import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getProjectParts,getProjectPages} from '../site/assets/projects.mjs';
const docs=JSON.parse(readFileSync(new URL('../site/data/981.json',import.meta.url))).documents;
test('technical chapter slices form one complete ordered project',()=>{
  const selected=docs.find(d=>d.start===2117);
  const parts=getProjectParts(selected,docs);
  assert.equal(parts.length,4);assert.equal(getProjectPages(parts).length,128);
  assert.deepEqual(getProjectParts(parts[2],docs),parts);
  assert.equal(getProjectPages(parts)[127].original,2244);
});
test('displaced continuation belongs to fuse procedure, excluding DTC appendix',()=>{
  const parts=getProjectParts(docs.find(d=>d.start===4455),docs);
  assert.deepEqual(parts.map(d=>d.start),[3827,4455]);
  assert.deepEqual(getProjectPages(parts).map(p=>p.original),[3827,3828,3829,3830,4455]);
});
test('same WM code in different markets does not combine different procedures',()=>{
  const parts=getProjectParts(docs.find(d=>d.start===99),docs);
  assert.deepEqual(parts.map(d=>d.start),[99]);
});
test('unannotated bookmark entries remain separate even when code is empty',()=>{
  const a={id:'a',code:'',start:1},b={id:'b',code:'',start:4};
  assert.deepEqual(getProjectParts(a,[a,b]),[a]);
});
test('every original page has valid geometry and every project has a root document',()=>{
  const ids=new Set(docs.map(d=>d.id));
  for(const d of docs) {
    assert.ok(ids.has(d.projectId));assert.equal(d.pageSizes.length,d.pages);
    assert.ok(d.pageSizes.every(([w,h])=>w>0&&h>0));
  }
});
