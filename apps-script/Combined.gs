const ZP_CONFIG = Object.freeze({
  DOMAIN: 'zdrowapolskagroup.pl',
  COMPANY: 'Zdrowa Polska S.A.',
  WEBSITE: 'www.zdrowapolskagroup.pl',
  WEBSITE_HREF: 'https://zdrowapolskagroup.pl/',

  TEST_USER: 'dhyk@zdrowapolskagroup.pl',

  CUSTOM_SCHEMA: 'SignatureProfile',
  LINKEDIN_FIELD: 'LinkedIn',
  ENABLED_FIELD: 'EmailSignature',
  EXTERNAL_MAILBOXES_FIELD: 'ExternalMailboxes',

  GITHUB_OWNER: 'Zdrowa-Polska',
  GITHUB_REPO: 'zdrowa-polska-signatures',
  GITHUB_BRANCH: 'main',
  PHOTOS_PATH: 'data/photos',
  VCARDS_PATH: 'data/vcards',
  ASSET_BASE_URL: 'https://zdrowa-polska.github.io/zdrowa-polska-signatures',

  TEST_LINKEDIN: 'https://www.linkedin.com/in/dhyk/',
  FACEBOOK_URL: '',
  YOUTUBE_URL: '',

  GMAIL_SCOPE: 'https://www.googleapis.com/auth/gmail.settings.basic',
  EXTRA_GMAIL_SCOPE: 'https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.settings.sharing',

  MODE_PROPERTY: 'SIGNATURE_MODE',
  MODE_TEST: 'test',
  MODE_PRODUCTION: 'production',
  MANAGED_PREFIX: 'SIG_MANAGED_',
  DESIRED_HASH_PREFIX: 'SIG_DESIRED_HASH_',
  ACTUAL_HASH_PREFIX: 'SIG_ACTUAL_HASH_',
  PHOTO_HASH_PREFIX: 'PHOTO_HASH_',
  PHOTO_EXT_PREFIX: 'PHOTO_EXT_',

  EXTRA_SEND_AS_ENABLED_PROPERTY: 'EXTRA_SEND_AS_ENABLED',
  EXTRA_MANAGED_PREFIX: 'EXTRA_SIG_MANAGED_',
  EXTRA_DESIRED_HASH_PREFIX: 'EXTRA_SIG_DESIRED_HASH_',
  EXTRA_ACTUAL_HASH_PREFIX: 'EXTRA_SIG_ACTUAL_HASH_',

  LEGACY_EXTRA_SEND_AS: Object.freeze([
    Object.freeze({
      mailboxEmail: 'dg@vitagramma.com',
      sendAsEmail: 'dhyk@zdrowapolskagroup.pl',
      sourceUserEmail: 'dhyk@zdrowapolskagroup.pl'
    })
  ])
});

const DISCLAIMER_PL = 'Niniejsza wiadomość wraz z załącznikami zawiera ściśle poufne i prawnie chronione informacje. Jeśli są Państwo jej omyłkowym odbiorcą, prosimy o jej usunięcie i niezwłoczne poinformowanie nadawcy. Kopiowanie, ujawnianie lub rozpowszechnianie materiału zawartego w tym e-mailu jest zabronione.';
const DISCLAIMER_EN = 'This email with all its attachments is confidential and may be subject to legal privilege. If it is not intended for you, please notify the sender immediately and delete this e-mail. Any unauthorized copying, disclosure or distribution of the material in this e-mail is strictly forbidden.';

function htmlEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugFromEmail_(email) {
  return String(email).split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '-');
}

function propertyKeyForEmail_(prefix, email) {
  return prefix + String(email).toLowerCase().replace(/[^a-z0-9]/g, '_');
}

function propertyKeyForSendAs_(prefix, mailboxEmail, sendAsEmail) {
  const value = String(mailboxEmail).toLowerCase() + '__' + String(sendAsEmail).toLowerCase();
  return prefix + value.replace(/[^a-z0-9]/g, '_');
}

function normalizeExternalMailboxes_(raw) {
  if (!raw) return [];

  const values = Array.isArray(raw)
    ? raw.map(function(item) {
        if (item && typeof item === 'object' && item.value != null) return item.value;
        return item;
      })
    : [raw];

  const seen = {};
  return values
    .reduce(function(out, value) {
      String(value == null ? '' : value)
        .split(/[\n,;]+/)
        .forEach(function(part) {
          const email = String(part || '').trim().toLowerCase();
          if (!email || email.indexOf('@') <= 0 || seen[email]) return;
          seen[email] = true;
          out.push(email);
        });
      return out;
    }, []);
}

function signatureMode_() {
  const value = String(
    PropertiesService.getScriptProperties().getProperty(ZP_CONFIG.MODE_PROPERTY) || ZP_CONFIG.MODE_TEST
  ).toLowerCase();
  return value === ZP_CONFIG.MODE_PRODUCTION ? ZP_CONFIG.MODE_PRODUCTION : ZP_CONFIG.MODE_TEST;
}

function isProduction_() {
  return signatureMode_() === ZP_CONFIG.MODE_PRODUCTION;
}

function setSignatureMode_(mode) {
  const normalized = String(mode).toLowerCase();
  if (normalized !== ZP_CONFIG.MODE_TEST && normalized !== ZP_CONFIG.MODE_PRODUCTION) {
    throw new Error('Invalid signature mode: ' + mode);
  }
  PropertiesService.getScriptProperties().setProperty(ZP_CONFIG.MODE_PROPERTY, normalized);
}

