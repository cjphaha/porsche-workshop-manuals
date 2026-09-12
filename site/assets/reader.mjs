import {getProjectParts,getProjectPages,projectTitle} from './projects.mjs';
const escapeHTML=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const urlFor=(model,id,page)=>`#/${model}/doc/${id}?page=${page}`;
const save=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
let pdfModule;
const getPDFModule=()=>pdfModule ||= import('../vendor/pdfjs/pdf.mjs?v=mobile-compat-1');

export function createContinuousReader({app,catalog,index,doc,page,returnRoute}) {
  const model=catalog.model, parts=getProjectParts(doc,index), pages=getProjectPages(parts);
  const title=projectTitle(parts[0]);
  const total=pages.length;
  let current=Math.max(0,pages.findIndex(p=>p.doc.id===doc.id && p.local===page));
  let ownedHash=location.hash;
  let closed=false, pdfjs, zoom=1, running=0, frame=0, resizeTimer, mergeWorker;
  let wanted=new Set(), jumping=false;
  const pdfs=new Map();
  app.innerHTML=`<section class="reader-heading"><a class="back-link" href="${escapeHTML(returnRoute)}">← 返回维修索引</a><div class="document-meta"><span>${escapeHTML(doc.moduleName || '')}</span><span>${escapeHTML(doc.code || '章节目录')}</span></div><h1>${escapeHTML(title)}</h1><p>${escapeHTML(model)} · 共 ${total} 页${parts.length>1?` · 已连接 ${parts.length} 份资料`:''} · 向下滚动连续阅读</p></section>
  <section class="reader-shell continuous-reader"><div class="reader-toolbar"><div class="page-controls"><button id="prev-page" aria-label="上一页">←</button><label><input id="page-number" type="number" min="1" max="${total}" value="${current+1}" aria-label="项目页码"><span> / ${total}</span></label><button id="next-page" aria-label="下一页">→</button></div><span id="original-page" class="original-page"></span><div class="zoom-controls"><button id="zoom-out" aria-label="缩小">−</button><button id="fit-page" title="适应宽度">适宽</button><button id="zoom-in" aria-label="放大">＋</button></div><button id="download-project" class="download-link">下载完整 PDF ↓</button><div id="download-status" role="status" hidden></div></div>
  <div class="pdf-stage" id="pdf-stage"><div class="pdf-status" role="status">正在准备连续阅读…</div><div id="pdf-pages">${pages.map((p,i)=>`<section class="pdf-sheet" data-page="${i+1}" data-doc="${p.doc.id}" data-local-page="${p.local}" aria-label="项目第 ${i+1} 页，原书第 ${p.original} 页"><div class="sheet-caption"><span>第 ${i+1} / ${total} 页</span><span>${p.local===1 && i>0?'续接资料 · ':''}原书第 ${p.original} 页</span></div><div class="pdf-page-scroll"><div class="canvas-wrap page-surface"><div class="page-load-state">页面即将加载</div></div></div></section>`).join('')}</div></div>
  <div class="reader-bottom"><span>已到达本项目末尾 · 共 ${total} 页</span><a href="${escapeHTML(returnRoute)}">返回维修索引 ↑</a></div></section>`;
  const variants=index.filter(d=>d.id!==doc.id && d.code && d.code===doc.code && !parts.some(p=>p.id===d.id) && (!/X00/.test(doc.code) || projectTitle(d)===title));
  if(variants.length)app.insertAdjacentHTML('beforeend',`<section class="related-docs"><strong>其他配置或版本的资料</strong><p>这些资料单独阅读，不包含在当前项目的下载中。</p>${variants.map(d=>`<a href="${urlFor(model,d.id,1)}">${escapeHTML(d.title)} · 原书 ${d.start}–${d.end} 页 ↗</a>`).join('')}</section>`);
  const stage=app.querySelector('#pdf-stage'), toolbar=app.querySelector('.reader-toolbar');
  const status=app.querySelector('.pdf-status'), input=app.querySelector('#page-number');
  const previous=app.querySelector('#prev-page'), next=app.querySelector('#next-page');
  const downloadButton=app.querySelector('#download-project'), downloadStatus=app.querySelector('#download-status');
  const states=pages.map((p,i)=>({...p,index:i,element:app.querySelector(`[data-page="${i+1}"]`),rendered:false,busy:false,generation:0}));
  for(const s of states)s.surface=s.element.querySelector('.page-surface');
  function layout() {
    const width=Math.max(180,Math.min(stage.clientWidth-32,1100))*zoom;
    for(const s of states) {
      s.width=width;s.height=width*s.size[1]/s.size[0];
      s.surface.style.width=`${s.width}px`;s.surface.style.height=`${s.height}px`;
      s.surface.style.setProperty('--scale-factor',s.width/s.size[0]);
    }
  }
  function updatePosition(i) {
    if(location.hash!==ownedHash)return;
    current=i;
    if(document.activeElement!==input)input.value=i+1;
    previous.disabled=i===0;next.disabled=i===total-1;
    app.querySelector('#original-page').textContent=`原书第 ${states[i].original} 页`;
    const state=states[i];
    history.replaceState(null,'',urlFor(model,state.doc.id,state.local));
    ownedHash=location.hash;
    save('werkstatt-last',{model,id:state.doc.id,title,page:state.local});
  }
  function dispose(s) {
    if(!s.rendered && !s.busy && !s.error)return;
    s.generation++;s.renderTask?.cancel();s.textLayer?.cancel();
    const canvas=s.canvas;
    if(canvas) {
      const release=()=>{canvas.width=0;canvas.height=0;};
      if(s.renderTask)s.renderTask.promise.catch(()=>{}).finally(release);else release();
    }
    s.surface.replaceChildren();
    s.rendered=false;s.error=false;s.canvas=null;
    s.element.dataset.rendered='false';
  }
  function evictPDFs() {
    for(const [id,entry] of pdfs) {
      if(states.some(s=>s.doc.id===id && (wanted.has(s.index)||s.busy)))continue;
      pdfs.delete(id);entry.task.destroy().catch(()=>{});
    }
  }
  function refresh() {
    if(closed || location.hash!==ownedHash)return;
    const rects=states.map(s=>s.element.getBoundingClientRect());
    const line=Math.max(100,Math.min(innerHeight*.3,toolbar.getBoundingClientRect().bottom+70));
    let active=0;
    for(let i=0;i<rects.length;i++)if(rects[i].top<=line)active=i;
    if(!jumping && active!==current)updatePosition(active);
    const near=states.filter(s=>rects[s.index].bottom>-innerHeight && rects[s.index].top<innerHeight*2)
      .sort((a,b)=>Math.abs(a.index-current)-Math.abs(b.index-current));
    wanted=new Set(near.slice(0,6).map(s=>s.index));
    for(const s of states)if(!wanted.has(s.index))dispose(s);
    pump();evictPDFs();
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;refresh();});}
  async function ensurePDF(d) {
    if(!pdfs.has(d.id)) {
      const task=pdfjs.getDocument({url:new URL('../'+d.file,import.meta.url).href,
        cMapUrl:new URL('../vendor/pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,
        standardFontDataUrl:new URL('../vendor/pdfjs/standard_fonts/',import.meta.url).href,
        wasmUrl:new URL('../vendor/pdfjs/wasm/',import.meta.url).href,isEvalSupported:false});
      const entry={task,promise:task.promise};pdfs.set(d.id,entry);
      entry.promise.catch(()=>{if(pdfs.get(d.id)===entry)pdfs.delete(d.id);});
    }
    return pdfs.get(d.id).promise;
  }
  async function render(s) {
    s.busy=true;running++;
    const generation=++s.generation;
    let pdfPage;
    const valid=()=>!closed && generation===s.generation && wanted.has(s.index);
    try {
      s.surface.innerHTML='<div class="page-load-state">正在加载此页…</div>';
      const pdf=await ensurePDF(s.doc);
      if(!valid())return;
      pdfPage=await pdf.getPage(s.local);
      if(!valid())return;
      const original=pdfPage.getViewport({scale:1});
      const viewport=pdfPage.getViewport({scale:s.width/original.width});
      // New imports have exact page geometry. This also supports old catalogs.
      if(Math.abs(s.height-viewport.height)>1) {
        s.size=[original.width,original.height];s.height=viewport.height;s.surface.style.height=`${viewport.height}px`;
      }
      const ratio=Math.min(devicePixelRatio||1,2,Math.sqrt(8_000_000/(viewport.width*viewport.height)));
      const canvas=document.createElement('canvas');
      canvas.setAttribute('aria-label',`项目第 ${s.index+1} 页 PDF 原图`);
      canvas.width=Math.floor(viewport.width*ratio);canvas.height=Math.floor(viewport.height*ratio);
      canvas.style.width=`${viewport.width}px`;canvas.style.height=`${viewport.height}px`;
      const text=document.createElement('div');text.className='textLayer';
      s.canvas=canvas;s.surface.replaceChildren(canvas,text);
      s.surface.style.setProperty('--scale-factor',viewport.scale);
      s.renderTask=pdfPage.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]});
      await s.renderTask.promise;
      if(!valid())return;
      s.rendered=true;s.element.dataset.rendered='true';status.hidden=true;
      try {
        const content=await pdfPage.getTextContent();
        if(!valid())return;
        s.textLayer=new pdfjs.TextLayer({textContentSource:content,container:text,viewport});
        await s.textLayer.render();
      }catch(error) {
        if(valid()) {
          text.remove();
          console.warn('PDF text layer failed; keeping rendered page',s.doc.id,s.local,error);
        }
      }
    }catch(error) {
      if(!valid() || error.name==='RenderingCancelledException' || error.name==='AbortException')return;
      console.error('PDF page render failed',s.doc.id,s.local,error);
      s.error=true;
      s.surface.innerHTML=`<div class="page-load-state page-error">此页暂时无法显示，请重试。<button type="button">重新加载</button><a href="${escapeHTML(s.doc.file)}" target="_blank" rel="noopener">单独打开此段 PDF ↗</a></div>`;
      s.surface.querySelector('button').onclick=()=>{s.error=false;pump();};
      status.hidden=true;
    }finally {
      s.busy=false;running--;
      if(!s.rendered)pdfPage?.cleanup();
      if(!closed){pump();evictPDFs();}
    }
  }
  function pump() {
    if(!pdfjs || closed)return;
    for(const i of [...wanted].sort((a,b)=>Math.abs(a-current)-Math.abs(b-current))) {
      if(running>=2)break;
      const s=states[i];if(!s.busy && !s.rendered && !s.error)void render(s);
    }
  }
  function jump(i) {
    i=Math.max(0,Math.min(total-1,Math.trunc(Number(i)||0)));
    jumping=true;updatePosition(i);
    const y=states[i].element.getBoundingClientRect().top+scrollY-toolbar.offsetHeight-14;
    window.scrollTo({top:Math.max(0,y),behavior:'instant'});
    refresh();jumping=false;
  }
  function resizeLayout() {
    if(closed)return;
    const s=states[current],oldTop=s.element.getBoundingClientRect().top;
    const fraction=Math.max(0,(toolbar.offsetHeight+14-oldTop)/s.element.offsetHeight);
    for(const state of states)dispose(state);
    layout();
    const top=s.element.getBoundingClientRect().top+scrollY;
    window.scrollTo({top:Math.max(0,top+fraction*s.element.offsetHeight-toolbar.offsetHeight-14),behavior:'instant'});
    refresh();
  }
  previous.onclick=()=>jump(current-1);next.onclick=()=>jump(current+1);
  input.onchange=()=>jump(Number(input.value)-1);
  app.querySelector('#zoom-in').onclick=()=>{zoom=Math.min(3,zoom+.25);resizeLayout();};
  app.querySelector('#zoom-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);resizeLayout();};
  app.querySelector('#fit-page').onclick=()=>{zoom=1;resizeLayout();};
  const keydown=e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName))return;if(e.key==='ArrowRight'){e.preventDefault();jump(current+1);}if(e.key==='ArrowLeft'){e.preventDefault();jump(current-1);}};
  document.addEventListener('keydown',keydown);
  window.addEventListener('scroll',schedule,{passive:true});
  let lastWidth=stage.clientWidth;
  const resizeObserver=new ResizeObserver(()=>{
    if(stage.clientWidth===lastWidth)return;
    lastWidth=stage.clientWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(resizeLayout,160);
  });
  resizeObserver.observe(stage);
  function finishDownload(message,error=false) {
    mergeWorker?.terminate();mergeWorker=null;downloadButton.disabled=false;
    downloadButton.textContent=error?'重试下载完整 PDF ↓':'下载完整 PDF ↓';
    downloadStatus.hidden=false;downloadStatus.textContent=message;downloadStatus.classList.toggle('error',error);
  }
  downloadButton.onclick=()=>{
    if(mergeWorker)return;
    downloadButton.disabled=true;downloadButton.textContent='正在准备…';downloadStatus.hidden=false;
    downloadStatus.textContent=`准备合并 ${parts.length} 份资料，共 ${total} 页…`;downloadStatus.classList.remove('error');
    try {
      mergeWorker=new Worker(new URL('./merge-worker.mjs',import.meta.url),{type:'module'});
      mergeWorker.onmessage=({data})=>{
        if(closed)return;
        if(data.type==='progress')downloadStatus.textContent=data.text;
        else if(data.type==='error')finishDownload(data.message,true);
        else if(data.type==='done') {
          const url=URL.createObjectURL(new Blob([data.buffer],{type:'application/pdf'}));
          const a=document.createElement('a');a.href=url;a.download=`${model}-${title}`.replace(/[\\/:*?"<>|]/g,'-').slice(0,120)+'.pdf';
          document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
          finishDownload(`已生成完整项目 PDF，共 ${total} 页。`);
        }
      };
      mergeWorker.onerror=()=>finishDownload('下载工具加载失败，请检查网络后重试。',true);
      mergeWorker.postMessage({files:parts.map(d=>new URL('../'+d.file,import.meta.url).href),title:`${model} · ${title}`});
    }catch{finishDownload('暂时无法生成 PDF，请重试。',true);}
  };
  layout();updatePosition(current);
  if(current>0)jump(current);else refresh();
  getPDFModule().then(module=>{
    if(closed)return;pdfjs=module;
    pdfjs.GlobalWorkerOptions.workerSrc=new URL('../vendor/pdfjs/pdf.worker.mjs?v=mobile-compat-1',import.meta.url).href;
    refresh();
  }).catch(()=>{if(!closed){status.textContent='阅读器加载失败，请刷新重试。';status.hidden=false;}});
  return {model,id:doc.id,contains:id=>parts.some(p=>p.id===id),goToDoc:(id,local)=>{
    ownedHash=location.hash;
    const i=pages.findIndex(p=>p.doc.id===id && p.local===local);if(i>=0)jump(i);
  },close:()=>{
    closed=true;cancelAnimationFrame(frame);clearTimeout(resizeTimer);resizeObserver.disconnect();
    window.removeEventListener('scroll',schedule);document.removeEventListener('keydown',keydown);
    mergeWorker?.terminate();
    for(const state of states)dispose(state);
    for(const entry of pdfs.values())entry.task.destroy().catch(()=>{});
    pdfs.clear();
  }};
}
