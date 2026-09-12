#!/usr/bin/env python3
"""Validate the deployed artifact without extracting PDF body text."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / 'site'
catalog = json.loads((SITE / 'data/981.json').read_text())
docs = catalog['documents']
assert docs, 'Empty catalog'
ids = set()
expected_page = 1
modules = {m['id']: m for m in catalog['modules']}
for doc in docs:
    assert doc['id'] not in ids, f"Duplicate ID: {doc['id']}"
    ids.add(doc['id'])
    assert doc['start'] == expected_page, f"Page gap/overlap before {doc['id']}"
    assert doc['pages'] == doc['end'] - doc['start'] + 1 > 0
    assert doc['module'] in modules, f"Unknown module: {doc['module']}"
    path = SITE / doc['file']
    assert path.is_file(), f"Missing PDF: {path}"
    assert path.stat().st_size == doc['bytes'], f"Size mismatch: {path}"
    assert doc['bytes'] < 100 * 1024**2, f"Git file limit: {path}"
    with path.open('rb') as stream:
        assert stream.read(5) == b'%PDF-', f"Invalid PDF header: {path}"
    expected_page = doc['end'] + 1
assert expected_page - 1 == catalog['sourcePages']
for module in modules.values():
    assert module['count'] == sum(d['module'] == module['id'] for d in docs)
for path in ['index.html','assets/app.mjs','assets/style.css','assets/search.mjs',
             'vendor/pdfjs/pdf.mjs','vendor/pdfjs/pdf.worker.mjs']:
    assert (SITE / path).is_file(), f'Missing asset: {path}'
size = sum(p.stat().st_size for p in SITE.rglob('*') if p.is_file())
assert size < 1_000_000_000, 'Published site exceeds 1 GB'
print(f"Validated {len(docs)} documents / {catalog['sourcePages']} pages / {len(modules)} modules.")
print(f"Published site: {size/1024**2:.1f} MiB ({size:,} bytes).")
