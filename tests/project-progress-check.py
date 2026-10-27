"""Exercise the boundary used by unattended project-feed updates."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('check_progress',ROOT/'check_project_progress.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class MajorProjectContract(unittest.TestCase):
    def setUp(self):self.data=json.loads((ROOT/'src/project-progress.json').read_text())
    def check(self,d):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'feed.json';p.write_text(json.dumps(d,ensure_ascii=False));return module.check(p)
    def test_current_feed(self):self.assertEqual(self.check(self.data),11)
    def test_small_work_can_be_added_to_existing_group(self):
        d=copy.deepcopy(self.data);d['projects'][0]['includes'].append('new-store-check');self.assertEqual(self.check(d),11)
    def test_extra_major_project_is_rejected(self):
        d=copy.deepcopy(self.data);d['projects'].append(copy.deepcopy(d['projects'][0]));
        with self.assertRaises(AssertionError):self.check(d)
    def test_moving_legacy_work_between_groups_is_rejected(self):
        d=copy.deepcopy(self.data);d['projects'][0]['includes'].remove('pos');d['projects'][1]['includes'].append('pos')
        with self.assertRaises(AssertionError):self.check(d)
    def test_duplicate_or_reference_work_is_rejected(self):
        for value in ['pos','buttermilk']:
            d=copy.deepcopy(self.data);d['projects'][1]['includes'].append(value)
            with self.assertRaises(AssertionError):self.check(d)

if __name__=='__main__':unittest.main(verbosity=2)
