# Werkstatt · 保时捷维修手册

支持多车型的纯静态维修资料库。当前收录 **981 Boxster / Boxster S / Boxster GTS，2013–2015** 和 **982 718 Boxster / Boxster S / Boxster GTS，2018**；982 首页使用车友的黄色 Cayman GT4 RS 卡通封面，资料内容仍以原 PDF 为准。

## 一条命令添加车型

将 PDF 放入 `manuals/982/` 文件夹，确保里面只有一份 PDF。在项目根目录运行：

```sh
npm run manual:add -- --model 982 --name "718 Boxster / Cayman"
```

也支持将文件放在 `manuals/982.pdf`，或使用 `--source` 明确指定任意 PDF 路径（有空格时加引号）：

```sh
npm run manual:add -- --model 982 --name "718 Boxster / Cayman" --source "manuals/982维修手册.pdf"
```

例如，为不同代际的 911 单独建库：

```sh
npm run manual:add -- --model 911-992 --name "911 Carrera (992)" --source "manuals/911-992.pdf"
```

`--model` 决定目录和网址，只接受小写字母、数字、连字符，例如 `982`、`911`、`911-991`、`911-992`。车型名称和年份由你提供，工具不会猜测手册适用年款。可选 `--years "起始年–结束年"`，省略时显示“年份未标注”。省略 `--name` 时显示车型代号。

导入成功后自动生成：

```text
site/docs/982/          PDF 切片
site/data/982.json      该车型的模块、标题和搜索索引
site/data/models.json   自动注册车型：首页卡片和路由的数据来源
```

刷新本地网页，首页就会出现新车型；不需要手动编辑 HTML 或 JavaScript。部署到 GitHub Pages 时，提交并推送生成文件和更新后的索引即可。

原始文件目录 `manuals/` 已被 Git 忽略，源 PDF 不会自动上传、删除或改写。现有车型不受新增车型影响。

## 运行环境与本地预览

导入工具面向 macOS / Linux，需要 Node.js 和 Python 3.10+。第一次运行导入命令会自动创建项目内的 `.venv` 并安装 `scripts/requirements.txt` 中的 PDF 处理依赖；首次安装需要网络，后续处理均在本地。可用 `WORKSHOP_PYTHON` 指定 Python 路径。当前开发环境已配置好 `.venv`。

启动网页不需要运行导入程序，也不需要安装 PDF 依赖：

```sh
npm start
```

或直接使用 Python：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

打开 <http://127.0.0.1:4173>。不要直接双击 HTML：浏览器需要通过 HTTP 加载索引和 PDF。

## 目录识别与异常手册

默认 `--mode auto`：

1. 优先读取 PDF 内嵌书签；同页有多个书签时选用更细的条目。
2. 没有书签时，只提取每页顶部 22% 区域，识别 WM 编号和维修标题，以及已识别诊断附录中的故障码。
3. 按 WM 编号或标题关键词分类，无法判断的条目放入参考资料模块。
4. 长章节按最多 40 页拆分；单个切片过大时继续拆分。同一项目各部分标记共同的项目 ID，阅读时自动连续加载，下载时合并。

**不会提取或保存全书正文，也不会自动进行全文 OCR。** 原文件会计算二进制摘要，用于区分版本和复用缓存，这不是正文提取。搜索只覆盖项目标题、编号、模块和同义词。

只检查目录、不生成文件或注册车型：

```sh
npm run manual:add -- --model 982 --inspect
```

有些扫描件没有可提取的标题，或文档版式不同。此时默认停止，不生成误导性的“自动目录”。你可以选择：

```sh
# 明确按页分段；条目将标注“未识别章节”，不推断部件名称
npm run manual:add -- --model 982 --mode pages --chunk-pages 30

# 使用人工整理的目录
npm run manual:add -- --model 982 --toc "manuals/982-toc.json"
```

目录 JSON 使用 **PDF 实际页序号（从 1 开始）**，不是纸面印刷页码：

