"""Build contract checks; no browser, credentials or business data required."""
from pathlib import Path
from html.parser import HTMLParser
import hashlib
import json
import re
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
PAGES = 'index finance bank products purchases sourcing sales stock partners audit settings branding characters agents quick'.split()


class Head(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.tags = []
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))


class BuildContract(unittest.TestCase):
    def test_fifteen_pages_share_head_and_build(self):
        versions = set()
        for page in PAGES:
            with self.subTest(page=page):
                parsed = Head((ROOT / (page + '.html')).read_text(encoding='utf-8'))
                tags = parsed.tags
                self.assertTrue(any(t == 'link' and a.get('rel') == 'manifest' and a.get('href') == 'manifest.webmanifest' for t, a in tags))
                self.assertTrue(any(t == 'link' and a.get('rel') == 'apple-touch-icon' for t, a in tags))
                self.assertTrue(any(t == 'script' and a.get('src', '').startswith('src/pwa.js?v=') for t, a in tags))
                self.assertFalse(any(t == 'script' and 'src' not in a for t, a in tags))
                for name in ['apple-mobile-web-app-capable', 'mobile-web-app-capable', 'apple-mobile-web-app-title']:
                    self.assertTrue(any(t == 'meta' and a.get('name') == name for t, a in tags))
                csp = next(a['content'] for t, a in tags if t == 'meta' and a.get('http-equiv') == 'Content-Security-Policy')
                script = next(part.strip() for part in csp.split(';') if part.strip().startswith('script-src '))
                self.assertTrue(script.startswith("script-src 'self'"))
                self.assertNotIn('unsafe-inline', script)
                self.assertIn("worker-src 'self'", csp)
                self.assertIn("manifest-src 'self'", csp)
                versions.add(next(a['data-build'] for t, a in tags if t == 'body'))
        self.assertEqual(len(versions), 1)
        worker = (ROOT / 'sw.js').read_text(encoding='utf-8')
        self.assertIn("const VERSION = '" + versions.pop() + "'", worker)

    def test_manifest_and_icons(self):
        manifest = json.loads((ROOT / 'manifest.webmanifest').read_text(encoding='utf-8'))
        self.assertEqual(manifest['name'], '무무토리 스튜디오')
        self.assertEqual(manifest['short_name'], '무무토리')
        for key in ['scope', 'start_url']:
            self.assertEqual(manifest[key], './')
        self.assertEqual(manifest['display'], 'standalone')
        for file, size in [('icon-192.png', 192), ('icon-512.png', 512), ('icon-maskable-512.png', 512), ('apple-touch-icon.png', 180)]:
            data = (ROOT / 'assets' / file).read_bytes()
            self.assertEqual(data[:8], b'\x89PNG\r\n\x1a\n')
            self.assertEqual(struct.unpack('>II', data[16:24]), (size, size))

    def test_cache_allowlist_matches_bytes_and_excludes_data(self):
        worker = (ROOT / 'sw.js').read_text(encoding='utf-8')
        assets = json.loads(re.search(r'^const ASSETS = (.+);$', worker, re.M)[1])
        pages = json.loads(re.search(r'^const PAGES = (.+);$', worker, re.M)[1])
        for file, digest in {**assets, **pages}.items():
            raw = (ROOT / file).read_bytes()
            if Path(file).suffix in {'.js', '.css', '.svg', '.html', '.webmanifest'}:
                raw = raw.replace(b'\r\n', b'\n')
            self.assertEqual(hashlib.sha256(raw).hexdigest(), digest, file)
            self.assertNotIn('data/', file)
            self.assertFalse(file.endswith(('.json', '.json.gz')))
        self.assertFalse(set(pages) & {'index.html', 'finance.html', 'bank.html', 'quick.html', 'sourcing.html', 'characters.html', 'branding.html', 'letter-hub.html', 'palsibo-shopping.html'})
        documents = json.loads(re.search(r'^const DOCUMENTS = (.+);$', worker, re.M)[1])
        self.assertIn('letter-hub.html', documents)
        self.assertIn('palsibo-shopping.html', documents)
        self.assertNotIn('src/shopping.js', assets)
        self.assertNotIn('src/shopping-data.js', assets)
        for file in assets:
            name = Path(file).name
            self.assertNotIn(name, {'fbauth.js', 'home-fin.js', 'finance.js', 'bank.js', 'overview.js'})
            self.assertFalse(name.startswith(('fin-', 'quick')))
            self.assertNotIn('vendor', Path(file).parts)


if __name__ == '__main__':
    unittest.main(verbosity=2)
