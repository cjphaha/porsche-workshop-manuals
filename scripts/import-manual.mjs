#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args=process.argv.slice(2);
const venv=path.join(root,'.venv');
const venvPython=path.join(venv,process.platform==='win32'?'Scripts/python.exe':'bin/python');
function run(exe,argv,options={}) {return spawnSync(exe,argv,{cwd:root,encoding:'utf8',...options});}
function exitError(message){console.error(message);process.exit(1);}
if(args.includes('--help') || args.includes('-h')) {
  console.log(`用法：npm run manual:add -- --model 982 [--source "manuals/982.pdf"] [--name "718 Boxster / Cayman"]

省略 --source：自动读取 manuals/982/ 内唯一 PDF 或 manuals/982.pdf。
--years "2016–2025"        手册年份，仅用于显示
--inspect                  只检查书签或页首，不生成资料
--mode auto                默认优先书签，再识别页首 WM / 故障码
--mode pages               明确按页分段，用于没有可提取标题的手册
--toc "manuals/982.json"    使用人工目录（start/title/code/module）
--chunk-pages 40           每个切片最多页数（默认 40）
--header-ratio 0.22        页首提取比例（上限 0.4，不提取全文）
--overrides "路径.json"     修正特定手册的目录边界
--replace                  更新已存在的同名车型
--refresh                  重新提取目录缓存

首次运行会在 .venv 安装本地 PDF 工具，需要 Python 3.10+ 和网络。
可通过 WORKSHOP_PYTHON 指定 Python 路径；不会上传原始手册。`);
  process.exit(0);
}
const candidates=[process.env.WORKSHOP_PYTHON,venvPython,'python3','python3.14','python3.13','python3.12','python3.11','python3.10','python'].filter(Boolean);
let python=candidates.find(exe=>run(exe,['-c','import sys; sys.exit(0 if sys.version_info >= (3,10) else 1)']).status===0);
if(!python)exitError('需要 Python 3.10+。安装后重新运行，或设置 WORKSHOP_PYTHON 为 Python 可执行文件路径。');
if(!existsSync(venvPython)) {
  console.log('创建项目本地 Python 环境 .venv…');
  if(run(python,['-m','venv',venv],{stdio:'inherit'}).status!==0)exitError('无法创建 .venv；请检查 Python 的 venv 支持。');
}
python=venvPython;
if(run(python,['-c','import pymupdf']).status!==0) {
  console.log('安装本地 PDF 处理工具（只下载依赖，不上传手册）…');
  if(run(python,['-m','pip','install','-r',path.join(root,'scripts/requirements.txt')],{stdio:'inherit'}).status!==0)exitError('依赖安装失败；请检查网络后重试。现有网站未改动。');
}
const result=run(python,[path.join(root,'scripts/manuals.py'),...args],{stdio:'inherit'});
process.exit(result.status ?? 1);