function workspaceUserFromRaw_(user) {
  const organizations = user.organizations || [];
  const org = organizations.find(function(x) { return x.primary; }) || organizations[0] || {};
  const phones = user.phones || [];
  const phoneObj =
    phones.find(function(x) { return x.primary; }) ||
    phones.find(function(x) { return String(x.type || '').toLowerCase() === 'work'; }) ||
    phones.find(function(x) { return String(x.type || '').toLowerCase() === 'mobile'; }) ||
    phones[0] || {};

  const custom = (user.customSchemas || {})[ZP_CONFIG.CUSTOM_SCHEMA] || {};
  const linkedin = custom[ZP_CONFIG.LINKEDIN_FIELD] || '';
  const externalMailboxes = normalizeExternalMailboxes_(custom[ZP_CONFIG.EXTERNAL_MAILBOXES_FIELD]);
  const enabledValue = custom[ZP_CONFIG.ENABLED_FIELD];
  const enabled = enabledValue === true || String(enabledValue).toLowerCase() === 'true';

  return {
    email: user.primaryEmail,
    givenName: user.name && user.name.givenName ? user.name.givenName : '',
    familyName: user.name && user.name.familyName ? user.name.familyName : '',
    fullName: user.name && user.name.fullName ? user.name.fullName : user.primaryEmail,
    jobTitle: org.title || '',
    phone: phoneObj.value || '',
    linkedin: linkedin,
    externalMailboxes: externalMailboxes,
    enabled: enabled,
    suspended: !!user.suspended,
    archived: !!user.archived
  };
}

function getWorkspaceUser_(email) {
  return workspaceUserFromRaw_(AdminDirectory.Users.get(email, { projection: 'full' }));
}

function listAllActiveUsers_() {
  const out = [];
  let pageToken;

  do {
    const response = AdminDirectory.Users.list({
      domain: ZP_CONFIG.DOMAIN,
      projection: 'full',
      maxResults: 200,
      pageToken: pageToken
    });

    (response.users || []).forEach(function(raw) {
      const u = workspaceUserFromRaw_(raw);
      if (!u.suspended && !u.archived) out.push(u);
    });

    pageToken = response.nextPageToken;
  } while (pageToken);

  return out;
}

function listAllWorkspaceUsers_() {
  const out = [];
  let pageToken;

  do {
    const response = AdminDirectory.Users.list({
      domain: ZP_CONFIG.DOMAIN,
      projection: 'full',
      maxResults: 200,
      pageToken: pageToken
    });

    (response.users || []).forEach(function(raw) {
      out.push(workspaceUserFromRaw_(raw));
    });

    pageToken = response.nextPageToken;
  } while (pageToken);

  return out;
}

function extraSendAsMappings_() {
  const mappings = [];
  const seen = {};

  listAllWorkspaceUsers_().forEach(function(user) {
    (user.externalMailboxes || []).forEach(function(mailboxEmail) {
      const mapping = {
        mailboxEmail: String(mailboxEmail).toLowerCase(),
        sendAsEmail: String(user.email).toLowerCase(),
        sourceUserEmail: String(user.email).toLowerCase(),
        source: 'directory'
      };
      const key = mapping.mailboxEmail + '|' + mapping.sendAsEmail;
      if (seen[key]) return;
      seen[key] = true;
      mappings.push(mapping);
    });
  });

  // Transitional fallback only. After migrateLegacyExtraSendAsToDirectory()
  // is verified in production, remove LEGACY_EXTRA_SEND_AS entirely.
  (ZP_CONFIG.LEGACY_EXTRA_SEND_AS || []).forEach(function(mapping) {
    const normalized = {
      mailboxEmail: String(mapping.mailboxEmail).toLowerCase(),
      sendAsEmail: String(mapping.sendAsEmail).toLowerCase(),
      sourceUserEmail: String(mapping.sourceUserEmail).toLowerCase(),
      source: 'legacy-fallback'
    };
    const key = normalized.mailboxEmail + '|' + normalized.sendAsEmail;
    if (seen[key]) return;
    seen[key] = true;
    mappings.push(normalized);
  });

  return mappings;
}

function usersForCurrentMode_() {
  if (!isProduction_()) return [getWorkspaceUser_(ZP_CONFIG.TEST_USER)];
  return listAllActiveUsers_();
}

function getUserPhoto_(email) {
  try {
    const url = 'https://admin.googleapis.com/admin/directory/v1/users/' +
      encodeURIComponent(email) + '/photos/thumbnail';

    const response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
        Accept: 'application/json'
      }
    });

    const code = response.getResponseCode();
    if (code === 404) return null;
    if (code < 200 || code >= 300) {
      throw new Error('Directory API HTTP ' + code + ': ' + response.getContentText());
    }

    const photo = JSON.parse(response.getContentText());
    if (!photo || !photo.photoData) return null;

    let encoded = String(photo.photoData).replace(/\s/g, '');
    while (encoded.length % 4 !== 0) encoded += '=';
    const bytes = Utilities.base64DecodeWebSafe(encoded);
    if (!bytes || !bytes.length) return null;

    const u = function(i) { return ((bytes[i] || 0) + 256) % 256; };
    let info = { mimeType: 'image/jpeg', extension: 'jpg' };

    if (bytes.length >= 8 && u(0) === 0x89 && u(1) === 0x50 && u(2) === 0x4E && u(3) === 0x47 && u(4) === 0x0D && u(5) === 0x0A && u(6) === 0x1A && u(7) === 0x0A) {
      info = { mimeType: 'image/png', extension: 'png' };
    } else if (bytes.length >= 3 && u(0) === 0xFF && u(1) === 0xD8 && u(2) === 0xFF) {
      info = { mimeType: 'image/jpeg', extension: 'jpg' };
    } else if (bytes.length >= 12 && u(0) === 0x52 && u(1) === 0x49 && u(2) === 0x46 && u(3) === 0x46 && u(8) === 0x57 && u(9) === 0x45 && u(10) === 0x42 && u(11) === 0x50) {
      info = { mimeType: 'image/webp', extension: 'webp' };
    }

    return { bytes: bytes, mimeType: info.mimeType, extension: info.extension };
  } catch (e) {
    console.log('Profile photo read failed for ' + email + ': ' + e.message);
    return null;
  }
}

