import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {profileCards} from '../scripts/profile-model.mjs';

const hash = x => crypto.createHash('sha256').update(String(x)).digest('hex');
function publisher() {
  const context = vm.createContext({
    ZP_CONFIG: {DOMAIN:'zdrowapolskagroup.pl', COMPANY:'Zdrowa Polska', WEBSITE:'example.com'},
    Utilities:{newBlob:x=>({getBytes:()=>String(x)})}, sha256Hex_:hash,
    slugFromEmail_:e=>e.split('@')[0],
    workspaceUserFromRaw_:r=>({email:r.primaryEmail,fullName:r.name.fullName,jobTitle:r.title,
      enabled:r.enabled,phone:r.phone,linkedin:r.linkedin}),
    syncPhoto_:u=>'https://example.com/photo-'+u.email+'.png', getUserPhoto_:()=>null,
    buildVCard_:u=>`BEGIN:VCARD\r\nFN:${u.fullName}\r\nEMAIL:${u.email}\r\nEND:VCARD\r\n`,
    buildSignatureHtml_:u=>`<p>${u.fullName} ${u.email} ${u.phone} ${u.jobTitle}</p>`,
    DISCLAIMER_PL:'PL',DISCLAIMER_EN:'EN', console
  });
  vm.runInContext(fs.readFileSync('apps-script/UnifiedProfileSync.gs','utf8'),context);
  return (users,history={})=>JSON.parse(JSON.stringify(context.unifiedSnapshot_(users,history)));
}
const raw = () => ({id:'permanent-google-id',primaryEmail:'malgorzata@zdrowapolskagroup.pl',
  name:{fullName:'Małgorzata Bojanowska'},enabled:true,title:'CEO',phone:'123',aliases:[]});
test('email rename preserves old phone URL and changes every published contact and signature',()=>{
  const publish=publisher(), a=raw(), initial=publish([a]);
  a.primaryEmail='mbojanowska@zdrowapolskagroup.pl';
  a.aliases=['malgorzata@zdrowapolskagroup.pl'];
  const next=publish([a],initial.histories), cards=profileCards(next.snapshot);
  assert.equal(cards.length,2);
  assert.ok(cards.some(c=>c.slug==='malgorzata'));
  assert.ok(cards.every(c=>c.email===a.primaryEmail && c.vcard.includes('EMAIL:'+a.primaryEmail)
    && c.html.includes(a.primaryEmail)));
  assert.equal(next.snapshot.profiles[0].id, initial.snapshot.profiles[0].id);
});
test('name, phone, title, LinkedIn and photo source follow the current profile',()=>{
  const publish=publisher(), a=raw(), initial=publish([a]);
  Object.assign(a,{name:{fullName:'Changed Name'},title:'Director',phone:'456',linkedin:'https://linkedin.com/in/new'});
  const next=publish([a],initial.histories).snapshot.profiles[0];
  assert.equal(next.fullName,'Changed Name');assert.equal(next.phone,'456');
  assert.equal(next.title,'Director');assert.equal(next.linkedin,a.linkedin);
  assert.ok(next.html.includes('Changed Name') && next.text.includes('456'));
});
test('disabling or suspending removes published cards and signatures',()=>{
  const publish=publisher(), a=raw(), initial=publish([a]);
  a.enabled=false;
  let result=publish([a],initial.histories);
  assert.equal(profileCards(result.snapshot).length,0);
  assert.equal(result.snapshot.profiles[0].html,undefined);
  a.enabled=true;a.suspended=true;result=publish([a],initial.histories);
  assert.equal(result.snapshot.profiles[0].active,false);
  assert.equal(profileCards(result.snapshot).length,0);
});
test('historical links cannot silently be reassigned to a different Google identity',()=>{
  const publish=publisher(), a=raw(), initial=publish([a]);
  const replacement={...a,id:'different-person'};
  assert.throws(()=>publish([replacement],initial.histories),/cannot be reassigned/);
});
test('a malformed snapshot or path traversal cannot be published',()=>{
  const publish=publisher(), snapshot=publish([raw()]).snapshot;
  snapshot.complete=false;assert.throws(()=>profileCards(snapshot),/incomplete/);
  snapshot.complete=true;snapshot.profiles[0].slugs=['../other'];
  assert.throws(()=>profileCards(snapshot),/URL/);
});
test('deleted employees publish anonymous tombstones and keep their URL reserved',()=>{
  const publish=publisher(),a=raw(),initial=publish([a]);
  const other={...raw(),id:'remaining-user',primaryEmail:'other@zdrowapolskagroup.pl',enabled:false};
  const result=publish([other],initial.histories);
  assert.equal(result.snapshot.profiles.length,1);
  assert.equal(result.snapshot.profiles[0].active,false);
  assert.equal(result.snapshot.profiles[0].email,undefined);
  assert.equal(profileCards(result.snapshot).length,0);
});
