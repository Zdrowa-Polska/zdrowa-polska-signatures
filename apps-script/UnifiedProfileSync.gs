/* Uses the existing Directory/Gmail renderer; raw Google IDs never leave Script Properties. */
const ZP_UNIFIED_PATH = 'data/unified-profiles.json';

function unifiedDirectoryUsers_() {
  const users = [];
  let pageToken;
  do {
    const page = AdminDirectory.Users.list({domain: ZP_CONFIG.DOMAIN,
      projection: 'full', maxResults: 200, pageToken: pageToken});
    (page.users || []).forEach(function(raw) { users.push(raw); });
    pageToken = page.nextPageToken;
  } while (pageToken);
  return users;
}

function unifiedHistory_(raw, previous) {
  if (!raw.id) throw new Error('Directory user has no immutable ID');
  const id = sha256Hex_(Utilities.newBlob(String(raw.id)).getBytes());
  const emails = [raw.primaryEmail].concat(raw.aliases || [])
    .map(function(x) { return String(x).toLowerCase(); })
    .filter(function(x) { return x.endsWith('@' + ZP_CONFIG.DOMAIN); });
  const prior = previous[id] || {slugs: []};
  const slugs = Array.from(new Set(prior.slugs.concat(emails.map(slugFromEmail_)))).sort();
  return {id: id, emails: Array.from(new Set(emails)).sort(), slugs: slugs};
}

function unifiedPlainText_(user) {
  return [user.fullName, user.jobTitle, ZP_CONFIG.COMPANY, user.phone,
    user.email, ZP_CONFIG.WEBSITE, user.linkedin, '', DISCLAIMER_PL, '', DISCLAIMER_EN]
    .filter(function(x) { return x !== undefined && x !== null; }).join('\n');
}

function unifiedSnapshot_(rawUsers, previous) {
  if (!rawUsers.length) throw new Error('Empty Directory read; keeping last good publication');
  const owners = {};
  rawUsers.forEach(function(raw) {
    [raw.primaryEmail].concat(raw.aliases || []).forEach(function(email) {
      if (!String(email).toLowerCase().endsWith('@' + ZP_CONFIG.DOMAIN)) return;
      const slug = slugFromEmail_(email);
      if (owners[slug] && owners[slug] !== String(raw.id)) {
        throw new Error('Conflicting Directory address: ' + slug);
      }
      owners[slug] = String(raw.id);
    });
  });
  const histories = {};
  const usedSlugs = {};
  const profiles = rawUsers.map(function(raw) {
    const u = workspaceUserFromRaw_(raw);
    const history = unifiedHistory_(raw, previous);
    // Do not publish a directory of employees who never opted into public signatures/cards.
    if ((!u.enabled || raw.suspended || raw.archived) && !previous[history.id]) return null;
    // Do not let a historical URL silently switch to another employee.
    history.slugs.forEach(function(slug) {
      if ((owners[slug] && owners[slug] !== String(raw.id)) ||
          (usedSlugs[slug] && usedSlugs[slug] !== history.id)) {
        throw new Error('Historical business-card URL collision: ' + slug);
      }
      usedSlugs[slug] = history.id;
    });
    histories[history.id] = {slugs: history.slugs};
    const active = !raw.suspended && !raw.archived;
    const enabled = active && u.enabled;
    const profile = {id: history.id, email: String(u.email).toLowerCase(),
      aliases: history.emails.filter(function(e) { return e !== u.email.toLowerCase(); }),
      slugs: history.slugs, active: active, enabled: enabled};
    if (enabled) {
      const photoUrl = syncPhoto_(u);
      const photo = getUserPhoto_(u.email);
      profile.fullName = u.fullName;
      profile.title = u.jobTitle;
      profile.phone = u.phone;
      profile.linkedin = u.linkedin;
      profile.photoUrl = photoUrl;
      profile.vcard = buildVCard_(u, photo).replace('END:VCARD',
        'UID:urn:zdrowapolska:' + history.id + '\r\nEND:VCARD');
      profile.html = buildSignatureHtml_(u, photoUrl);
      profile.text = unifiedPlainText_(u);
    }
    return profile;
  }).filter(function(p) { return p !== null; })
    .sort(function(a, b) { return a.id.localeCompare(b.id); });
  // Retain deleted users' URL reservations privately, never their published details.
  Object.keys(previous).forEach(function(id) {
    if (!histories[id]) {
      histories[id] = previous[id];
      profiles.push({id: id, slugs: previous[id].slugs, active: false, enabled: false});
    }
  });
  Object.keys(histories).forEach(function(id) {
    (histories[id].slugs || []).forEach(function(slug) {
      if (usedSlugs[slug] && usedSlugs[slug] !== id) {
        throw new Error('Retired business-card URL cannot be reassigned: ' + slug);
      }
    });
  });
  profiles.sort(function(a, b) { return a.id.localeCompare(b.id); });
  return {snapshot: {version: 1, domain: ZP_CONFIG.DOMAIN, complete: true, profiles: profiles},
    histories: histories};
}

function syncUnifiedProfiles() {
  if (!isProduction_()) throw new Error('Unified sync requires existing production mode');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {skipped: 'another sync is running'};
  const props = PropertiesService.getScriptProperties();
  try {
    const previous = JSON.parse(props.getProperty('ZP_UNIFIED_HISTORY') || '{}');
    const result = unifiedSnapshot_(unifiedDirectoryUsers_(), previous);
    const content = JSON.stringify(result.snapshot);
    // Publish only complete Directory reads. Any rendering/read failure keeps last good snapshot.
    const changed = githubPutBytesIfChanged_(ZP_UNIFIED_PATH,
      Utilities.newBlob(content, 'application/json').getBytes(),
      'Synchronize public employee profiles from Google Workspace');
    props.setProperty('ZP_UNIFIED_HISTORY', JSON.stringify(result.histories));
    props.setProperty('ZP_UNIFIED_LAST_PUBLISHED', new Date().toISOString());
    props.deleteProperty('ZP_UNIFIED_LAST_ERROR');
    // Existing code remains responsible for primary and configured extra Gmail signatures.
    syncSignatures();
    props.setProperty('ZP_UNIFIED_LAST_SUCCESS', new Date().toISOString());
    console.log(JSON.stringify({unifiedProfiles: result.snapshot.profiles.length, changed: changed}));
    return {profiles: result.snapshot.profiles.length, changed: changed};
  } catch (e) {
    props.setProperty('ZP_UNIFIED_LAST_ERROR', new Date().toISOString() + ' ' + e.message);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function enableUnifiedProfileSync() {
  // Validate and complete a real sync before replacing the old schedule.
  const result = syncUnifiedProfiles();
  const old = ScriptApp.getProjectTriggers().filter(function(t) {
    return ['syncSignatures', 'syncUnifiedProfiles'].indexOf(t.getHandlerFunction()) >= 0;
  });
  ScriptApp.newTrigger('syncUnifiedProfiles').timeBased().everyMinutes(5).create();
  old.forEach(function(t) { ScriptApp.deleteTrigger(t); });
  return result;
}

function unifiedProfileSyncStatus() {
  const p = PropertiesService.getScriptProperties();
  console.log(JSON.stringify({lastSuccess: p.getProperty('ZP_UNIFIED_LAST_SUCCESS'),
    lastPublished: p.getProperty('ZP_UNIFIED_LAST_PUBLISHED'),
    lastError: p.getProperty('ZP_UNIFIED_LAST_ERROR'),
    triggers: ScriptApp.getProjectTriggers().filter(function(t) {
      return t.getHandlerFunction() === 'syncUnifiedProfiles';
    }).length}));
}
