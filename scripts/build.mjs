import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import QRCode from 'qrcode';

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'assets');
const PHOTO_DIR = path.join(ROOT, 'data', 'photos');
const VCARD_DIR = path.join(ROOT, 'data', 'vcards');
const GATEWAY_SIGNATURE_DIR = path.join(ROOT, 'data', 'gateway-signatures');
const SITE_DIR = path.join(ROOT, 'site');
const PUBLIC_BASE_URL = 'https://zdrowa-polska.github.io/zdrowa-polska-signatures';

await fs.rm(SITE_DIR, { recursive: true, force: true });
await fs.mkdir(path.join(SITE_DIR, 'assets', 'icons'), { recursive: true });
await fs.mkdir(path.join(SITE_DIR, 'photos'), { recursive: true });
await fs.mkdir(path.join(SITE_DIR, 'contacts'), { recursive: true });
await fs.mkdir(path.join(SITE_DIR, 'qr'), { recursive: true });
await fs.mkdir(path.join(SITE_DIR, 'card'), { recursive: true });
await fs.mkdir(path.join(SITE_DIR, 'gateway-signatures'), { recursive: true });

function unfoldVCard(text) {
  return String(text).replace(/\r?\n[ \t]/g, '');
}

function decodeVCardValue(value) {
  return String(value || '')
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function vCardValue(text, fieldName) {
  const wanted = String(fieldName).toUpperCase();
  const lines = unfoldVCard(text).split(/\r?\n/);

  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const left = line.slice(0, colon).toUpperCase();
    if (left === wanted || left.startsWith(wanted + ';')) {
      return decodeVCardValue(line.slice(colon + 1));
    }
  }

  return '';
}

function htmlEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cardHtml(data) {
  const phoneHref = String(data.phone || '').replace(/[^+\d]/g, '');
  const titleHtml = data.title ? `<p class="title">${htmlEscape(data.title)}</p>` : '';
  const callButton = data.phone
    ? `<a class="secondary" href="tel:${htmlEscape(phoneHref)}">Zadzwoń</a>`
    : '';
  const emailButton = data.email
    ? `<a class="secondary" href="mailto:${htmlEscape(data.email)}">Napisz e-mail</a>`
    : '';
  const linkedinButton = data.linkedin
    ? `<a class="secondary" href="${htmlEscape(data.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>`
    : '';
  const phoneRow = data.phone
    ? `<div class="row"><span class="label">Telefon</span><a href="tel:${htmlEscape(phoneHref)}">${htmlEscape(data.phone)}</a></div>`
    : '';
  const emailRow = data.email
    ? `<div class="row"><span class="label">E-mail</span><a href="mailto:${htmlEscape(data.email)}">${htmlEscape(data.email)}</a></div>`
    : '';

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#ffffff">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Wizytówka">
<link rel="apple-touch-icon" href="${PUBLIC_BASE_URL}/assets/app-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<title>${htmlEscape(data.fullName)} — Zdrowa Polska</title>
<style>
:root{--blue:#0B6FA4;--text:#1b1b1b;--muted:#666;--line:#dfe7eb}
*{box-sizing:border-box}
body{margin:0;background:#f4f7f8;font-family:Arial,Helvetica,sans-serif;color:var(--text)}
.wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{width:100%;max-width:430px;background:#fff;border-radius:22px;box-shadow:0 12px 36px rgba(0,0,0,.10);overflow:hidden}
.top{padding:28px 24px 16px;text-align:center}
.photo{width:132px;height:132px;display:block;margin:0 auto 14px}
.logo{width:180px;max-width:70%;height:auto;margin:0 auto 18px;display:block}
h1{font-size:28px;line-height:1.1;margin:0 0 6px}
.title{font-size:16px;line-height:1.35;color:var(--muted);margin:0 0 4px}
.company{font-size:18px;font-weight:700;color:var(--blue);margin:0}
.qrbox{padding:8px 24px 4px;text-align:center}
.qr{width:min(72vw,250px);height:auto;display:block;margin:0 auto}
.hint{font-size:14px;line-height:1.35;color:var(--muted);margin:10px auto 0;max-width:310px}
.actions{padding:18px 24px 10px;display:grid;gap:10px}
.actions a{display:flex;align-items:center;justify-content:center;min-height:50px;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px}
.primary{background:var(--blue);color:#fff}
.secondary{background:#edf5f8;color:var(--blue)}
.details{border-top:1px solid var(--line);margin-top:8px;padding:16px 24px 24px}
.row{padding:8px 0;font-size:15px;line-height:1.4;word-break:break-word}
.row a{color:var(--blue);text-decoration:none}
.label{display:block;font-size:12px;color:#888;margin-bottom:2px;text-transform:uppercase;letter-spacing:.04em}
@media (max-width:380px){.wrap{padding:12px}.top{padding-top:22px}.photo{width:116px;height:116px}h1{font-size:25px}}
</style>
</head>
<body>
<div class="wrap">
  <main class="card">
    <section class="top">
      <img class="photo" src="${htmlEscape(data.photoUrl)}" alt="${htmlEscape(data.fullName)}">
      <img class="logo" src="${PUBLIC_BASE_URL}/assets/logo.png" alt="Zdrowa Polska">
      <h1>${htmlEscape(data.fullName)}</h1>
      ${titleHtml}
      <p class="company">Zdrowa Polska S.A.</p>
    </section>
    <section class="qrbox">
      <img class="qr" src="${htmlEscape(data.qrUrl)}" alt="QR — dodaj kontakt">
      <p class="hint">Zeskanuj kod QR drugim telefonem albo użyj przycisku poniżej.</p>
    </section>
    <section class="actions">
      <a class="primary" href="${htmlEscape(data.vcardUrl)}">Dodaj do kontaktów</a>
      ${callButton}
      ${emailButton}
      ${linkedinButton}
    </section>
    <section class="details">
      ${phoneRow}
      ${emailRow}
      <div class="row"><span class="label">Strona</span><a href="https://zdrowapolskagroup.pl/" target="_blank" rel="noopener">www.zdrowapolskagroup.pl</a></div>
    </section>
  </main>
</div>
</body>
</html>`;
}

const logoSvg = await fs.readFile(path.join(ASSETS_DIR, 'logo.svg'));
await sharp(logoSvg)
  .trim()
  .resize({ width: 300 })
  .png({ compressionLevel: 9 })
  .toFile(path.join(SITE_DIR, 'assets', 'logo.png'));

await sharp(logoSvg)
  .trim()
  .resize(140, 140, { fit: 'contain', background: '#ffffff' })
  .extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#ffffff' })
  .png({ compressionLevel: 9 })
  .toFile(path.join(SITE_DIR, 'assets', 'app-icon.png'));

const neutralSvg = await fs.readFile(path.join(ASSETS_DIR, 'neutral-avatar.svg'));
await sharp(neutralSvg)
  .resize(160, 160)
  .png({ compressionLevel: 9 })
  .toFile(path.join(SITE_DIR, 'assets', 'neutral-avatar.png'));

for (const name of ['linkedin', 'facebook', 'youtube']) {
  const svg = await fs.readFile(path.join(ASSETS_DIR, 'icons', `${name}.svg`));
  await sharp(svg)
    .resize(64, 64)
    .png({ compressionLevel: 9 })
    .toFile(path.join(SITE_DIR, 'assets', 'icons', `${name}.png`));
}

for (const name of await fs.readdir(PHOTO_DIR)) {
  if (name.startsWith('.')) continue;

  const sourcePath = path.join(PHOTO_DIR, name);
  const slug = path.parse(name).name;
  const size = 192;

  const circleMask = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`
  );

  await sharp(sourcePath)
    .rotate()
    .resize(size, size, { fit: 'cover', position: 'centre' })
    .ensureAlpha()
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(SITE_DIR, 'photos', `${slug}.png`));
}

try {
  const vcardNames = await fs.readdir(VCARD_DIR);

  for (const name of vcardNames) {
    if (name.startsWith('.') || path.extname(name).toLowerCase() !== '.vcf') continue;

    const sourcePath = path.join(VCARD_DIR, name);
    const slug = path.parse(name).name;
    const targetVcf = path.join(SITE_DIR, 'contacts', `${slug}.vcf`);
    const contactUrl = `${PUBLIC_BASE_URL}/contacts/${encodeURIComponent(slug)}.vcf`;
    const qrUrl = `${PUBLIC_BASE_URL}/qr/${encodeURIComponent(slug)}.svg`;
    const cardDir = path.join(SITE_DIR, 'card', slug);

    await fs.copyFile(sourcePath, targetVcf);

    await QRCode.toFile(
      path.join(SITE_DIR, 'qr', `${slug}.png`),
      contactUrl,
      { errorCorrectionLevel: 'H', margin: 4, width: 1200 }
    );

    await QRCode.toFile(
      path.join(SITE_DIR, 'qr', `${slug}.svg`),
      contactUrl,
      { errorCorrectionLevel: 'H', margin: 4, type: 'svg' }
    );

    const vcardText = await fs.readFile(sourcePath, 'utf8');
    const fullName = vCardValue(vcardText, 'FN') || slug;
    const title = vCardValue(vcardText, 'TITLE');
    const phone = vCardValue(vcardText, 'TEL');
    const email = vCardValue(vcardText, 'EMAIL');
    const linkedin = vCardValue(vcardText, 'X-SOCIALPROFILE');
    const photoUrl = `${PUBLIC_BASE_URL}/photos/${encodeURIComponent(slug)}.png`;

    await fs.mkdir(cardDir, { recursive: true });
    await fs.writeFile(
      path.join(cardDir, 'index.html'),
      cardHtml({ fullName, title, phone, email, linkedin, vcardUrl: contactUrl, qrUrl, photoUrl }),
      'utf8'
    );

    await fs.writeFile(
      path.join(cardDir, 'manifest.webmanifest'),
      JSON.stringify({
        name: `${fullName} — Zdrowa Polska`,
        short_name: fullName,
        start_url: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: `${PUBLIC_BASE_URL}/assets/app-icon.png`, sizes: '180x180', type: 'image/png' }
        ]
      }, null, 2),
      'utf8'
    );
  }
} catch (e) {
  if (e && e.code !== 'ENOENT') throw e;
}

try {
  const names = (await fs.readdir(GATEWAY_SIGNATURE_DIR))
    .filter(name => !name.startsWith('.') && path.extname(name).toLowerCase() === '.json')
    .sort();

  const manifest = [];

  for (const name of names) {
    const sourcePath = path.join(GATEWAY_SIGNATURE_DIR, name);
    const targetPath = path.join(SITE_DIR, 'gateway-signatures', name);
    const raw = await fs.readFile(sourcePath, 'utf8');
    const data = JSON.parse(raw);

    if (!data || !data.email || !data.html || !data.text) {
      throw new Error(`Invalid gateway signature file: ${name}`);
    }

    await fs.writeFile(targetPath, JSON.stringify(data), 'utf8');
    manifest.push({
      email: String(data.email).toLowerCase(),
      file: name
    });
  }

  await fs.writeFile(
    path.join(SITE_DIR, 'gateway-signatures', 'manifest.json'),
    JSON.stringify({ version: 1, signatures: manifest }),
    'utf8'
  );
} catch (e) {
  if (e && e.code !== 'ENOENT') throw e;

  await fs.writeFile(
    path.join(SITE_DIR, 'gateway-signatures', 'manifest.json'),
    JSON.stringify({ version: 1, signatures: [] }),
    'utf8'
  );
}

await fs.writeFile(
  path.join(SITE_DIR, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Zdrowa Polska signature assets</title>',
  'utf8'
);

console.log('Published Gmail signature assets, employee vCards, printable QR codes, mobile business cards and SMTP gateway signatures.');
