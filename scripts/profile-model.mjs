import { createHash } from 'node:crypto';

export function profileCards(snapshot) {
  if (snapshot.version !== 1 || snapshot.complete !== true ||
      snapshot.domain !== 'zdrowapolskagroup.pl' || !Array.isArray(snapshot.profiles)) {
    throw new Error('Invalid or incomplete Directory snapshot');
  }
  const ids = new Set(), slugs = new Set(), emails = new Set();
  const cards = [];
  for (const p of snapshot.profiles) {
    if (!/^[a-f0-9]{64}$/.test(p.id) || ids.has(p.id) || !Array.isArray(p.slugs)) {
      throw new Error('Invalid/duplicate employee identity');
    }
    ids.add(p.id);
    if (typeof p.active !== 'boolean' || typeof p.enabled !== 'boolean') throw new Error('Invalid status');
    const retired = !p.active && !p.enabled && p.email === undefined;
    if (!retired && (!/^[a-z0-9._+-]+@zdrowapolskagroup\.pl$/.test(p.email) || emails.has(p.email))) {
      throw new Error('Invalid/duplicate primary address');
    }
    if (!retired) emails.add(p.email);
    for (const slug of p.slugs) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(slug) || slug === '.' || slug === '..' || slugs.has(slug)) {
        throw new Error('Invalid/conflicting business-card URL');
      }
      slugs.add(slug);
    }
    if (!p.active || !p.enabled) continue;
    if (!p.vcard?.includes('BEGIN:VCARD') || !p.vcard.includes(`UID:urn:zdrowapolska:${p.id}`) ||
        !p.html || !p.text) throw new Error('Incomplete employee profile');
    const revision = createHash('sha256').update(JSON.stringify(p)).digest('hex');
    for (const slug of p.slugs) cards.push({...p, slug, revision});
  }
  return cards;
}
