const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base='http://parts.test/';
const site=path.resolve(__dirname,'../site');

(async()=>{
  const browser=await chromium.launch({headless:true,channel:'chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const errors=[];
    await page.route('**/*',route=>{
      const pathname=decodeURIComponent(new URL(route.request().url()).pathname);
      const file=path.resolve(site,'.'+(pathname==='/'?'/index.html':pathname));
      if(!file.startsWith(site+path.sep))return route.fulfill({status:404});
      try{const body=readFileSync(file);const extension=path.extname(file);const contentType={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}[extension]||'application/octet-stream';return route.fulfill({status:200,body,contentType});}
      catch{return route.fulfill({status:404});}
    });
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
    await page.goto(base+'#/981');
    await page.waitForSelector('.library-tabs');
    await page.locator('.library-tabs a[href="#/981/parts"]').click();
    await page.waitForSelector('.part-card');
    assert.equal(await page.locator('.part-card').count(),7);
    assert.ok((await page.locator('.part-card').first().innerText()).includes('MANN-FILTER'));
    await page.screenshot({path:'tmp/parts-981-desktop.png',fullPage:false});
    await page.locator('#parts-search').fill('FGR5NQE04');
    await page.waitForFunction(()=>document.querySelectorAll('.part-card').length===1);
    assert.ok((await page.locator('.part-card').first().innerText()).includes('999 170 151 90'));
    await page.reload();
    await page.waitForSelector('.part-card');
    assert.equal(await page.locator('#parts-search').inputValue(),'FGR5NQE04');
    await page.goto(base+'#/982/parts');
    await page.waitForSelector('.part-card');
    assert.equal(await page.locator('.part-card').count(),8);
    await page.locator('[data-category="ignition"]').click();
    assert.equal(await page.locator('.part-card').count(),2);
    await page.setViewportSize({width:390,height:844});
    await page.reload();
    await page.waitForSelector('.part-card');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');
    await page.screenshot({path:'tmp/parts-982-mobile.png',fullPage:false});
    assert.deepEqual(errors,[]);
    console.log('PASS: 981/982 parts tabs, brand-number search, direct links, category filter, reload, mobile layout.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