function githubSettings_() {
  const props = PropertiesService.getScriptProperties();
  const owner = ZP_CONFIG.GITHUB_OWNER;
  const token = props.getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('Script Property GITHUB_TOKEN is not set.');
  return { owner: owner, token: token, repo: ZP_CONFIG.GITHUB_REPO, branch: ZP_CONFIG.GITHUB_BRANCH };
}

function githubRequest_(method, path, body, accept404) {
  const s = githubSettings_();
  const url = 'https://api.github.com/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo) + path;
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + s.token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };

  if (body !== undefined && body !== null) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (accept404 && code === 404) return null;
  if (code < 200 || code >= 300) throw new Error('GitHub API ' + code + ': ' + text);
  return text ? JSON.parse(text) : {};
}

function githubGetFile_(path) {
  const s = githubSettings_();
  return githubRequest_(
    'get',
    '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(s.branch),
    null,
    true
  );
}

function githubPutBytesIfChanged_(path, bytes, message) {
  const current = githubGetFile_(path);
  const newBase64 = Utilities.base64Encode(bytes);

  if (current && current.content) {
    const oldBase64 = String(current.content).replace(/\s/g, '');
    if (oldBase64 === newBase64) return false;
  }

  const payload = { message: message, branch: githubSettings_().branch, content: newBase64 };
  if (current && current.sha) payload.sha = current.sha;

  githubRequest_(
    'put',
    '/contents/' + path.split('/').map(encodeURIComponent).join('/'),
    payload,
    false
  );
  return true;
}

function githubDeleteIfExists_(path, message) {
  const current = githubGetFile_(path);
  if (!current || !current.sha) return false;

  githubRequest_(
    'delete',
    '/contents/' + path.split('/').map(encodeURIComponent).join('/'),
    { message: message, branch: githubSettings_().branch, sha: current.sha },
    false
  );
  return true;
}

