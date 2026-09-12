#!/usr/bin/env python3
"""Validate all registered models without extracting PDF body text."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def validate(site):
    registry = json.loads((site / 'data/models.json').read_text())
    assert isinstance(registry['models'], list), 'Invalid model registry'
    model_ids = set()
    total_docs = total_pages = 0
    for entry in registry['models']:
        model = entry['model']
        assert re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', model), 'Invalid model ID'
        assert model not in model_ids, f'Duplicate model: {model}'
        model_ids.add(model)
        assert entry['catalog'] == f'data/{model}.json'
        catalog = json.loads((site / entry['catalog']).read_text())
        assert catalog['model'] == model
        docs = catalog['documents']
        assert docs, f'Empty catalog: {model}'
        assert entry['documentCount'] == len(docs)
        assert entry['sourcePages'] == catalog['sourcePages']
        ids = set()
        expected_page = 1
        modules = {m['id']: m for m in catalog['modules']}
        assert len(modules) == len(catalog['modules'])
        for doc in docs:
            assert doc['id'] not in ids, f"Duplicate ID: {doc['id']}"
            ids.add(doc['id'])
            if 'pageSizes' in doc:
                assert len(doc['pageSizes']) == doc['pages']
                assert all(len(size)==2 and all(isinstance(n,(int,float)) and n>0 for n in size) for size in doc['pageSizes'])
            assert re.fullmatch(re.escape(model)+r'-\d+', doc['id']), 'Invalid document ID'
            assert doc['file'] == f"docs/{model}/{doc['id']}.pdf", 'Invalid document path'
            assert doc['start'] == expected_page, f"Page gap/overlap before {doc['id']}"
            assert doc['pages'] == doc['end'] - doc['start'] + 1 > 0
            assert doc['module'] in modules, f"Unknown module: {doc['module']}"
            path = site / doc['file']
            assert path.is_file(), f"Missing PDF: {path}"
            assert path.stat().st_size == doc['bytes'], f"Size mismatch: {path}"
            assert doc['bytes'] < 100 * 1024**2, f"Git file limit: {path}"
            with path.open('rb') as stream:
                assert stream.read(5) == b'%PDF-', f"Invalid PDF header: {path}"
            expected_page = doc['end'] + 1
        assert expected_page - 1 == catalog['sourcePages']
        for doc in docs:
            if 'projectId' in doc:
                assert doc['projectId'] in ids, f"Unknown project: {doc['projectId']}"
        for module in modules.values():
            assert module['count'] == sum(d['module'] == module['id'] for d in docs)
        total_docs += len(docs)
        total_pages += catalog['sourcePages']
    for path in ['index.html','assets/app.mjs','assets/style.css','assets/search.mjs',
                 'assets/reader.mjs','assets/projects.mjs','assets/merge-worker.mjs',
                 'vendor/pdfjs/pdf.mjs','vendor/pdfjs/pdf.worker.mjs','vendor/pdf-lib/pdf-lib.esm.min.js']:
        assert (site / path).is_file(), f'Missing asset: {path}'
    size = sum(p.stat().st_size for p in site.rglob('*') if p.is_file())
    assert size < 1_000_000_000, 'Published site exceeds 1 GB'
    print(f'Validated {len(model_ids)} models / {total_docs} documents / {total_pages} pages.')
    print(f'Published site: {size/1024**2:.1f} MiB ({size:,} bytes).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', type=Path, default=ROOT/'site')
    validate(parser.parse_args().site)