```json
[
  {"start": 1, "title": "手册说明", "module": "reference"},
  {"start": 8, "title": "发动机维修", "module": "1"},
  {"start": 65, "title": "制动系统", "module": "4", "code": "WM编号可选"}
]
```

每项以后一项起始页的前一页结束。若某项是分散的续页，可设置 `projectStart` 指向对应主项目的起始页（例如 981 原书第 4455 页的 `projectStart` 为 3827）；只有显式归属同一项目的资料会连续阅读和合并下载。`start` 和 `title` 必填；`module` 和 `code` 可选，所有页码必须在原文件范围内且不重复。未提供 `module` 时默认参考资料分组。页首识别出很大的跨度时会提示核对，可通过 `--toc` 完整指定目录，或用同格式的 `--overrides` 补充/替换特定起始页。

模块代号：`0` 保养通用，`1` 发动机，`2` 燃油排放，`3` 变速传动，`4` 底盘制动，`5` 车身，`6` 外部装备，`7` 内饰座椅，`8` 空调暖风，`9` 电气电子，`diagnostics` 故障码，`reference` 参考资料。

查看全部参数：

```sh
npm run manual:add -- --help
```

## 更新同名车型与缓存

同名车型默认拒绝覆盖。确定替换时显式使用 `--replace`：

```sh
npm run manual:add -- --model 982 --source "manuals/982新版.pdf" --replace
```

更新时未指定名称和年份，会保留已有显示信息。原文件内容、识别方式或目录 JSON 变化时，自动重新识别；`--refresh` 强制刷新目录缓存。

目录缓存和未完成的切片保存在 `tmp/manuals/车型代号/`。失败后重试可复用已完成内容。生成、页数检查和容量检查完成后，才更新该车型的发布目录、索引与车型注册表；普通发布错误会恢复旧版。系统被强制终止时若发现 `previous` 备份目录，工具会停止并提示检查，不直接丢弃备份。

旧入口 `scripts/prepare_manual.py inspect/build` 保留兼容，默认仅定位原有 981 源文件；`build` 更新已有车型同样需要 `--replace`。日常使用推荐上面的通用 npm 命令。

## 网页功能

- 首页自动展示所有已成功导入的车型，进入车型时才加载对应索引。
- 按维修模块浏览；支持标题、WM 编号、DTC 故障码和多个空格分隔的关键词。
- 同义词关联，如电瓶/蓄电池、火嘴/火花塞、刹车/制动，以及“刹车盘”等复合词。
- 无直接匹配时显示少量错字容错结果，并标记为相近结果。
- 点击项目才加载 PDF；上下连续滚动，自动加载附近页面，并接上同一项目的分段和续页。仅保留附近最多 6 页画布，支持跳页、缩放、适宽和文本选择。
- “下载完整 PDF”会在浏览器后台线程中获取并合并当前项目的全部切片，不增加服务器存储。单文件项目直接下载原文件；不同配置/市场版本不混在一起。准备过程显示进度，失败可重试。
- 每个车型独立的搜索条件、PDF 路由及返回入口；支持链接分享和刷新恢复。
- 本地记住上次阅读位置，不依赖账户、数据库或后端。
- 手机与桌面布局；`/` 聚焦搜索，左右方向键翻页。

没有车型图片时使用资料卡片，不会把 981 示意图套用到其他车型。

## GitHub Pages 部署

