import {createContinuousReader} from './reader.mjs?v=mobile-compat-1';
import {buildIndex, searchDocuments, relatedTerms} from './search.mjs';

const app = document.querySelector('#app');
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => n.toLocaleString('zh-CN');
const size = n => n < 1024*1024 ? `${Math.ceil(n/1024)} KB` : `${(n/1024/1024).toFixed(1)} MB`;
const readStorage = key => {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}};
const writeStorage = (key,value) => {try{localStorage.setItem(key,JSON.stringify(value));}catch{/* Private browsing still works. */}};
let catalog, index, reader, registry, routeVersion=0, returnRoute='#/';
const catalogCache=new Map();
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
const docURL = (id,page=1,model=catalog.model) => `#/${model}/doc/${id}?page=${page}`;
function alternateCover() {
  return `<svg class="car-art theme-lineart" viewBox="50 20 650 240" role="img" aria-label="911 线稿主题封面"><defs><filter id="cover-lineart-ink" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -.3333 -.3333 -.3333 0 1"/><feComponentTransfer result="lines"><feFuncA type="linear" slope="2.2"/></feComponentTransfer><feFlood class="cover-lineart-tone"/><feComposite in2="lines" operator="in"/></filter></defs><image href="assets/911-cover-lineart.png" width="768" height="274" filter="url(#cover-lineart-ink)"/></svg>`;
}
function home() {
  const last=readStorage('werkstatt-last');
  const lastModel=last?.model || '981';
  const canResume=last && registry.models.some(m=>m.model===lastModel) && typeof last.id==='string' && /^[a-z0-9-]+$/.test(last.id);
  const totalPages=registry.models.reduce((sum,m)=>sum+m.sourcePages,0);
  const totalDocs=registry.models.reduce((sum,m)=>sum+m.documentCount,0);
  const cards=registry.models.map(m=>`<a href="#/${m.model}" class="model-card ${m.image?'owner-car':''}"><div class="model-top"><span class="model-label">PORSCHE · ${escapeHTML(m.name)}</span><span class="pill light">维修手册已收录 <i></i></span></div><div class="model-number ${m.model.length>4?'long-model':''}">${escapeHTML(m.model)}<span>${escapeHTML(m.years || '')}</span></div>${m.image ? `<img src="${escapeHTML(m.image)}" alt="${m.model==='981'?'红色黑顶 981 Boxster 卡通插画':m.model==='982'?'黄色 982 Cayman GT4 RS 卡通插画':escapeHTML(m.model)+' 车型图片'}" class="car-art">${m.model==='981'?alternateCover():''}` : `<div class="model-placeholder">${icon('book')}<span>WORKSHOP MANUAL</span><small>${fmt(m.sourcePages)} 页 · ${fmt(m.documentCount)} 份资料</small></div>`}<div class="model-bottom"><div><h2>${escapeHTML(m.name)}</h2><p>查看维修模块与资料索引</p></div><span class="round-arrow">↗</span></div></a>`).join('');
  app.innerHTML=`<section class="home-intro"><h1>车型资料库</h1><p>选择车型，查阅原版车间维修手册。</p><div class="intro-caption"><span>${registry.models.length} 个已收录车型</span><span>按系统归档 · 按需阅读</span></div></section>
  <section class="model-section ${registry.models.length>1?'multi-model':''}" aria-label="选择车型">${cards}${registry.models.length===1?`<div class="model-detail"><span class="eyebrow">已收录资料</span><h2>车间维修资料</h2><p>按系统找到维修项目，<br>用熟悉的词搜索专业资料。</p><div class="stat-line"><strong>${fmt(totalPages)}</strong><span>页原版资料</span></div><div class="stat-line"><strong>${fmt(totalDocs)}</strong><span>份维修资料切片</span></div><a class="text-link" href="#/${registry.models[0].model}">浏览全部维修模块 <span>→</span></a></div>`:''}</section>
  ${canResume ? `<a class="resume" href="${docURL(last.id,last.page,lastModel)}"><span>↳ 继续上次阅读 · ${escapeHTML(lastModel)}</span><strong>${escapeHTML(last.title || '维修资料')}</strong><span>第 ${Number(last.page)||1} 页 →</span></a>`:''}
  <section class="home-notes"><div><b>01</b><span><strong>按系统归档</strong><small>保养、动力、底盘与车身</small></span></div><div><b>02</b><span><strong>模糊关联搜索</strong><small>支持常用叫法与维修编号</small></span></div><div><b>03</b><span><strong>保留原始图文</strong><small>按项目加载，随时核对原页</small></span></div></section>`;
}
function library(params) {
  const libraryVersion=routeVersion;
  let module=params.get('module') || 'all';
  if(module!=='all' && !catalog.modules.some(m=>m.id===module)) module='all';
  let query=params.get('q') || '', limit=50;
  app.innerHTML=`<section class="library-heading"><a href="#/" class="back-link">← 车型资料库</a><div class="library-title"><div><div class="eyebrow">${escapeHTML(catalog.name)}</div><h1>${escapeHTML(catalog.model)} <span>车间维修手册</span></h1></div><span class="edition">${escapeHTML(catalog.years || "年份未标注")}<br><small>${fmt(catalog.sourcePages)} 页原版资料</small></span></div><div class="search-wrap">${icon('search')}<input id="search" type="search" value="${escapeHTML(query)}" placeholder="搜索维修项目、部件或 WM 编号，例如：电瓶、刹车、PDK" aria-label="搜索维修资料" autocomplete="off"><kbd>/</kbd></div><div class="search-helper"><span>搜索项目标题与编号，支持同义词关联和错字容错</span><span id="related"></span></div></section>
  <div class="library-layout"><aside class="module-sidebar"><div class="sidebar-heading">维修模块 <span>${catalog.modules.length}</span></div><button class="module-link" data-module="all">${icon('book')}<span>全部资料</span><small>${catalog.documents.length}</small></button>${catalog.modules.map(m=>`<button class="module-link" data-module="${m.id}">${icon(m.icon)}<span>${m.name}</span><small>${m.count}</small></button>`).join('')}<div class="sidebar-note">资料阅读说明<p>索引来自原书目录或页首标题。不同配置的适用范围，请以 PDF 原文为准。</p></div></aside><section class="catalog-content"><div id="catalog-results"></div></section></div>`;
  function updateURL() {
    const p=new URLSearchParams();if(module!=='all')p.set('module',module);if(query)p.set('q',query);
    returnRoute='#/'+catalog.model+(p.size?'?'+p:'');history.replaceState(null,'',returnRoute);writeStorage('werkstatt-return-route:'+catalog.model,returnRoute);
  }
  function draw() {
    const active=catalog.modules.find(m=>m.id===module);
    const rows=searchDocuments(index,query,module);
    const related=relatedTerms(query);
    document.querySelector('#related').innerHTML=related.length ? `关联：${related.map(t=>`<button class="term-chip" data-term="${escapeHTML(t)}">${escapeHTML(t)}</button>`).join('')}`:'';
    document.querySelectorAll('[data-module]').forEach(el=>{el.classList.toggle('active',el.dataset.module===module);el.setAttribute('aria-pressed',el.dataset.module===module);});
    document.querySelector('#catalog-results').innerHTML=`${!query && module==='all' ? `<div class="section-top"><h2>从维修模块开始</h2><span>选择你要查阅的系统</span></div><div class="module-grid">${catalog.modules.filter(m=>m.id!=='reference').map(m=>`<button class="module-tile" data-select-module="${m.id}"><span class="tile-icon">${icon(m.icon)}</span><strong>${m.name}</strong><small>${m.count} 份资料 <span>↗</span></small></button>`).join('')}</div>`:''}<div class="section-top result-heading"><div><h2>${query ? `“${escapeHTML(query)}” 的搜索结果` : active ? active.name : '全部维修资料'}</h2>${active?`<p>${active.description}</p>`:''}</div><span>${fmt(rows.length)} 份资料</span></div>${rows[0]?.match==='fuzzy'?'<div class="fuzzy-note">没有精确匹配，以下是名称相近的维修项目。</div>':''}
    ${rows.length ? `<div class="document-list">${rows.slice(0,limit).map(({doc,match})=>`<a class="document-row" href="${docURL(doc.id)}"><span class="pdf-icon">PDF</span><div class="document-info"><div class="document-meta"><span>${escapeHTML(doc.moduleName)}</span><span>${escapeHTML(doc.code==='COVER'?'前置资料':doc.code?(doc.module==='diagnostics'?'':'WM ')+doc.code:'章节目录')}</span>${match==='synonym'?'<span class="match-label">关联匹配</span>':''}</div><h3>${escapeHTML(doc.title)}</h3><small>${doc.pages} 页 <span>·</span> 原书 ${doc.start}–${doc.end} 页 <span>·</span> ${size(doc.bytes)}</small></div><span class="row-arrow">↗</span></a>`).join('')}</div>${rows.length>limit?`<button id="load-more" class="button subtle load-more">继续显示 · 还有 ${rows.length-limit} 份资料 ↓</button>`:''}`:`<div class="empty-state">${icon('search')}<h3>暂时没有找到相关项目</h3><p>试试更短的部件名称、常用叫法或 WM 编号。</p>${module!=='all'?'<button class="button" id="search-all">在全部模块中搜索</button>':'<button class="button" id="clear-search">清空搜索</button>'}</div>`}`;
    document.querySelectorAll('[data-select-module]').forEach(el=>el.onclick=()=>selectModule(el.dataset.selectModule));
    document.querySelectorAll('[data-term]').forEach(el=>el.onclick=()=>{query=el.dataset.term;document.querySelector('#search').value=query;limit=50;updateURL();draw();});
    const more=document.querySelector('#load-more');if(more)more.onclick=()=>{limit+=50;draw();};
    const all=document.querySelector('#search-all');if(all)all.onclick=()=>selectModule('all');
    const clear=document.querySelector('#clear-search');if(clear)clear.onclick=()=>{query='';document.querySelector('#search').value='';updateURL();draw();};
  }
  function selectModule(id){module=id;limit=50;updateURL();draw();document.querySelector('.catalog-content').scrollIntoView({behavior:'smooth',block:'start'});}
  document.querySelectorAll('[data-module]').forEach(el=>el.onclick=()=>selectModule(el.dataset.module));
  let debounce;
  document.querySelector('#search').oninput=e=>{query=e.target.value;clearTimeout(debounce);debounce=setTimeout(()=>{if(libraryVersion!==routeVersion || !document.querySelector('#catalog-results'))return;limit=50;updateURL();draw();},100);};
  draw();updateURL();
}
function openReader(doc,page) {
  reader=createContinuousReader({app,catalog,index,doc,page,returnRoute});
}
async function loadCatalog(model) {
  if(!catalogCache.has(model)) {
    const entry=registry.models.find(m=>m.model===model);
    const response=await fetch(new URL('../'+entry.catalog,import.meta.url));
    if(!response.ok)throw Error('Catalog HTTP '+response.status);
    const data=await response.json();
    if(data.model!==model)throw Error('车型索引不匹配');
    catalogCache.set(model,{catalog:data,index:buildIndex(data)});
  }
  return catalogCache.get(model);
}
function notFound(){app.innerHTML='<div class="empty-state"><h1>没有找到这份资料</h1><p>请从车型资料库重新选择车型和维修项目。</p><a class="button" href="#/">返回车型选择</a></div>';}
async function route() {
  const [path,query='']=(location.hash.slice(1)||'/').split('?');
  const params=new URLSearchParams(query);
  const match=path.match(/^\/([a-z0-9][a-z0-9-]{0,39})(?:\/doc\/([a-z0-9-]+))?$/);
  const model=match?.[1];
  if(model && reader?.model===model && reader.contains(match[2])) {
    const doc=index.find(d=>d.id===match[2]);
    const page=Math.max(1,Math.min(doc.pages,parseInt(params.get('page'),10)||1));
    reader.goToDoc(match[2],page);return;
  }
  reader?.close();reader=null;
  const version=++routeVersion;
  document.querySelector('#nav-models').classList.toggle('active',path==='/');
  document.querySelector('#nav-manual').classList.toggle('active',path!=='/');
  document.title='Porsche 维修资料库';
  window.scrollTo(0,0);
  if(path==='/'){home();return;}
  if(!match || !registry.models.some(m=>m.model===model)){notFound();return;}
  app.innerHTML='<div class="loading-state">正在载入车型资料索引…</div>';
  try {
    const loaded=await loadCatalog(model);
    if(version!==routeVersion)return;
    ({catalog,index}=loaded);
    document.querySelector('#nav-manual').href='#/'+model;
    const saved=readStorage('werkstatt-return-route:'+model);
    returnRoute=typeof saved==='string' && (saved==='#/'+model || saved.startsWith('#/'+model+'?'))?saved:'#/'+model;
    if(!match[2]){library(params);return;}
    const doc=index.find(d=>d.id===match[2]);
    if(!doc){notFound();return;}
    const page=Math.max(1,Math.min(doc.pages,parseInt(params.get('page'),10)||1));
    document.title=`${doc.title} · ${catalog.model} 维修手册`;
    openReader(doc,page,version);
  }catch(error){
    if(version!==routeVersion)return;
    console.error(error);app.innerHTML='<div class="empty-state"><h1>车型索引未能加载</h1><p>请检查索引文件和网络，然后重试。</p><button class="button" id="retry-catalog">重试</button><a class="button subtle" href="#/">返回车型选择</a></div>';
    document.querySelector('#retry-catalog').onclick=()=>route();
  }
}
document.addEventListener('keydown',e=>{if(e.key==='/' && !/INPUT|TEXTAREA/.test(e.target.tagName)){const input=document.querySelector('#search');if(input){e.preventDefault();input.focus();}}});
try {
  const response=await fetch(new URL('../data/models.json',import.meta.url));
  if(!response.ok)throw Error('Registry HTTP '+response.status);
  registry=await response.json();
  if(!Array.isArray(registry.models))throw Error('车型列表格式无效');
  document.querySelector('#nav-manual').href=registry.models.length?'#/'+registry.models[0].model:'#/';
  window.addEventListener('hashchange',route);route();
}catch(error){console.error(error);app.innerHTML='<div class="empty-state"><h1>资料索引未能加载</h1><p>请通过 HTTP 服务或 GitHub Pages 打开本站，并检查 data/models.json。</p><button class="button" onclick="location.reload()">重新加载</button></div>';}