function sha256Hex_(bytes) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes);
  return digest.map(function(b) {
    const v = (b + 256) % 256;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

function sha256Short_(bytes) {
  return sha256Hex_(bytes).slice(0, 16);
}

function textHash_(text) {
  return sha256Hex_(Utilities.newBlob(String(text), 'text/plain').getBytes());
}

function syncPhoto_(user) {
  const props = PropertiesService.getScriptProperties();
  const hashKey = propertyKeyForEmail_(ZP_CONFIG.PHOTO_HASH_PREFIX, user.email);
  const extKey = propertyKeyForEmail_(ZP_CONFIG.PHOTO_EXT_PREFIX, user.email);
  const photo = getUserPhoto_(user.email);
  const slug = slugFromEmail_(user.email);

  if (!photo) {
    const oldExt = props.getProperty(extKey);
    if (oldExt) {
      ['jpg', 'png', 'webp'].forEach(function(ext) {
        githubDeleteIfExists_(
          ZP_CONFIG.PHOTOS_PATH + '/' + slug + '.' + ext,
          'Remove Workspace photo for ' + user.email
        );
      });
      props.deleteProperty(hashKey);
      props.deleteProperty(extKey);
    }
    return ZP_CONFIG.ASSET_BASE_URL + '/assets/neutral-avatar.png';
  }

  const photoHash = sha256Short_(photo.bytes);
  const oldHash = props.getProperty(hashKey) || '';
  const oldExt = props.getProperty(extKey) || '';

  if (oldHash === photoHash && oldExt === photo.extension) {
    return ZP_CONFIG.ASSET_BASE_URL + '/photos/' + slug + '.png?v=' + photoHash;
  }

  const filename = slug + '.' + photo.extension;

  githubPutBytesIfChanged_(
    ZP_CONFIG.PHOTOS_PATH + '/' + filename,
    photo.bytes,
    'Update Workspace photo for ' + user.email
  );

  ['jpg', 'png', 'webp'].forEach(function(ext) {
    if (ext !== photo.extension) {
      githubDeleteIfExists_(
        ZP_CONFIG.PHOTOS_PATH + '/' + slug + '.' + ext,
        'Remove obsolete photo format for ' + user.email
      );
    }
  });

  props.setProperty(hashKey, photoHash);
  props.setProperty(extKey, photo.extension);

  return ZP_CONFIG.ASSET_BASE_URL + '/photos/' + slug + '.png?v=' + photoHash;
}

function vCardEscape_(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function foldVCardLine_(line) {
  const text = String(line);
  const limit = 74;
  if (text.length <= limit) return text;

  const parts = [];
  let rest = text;

  while (rest.length > limit) {
    parts.push(rest.slice(0, limit));
    rest = rest.slice(limit);
  }

  if (rest) parts.push(rest);
  return parts.join('\r\n ');
}

function vCardPhotoJpegBytes_(photo) {
  if (!photo || !photo.bytes || !photo.bytes.length) return null;

  try {
    const sourceBlob = Utilities.newBlob(
      photo.bytes,
      photo.mimeType || 'image/png',
      'profile.' + (photo.extension || 'png')
    );

    return sourceBlob.getAs('image/jpeg').getBytes();
  } catch (e) {
    console.log('vCard photo JPEG conversion failed: ' + e.message);

    if (photo.extension === 'jpg' || photo.extension === 'jpeg') {
      return photo.bytes;
    }

    return null;
  }
}

function buildVCard_(user, photo) {
  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'PRODID:-//Zdrowa Polska S.A.//Business Card//PL',
    'N;CHARSET=UTF-8:' +
      vCardEscape_(user.familyName || '') + ';' +
      vCardEscape_(user.givenName || '') + ';;;',
    'FN;CHARSET=UTF-8:' + vCardEscape_(user.fullName),
    'ORG;CHARSET=UTF-8:' + vCardEscape_(ZP_CONFIG.COMPANY)
  ];

  if (user.jobTitle) {
    lines.push('TITLE;CHARSET=UTF-8:' + vCardEscape_(user.jobTitle));
  }

  if (user.phone) {
    lines.push('TEL;TYPE=WORK,VOICE:' + vCardEscape_(user.phone));
  }

  lines.push('EMAIL;TYPE=INTERNET,WORK:' + vCardEscape_(user.email));
  lines.push('URL;TYPE=WORK:' + ZP_CONFIG.WEBSITE_HREF);

  if (user.linkedin) {
    lines.push('X-SOCIALPROFILE;TYPE=linkedin:' + vCardEscape_(user.linkedin));
  }

  const jpegPhotoBytes = vCardPhotoJpegBytes_(photo);

  if (jpegPhotoBytes && jpegPhotoBytes.length) {
    lines.push(
      'PHOTO;TYPE=JPEG;ENCODING=b:' +
      Utilities.base64Encode(jpegPhotoBytes)
    );
  }

  lines.push('END:VCARD');

  return lines.map(foldVCardLine_).join('\r\n') + '\r\n';
}

function vCardPublicUrl_(email) {
  return ZP_CONFIG.ASSET_BASE_URL + '/contacts/' + slugFromEmail_(email) + '.vcf';
}

function qrPublicUrl_(email, extension) {
  return ZP_CONFIG.ASSET_BASE_URL + '/qr/' + slugFromEmail_(email) + '.' + (extension || 'png');
}

function syncVCard_(user) {
  const photo = getUserPhoto_(user.email);
  const vcard = buildVCard_(user, photo);
  const slug = slugFromEmail_(user.email);
  const path = ZP_CONFIG.VCARDS_PATH + '/' + slug + '.vcf';

  return githubPutBytesIfChanged_(
    path,
    Utilities.newBlob(vcard, 'text/vcard', slug + '.vcf').getBytes(),
    'Update employee vCard for ' + user.email
  );
}

function removeVCard_(user) {
  const slug = slugFromEmail_(user.email);
  return githubDeleteIfExists_(
    ZP_CONFIG.VCARDS_PATH + '/' + slug + '.vcf',
    'Remove employee vCard for ' + user.email
  );
}

function syncBusinessCardsInternal_(users) {
  const stats = { updated: 0, unchanged: 0, removed: 0, absent: 0, failed: 0 };
  const failures = [];

  users.forEach(function(user) {
    try {
      if (user.suspended || user.archived || !user.enabled) {
        const removed = removeVCard_(user);
        stats[removed ? 'removed' : 'absent']++;
        return;
      }

      const changed = syncVCard_(user);
      stats[changed ? 'updated' : 'unchanged']++;
    } catch (e) {
      stats.failed++;
      failures.push(user.email + ': ' + e.message);
      console.error('Business card sync failed for ' + user.email + ': ' + e.message);
    }
  });

  console.log('Business card/vCard sync complete: ' + JSON.stringify(stats));

  if (failures.length) {
    console.log('Business card/vCard warnings: ' + failures.join(' | '));
  }

  return stats;
}

function syncBusinessCards() {
  const stats = syncBusinessCardsInternal_(listAllActiveUsers_());

  const enabled = listAllActiveUsers_().filter(function(user) {
    return !user.suspended && !user.archived && user.enabled;
  });

  enabled.forEach(function(user) {
    console.log(
      user.email +
      ' | vCard: ' + vCardPublicUrl_(user.email) +
      ' | QR PNG: ' + qrPublicUrl_(user.email, 'png') +
      ' | QR SVG: ' + qrPublicUrl_(user.email, 'svg')
    );
  });

  return stats;
}

function socialIcon_(name, url, alt) {
  const iconUrl = ZP_CONFIG.ASSET_BASE_URL + '/assets/icons/' + name + '.png';
  const img = '<img src="' + iconUrl + '" width="24" height="24" alt="' + htmlEscape_(alt) + '" style="display:inline-block;border:0;vertical-align:middle;margin-right:6px;">';
  return url ? '<a href="' + htmlEscape_(url) + '" style="text-decoration:none;">' + img + '</a>' : img;
}

function buildSignatureHtml_(user, photoUrl) {
  const logoUrl = ZP_CONFIG.ASSET_BASE_URL + '/assets/logo.png?v=20260918-logo2';
  const websiteHref = ZP_CONFIG.WEBSITE_HREF;

  const phoneRow = user.phone
    ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#555;">Tel: <a href="tel:' + htmlEscape_(String(user.phone).replace(/[^+\d]/g, '')) + '" style="color:#555;text-decoration:none;">' + htmlEscape_(user.phone) + '</a></div>'
    : '';

  const titleRow = user.jobTitle
    ? '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:19px;color:#555;">' + htmlEscape_(user.jobTitle) + '</div>'
    : '';

  const social =
    socialIcon_('linkedin', user.linkedin || '', 'LinkedIn') +
    socialIcon_('facebook', ZP_CONFIG.FACEBOOK_URL, 'Facebook') +
    socialIcon_('youtube', ZP_CONFIG.YOUTUBE_URL, 'YouTube');

  return '' +
    '<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;max-width:680px;">' +
      '<tr>' +
        '<td valign="top" style="width:165px;padding:0 8px 0 0;text-align:center;">' +
          '<img src="' + htmlEscape_(photoUrl) + '" width="132" height="132" alt="' + htmlEscape_(user.fullName) + '" style="display:block;width:132px;height:132px;border:0;border-radius:66px;margin:0 auto 8px auto;">' +
          '<img src="' + logoUrl + '" width="165" alt="Zdrowa Polska" style="display:block;width:165px;height:auto;border:0;margin:0 auto;">' +
        '</td>' +
        '<td valign="top" style="border-left:3px solid #0B6FA4;padding:1px 0 0 12px;">' +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:25px;font-weight:700;color:#111;">' + htmlEscape_(user.fullName) + '</div>' +
          titleRow +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;font-weight:700;color:#0B6FA4;margin:2px 0 6px 0;">' + ZP_CONFIG.COMPANY + '</div>' +
          phoneRow +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#555;">Email: <a href="mailto:' + htmlEscape_(user.email) + '" style="color:#0B6FA4;text-decoration:none;">' + htmlEscape_(user.email) + '</a></div>' +
          '<div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#555;">Strona: <a href="' + websiteHref + '" style="color:#0B6FA4;text-decoration:none;">' + ZP_CONFIG.WEBSITE + '</a></div>' +
          '<div style="padding-top:8px;">' + social + '</div>' +
        '</td>' +
      '</tr>' +
      '<tr><td colspan="2" style="padding-top:9px;border-bottom:1px solid #d9e1e5;"></td></tr>' +
      '<tr><td colspan="2" style="padding-top:7px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;color:#666;">' + htmlEscape_(DISCLAIMER_PL) + '</td></tr>' +
      '<tr><td colspan="2" style="padding-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;line-height:14px;color:#666;">' + htmlEscape_(DISCLAIMER_EN) + '</td></tr>' +
    '</table>';
}

function base64UrlText_(text) {
  return Utilities.base64EncodeWebSafe(String(text)).replace(/=+$/g, '');
}

function base64UrlBytes_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function serviceAccountSettings_() {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  let privateKey = props.getProperty('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  if (!email) throw new Error('Script Property GOOGLE_SERVICE_ACCOUNT_EMAIL is not set.');
  if (!privateKey) throw new Error('Script Property GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY is not set.');
  privateKey = privateKey.replace(/\\n/g, '\n');
  return { email: email, privateKey: privateKey };
}

const ZP_TOKEN_CACHE = {};

function delegatedAccessToken_(subjectEmail, scope) {
  const effectiveScope = scope || ZP_CONFIG.GMAIL_SCOPE;
  const cacheKey = String(subjectEmail).toLowerCase() + '|' + effectiveScope;
  if (ZP_TOKEN_CACHE[cacheKey]) return ZP_TOKEN_CACHE[cacheKey];

  const sa = serviceAccountSettings_();
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: sa.email,
    sub: subjectEmail,
    scope: effectiveScope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  const unsigned = base64UrlText_(JSON.stringify(header)) + '.' + base64UrlText_(JSON.stringify(claims));
  const signature = Utilities.computeRsaSha256Signature(unsigned, sa.privateKey);
  const assertion = unsigned + '.' + base64UrlBytes_(signature);

  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    muteHttpExceptions: true,
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: assertion
    }
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('Google OAuth token error ' + code + ': ' + text);

  const data = JSON.parse(text);
  if (!data.access_token) throw new Error('Google OAuth response did not contain an access token.');
  ZP_TOKEN_CACHE[cacheKey] = data.access_token;
  return data.access_token;
}

function gmailSendAsUrl_(mailboxEmail, sendAsEmail) {
  const alias = sendAsEmail || mailboxEmail;
  return 'https://gmail.googleapis.com/gmail/v1/users/' +
    encodeURIComponent(mailboxEmail) + '/settings/sendAs/' + encodeURIComponent(alias);
}

function getGmailSendAs_(mailboxEmail, sendAsEmail, scope) {
  const alias = sendAsEmail || mailboxEmail;
  const token = delegatedAccessToken_(mailboxEmail, scope || ZP_CONFIG.GMAIL_SCOPE);
  const response = UrlFetchApp.fetch(gmailSendAsUrl_(mailboxEmail, alias), {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token }
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Gmail API GET HTTP ' + code +
      ' for mailbox ' + mailboxEmail +
      ', send-as ' + alias + ': ' + text
    );
  }
  return text ? JSON.parse(text) : {};
}

function setGmailSignature_(mailboxEmail, sendAsEmail, html, scope) {
  const alias = sendAsEmail || mailboxEmail;
  const token = delegatedAccessToken_(mailboxEmail, scope || ZP_CONFIG.GMAIL_SCOPE);
  const response = UrlFetchApp.fetch(gmailSendAsUrl_(mailboxEmail, alias), {
    method: 'patch',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ signature: html })
  });

  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error(
      'Gmail API PATCH HTTP ' + code +
      ' for mailbox ' + mailboxEmail +
      ', send-as ' + alias + ': ' + text
    );
  }
  return text ? JSON.parse(text) : {};
}

