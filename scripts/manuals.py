#!/usr/bin/env python3
"""Offline multi-model manual importer. Extract bookmarks or page headers only."""
import argparse
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys

import pymupdf as fitz
from modules import MODULES

ROOT = Path(__file__).resolve().parents[1]
MODEL_RE = re.compile(r'[a-z0-9][a-z0-9-]{0,39}\Z')
MODULE_IDS = {m[0] for m in MODULES}
SITE_LIMIT = 1_000_000_000
FILE_LIMIT = 100 * 1024**2


def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
    temp.replace(path)


def read_json(path, default=None):
    return json.loads(path.read_text()) if path.exists() else default


def source_hash(source):
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def classify(code, title):
    if re.search(r'蓄电池|保险熔丝|保险丝盒|熔断器', title):
        return '9'
    if code and code[0].isdigit():
        return code[0]
    for module, pattern in [
        ('0', r'保养|维护|maintenance|service schedule'),
        ('4', r'制动|刹车|悬架|转向|轮胎|brake|suspension|steering|wheel'),
        ('3', r'变速|离合|传动|transmission|clutch|gearbox|\bpdk\b'),
        ('8', r'空调|暖风|air conditioning|heating|climate'),
        ('7', r'内饰|座椅|interior|seat'),
        ('6', r'敞篷|玻璃|后视镜|exterior|roof|mirror'),
        ('5', r'车身|车门|body|door'),
        ('9', r'电气|电源|灯光|控制单元|electrical|battery|lighting'),
        ('2', r'燃油|排放|进气|点火|fuel|exhaust|ignition|intake'),
        ('1', r'发动机|引擎|润滑|冷却|engine|lubrication|cooling'),
    ]:
        if re.search(pattern, title, re.I):
            return module
    return 'reference'


def heading(start, title, code=''):
    title = re.sub(r'\s+', ' ', title).strip()
    match = re.search(r'\bWM\s+([A-Z0-9]{4,10})\s+(.+)', title)
    if match:
        code, title = match.groups()
    return dict(start=start, title=title, code=code, module=classify(code, title))


def validate_headings(items, pages):
    if not isinstance(items, list) or not items:
        raise ValueError('目录必须是非空数组，每项包含 start 和 title。')
    seen = set()
    for item in items:
        start = item.get('start')
        if type(start) is not int or not 1 <= start <= pages or start in seen:
            raise ValueError(f'目录页码越界或重复: {start}')
        seen.add(start)
        if not isinstance(item.get('title'), str) or not item['title'].strip():
            raise ValueError(f'第 {start} 页目录标题为空。')
        if item.get('module', 'reference') not in MODULE_IDS:
            raise ValueError(f'未知维修模块: {item.get("module")}')
        if not isinstance(item.get('code', ''), str):
            raise ValueError('code 必须是字符串。')
    return sorted(items, key=lambda x: x['start'])


def inspect_pdf(source, cache, *, mode='auto', header_ratio=.22, refresh=False, toc=None):
    fingerprint = source_hash(source)
    cache_key = {'sha256': fingerprint, 'mode': mode, 'headerRatio': header_ratio,
                 'tocHash': source_hash(toc) if toc else None, 'schema': 1}
    cached = read_json(cache)
    if cached and cached.get('key') == cache_key and not refresh:
        print('复用已提取的目录缓存。', flush=True)
        return cached
    with fitz.open(source) as doc:
        if doc.needs_pass:
            raise ValueError('PDF 需要打开密码；请先提供可正常打开的副本。')
        pages = len(doc)
        if not pages:
            raise ValueError('PDF 没有页面。')
        headings = []
        method = mode
        if toc:
            headings = validate_headings(read_json(toc), pages)
            method = 'custom-toc'
        elif mode in ('auto', 'bookmarks'):
            # Deepest bookmark wins when multiple entries point at the same page.
            bookmarks = {}
            for level, title, page in doc.get_toc():
                if 1 <= page <= pages and title.strip():
                    bookmarks[page] = heading(page, title)
            headings = list(bookmarks.values())
            if headings:
                method = 'bookmarks'
            elif mode == 'bookmarks':
                raise ValueError('没有可用 PDF 书签。可选择 --mode headers 或提供 --toc。')
        if not headings and mode in ('auto', 'headers') and not toc:
            method = 'headers'
            diagnostics = False
            for i, page in enumerate(doc):
                blocks = page.get_text('blocks', clip=fitz.Rect(0, 0, page.rect.width, page.rect.height * header_ratio), sort=True)
                text = '\n'.join(b[4] for b in blocks)
                found = None
                if 'Porsche DTC Diagnostic Information' in text:
                    diagnostics = True
                    found = dict(start=i+1, code='DTC-INDEX', title='故障码诊断 · 原书代码目录', module='diagnostics')
                if diagnostics:
                    codes = list(dict.fromkeys(re.findall(r'\b[PBCU][0-9A-F]{6}\b', text)))
                    if len(codes) == 1 and codes[0] in text[:100] and (not headings or headings[-1]['code'] != codes[0]):
                        found = dict(start=i+1, code=codes[0], title='故障码诊断 · '+codes[0], module='diagnostics')
                for block in blocks:
                    title = re.sub(r'\s+', ' ', block[4]).strip()
                    match = re.search(r'\bWM\s+([A-Z0-9]{4,10})\s+(.+)', title)
                    if match:
                        code, title = match.groups()
                        title = re.split(r'当前文件在印刷|Page \d+ of', title)[0].strip()
                        found = heading(i+1, title, code)
                        break
                if found:
                    headings.append(found)
                if (i+1) % 500 == 0:
                    print(f'已检查页首: {i+1}/{pages}', flush=True)
        if mode == 'pages' and not toc:
            method = 'pages'
            headings = [heading(1, '按页分段资料（未识别章节）')]
        if not headings:
            raise ValueError('未识别到目录。没有导入或改动现有车型。可提供 --toc 目录 JSON，或明确使用 --mode pages 按页分段；不会自动进行全文 OCR。')
        headings = validate_headings(headings, pages)
        data = dict(key=cache_key, pageCount=pages, headings=headings, method=method)
        save_json(cache, data)
        return data


