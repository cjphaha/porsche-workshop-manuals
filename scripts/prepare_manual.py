#!/usr/bin/env python3
"""Extract page-header metadata locally; never collect full manual text.

Run inspect first, then build. Original PDF is always read-only.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

import pymupdf as fitz

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp" / "pdfs" / "headers.json"
MODULES = [
    ("0", "保养与通用", "检查、保养周期、举升与维修准备", "service"),
    ("1", "发动机", "发动机机械、润滑与冷却系统", "engine"),
    ("2", "燃油与排放", "供油、进气、排气与点火系统", "fuel"),
    ("3", "变速箱与传动", "离合器、PDK、手动变速箱与驱动轴", "gear"),
    ("4", "底盘与制动", "悬架、转向、车轮与制动系统", "wheel"),
    ("5", "车身结构", "车身维修、车门与前后舱盖", "body"),
    ("6", "外部装备", "保险杠、玻璃、后视镜与敞篷机构", "roof"),
    ("7", "内饰与座椅", "仪表板、饰板、座椅与乘员保护", "seat"),
    ("8", "空调与暖风", "制冷、暖风与空气分配系统", "climate"),
    ("9", "电气与电子", "电源、灯光、仪表与控制单元", "electrical"),
    ("diagnostics", "故障码诊断", "DME 故障码与原版诊断步骤", "electrical"),
    ("reference", "封面与诊断附录", "原书封面、未识别章节与诊断参考", "book"),
]


def tidy(value):
    return re.sub(r"\s+", " ", value).strip()


def classify(item):
    if item.get('module'):
        return item['module']
    # Some general instructions appear under the engine-control WM group.
    # File them by the component users look for, while retaining the original WM code.
    if re.search(r'蓄电池|保险熔丝|保险丝盒|熔断器', item['title']):
        return '9'
    return item['code'][0]


def inspect(source, refresh=False):
    stat = source.stat()
    signature = {"name": source.name, "bytes": stat.st_size, "mtime": stat.st_mtime_ns}
    if CACHE.exists() and not refresh:
        cached = json.loads(CACHE.read_text())
        if cached["source"] == signature and cached.get('schema') == 2:
            return cached
    doc = fitz.open(source)
    if doc.needs_pass:
        raise RuntimeError("PDF requires an opening password.")
    headings = []
    diagnostics = False
    # Only inspect the top 22% of each page. Body text is neither indexed nor saved.
    for i, page in enumerate(doc):
        clip = fitz.Rect(0, 0, page.rect.width, page.rect.height * .22)
        blocks = page.get_text("blocks", clip=clip, sort=True)
        header_text = '\n'.join(b[4] for b in blocks)
        if 'Porsche DTC Diagnostic Information' in header_text:
            diagnostics = True
            headings.append({'start': i+1, 'code': 'DTC-INDEX', 'title': '故障码诊断 · 原书代码目录', 'module': 'diagnostics'})
        if diagnostics:
            codes = list(dict.fromkeys(re.findall(r'\b[PBCU][0-9A-F]{6}\b', header_text)))
            if len(codes) == 1 and re.search(r'\b'+codes[0]+r'\b',header_text[:100]):
                if not headings or headings[-1]['code'] != codes[0]:
                    headings.append({'start':i+1,'code':codes[0], 'title':'DME 故障诊断 · '+codes[0], 'module':'diagnostics'})
        for block in blocks:
            text = tidy(block[4])
            match = re.search(r"\bWM\s+([A-Z0-9]{4,10})\s+(.+)", text)
            if match:
                title = re.split(r"当前文件在印刷|Page \d+ of", match[2])[0].strip()
                headings.append({"start": i + 1, "code": match[1], "title": title})
                break
        if (i + 1) % 500 == 0:
            print(f"Inspected page headers: {i+1}/{len(doc)}", flush=True)
    data = {"schema": 2, "source": signature, "pageCount": len(doc), "headings": headings,
            "method": "page headers only, top 22%; no full-text extraction or OCR"}
    CACHE.parent.mkdir(parents=True, exist_ok=True)
    CACHE.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return data


def build(source, data):
    doc = fitz.open(source)
    headings = data["headings"]
    if not headings:
        raise RuntimeError("No WM headings found. Review samples before building.")
    records = []
    if headings[0]["start"] > 1:
        records.append({"start": 1, "end": headings[0]["start"]-1,
                        "code": "COVER", "title": "981 车间维修手册 · 封面", "module": "reference"})
    for i, item in enumerate(headings):
        end = headings[i+1]["start"]-1 if i+1 < len(headings) else len(doc)
        records.append({**item, "end": end, "module": classify(item)})
    # Manual overrides are metadata only and may split unrecognized appendices.
    overrides = ROOT / "scripts" / "catalog-overrides.json"
    if overrides.exists():
        for rule in json.loads(overrides.read_text()):
            start = rule["start"]
            for record in records:
                if record["start"] < start <= record["end"]:
                    old_end = record["end"]
                    record["end"] = start-1
                    records.append({**rule, "end": old_end})
                    break
                if record["start"] == start:
                    record.update(rule)
                    break
        records.sort(key=lambda x: x["start"])
    output = ROOT / "site" / "docs" / "981"
    output.mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / 'tmp' / 'pdfs' / 'slice-manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    updated_manifest = {}
    result = []
    for record in records:
        # Bound large unidentified sections; preserve ordinary procedures intact.
        chunks = list(range(record["start"], record["end"]+1, 40))
        for part, start in enumerate(chunks):
            end = min(start+39, record["end"])
            key = f"981-{start:04d}"
            target = output / f"{key}.pdf"
            signature = hashlib.sha256(json.dumps([data['source'], start, end, record],sort_keys=True).encode()).hexdigest()
            if not target.exists() or manifest.get(key) != signature:
                cut = fitz.open()
                cut.insert_pdf(doc, from_page=start-1, to_page=end-1, links=False)
                cut.set_metadata({"title": record["title"], "subject": f"981 workshop manual, original pages {start}-{end}"})
                temporary = target.with_suffix('.tmp.pdf')
                cut.save(temporary, garbage=4, deflate=True)
                cut.close()
                temporary.replace(target)
            updated_manifest[key] = signature
            manifest[key] = signature
            title = record["title"]
            if len(chunks) > 1:
                title += f" · 第 {part+1}/{len(chunks)} 部分"
            result.append({"id": key, "title": title, "code": record["code"],
                           "module": record.get("module", "reference"),
                           "start": start, "end": end, "pages": end-start+1,
                           "file": f"docs/981/{key}.pdf", "bytes": target.stat().st_size})
        if len(result) % 100 == 0:
            manifest_path.write_text(json.dumps(manifest))
            print(f"Prepared {len(result)} PDF slices", flush=True)
    modules = [{"id": a, "name": b, "description": c, "icon": d,
                "count": sum(x["module"] == a for x in result)} for a,b,c,d in MODULES]
    catalog = {"version": 1, "model": "981", "name": "Boxster / Boxster S / Boxster GTS",
               "years": "2013–2015", "sourcePages": len(doc), "sourceBytes": source.stat().st_size,
               "searchScope": "维修项目标题、WM 编号、模块名称与常用同义词；不含正文全文搜索。",
               "modules": [m for m in modules if m["count"]], "documents": result}
    catalog_path = ROOT / "site" / "data" / "981.json"
    catalog_tmp = catalog_path.with_suffix('.tmp.json')
    catalog_tmp.write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")))
    catalog_tmp.replace(catalog_path)
    manifest_path.write_text(json.dumps(updated_manifest))
    # Remove obsolete generated slices only; never touch the source.
    expected = {x["file"].split("/")[-1] for x in result}
    for old in output.glob("981-*.pdf"):
        if old.name not in expected:
            old.unlink()
    print(json.dumps({"documents": len(result), "pages": sum(x["pages"] for x in result),
                      "pdfMiB": round(sum(x["bytes"] for x in result)/2**20, 1),
                      "maxSliceMiB": round(max(x["bytes"] for x in result)/2**20, 1)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["inspect", "build"])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--refresh", action="store_true")
    args = parser.parse_args()
    source = args.source or next(ROOT.glob("*.pdf"))
    data = inspect(source, args.refresh)
    if args.action == "build":
        build(source, data)
    else:
        gaps = sorted([(b["start"]-a["start"], a["start"], a["title"][:60]) for a,b in zip(data["headings"], data["headings"][1:])], reverse=True)
        print(json.dumps({"pages": data["pageCount"], "headings": len(data["headings"]),
                          "first": data["headings"][:5], "last": data["headings"][-5:],
                          "largestGaps": gaps[:12]}, ensure_ascii=False, indent=2))