function clearGmailSignature_(mailboxEmail, sendAsEmail) {
  return setGmailSignature_(mailboxEmail, sendAsEmail || mailboxEmail, '');
}

function isManaged_(email) {
  return PropertiesService.getScriptProperties().getProperty(
    propertyKeyForEmail_(ZP_CONFIG.MANAGED_PREFIX, email)
  ) === 'true';
}

function markManaged_(email, desiredHtml, gmailSignatureHtml) {
  const props = PropertiesService.getScriptProperties();
  const values = {};
  values[propertyKeyForEmail_(ZP_CONFIG.MANAGED_PREFIX, email)] = 'true';
  values[propertyKeyForEmail_(ZP_CONFIG.DESIRED_HASH_PREFIX, email)] = textHash_(desiredHtml);
  values[propertyKeyForEmail_(ZP_CONFIG.ACTUAL_HASH_PREFIX, email)] = textHash_(gmailSignatureHtml || desiredHtml);
  props.setProperties(values, false);
}

function forgetManaged_(email) {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(propertyKeyForEmail_(ZP_CONFIG.MANAGED_PREFIX, email));
  props.deleteProperty(propertyKeyForEmail_(ZP_CONFIG.DESIRED_HASH_PREFIX, email));
  props.deleteProperty(propertyKeyForEmail_(ZP_CONFIG.ACTUAL_HASH_PREFIX, email));
}

