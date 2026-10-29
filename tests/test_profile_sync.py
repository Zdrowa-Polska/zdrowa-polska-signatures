import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gateway'))
from profile_sync import compile_snapshot

OLD = 'malgorzata@zdrowapolskagroup.pl'
NEW = 'mbojanowska@zdrowapolskagroup.pl'

def snapshot():
    return {'version':1,'complete':True,'domain':'zdrowapolskagroup.pl','profiles':[
        {'id':'a'*64,'email':OLD,'aliases':[],'active':True,'enabled':True,
         'html':'<p>Małgorzata '+OLD+'</p>','text':'Małgorzata '+OLD}]}

class ProfileSyncTests(unittest.TestCase):
    def test_rename_preserves_login_identity_updates_signature_and_allowed_sender(self):
        initial, state, logins = compile_snapshot(snapshot(), {}, {OLD:OLD})
        source = snapshot(); p=source['profiles'][0]
        p.update(email=NEW,aliases=[OLD],html='<p>'+NEW+'</p>',text=NEW)
        current, next_state, logins = compile_snapshot(source, state, {OLD:OLD})
        self.assertEqual(current['signatures'][NEW]['html'],'<p>'+NEW+'</p>')
        self.assertEqual(current['signatures'][OLD]['primary'],NEW)
        self.assertEqual(logins[NEW], OLD)
        self.assertEqual(next_state['bindings'], state['bindings'])

    def test_removed_alias_does_not_keep_sending_permission(self):
        _, state, _ = compile_snapshot(snapshot(), {}, {OLD:OLD})
        source=snapshot();source['profiles'][0].update(email=NEW)
        current, state, logins=compile_snapshot(source,state,{OLD:OLD})
        self.assertNotIn(OLD,current['allowed_senders'])
        self.assertNotIn(OLD,logins)
        self.assertIn(OLD,state['managed_addresses'])

    def test_suspension_revokes_both_delivery_paths(self):
        _,state,_=compile_snapshot(snapshot(),{},{OLD:OLD})
        source=snapshot();source['profiles'][0].update(active=False,enabled=False)
        current,_,logins=compile_snapshot(source,state,{OLD:OLD})
        self.assertFalse(current['signatures']);self.assertFalse(logins)
        self.assertFalse(current['allowed_senders'])

    def test_signature_disabled_keeps_mail_enabled_without_signature(self):
        _,state,_=compile_snapshot(snapshot(),{},{OLD:OLD})
        source=snapshot();source['profiles'][0].update(enabled=False,html='',text='')
        current,_,logins=compile_snapshot(source,state,{OLD:OLD})
        self.assertFalse(current['signatures'][OLD]['enabled'])
        self.assertIn(OLD,current['allowed_senders']);self.assertEqual(logins[OLD],OLD)

    def test_a_new_identity_never_inherits_an_existing_identitys_credentials(self):
        _,state,_=compile_snapshot(snapshot(),{},{OLD:OLD})
        source=snapshot();source['profiles'][0]['id']='b'*64
        _,_,logins=compile_snapshot(source,state,{OLD:OLD})
        self.assertNotIn(OLD,logins)

    def test_bad_or_partial_export_does_not_produce_runtime_state(self):
        for change in ({'complete':False},{'profiles':[]},{'version':2}):
            source=snapshot();source.update(change)
            with self.assertRaises(ValueError):compile_snapshot(source,{},{})
        source=snapshot();source['profiles'].append(copy.deepcopy(source['profiles'][0]))
        with self.assertRaises(ValueError):compile_snapshot(source,{},{})

    def test_deleted_employee_tombstone_revokes_permissions_without_republishing_data(self):
        _,state,_=compile_snapshot(snapshot(),{},{OLD:OLD})
        source=snapshot();source['profiles']=[{'id':'a'*64,'active':False,'enabled':False,'slugs':['malgorzata']}]
        current,_,logins=compile_snapshot(source,state,{OLD:OLD})
        self.assertFalse(current['signatures']);self.assertFalse(logins)

if __name__=='__main__':unittest.main()