def make_records(data, model, overrides=None):
    starts = {h['start']: {**h, 'module': h.get('module', classify(h.get('code', ''), h['title'])), 'code': h.get('code', '')} for h in data['headings']}
    if overrides is not None:
        for item in validate_headings(overrides, data['pageCount']):
            starts[item['start']] = {**heading(item['start'], item['title'], item.get('code', '')), **item}
    if 1 not in starts:
        starts[1] = dict(start=1, code='COVER', title=f'{model} 车间维修手册 · 前置资料', module='reference')
    items = sorted(starts.values(), key=lambda h: h['start'])
    for item in items:
        parent = item.get('projectStart', item['start'])
        if type(parent) is not int or parent not in starts or starts[parent].get('projectStart', parent) != parent:
            raise ValueError('projectStart 必须指向同一目录中有效的项目起始页，不能循环引用。')
    return [{**h, 'end': items[i+1]['start']-1 if i+1 < len(items) else data['pageCount']} for i, h in enumerate(items)]


@contextmanager
def import_lock(root):
    # OS lock is automatically released on interruption; no stale lock removal needed.
    import fcntl
    path = root / 'tmp' / 'manual-import.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w') as stream:
        try:
            fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ValueError('另一个导入正在进行，请等它完成后再运行。')
        yield