function extraSendAsEnabled_() {
  return PropertiesService.getScriptProperties().getProperty(
    ZP_CONFIG.EXTRA_SEND_AS_ENABLED_PROPERTY
  ) === 'true';
}

function setExtraSendAsEnabled_(enabled) {
  PropertiesService.getScriptProperties().setProperty(
    ZP_CONFIG.EXTRA_SEND_AS_ENABLED_PROPERTY,
    enabled ? 'true' : 'false'
  );
}

function isExtraSendAsManaged_(mapping) {
  return PropertiesService.getScriptProperties().getProperty(
    propertyKeyForSendAs_(
      ZP_CONFIG.EXTRA_MANAGED_PREFIX,
      mapping.mailboxEmail,
      mapping.sendAsEmail
    )
  ) === 'true';
}

function markExtraSendAsManaged_(mapping, desiredHtml, gmailSignatureHtml) {
  const props = PropertiesService.getScriptProperties();
  const values = {};

  values[propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_MANAGED_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  )] = 'true';

  values[propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_DESIRED_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  )] = textHash_(desiredHtml);

  values[propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_ACTUAL_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  )] = textHash_(gmailSignatureHtml || desiredHtml);

  props.setProperties(values, false);
}

function forgetExtraSendAsManaged_(mapping) {
  const props = PropertiesService.getScriptProperties();

  props.deleteProperty(propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_MANAGED_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  ));

  props.deleteProperty(propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_DESIRED_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  ));

  props.deleteProperty(propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_ACTUAL_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  ));
}

function syncExtraSendAsMapping_(mapping) {
  const sourceUser = getWorkspaceUser_(mapping.sourceUserEmail);

  if (sourceUser.suspended || sourceUser.archived || !sourceUser.enabled) {
    if (!isExtraSendAsManaged_(mapping)) {
      return { action: 'ignored', mapping: mapping };
    }

    setGmailSignature_(mapping.mailboxEmail, mapping.sendAsEmail, '', ZP_CONFIG.EXTRA_GMAIL_SCOPE);
    forgetExtraSendAsManaged_(mapping);
    return { action: 'cleared', mapping: mapping };
  }

  const photoUrl = syncPhoto_(sourceUser);
  const desiredHtml = buildSignatureHtml_(sourceUser, photoUrl);
  const desiredHash = textHash_(desiredHtml);

  const props = PropertiesService.getScriptProperties();

  const desiredKey = propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_DESIRED_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  );

  const actualKey = propertyKeyForSendAs_(
    ZP_CONFIG.EXTRA_ACTUAL_HASH_PREFIX,
    mapping.mailboxEmail,
    mapping.sendAsEmail
  );

  const storedDesiredHash = props.getProperty(desiredKey) || '';
  const storedActualHash = props.getProperty(actualKey) || '';

  const current = getGmailSendAs_(mapping.mailboxEmail, mapping.sendAsEmail, ZP_CONFIG.EXTRA_GMAIL_SCOPE);
  const currentSignature = current.signature || '';
  const currentActualHash = textHash_(currentSignature);

  if (
    isExtraSendAsManaged_(mapping) &&
    desiredHash === storedDesiredHash &&
    currentActualHash === storedActualHash
  ) {
    return { action: 'unchanged', mapping: mapping };
  }

  const updated = setGmailSignature_(
    mapping.mailboxEmail,
    mapping.sendAsEmail,
    desiredHtml,
    ZP_CONFIG.EXTRA_GMAIL_SCOPE
  );

  const resultingSignature = updated.signature || desiredHtml;

  markExtraSendAsManaged_(
    mapping,
    desiredHtml,
    resultingSignature
  );

  return { action: 'updated', mapping: mapping };
}

function syncExtraSendAsSignatures_() {
  const stats = { updated: 0, unchanged: 0, cleared: 0, ignored: 0, failed: 0 };
  const failures = [];

  extraSendAsMappings_().forEach(function(mapping) {
    try {
      const result = syncExtraSendAsMapping_(mapping);
      if (result && stats.hasOwnProperty(result.action)) {
        stats[result.action]++;
      }
    } catch (e) {
      stats.failed++;
      failures.push(
        mapping.mailboxEmail + ' -> ' + mapping.sendAsEmail + ': ' + e.message
      );
      console.error(
        'Extra send-as sync failed for ' +
        mapping.mailboxEmail + ' -> ' +
        mapping.sendAsEmail + ': ' + e.message
      );
    }
  });

  console.log('Extra send-as sync complete: ' + JSON.stringify(stats));

  if (failures.length) {
    throw new Error(
      'Extra send-as sync completed with failures (' +
      failures.length + '): ' + failures.join(' | ')
    );
  }

  return stats;
}

function testExtraSendAsAccess() {
  extraSendAsMappings_().forEach(function(mapping) {
    const current = getGmailSendAs_(
      mapping.mailboxEmail,
      mapping.sendAsEmail,
      ZP_CONFIG.EXTRA_GMAIL_SCOPE
    );

    console.log(
      'Extra send-as access OK: ' +
      mapping.mailboxEmail + ' -> ' +
      mapping.sendAsEmail +
      '; displayName=' + (current.displayName || '') +
      '; verificationStatus=' + (current.verificationStatus || '')
    );
  });

  console.log('All extra send-as mappings are accessible.');
}

function enableExtraSendAs() {
  testExtraSendAsAccess();

  try {
    const stats = syncExtraSendAsSignatures_();
    setExtraSendAsEnabled_(true);

    console.log(
      'Extra send-as synchronization is ON and will now run together with hourly syncSignatures.'
    );

    return stats;
  } catch (e) {
    setExtraSendAsEnabled_(false);
    console.error(
      'Extra send-as synchronization was NOT enabled because the first sync failed: ' + e.message
    );
    throw e;
  }
}

