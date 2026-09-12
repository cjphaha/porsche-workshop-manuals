import {PDFDocument} from '../vendor/pdf-lib/pdf-lib.esm.min.js';
self.onmessage=async({data:{files,title}})=>{
  try {
    const merged=files.length>1?await PDFDocument.create():null;
    let result;
    for(let i=0;i<files.length;i++) {
      self.postMessage({type:'progress',text:`准备资料 ${i+1}/${files.length}…`});
      const response=await fetch(files[i]);
      if(!response.ok)throw Error(`资料下载失败（HTTP ${response.status}），请重试。`);
      const bytes=await response.arrayBuffer();
      if(!merged){result=new Uint8Array(bytes);break;}
      const source=await PDFDocument.load(bytes);
      const pages=await merged.copyPages(source,source.getPageIndices());
      for(const page of pages)merged.addPage(page);
    }
    if(merged) {
      self.postMessage({type:'progress',text:'正在生成完整项目 PDF…'});
      merged.setTitle(title);merged.setCreator('Werkstatt');
      result=await merged.save();
    }
    self.postMessage({type:'done',buffer:result.buffer},[result.buffer]);
  }catch(error){self.postMessage({type:'error',message:error.message || '合并失败，请稍后重试。'});}
};
