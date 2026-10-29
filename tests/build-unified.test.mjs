import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

test('a full site build updates historical phone URLs and suppresses retired cards',async()=>{
  const root=process.cwd(),tmp=await fs.mkdtemp(path.join(os.tmpdir(),'zp-unified-build-'));
  try {
    await fs.cp(path.join(root,'assets'),path.join(tmp,'assets'),{recursive:true});
    await fs.mkdir(path.join(tmp,'data/photos'),{recursive:true});
    await fs.mkdir(path.join(tmp,'data/vcards'),{recursive:true});
    const id='a'.repeat(64),retired='b'.repeat(64),email='mbojanowska@zdrowapolskagroup.pl';
    const profile={id,email,aliases:['malgorzata@zdrowapolskagroup.pl'],
      slugs:['malgorzata','mbojanowska'],active:true,enabled:true,
      fullName:'Test Person',photoUrl:'https://example.org/current-photo.png',
      html:'<p>'+email+'</p>',text:email,
      vcard:`BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Test Person\r\nEMAIL:${email}\r\nUID:urn:zdrowapolska:${id}\r\nEND:VCARD\r\n`};
    await fs.writeFile(path.join(tmp,'data/unified-profiles.json'),JSON.stringify({version:1,
      domain:'zdrowapolskagroup.pl',complete:true,profiles:[profile,{id:retired,slugs:['retired'],active:false,enabled:false}]}));
    process.chdir(tmp);
    try { await import(pathToFileURL(path.join(root,'scripts/build.mjs')).href); }
    finally {process.chdir(root);}
    for(const slug of profile.slugs) {
      const html=await fs.readFile(path.join(tmp,`site/card/${slug}/index.html`),'utf8');
      assert.ok(html.includes(`mailto:${email}`));
      assert.ok(html.includes('visibilitychange') && html.includes('cache:\'no-store\''));
      assert.ok(html.includes(profile.photoUrl));
      const vcard=await fs.readFile(path.join(tmp,`site/contacts/${slug}.vcf`),'utf8');
      assert.ok(vcard.includes(email) && vcard.includes(id));
    }
    await assert.rejects(fs.access(path.join(tmp,'site/card/retired/index.html')));
    assert.equal(JSON.parse(await fs.readFile(path.join(tmp,`site/profiles/${retired}.json`))).active,false);
  } finally {await fs.rm(tmp,{recursive:true,force:true});}
});
