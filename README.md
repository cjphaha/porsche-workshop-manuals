# Werkstatt · 保时捷维修手册

面向 GitHub Pages 的纯静态维修资料库。当前收录 **981 Boxster / Boxster S / Boxster GTS，2013–2015**。

## 本地预览

在项目根目录运行（需要 Python 3）：

```sh
npm start
```

也可以不安装 Node，直接运行：

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
```

打开 <http://127.0.0.1:4173>。不要直接双击 HTML，浏览器需要通过 HTTP 加载索引和 PDF。

## 已实现

- 车型选择首页，目前仅展示 981。
- 12 个模块：保养与通用、发动机、燃油与排放、变速箱与传动、底盘与制动、车身结构、外部装备、内饰与座椅、空调与暖风、电气与电子、故障码诊断、封面与诊断附录。
- 项目标题、WM 编号、DTC 故障码搜索；支持多个空格分隔的关键词。
- 常用词关联：电瓶/蓄电池、火嘴/火花塞、刹车/制动、波箱/变速箱等；支持“刹车盘”“换电瓶”等复合词。
- 无直接匹配时，提供小范围错字容错，并明确标记为相近结果。
- PDF 按点击项目加载，单页渲染；翻页、跳页、缩放、适宽、下载和文本选择。
- URL 保存项目和页码，支持刷新、分享和浏览器前进/后退。
- 本地记住上次阅读位置及返回的搜索条件；不依赖账户或服务器。
- 手机与桌面布局；按 `/` 聚焦搜索，阅读时按左右方向键翻页。

## 资料处理方式与边界

原文件为 **4,456 页、216,464,740 字节**。文件名中的“4450 页”与实际页数不同。

处理程序只提取每页顶部 22% 区域的标题元数据，没有生成或存储整本正文，也没有进行全书 OCR。页面数量等统计由本地工具完成。搜索范围是 **项目标题、编号、模块及同义词**，不包含手册正文全文检索。

原书没有 PDF 书签。通过页首 WM 编号得到 735 个维修项目标题；诊断附录按可识别的故障码建立索引。超长项目以最多 40 页拆分，关联资料入口连接同一项目的各部分。最终生成 **1,223 个切片，完整覆盖 4,456 页**，不存在页码缺口或重复覆盖。

- 主维修模块主要沿用 WM 编号首位分组；蓄电池等通用说明按部件归类。
- 故障诊断附录中文存在原始编码问题，但可正常显示。索引使用故障码，不将乱码误作中文标题。查看以原页为准。
- 原书第 3,827–3,830 页“更换保险熔丝”的最后一页位于第 4,455 页。它被单独标为续页，并提供同项目关联链接。
- PDF 保留原页面内容和版式，切片不复制原始文档链接注释；跨项目导航由网站索引和相关资料入口提供。
- 切片会重复使用字体等共享资源，总容量高于原文件。当前网站约 **695 MiB**，最大切片约 **12.6 MiB**。部署前验证脚本会检查整站容量和单文件大小。

## 目录结构

```text
site/                       可直接部署的静态网站
  index.html                首页和 Hash 路由入口
  assets/                   界面、搜索逻辑、车型示意图
  data/981.json             模块、标题、编号、页码与文件映射
  docs/                     按车型组织的 PDF 资料
    981/                    981 已生成的 1,223 份 PDF 切片
  vendor/pdfjs/             本地托管的 PDF.js、字体、CMap 和 WASM
scripts/
  prepare_manual.py         页首检查、分类与 PDF 切片生成
  catalog-overrides.json    已核对的特殊边界与续页修正
  validate.py               部署资源、页码覆盖、容量校验
  requirements.txt          重新处理 PDF 时使用的依赖
tests/                      搜索测试与浏览器验收
.github/workflows/pages.yml GitHub Pages 部署工作流
```

原始大 PDF 保存在项目根目录，已被 `.gitignore` 排除；部署只需要 `site/` 中生成的资源。PDF.js 依赖也在本站托管，阅读不依赖外部 CDN、API、数据库或构建服务。

后续车型的 PDF 可放在 `site/docs/车型代号/`，例如 `site/docs/718/`；车型索引单独放在 `site/data/车型代号.json`。同时需要为新车型接入首页入口、路由与对应索引，不能仅复制 PDF 就自动显示车型。当前网页与处理脚本仍针对 981；其他车型应单独核对目录、页码边界和车型配置。

这里的 `docs/` 位于 `site/` 内，是网站公开资源目录。GitHub Pages 工作流继续发布整个 `site/`，不需要切换为根目录 `/docs` 发布模式。

## 部署到 GitHub Pages

1. 在 GitHub 创建仓库，把项目代码和 `site/` 上传至 `main` 分支。保留根目录 `.gitignore`，不要强制加入原始大 PDF。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. 推送 `main`，或者在 Actions 手动运行 **Deploy workshop library**。
4. 工作流验证索引和资源后，发布 `site/`。完成后的地址通常为 `https://用户名.github.io/仓库名/`。

网站采用相对资源路径和 Hash 路由，可以部署在仓库子路径。直接分享 `#/981/doc/981-0002?page=2` 这样的链接不需要服务器路由重写。

不需要在线重新切 PDF。已有生成文件可直接发布；GitHub Actions 只测试并上传静态目录。当前工作流默认分支为 `main`，其他分支名需要同步修改工作流。

## 重新生成资料

需要 Python 3.10+。原始 PDF 保持在根目录，或通过 `--source` 指定路径。

```sh
python3 -m venv .venv
.venv/bin/pip install -r scripts/requirements.txt
.venv/bin/python scripts/prepare_manual.py inspect
.venv/bin/python scripts/prepare_manual.py build
python3 scripts/validate.py
```

`inspect` 仅输出进度、少量标题样本和异常跨度，页首索引保存在 `tmp/pdfs/headers.json`。`build` 根据来源和边界签名复用切片，并周期保存进度；原文件变化时会重新生成受影响资源。不要将 `tmp/` 提交到 GitHub。

`catalog-overrides.json` 是针对当前原文件页码的修正；更换不同版本的手册时应重新核对。普通界面和同义词修改无需再次处理 PDF。同义词位于 `site/assets/search.mjs`。

## 验证

```sh
npm test
python3 scripts/validate.py
```

额外的浏览器验收需要本机 Chrome 和 Playwright：安装 Playwright 后启动本地预览，再执行 `node tests/browser.cjs`。也可以通过 `PLAYWRIGHT_MODULE` 指定已安装的 Playwright 路径，通过 `TEST_BASE_URL` 指定预览地址。

本次交付已检查全部切片可打开及页数一致，并将 16 个代表性页面的渲染结果与原书逐像素比较，包含表格、图示、诊断页和分散续页。浏览器验收覆盖按需加载、搜索、分页、缩放、刷新恢复、手机布局和故障码入口。

## 第三方组件

PDF.js 5.6.205，Apache-2.0，许可证位于 `site/vendor/pdfjs/LICENSE`。`text-layer.css` 从该版本的 PDF.js 样式中提取。车型侧面图为本项目的 SVG 示意图。站点为独立整理的资料索引，非保时捷官方网站。