function disableExtraSendAs() {
  setExtraSendAsEnabled_(false);

  console.log(
    'Extra send-as synchronization is OFF. Existing send-as signatures were not removed.'
  );
}

function syncEnabledUser_(user) {
  const photoUrl = syncPhoto_(user);
  const desiredHtml = buildSignatureHtml_(user, photoUrl);
  const desiredHash = textHash_(desiredHtml);

  const props = PropertiesService.getScriptProperties();
  const desiredKey = propertyKeyForEmail_(ZP_CONFIG.DESIRED_HASH_PREFIX, user.email);
  const actualKey = propertyKeyForEmail_(ZP_CONFIG.ACTUAL_HASH_PREFIX, user.email);
  const storedDesiredHash = props.getProperty(desiredKey) || '';
  const storedActualHash = props.getProperty(actualKey) || '';

  const current = getGmailSendAs_(user.email, user.email);
  const currentSignature = current.signature || '';
  const currentActualHash = textHash_(currentSignature);

  if (isManaged_(user.email) && desiredHash === storedDesiredHash && currentActualHash === storedActualHash) {
    return { action: 'unchanged', email: user.email };
  }

  const updated = setGmailSignature_(user.email, user.email, desiredHtml);
  const resultingSignature = updated.signature || desiredHtml;
  markManaged_(user.email, desiredHtml, resultingSignature);
  return { action: 'updated', email: user.email };
}

function syncDisabledUser_(user) {
  if (!isManaged_(user.email)) {
    return { action: 'ignored', email: user.email };
  }

  clearGmailSignature_(user.email, user.email);
  forgetManaged_(user.email);
  return { action: 'cleared', email: user.email };
}

function syncSignatures() {
  const users = usersForCurrentMode_();
  const stats = { updated: 0, unchanged: 0, cleared: 0, ignored: 0, failed: 0 };
  const failures = [];

  users.forEach(function(user) {
    try {
      if (user.suspended || user.archived) return;

      let result;
      if (!isProduction_()) {
        result = syncEnabledUser_(user);
      } else if (user.enabled) {
        result = syncEnabledUser_(user);
      } else {
        result = syncDisabledUser_(user);
      }

      if (result && stats.hasOwnProperty(result.action)) stats[result.action]++;
    } catch (e) {
      stats.failed++;
      failures.push(user.email + ': ' + e.message);
      console.error('Signature sync failed for ' + user.email + ': ' + e.message);
    }
  });

  let businessCardStats = null;

  if (isProduction_()) {
    try {
      businessCardStats = syncBusinessCardsInternal_(listAllActiveUsers_());
    } catch (e) {
      console.error('Business card/vCard hourly sync warning: ' + e.message);
    }
  }

  let extraStats = null;

  if (isProduction_() && extraSendAsEnabled_()) {
    try {
      extraStats = syncExtraSendAsSignatures_();
    } catch (e) {
      failures.push('EXTRA SEND-AS: ' + e.message);
    }
  }

  console.log('Signature mode: ' + signatureMode_());
  console.log('Gmail signature sync complete: ' + JSON.stringify(stats));

  if (businessCardStats) {
    console.log('Business card/vCard hourly sync: ' + JSON.stringify(businessCardStats));
  }

  if (extraStats) {
    console.log('Extra send-as hourly sync: ' + JSON.stringify(extraStats));
  }

  if (failures.length) {
    throw new Error('Signature sync completed with failures (' + failures.length + '): ' + failures.join(' | '));
  }

  return stats;
}

function stageLaunchAssets() {
  const users = listAllActiveUsers_();
  let staged = 0;

  users.forEach(function(user) {
    if (!user.enabled) return;
    syncPhoto_(user);
    syncVCard_(user);
    staged++;
  });

  console.log('Staged signature assets for enabled users: ' + staged);
}

function launchReadinessCheck() {
  githubSettings_();
  serviceAccountSettings_();
  delegatedAccessToken_(ZP_CONFIG.TEST_USER);

  if (extraSendAsEnabled_()) {
    testExtraSendAsAccess();
  }

  const logo = githubGetFile_('assets/logo.svg');
  if (!logo) throw new Error('GitHub source asset assets/logo.svg was not found.');

  const users = listAllActiveUsers_();
  const enabled = users.filter(function(u) { return u.enabled; });
  const warnings = [];

  enabled.forEach(function(user) {
    if (!user.jobTitle) warnings.push(user.email + ': brak stanowiska');
    if (!user.phone) warnings.push(user.email + ': brak telefonu');
    if (!user.linkedin) warnings.push(user.email + ': brak LinkedIn');
  });

  console.log('Launch readiness OK. Active users: ' + users.length + '; EmailSignature=true: ' + enabled.length + '; EmailSignature=false: ' + (users.length - enabled.length));
  if (warnings.length) console.log('Optional profile warnings: ' + warnings.join(' | '));
  return { activeUsers: users.length, enabledUsers: enabled.length, warnings: warnings };
}

function removeSyncTriggers_() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === 'syncSignatures'; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });
}

function setupHourlyTrigger() {
  removeSyncTriggers_();
  ScriptApp.newTrigger('syncSignatures')
    .timeBased()
    .everyHours(1)
    .create();
}

function goLive() {
  launchReadinessCheck();
  setSignatureMode_(ZP_CONFIG.MODE_PRODUCTION);

  try {
    const stats = syncSignatures();
    setupHourlyTrigger();
    console.log('GO LIVE complete. Production mode is ON and hourly synchronization is active.');
    return stats;
  } catch (e) {
    setSignatureMode_(ZP_CONFIG.MODE_TEST);
    removeSyncTriggers_();
    console.error('GO LIVE failed. Mode returned to TEST and no hourly trigger is active. Some users may already have been updated before the error: ' + e.message);
    throw e;
  }
}