仓库：[cjphaha/porsche-workshop-manuals](https://github.com/cjphaha/porsche-workshop-manuals)。网站：https://cjphaha.github.io/porsche-workshop-manuals/。

1. 将项目代码、`site/` 资源和索引提交到 GitHub 仓库的 `master` 分支。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送 `master`，或手动运行 **Deploy workshop library**。
4. 工作流验证搜索、导入工具和所有车型的发布资源后，发布 `site/`。

采用相对路径和 Hash 路由，例如 `#/911-992/doc/911-992-0001?page=2`；支持 `https://用户名.github.io/仓库名/` 子路径，不需要服务器路由重写。所有 PDF.js、字体、CMap、WASM 均在本站托管，不依赖外部 CDN。

`site/docs/` 是网站内部资源目录，不是 GitHub Pages 的根目录 `/docs` 发布模式。在线部署不重新处理真实手册；CI 仅使用小型合成 PDF 测试导入工具。

**容量按所有车型合计。** 981 和 982 的网页及切片约 891 MiB，低于 GitHub Pages 的 1 GB 发布限制。两张封面缩为 JPEG；PDF 仅对高分辨率嵌入图片做适度重编码（180 DPI、质量 85），保留原有文字、页码和项目切片结构。两份原始 PDF 已由 Git 忽略，不进入网站。导入工具和 CI 仍会阻止超限发布；以后更新手册时需重新检查整站容量。

## 当前 981 资料说明

原文件实际为 4,456 页、216,464,740 字节，与文件名中的“4450 页”不同。现有 1,223 个切片完整覆盖全书，图片重编码后约 535 MiB。拆分后的资源会重复字体等共享内容，所以总体积高于原文件。

- 735 个维修项目页首标题，加上故障码索引和参考资料，归入 12 个模块。
- 原书诊断附录中文编码异常但原页显示正常，所以按故障码索引，以原 PDF 为准。
- 第 3,827–3,830 页“更换保险熔丝”的末页位于第 4,455 页，已提供续页关联。
- 981 的特殊页码修正只在原文件二进制摘要匹配 `scripts/source-profiles.json` 时自动应用，不会把这些固定页码用于其他手册。
- 切片保留原页内容，未复制原始文档链接注释；跨项目通过索引和关联资料导航。
- 已检查全部切片的页数；压缩前的代表页面曾与原书逐像素比对，压缩后的图片为有损重编码，另行抽查了图示和文字的可读性。

## 项目结构

```text
manuals/                    原始手册收件目录，PDF 不提交
site/
  index.html                通用首页和阅读路由
  assets/                   界面、搜索、图片
  data/models.json          车型注册表
  data/981.json             981 独立目录和搜索数据
  docs/981/                 981 PDF 切片
  vendor/pdfjs/             本地阅读器依赖
scripts/
  import-manual.mjs         npm 命令入口和依赖环境准备
  manuals.py                通用提取、切片、注册与容量检查
  modules.py                共享维修模块定义
  source-profiles.json      已核对源文件的特殊修正规则
  catalog-overrides.json    原有 981 的特殊页码修正
  prepare_manual.py         旧命令兼容入口
  validate.py               所有车型的资源与页码校验
  requirements.txt          PDF 处理依赖
tests/                      搜索、导入和浏览器测试
```

## 验证

```sh
npm test
npm run test:import
npm run validate
```

`test:import` 使用 `.venv`，测试临时创建的小 PDF，覆盖两种车型、目录识别、页首裁剪、缓存、覆盖保护、容量失败、发布回退和页数/渲染一致性。测试数据不注册到真实网站。

浏览器测试需要本机 Chrome 和 Playwright。启动预览后运行 `node tests/browser.cjs`；`PLAYWRIGHT_MODULE` 可指定已安装 Playwright 路径。

独立的多车型测试站点可用 `.venv/bin/python tests/create_preview.py` 准备，然后对该临时根目录导入测试手册；`tests/multi-model-browser.cjs` 验证不同车型入口、索引隔离、链接刷新、加载竞态和移动端布局。这些产物均位于 `tmp/`。

## 第三方组件

PDF.js 5.6.205，Apache-2.0，许可证在 `site/vendor/pdfjs/LICENSE`。pdf-lib 用于浏览器内合并 PDF，许可证在 `site/vendor/pdf-lib/LICENSE.md`。车型 SVG 为示意图。本站是独立整理的资料索引，非保时捷官方网站。

连续阅读验收：启动本地预览后运行 `node tests/continuous-reader.cjs`，覆盖滚动加载、128 页画布回收、续页合并、移动端、下载与失败重试。下载测试文件保存在 `tmp/`。