def build_model(args, data):
    root, model = args.root, args.model
    site = root / 'site'
    registry_path = site / 'data' / 'models.json'
    registry = read_json(registry_path, {'version': 1, 'models': []})
    old_entry = next((m for m in registry['models'] if m['model'] == model), None)
    target = site / 'docs' / model
    catalog_path = site / 'data' / f'{model}.json'
    if (old_entry or target.exists() or catalog_path.exists()) and not args.replace:
        raise ValueError(f'车型 {model} 已存在；更新它请显式添加 --replace。其他车型不会被改动。')
    overrides = read_json(args.overrides) if args.overrides else None
    if overrides is None:
        profiles = read_json(Path(__file__).with_name('source-profiles.json'), {})
        profile = profiles.get(data['key']['sha256'])
        if profile:
            overrides = read_json(Path(__file__).parent / profile['overrides'])
    records = make_records(data, model, overrides)
    long_spans = sum(r['end']-r['start']+1 > 80 for r in records)
    if long_spans and data['method'] == 'headers':
        print(f'提示：{long_spans} 个标题之间跨度超过 80 页；请核对它们是否为长章节，必要时用 --toc 或 --overrides 补充边界。')
    work = root / 'tmp' / 'manuals' / model
    staged = work / 'slices'
    staged.mkdir(parents=True, exist_ok=True)
    signature_path = work / 'slices.json'
    manifest = read_json(signature_path, {})
    docs = []
    with fitz.open(args.source) as source:
        def cut(record, start, end):
            key = f'{model}-{start:04d}'
            output = staged / f'{key}.pdf'
            sig = hashlib.sha256(json.dumps([data['key'], record, start, end], sort_keys=True).encode()).hexdigest()
            published = target / output.name
            if not output.exists() and published.exists() and manifest.get(key) == sig:
                try:
                    os.link(published, output)
                except OSError:
                    shutil.copyfile(published, output)
            if not output.exists() or manifest.get(key) != sig:
                with fitz.open() as part:
                    part.insert_pdf(source, from_page=start-1, to_page=end-1, links=False)
                    part.set_metadata({'title': record['title'], 'subject': f'{model} workshop manual, original pages {start}-{end}'})
                    temp = output.with_suffix('.tmp.pdf')
                    part.save(temp, garbage=4, deflate=True)
                    temp.replace(output)
                manifest[key] = sig
                save_json(signature_path, manifest)
            if output.stat().st_size >= FILE_LIMIT:
                if start == end:
                    raise ValueError(f'第 {start} 页单页 PDF 已达到 100 MiB，需先优化原始资源。')
                output.unlink()
                middle = (start + end) // 2
                return cut(record, start, middle) + cut(record, middle+1, end)
            return [dict(id=key, title=record['title'], code=record['code'], module=record['module'],
                         projectId=f'{model}-{record.get("projectStart", record["start"]):04d}',
                         pageSizes=[[round(source[n-1].rect.width,2), round(source[n-1].rect.height,2)] for n in range(start,end+1)],
                         start=start, end=end, pages=end-start+1, bytes=output.stat().st_size,
                         file=f'docs/{model}/{key}.pdf')]
        for record in records:
            parts = []
            for start in range(record['start'], record['end']+1, args.chunk_pages):
                parts += cut(record, start, min(start+args.chunk_pages-1, record['end']))
            if len(parts) > 1:
                for i, part in enumerate(parts):
                    part['title'] += f' · 第 {i+1}/{len(parts)} 部分'
            docs += parts
            if len(docs) % 100 == 0:
                print(f'已准备 {len(docs)} 份切片', flush=True)
    expected = {Path(d['file']).name for d in docs}
    for old in staged.glob('*.pdf'):
        if old.name not in expected:
            old.unlink()
    assert sum(d['pages'] for d in docs) == data['pageCount']
    # Reopen generated slices; this does not extract body text.
    for item in docs:
        with fitz.open(staged / Path(item['file']).name) as part:
            if len(part) != item['pages']:
                raise ValueError(f'切片页数不匹配: {item["id"]}')
    name = args.name or (old_entry or {}).get('name', model)
    years = args.years if args.years is not None else (old_entry or {}).get('years', '')
    catalog = dict(version=2, model=model, name=name, years=years, sourcePages=data['pageCount'],
                   sourceBytes=args.source.stat().st_size, sourceSha256=data['key']['sha256'],
                   indexingMethod=data['method'], searchScope='项目标题、编号、模块与常用同义词；不含正文全文搜索。',
                   modules=[dict(id=a, name=b, description=c, icon=d, count=sum(x['module']==a for x in docs))
                            for a,b,c,d in MODULES if any(x['module']==a for x in docs)], documents=docs)
    entry = dict(model=model, name=name, years=years, catalog=f'data/{model}.json',
                 sourcePages=data['pageCount'], documentCount=len(docs))
    if old_entry and old_entry.get('image'):
        entry['image'] = old_entry['image']
    models = [entry if m['model'] == model else m for m in registry['models']]
    if not old_entry:
        models.append(entry)
    new_registry = {'version': 1, 'models': models}
    current_size = sum(p.stat().st_size for p in site.rglob('*') if p.is_file())
    replaced_size = sum(p.stat().st_size for p in target.rglob('*') if p.is_file()) if target.exists() else 0
    replaced_size += sum(p.stat().st_size for p in [catalog_path, registry_path] if p.exists())
    new_size = sum(d['bytes'] for d in docs) + sum(len((json.dumps(x, ensure_ascii=False, separators=(',', ':'))+'\n').encode()) for x in [catalog, new_registry])
    total_size = current_size - replaced_size + new_size
    if total_size >= SITE_LIMIT:
        raise ValueError(f'导入后站点约 {total_size/1024**2:.1f} MiB，超过 GitHub Pages 的 1 GB 限制。切片保存在临时目录，现有网站未改动。')
    # Publish only after all generation and validation succeeds. Restore on errors.
    backup = work / 'previous'
    if backup.exists():
        raise ValueError(f'发现待恢复备份 {backup}，请先检查上次中断。')
    original_catalog = catalog_path.read_bytes() if catalog_path.exists() else None
    original_registry = registry_path.read_bytes() if registry_path.exists() else None
    target.parent.mkdir(parents=True, exist_ok=True)
    moved_old = moved_new = False
    try:
        if target.exists():
            target.rename(backup)
            moved_old = True
        staged.rename(target)
        moved_new = True
        save_json(catalog_path, catalog)
        save_json(registry_path, new_registry)
    except BaseException:
        if moved_new:
            target.rename(staged)
        if moved_old:
            backup.rename(target)
        for path, content in [(catalog_path, original_catalog), (registry_path, original_registry)]:
            if content is None:
                path.unlink(missing_ok=True)
            else:
                path.write_bytes(content)
        raise
    if backup.exists():
        shutil.rmtree(backup)
    print(f'已导入 {model}: {len(docs)} 份资料 / {data["pageCount"]} 页；整站 {total_size/1024**2:.1f} MiB。')
    print(f'刷新首页即可看到车型入口：#/{model}；文件：site/docs/{model}/')