function backToTest() {
  setSignatureMode_(ZP_CONFIG.MODE_TEST);
  removeSyncTriggers_();
  console.log('TEST mode is ON. Hourly synchronization is OFF. Existing user signatures were not removed.');
}

function systemStatus() {
  const triggers = ScriptApp.getProjectTriggers().filter(function(t) {
    return t.getHandlerFunction() === 'syncSignatures';
  }).length;
  const users = listAllActiveUsers_();
  const enabled = users.filter(function(u) { return u.enabled; }).length;

  const status = {
    mode: signatureMode_(),
    hourlySyncTriggers: triggers,
    activeUsers: users.length,
    enabledUsers: enabled,
    disabledUsers: users.length - enabled,
    extraSendAsEnabled: extraSendAsEnabled_(),
    extraSendAsMappings: extraSendAsMappings_().length,
    businessCardsBaseUrl: ZP_CONFIG.ASSET_BASE_URL + '/contacts/',
    businessCardQrBaseUrl: ZP_CONFIG.ASSET_BASE_URL + '/qr/'
  };
  console.log(JSON.stringify(status));
  return status;
}

function signatureSchemaFields_() {
  return [
    {
      fieldName: ZP_CONFIG.LINKEDIN_FIELD,
      fieldType: 'STRING',
      multiValued: false,
      readAccessType: 'ADMINS_AND_SELF'
    },
    {
      fieldName: ZP_CONFIG.ENABLED_FIELD,
      fieldType: 'BOOL',
      multiValued: false,
      readAccessType: 'ADMINS_AND_SELF'
    },
    {
      fieldName: ZP_CONFIG.EXTERNAL_MAILBOXES_FIELD,
      displayName: 'External Gmail / Workspace mailboxes',
      fieldType: 'STRING',
      multiValued: true,
      readAccessType: 'ADMINS_AND_SELF'
    }
  ];
}

function setupSignatureSchema() {
  const name = ZP_CONFIG.CUSTOM_SCHEMA;
  let schema = null;

  try {
    schema = AdminDirectory.Schemas.get('my_customer', name);
  } catch (e) {
    schema = null;
  }

  if (!schema) {
    AdminDirectory.Schemas.insert({
      schemaName: name,
      displayName: 'Email Signature',
      fields: signatureSchemaFields_()
    }, 'my_customer');

    console.log('SignatureProfile schema created with ExternalMailboxes.');
    return;
  }

  const existing = {};
  (schema.fields || []).forEach(function(field) {
    existing[field.fieldName] = true;
  });

  const missing = signatureSchemaFields_().filter(function(field) {
    return !existing[field.fieldName];
  });

  if (!missing.length) {
    console.log('SignatureProfile schema already contains ExternalMailboxes.');
    return;
  }

  AdminDirectory.Schemas.patch({
    fields: (schema.fields || []).concat(missing)
  }, 'my_customer', name);

  console.log(
    'SignatureProfile schema upgraded. Added fields: ' +
    missing.map(function(field) { return field.fieldName; }).join(', ')
  );
}

function setExternalMailboxesForUser_(sourceUserEmail, mailboxEmails) {
  const values = normalizeExternalMailboxes_(mailboxEmails);
  const patch = { customSchemas: {} };
  patch.customSchemas[ZP_CONFIG.CUSTOM_SCHEMA] = {};
  patch.customSchemas[ZP_CONFIG.CUSTOM_SCHEMA][ZP_CONFIG.EXTERNAL_MAILBOXES_FIELD] =
    values.map(function(email) {
      return { value: email, type: 'work' };
    });

  AdminDirectory.Users.patch(patch, sourceUserEmail);
  return values;
}

function migrateLegacyExtraSendAsToDirectory() {
  setupSignatureSchema();

  const migrated = [];

  (ZP_CONFIG.LEGACY_EXTRA_SEND_AS || []).forEach(function(mapping) {
    const sourceUser = getWorkspaceUser_(mapping.sourceUserEmail);
    const mailboxes = (sourceUser.externalMailboxes || []).slice();

    if (mailboxes.indexOf(String(mapping.mailboxEmail).toLowerCase()) < 0) {
      mailboxes.push(String(mapping.mailboxEmail).toLowerCase());
    }

    const saved = setExternalMailboxesForUser_(mapping.sourceUserEmail, mailboxes);
    migrated.push({
      sourceUserEmail: mapping.sourceUserEmail,
      externalMailboxes: saved
    });
  });

  console.log('Legacy extra send-as mappings migrated to Directory: ' + JSON.stringify(migrated));
  return migrated;
}

function dynamicSendAsStatus() {
  const mappings = extraSendAsMappings_();
  const status = mappings.map(function(mapping) {
    return {
      mailboxEmail: mapping.mailboxEmail,
      sendAsEmail: mapping.sendAsEmail,
      sourceUserEmail: mapping.sourceUserEmail,
      source: mapping.source
    };
  });

  console.log(JSON.stringify(status));
  return status;
}

function setupTestUser() {
  const patch = { customSchemas: {} };
  patch.customSchemas[ZP_CONFIG.CUSTOM_SCHEMA] = {};
  patch.customSchemas[ZP_CONFIG.CUSTOM_SCHEMA][ZP_CONFIG.LINKEDIN_FIELD] = ZP_CONFIG.TEST_LINKEDIN;
  patch.customSchemas[ZP_CONFIG.CUSTOM_SCHEMA][ZP_CONFIG.ENABLED_FIELD] = true;
  AdminDirectory.Users.patch(patch, ZP_CONFIG.TEST_USER);
}

function prepareSystem() {
  setupSignatureSchema();
  setSignatureMode_(ZP_CONFIG.MODE_TEST);
  removeSyncTriggers_();
  launchReadinessCheck();
  stageLaunchAssets();
  syncSignatures();
  console.log('Preparation complete. Enabled-user assets are staged and the system remains in TEST mode.');
}
