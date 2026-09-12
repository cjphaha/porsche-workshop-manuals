"""Create an isolated multi-model fixture website without touching the real catalog."""
import json
from pathlib import Path
import shutil
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from test_import import fixture

root = Path(__file__).resolve().parents[1]
preview = root / 'tmp/multi-model-preview'
if preview.exists():
    shutil.rmtree(preview)
site = preview / 'site'
(site / 'data').mkdir(parents=True, exist_ok=True)
(site / 'docs').mkdir(exist_ok=True)
for name in ['assets', 'vendor']:
    dest = site / name
    if not dest.exists():
        dest.symlink_to(root / 'site' / name, target_is_directory=True)
if not (site / 'docs/981').exists():
    (site / 'docs/981').symlink_to(root / 'site/docs/981', target_is_directory=True)
shutil.copyfile(root / 'site/index.html', site / 'index.html')
for name in ['981.json','models.json']:
    shutil.copyfile(root / 'site/data' / name, site / 'data' / name)
fixture(preview / 'manuals/982/manual.pdf')
fixture(preview / 'manuals/911-992/manual.pdf', bookmarks=True)
print(preview)
