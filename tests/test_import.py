import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import pymupdf as fitz
import manuals


def fixture(path, *, bookmarks=False, blank=False, count=4):
    path.parent.mkdir(parents=True, exist_ok=True)
    with fitz.open() as pdf:
        for i in range(count):
            page = pdf.new_page()
            if not blank:
                if i == 0:
                    page.insert_text((40, 70), 'WM 100100 Engine oil service')
                elif i == 2:
                    page.insert_text((40, 70), 'WM 400100 Brake inspection')
                else:
                    page.insert_text((40, 70), 'Continuation')
                page.insert_text((40, 400), 'BODY_ONLY_SENTINEL_MUST_NOT_ENTER_CATALOG')
        if bookmarks:
            pdf.set_toc([[1, 'Engine', 1], [2, 'Engine oil', 1], [1, 'Brakes', 3]])
        pdf.save(path)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'site/data').mkdir(parents=True)
        (self.root / 'site/data/models.json').write_text('{"version":1,"models":[]}')
        fixture(self.root / 'manuals/982/source.pdf')

    def tearDown(self):
        self.temp.cleanup()

    def run_import(self, model='982', *args):
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            return manuals.main(['--root', str(self.root), '--model', model, *args])

    def catalog(self, model='982'):
        return json.loads((self.root / f'site/data/{model}.json').read_text())

    def test_two_models_preserve_existing_data_and_alias_paths(self):
        self.assertEqual(self.run_import('982', '--name', '718'), 0)
        first = (self.root / 'site/data/982.json').read_bytes()
        fixture(self.root / 'manuals/911-992/source.pdf', bookmarks=True)
        self.assertEqual(self.run_import('911-992', '--name', '911'), 0)
        self.assertEqual(first, (self.root / 'site/data/982.json').read_bytes())
        models = json.loads((self.root / 'site/data/models.json').read_text())['models']
        self.assertEqual([m['model'] for m in models], ['982', '911-992'])
        self.assertTrue(all(d['file'].startswith('docs/911-992/') for d in self.catalog('911-992')['documents']))
        self.assertNotIn('BODY_ONLY_SENTINEL', json.dumps(self.catalog()))
        with fitz.open(self.root / 'manuals/982/source.pdf') as src:
            for d in self.catalog()['documents']:
                with fitz.open(self.root / 'site' / d['file']) as out:
                    self.assertEqual(len(out), d['pages'])
                    for i in range(len(out)):
                        self.assertEqual(src[d['start']-1+i].get_pixmap().samples, out[i].get_pixmap().samples)

    def test_bookmarks_never_extract_page_text(self):
        fixture(self.root / 'manuals/982/source.pdf', bookmarks=True)
        with patch.object(fitz.Page, 'get_text', side_effect=AssertionError('no page extraction')):
            self.assertEqual(self.run_import(), 0)
        self.assertEqual(self.catalog()['indexingMethod'], 'bookmarks')
        self.assertEqual(self.catalog()['documents'][0]['title'], 'Engine oil')

    def test_numbered_bookmarks_supply_search_code_and_module(self):
        source = self.root / 'manuals/982/source.pdf'
        with fitz.open(source) as pdf:
            pdf.set_toc([[1, '100119 拆卸和安装发动机', 1], [1, '400100 检查制动器', 3]])
            pdf.saveIncr()
        self.assertEqual(self.run_import(), 0)
        docs = self.catalog()['documents']
        self.assertEqual([(d['code'], d['module'], d['title']) for d in docs], [
            ('100119', '1', '拆卸和安装发动机'),
            ('400100', '4', '检查制动器'),
        ])

    def test_headers_are_clipped_and_cache_avoids_reextraction(self):
        original = fitz.Page.get_text
        clips = []
        def clipped(page, *args, **kwargs):
            clips.append(kwargs.get('clip'))
            self.assertIsNotNone(kwargs.get('clip'))
            self.assertLessEqual(kwargs['clip'].height, page.rect.height*.4)
            return original(page, *args, **kwargs)
        with patch.object(fitz.Page, 'get_text', clipped):
            self.assertEqual(self.run_import('982', '--inspect'), 0)
        self.assertEqual(len(clips), 4)
        self.assertFalse((self.root / 'site/docs/982').exists())
        with patch.object(fitz.Page, 'get_text', side_effect=AssertionError('cache was ignored')):
            self.assertEqual(self.run_import(), 0)

    def test_replace_is_explicit_and_updates_only_one_model(self):
        self.assertEqual(self.run_import(), 0)
        self.assertEqual(self.run_import(), 1)
        self.assertEqual(self.run_import('982', '--replace', '--chunk-pages', '1'), 0)
        self.assertEqual(len(self.catalog()['documents']), 4)
        self.assertEqual(sum(d['pages'] for d in self.catalog()['documents']), 4)
        docs=self.catalog()['documents']
        self.assertEqual([d['projectId'] for d in docs],['982-0001','982-0001','982-0003','982-0003'])
        self.assertTrue(all(len(d['pageSizes'])==d['pages'] for d in docs))

    def test_unrecognized_pdf_requires_explicit_fallback(self):
        fixture(self.root / 'manuals/982/source.pdf', blank=True)
        self.assertEqual(self.run_import(), 1)
        self.assertFalse((self.root / 'site/docs/982').exists())
        self.assertEqual(self.run_import('982', '--mode', 'pages', '--chunk-pages', '2'), 0)
        self.assertEqual(len(self.catalog()['documents']), 2)
        self.assertEqual(self.catalog()['indexingMethod'], 'pages')

    def test_custom_toc_and_invalid_boundaries(self):
        path = self.root / 'toc.json'
        path.write_text(json.dumps([{'start': 1, 'title':'Intro'}, {'start':3, 'title':'Service', 'module':'0'}]))
        self.assertEqual(self.run_import('982', '--toc', str(path)), 0)
        before = (self.root / 'site/data/982.json').read_bytes()
        path.write_text(json.dumps([{'start': 5, 'title':'Out of range'}]))
        self.assertEqual(self.run_import('982', '--toc', str(path), '--replace'), 1)
        self.assertEqual(before, (self.root / 'site/data/982.json').read_bytes())

    def test_quota_failure_preserves_previous_site_and_can_resume(self):
        self.assertEqual(self.run_import(), 0)
        before = (self.root / 'site/data/models.json').read_bytes()
        fixture(self.root / 'manuals/911/source.pdf')
        with patch.object(manuals, 'SITE_LIMIT', 1):
            self.assertEqual(self.run_import('911'), 1)
        self.assertEqual(before, (self.root / 'site/data/models.json').read_bytes())
        self.assertFalse((self.root / 'site/docs/911').exists())
        self.assertTrue(list((self.root / 'tmp/manuals/911/slices').glob('*.pdf')))
        self.assertEqual(self.run_import('911'), 0)

    def test_path_validation_and_ambiguous_source(self):
        self.assertEqual(self.run_import('../bad'), 1)
        fixture(self.root / 'manuals/982/extra.pdf')
        self.assertEqual(self.run_import(), 1)
        self.assertEqual(self.run_import('982', '--source', str(self.root / 'manuals/982/source.pdf')), 0)

    def test_publish_failure_rolls_back_existing_model(self):
        self.assertEqual(self.run_import(), 0)
        before = (self.root / 'site/data/982.json').read_bytes()
        real_save = manuals.save_json
        def fail_registry(path, data):
            if path.name == 'models.json':
                raise OSError('simulated registry write failure')
            real_save(path, data)
        with patch.object(manuals, 'save_json', fail_registry):
            self.assertEqual(self.run_import('982', '--replace', '--name', 'Replacement'), 1)
        self.assertEqual(before, (self.root / 'site/data/982.json').read_bytes())
        self.assertEqual(len(list((self.root / 'site/docs/982').glob('*.pdf'))), 2)


if __name__ == '__main__':
    unittest.main()