def main(argv=None):
    parser = argparse.ArgumentParser(description='通用维修手册导入：PDF 书签或页首标题 → 切片、搜索索引、车型首页。')
    parser.add_argument('--model', required=True, help='车型目录代号，如 982、911-992；只接受小写字母、数字、连字符')
    parser.add_argument('--source', type=Path, help='PDF 路径；省略时自动查找 manuals/<model>/ 中唯一的 PDF 或 manuals/<model>.pdf')
    parser.add_argument('--name', help='首页显示的车型名称，不指定时使用车型代号')
    parser.add_argument('--years', help='手册覆盖年份，仅作显示，不自动猜测')
    parser.add_argument('--mode', choices=['auto','bookmarks','headers','pages'], default='auto')
    parser.add_argument('--toc', type=Path, help='人工目录 JSON，数组项为 start/title，可选 code/module')
    parser.add_argument('--overrides', type=Path, help='针对当前原文件的目录边界修正 JSON')
    parser.add_argument('--header-ratio', type=float, default=.22)
    parser.add_argument('--chunk-pages', type=int, default=40)
    parser.add_argument('--replace', action='store_true', help='显式更新同名车型')
    parser.add_argument('--inspect', action='store_true', help='只检查目录，不生成或注册车型')
    parser.add_argument('--refresh', action='store_true', help='重新提取目录缓存')
    parser.add_argument('--root', type=Path, default=ROOT, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)
    try:
        args.root = args.root.resolve()
        if not MODEL_RE.fullmatch(args.model):
            raise ValueError('车型代号格式错误；示例 982、911-992。')
        if not 1 <= args.chunk_pages <= 200 or not .05 <= args.header_ratio <= .4:
            raise ValueError('--chunk-pages 范围为 1–200；--header-ratio 范围为 0.05–0.4。')
        if args.source is None:
            folder = args.root / 'manuals' / args.model
            candidates = [p for p in folder.iterdir() if p.is_file() and p.suffix.lower()=='.pdf'] if folder.exists() else []
            single = args.root / 'manuals' / f'{args.model}.pdf'
            if single.exists():
                candidates.append(single)
            if len(candidates) != 1:
                raise ValueError(f'需要唯一的原始 PDF；请放入 manuals/{args.model}/，或用 --source 明确指定。')
            args.source = candidates[0]
        args.source = args.source.resolve()
        if not args.source.is_file() or args.source.suffix.lower() != '.pdf':
            raise ValueError(f'找不到 PDF：{args.source}')
        for path in (args.toc, args.overrides):
            if path and not path.is_file():
                raise ValueError(f'找不到目录文件：{path}')
        with import_lock(args.root):
            registry = read_json(args.root / 'site/data/models.json', {'models':[]})
            if not args.inspect and not args.replace and (any(m['model']==args.model for m in registry['models']) or (args.root / 'site/docs' / args.model).exists() or (args.root / 'site/data' / f'{args.model}.json').exists()):
                raise ValueError(f'车型 {args.model} 已存在；更新请添加 --replace。')
            cache = args.root / 'tmp/manuals' / args.model / 'headers.json'
            data = inspect_pdf(args.source, cache, mode=args.mode, header_ratio=args.header_ratio, refresh=args.refresh, toc=args.toc)
            print(f'识别方式: {data["method"]}；{data["pageCount"]} 页，{len(data["headings"])} 个目录入口。')
            if args.inspect:
                print(json.dumps({'first':data['headings'][:3], 'last':data['headings'][-3:]}, ensure_ascii=False))
            else:
                build_model(args, data)
    except (ValueError, OSError, RuntimeError) as error:
        print(f'导入未完成：{error}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
