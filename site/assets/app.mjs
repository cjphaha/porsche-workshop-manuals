import {buildIndex, searchDocuments, relatedTerms} from './search.mjs';

const app = document.querySelector('#app');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n.toLocaleString('zh-CN');
const size = n => n < 1024*1024 ? `${Math.ceil(n/1024)} KB` : `${(n/1024/1024).toFixed(1)} MB`;
const readStorage = key => {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const writeStorage = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Private browsing still works. */}};
let catalog, index, reader, routeVersion=0, returnRoute=readStorage('werkstatt-return-route') || '#/981';
const iconPaths = {
  service:'M12 3v4m0 10v4M3 12h4m10 0h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2 2.8-2.8M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  engine:'M4 8h4V5h8v3h3v4h2v6h-5l-2 2H7l-3-4V8ZM1 10v6m7-13h8',
  fuel:'M5 21V5h10v16M5 10h10M3 21h14m-1-15 3 3v8a2 2 0 0 0 4 0v-5l-3-3',
  gear:'M6 4v16m12-16v9H6m6-9v16M4 4h4m2 0h4m2 0h4M4 20h4m2 0h4',
  wheel:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM12 3v6m0 6v6M3 12h6m6 0h6',
  body:'M3 17V9l3-5h12l3 5v8M3 10h18M5 17v3m14-3v3M6 14h3m6 0h3',
  roof:'M3 18h18M5 18V9l6-5h7v14M5 10h13M9 13h3',
  seat:'M8 3h5v7l5 3v6H7l-3-7V5h4M7 19v3m11-3v3M8 10l1 5h8',
  climate:'M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M20 14l-4 1 1 4M4 14l4 1-1 4M20 10l-4-1 1-4',
  electrical:'m13 2-9 12h7l-1 8 10-13h-8l1-7',
  book:'M12 5C8 2 3 3 2 4v16c4-2 7-1 10 1m0-16c4-3 9-2 10-1v16c-4-2-7-1-10 1V5',
  search:'m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
};
function icon(name) {return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${iconPaths[name] || iconPaths.book}"/></svg>`;}
const docURL = (id,page=1) => `#/981/doc/${id}?page=${page}`;
function home() {
  const last=readStorage('werkstatt-last');
  const lastDoc=last && catalog.documents.find(d=>d.id===last.id);
  app.innerHTML=`<section class="home-intro"><div class="eyebrow"><span class="short-line"></span> THE WORKSHOP LIBRARY</div><h1>每一处细节，<br>都有据可循。</h1><p>从保养检查到部件维修，找到你需要的那一页。<br>选择车型，开始查阅原版车间维修资料。</p><div class="intro-caption"><span>01 / 车型选择</span><span>原版图文 · 按需加载</span></div></section>
  <section class="model-section" aria-label="选择车型"><a href="#/981" class="model-card"><div class="model-top"><span class="model-label">PORSCHE · BOXSTER</span><span class="pill light">维修手册已收录 <i></i></span></div><div class="model-number">981<span>2013 — 2015</span></div><img src="assets/981.svg" alt="981 敞篷跑车侧面示意图" class="car-art"><div class="model-bottom"><div><h2>Boxster / S / GTS</h2><p>中置引擎，纯粹驾趣。</p></div><span class="round-arrow">↗</span></div></a><div class="model-detail"><span class="eyebrow">YOUR TECHNICAL COMPANION</span><h2>让查阅，<br>跟上你的思路。</h2><p>按系统找到维修项目，<br>用熟悉的词搜索专业资料。</p><div class="stat-line"><strong>${fmt(catalog.sourcePages)}</strong><span>页原版资料</span></div><div class="stat-line"><strong>${fmt(catalog.documents.length)}</strong><span>份维修资料切片</span></div><a class="text-link" href="#/981">浏览全部维修模块 <span>→</span></a></div></section>
  ${lastDoc ? `<a class="resume" href="${docURL(lastDoc.id,last.page)}"><span>↳ 继续上次阅读</span><strong>${escapeHTML(lastDoc.title)}</strong><span>第 ${last.page} 页 →</span></a>`:''}
  <section class="home-notes"><div><b>01</b><span><strong>按系统归档</strong><small>保养、动力、底盘与车身</small></span></div><div><b>02</b><span><strong>模糊关联搜索</strong><small>支持常用叫法与维修编号</small></span></div><div><b>03</b><span><strong>保留原始图文</strong><small>按项目加载，随时核对原页</small></span></div></section>`;
}
function library(params) {
  let module=params.get('module') || 'all';
  if(module!=='all' && !catalog.modules.some(m=>m.id===module)) module='all';
  let query=params.get('q') || '', limit=50;
  app.innerHTML=`<section class="library-heading"><a href="#/" class="back-link">← 车型资料库</a><div class="library-title"><div><div class="eyebrow">BOXSTER / BOXSTER S / BOXSTER GTS</div><h1>981 <span>车间维修手册</span></h1></div><span class="edition">2013–2015<br><small>中文资料 · ${fmt(catalog.sourcePages)} 页</small></span></div><div class="search-wrap">${icon('search')}<input id="search" type="search" value="${escapeHTML(query)}" placeholder="搜索维修项目、部件或 WM 编号，例如：电瓶、刹车、PDK" aria-label="搜索维修资料" autocomplete="off"><kbd>/</kbd></div><div class="search-helper"><span>搜索项目标题与编号，支持同义词关联和错字容错</span><span id="related"></span></div></section>
  <div class="library-layout"><aside class="module-sidebar"><div class="sidebar-heading">维修模块 <span>${catalog.modules.length}</span></div><button class="module-link" data-module="all">${icon('book')}<span>全部资料</span><small>${catalog.documents.length}</small></button>${catalog.modules.map(m=>`<button class="module-link" data-module="${m.id}">${icon(m.icon)}<span>${m.name}</span><small>${m.count}</small></button>`).join('')}<div class="sidebar-note">资料阅读说明<p>索引由原书页首标题整理。不同配置的适用范围，请以 PDF 原文为准。</p></div></aside><section class="catalog-content"><div id="catalog-results"></div></section></div>`;
  function updateURL() {
    const p=new URLSearchParams();if(module!=='all')p.set('module',module);if(query)p.set('q',query);
    returnRoute='#/981'+(p.size?'?'+p:'');history.replaceState(null,'',returnRoute);writeStorage('werkstatt-return-route',returnRoute);
  }
  function draw() {
    const active=catalog.modules.find(m=>m.id===module);
    const rows=searchDocuments(index,query,module);
    const related=relatedTerms(query);
    document.querySelector('#related').innerHTML=related.length ? `关联：${related.map(t=>`<button class="term-chip" data-term="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}`:'';
    document.querySelectorAll('[data-module]').forEach(el=>{el.classList.toggle('active',el.dataset.module===module);el.setAttribute('aria-pressed',el.dataset.module===module);});
    document.querySelector('#catalog-results').innerHTML=`${!query && module==='all' ? `<div class="section-top"><h2>从维修模块开始</h2><span>选择你要查阅的系统</span></div><div class="module-grid">${catalog.modules.filter(m=>m.id!=='reference').map(m=>`<button class="module-tile" data-select-module="${m.id}"><span class="tile-icon">${icon(m.icon)}</span><strong>${m.name}</strong><small>${m.count} 份资料 <span>↗</span></small></button>`).join('')}</div>`:''}<div class="section-top result-heading"><div><h2>${query ? `“${escapeHTML(query)}” 的搜索结果` : active ? active.name : '全部维修资料'}</h2>${active?`<p>${active.description}</p>`:''}</div><span>${fmt(rows.length)} 份资料</span></div>${rows[0]?.match==='fuzzy'?'<div class="fuzzy-note">没有精确匹配，以下是名称相近的维修项目。</div>':''}
    ${rows.length ? `<div class="document-list">${rows.slice(0,limit).map(({doc,match})=>`<a class="document-row" href="${docURL(doc.id)}"><span class="pdf-icon">PDF</span><div class="document-info"><div class="document-meta"><span>${escapeHTML(doc.moduleName)}</span><span>${escapeHTML(doc.code==='COVER'?'封面':'WM '+doc.code)}</span>${match==='synonym'?'<span class="match-label">关联匹配</span>':''}</div><h3>${escapeHTML(doc.title)}</h3><small>${doc.pages} 页 <span>·</span> 原书 ${doc.start}–${doc.end} 页 <span>·</span> ${size(doc.bytes)}</small></div><span class="row-arrow">↗</span></a>`).join('')}</div>${rows.length>limit?`<button id="load-more" class="button subtle load-more">继续显示 · 还有 ${rows.length-limit} 份资料 ↓</button>`:''}`:`<div class="empty-state">${icon('search')}<h3>暂时没有找到相关项目</h3><p>试试更短的部件名称、常用叫法或 WM 编号。</p>${module!=='all'?'<button class="button" id="search-all">在全部模块中搜索</button>':'<button class="button" id="clear-search">清空搜索</button>'}</div>`}`;
    document.querySelectorAll('[data-select-module]').forEach(el=>el.onclick=()=>selectModule(el.dataset.selectModule));
    document.querySelectorAll('[data-term]').forEach(el=>el.onclick=()=>{query=el.dataset.term;document.querySelector('#search').value=query;limit=50;updateURL();draw();});
    const more=document.querySelector('#load-more');if(more)more.onclick=()=>{limit+=50;draw();};
    const all=document.querySelector('#search-all');if(all)all.onclick=()=>selectModule('all');
    const clear=document.querySelector('#clear-search');if(clear)clear.onclick=()=>{query='';document.querySelector('#search').value='';updateURL();draw();};
  }
  function selectModule(id){module=id;limit=50;updateURL();draw();document.querySelector('.catalog-content').scrollIntoView({behavior:'smooth',block:'start'});}
  document.querySelectorAll('[data-module]').forEach(el=>el.onclick=()=>selectModule(el.dataset.module));
  let debounce;
  document.querySelector('#search').oninput=e=>{query=e.target.value;clearTimeout(debounce);debounce=setTimeout(()=>{if(!document.querySelector('#catalog-results'))return;limit=50;updateURL();draw();},100);};
  draw();updateURL();
}
async function openReader(doc,page,version) {
  app.innerHTML=`<section class="reader-heading"><a class="back-link" href="${escapeHTML(returnRoute)}">← 返回维修索引</a><div class="document-meta"><span>${escapeHTML(doc.moduleName)}</span><span>${escapeHTML(doc.code==='COVER'?'封面':'WM '+doc.code)}</span></div><h1>${escapeHTML(doc.title)}</h1><p>981 · 原书第 ${doc.start}–${doc.end} 页 · ${size(doc.bytes)}</p></section><section class="reader-shell"><div class="reader-toolbar"><div class="page-controls"><button id="prev-page" aria-label="上一页">←</button><label><input id="page-number" type="number" min="1" max="${doc.pages}" value="${page}" aria-label="PDF 页码"><span> / ${doc.pages}</span></label><button id="next-page" aria-label="下一页">→</button></div><span id="original-page" class="original-page"></span><div class="zoom-controls"><button id="zoom-out" aria-label="缩小">−</button><button id="fit-page" title="适应宽度">适宽</button><button id="zoom-in" aria-label="放大">＋</button></div><a class="download-link" href="${doc.file}" download>下载 PDF ↓</a></div><div class="pdf-stage" id="pdf-stage"><div class="pdf-status" role="status">正在加载当前维修项目…</div><div class="canvas-wrap"><canvas id="pdf-canvas" aria-label="维修手册原始 PDF 页面"></canvas><div id="pdf-text" class="textLayer"></div></div></div><div class="reader-bottom"><span>← → 翻页 <span class="desktop-only">· 浏览器会记住阅读位置</span></span><a href="${doc.file}" target="_blank" rel="noopener">使用浏览器打开 PDF ↗</a></div></section>`;
  const siblings=index.filter(d=>d.id!==doc.id && d.code===doc.code && (!/X00/.test(doc.code) || d.title.split(' · 第')[0]===doc.title.split(' · 第')[0]));
  if(siblings.length)app.insertAdjacentHTML('beforeend',`<section class="related-docs"><strong>同一项目的其他资料 / 续页</strong><p>原书可能包含不同版本或分散的续页，请结合项目适用范围阅读。</p>${siblings.map(d=>`<a href="${docURL(d.id)}">${escapeHTML(d.title)} · 原书 ${d.start}–${d.end} 页 ↗</a>`).join('')}</section>`);
  if(doc.module==='diagnostics')app.querySelector('.reader-heading').insertAdjacentHTML('beforeend','<p class="diagnostic-note">此附录按故障码索引；原书中文文字编码异常，阅读以 PDF 原页为准。</p>');
  let pdf,loading,renderTask,textLayer,closed=false,renderVersion=0,zoom=1,current=page;
  const stage=document.querySelector('#pdf-stage'), status=stage.querySelector('.pdf-status'),wrap=stage.querySelector('.canvas-wrap');
  const canvas=document.querySelector('#pdf-canvas');
  const pageInput=document.querySelector('#page-number');
  const setStatus=(text,error=false)=>{status.textContent=text;status.classList.toggle('error',error);status.hidden=!text;};
  const go=n=>{n=Math.min(doc.pages,Math.max(1,Number(n)||1));location.hash=docURL(doc.id,n).slice(1);};
  document.querySelector('#prev-page').onclick=()=>go(current-1);
  document.querySelector('#next-page').onclick=()=>go(current+1);
  pageInput.onchange=()=>go(pageInput.value);
  document.querySelector('#zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);render();};
  document.querySelector('#zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);render();};
  document.querySelector('#fit-page').onclick=()=>{zoom=1;render();};
  const keys=e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();go(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();go(current-1);}};
  document.addEventListener('keydown',keys);
  let resizeTimer;
  const observer=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(pdf)render();},160);});
  observer.observe(stage);
  reader={id:doc.id,go:n=>{if(current!==n)stage.scrollTo(0,0);current=n;render();},close:()=>{closed=true;renderVersion++;clearTimeout(resizeTimer);observer.disconnect();document.removeEventListener('keydown',keys);renderTask?.cancel();textLayer?.cancel();loading?.destroy();}};
  async function render() {
    pageInput.value=current;
    document.querySelector('#original-page').textContent=`原书第 ${doc.start+current-1} 页`;
    document.querySelector('#prev-page').disabled=current<=1;
    document.querySelector('#next-page').disabled=current>=doc.pages;
    writeStorage('werkstatt-last',{id:doc.id,page:current});
    if(!pdf || closed)return;
    const serial=++renderVersion;
    renderTask?.cancel();textLayer?.cancel();
    const previous=renderTask;
    if(previous)try{await previous.promise;}catch{}
    if(closed || serial!==renderVersion)return;
    setStatus('正在渲染页面…');
    try {
      const pdfPage=await pdf.getPage(current);
      if(closed || serial!==renderVersion)return;
      const base=pdfPage.getViewport({scale:1});
      const scale=(Math.min(stage.clientWidth-32,1100)/base.width)*zoom;
      const viewport=pdfPage.getViewport({scale});
      const pixelRatio=Math.min(window.devicePixelRatio||1,2);
      canvas.width=Math.floor(viewport.width*pixelRatio);canvas.height=Math.floor(viewport.height*pixelRatio);
      canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
      wrap.style.width=`${viewport.width}px`;wrap.style.height=`${viewport.height}px`;
      wrap.style.setProperty('--scale-factor',scale);
      const layer=document.querySelector('#pdf-text');layer.replaceChildren();
      renderTask=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:[pixelRatio,0,0,pixelRatio,0,0]});
      await renderTask.promise;
      if(closed || serial!==renderVersion)return;
      const textContent=await pdfPage.getTextContent();
      if(closed || serial!==renderVersion)return;
      textLayer=new pdfjs.TextLayer({textContentSource:textContent,container:layer,viewport});
      await textLayer.render();
      if(closed || serial!==renderVersion)return;
      setStatus('');
    }catch(error){if(error.name==='RenderingCancelledException' || error.name==='AbortException' || closed || serial!==renderVersion)return;console.error(error);setStatus('此页暂时无法渲染，可使用下方“使用浏览器打开 PDF”查看。',true);}
  }
  let pdfjs;
  try {
    pdfjs=await import('../vendor/pdfjs/pdf.mjs');
    if(closed || version!==routeVersion)return;
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs',import.meta.url).href;
    loading=pdfjs.getDocument({url:new URL('../'+doc.file,import.meta.url).href,
      cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
      standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href,
      wasmUrl:new URL('../vendor/pdfjs/wasm/',import.meta.url).href, isEvalSupported:false});
    loading.onProgress=({loaded,total})=>{if(!closed)setStatus(`正在加载当前维修项目${total?` · ${Math.min(100,Math.round(loaded/total*100))}%`:''}`);};
    pdf=await loading.promise;
    if(closed)return;
    await render();
  }catch(error){if(closed)return;console.error(error);setStatus('PDF 加载失败，请检查网络后刷新，或直接打开 PDF 文件。',true);}
}
function route() {
  const [path,query='']=(location.hash.slice(1)||'/').split('?');
  const params=new URLSearchParams(query);
  const match=path.match(/^\/981\/doc\/(981-\d+)$/);
  const doc=match && index.find(d=>d.id===match[1]);
  const page=doc?Math.max(1,Math.min(doc.pages,parseInt(params.get('page'),10)||1)):1;
  if(doc && reader?.id===doc.id){reader.go(page);return;}
  reader?.close();reader=null;const version=++routeVersion;
  document.querySelector('#nav-models').classList.toggle('active',path==='/');
  document.querySelector('#nav-manual').classList.toggle('active',path.startsWith('/981'));
  document.title=doc?`${doc.title} · 981 维修手册`:'Werkstatt · 保时捷维修手册';
  if(doc)openReader(doc,page,version);
  else if(path==='/981')library(params);
  else if(path==='/')home();
  else app.innerHTML='<div class="empty-state"><h1>没有找到这份资料</h1><p>链接可能不完整，请从维修索引重新选择。</p><a class="button" href="#/981">返回维修索引</a></div>';
  window.scrollTo(0,0);
}
document.addEventListener('keydown',e=>{if(e.key==='/' && !/INPUT|TEXTAREA/.test(e.target.tagName)){const input=document.querySelector('#search');if(input){e.preventDefault();input.focus();}}});
try {
  const response=await fetch(new URL('../data/981.json',import.meta.url));
  if(!response.ok)throw Error('Catalog HTTP '+response.status);
  catalog=await response.json();index=buildIndex(catalog);
  window.addEventListener('hashchange',route);route();
}catch(error){console.error(error);app.innerHTML='<div class="empty-state"><h1>资料索引未能加载</h1><p>请通过本地 HTTP 服务或 GitHub Pages 打开本站，并检查 data/981.json 是否存在。</p><button class="button" onclick="location.reload()">重新加载</button></div>';}
