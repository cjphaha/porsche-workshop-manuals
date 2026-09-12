import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildIndex,searchDocuments,relatedTerms} from '../site/assets/search.mjs';
const catalog=JSON.parse(readFileSync(new URL('../site/data/981.json',import.meta.url)));
const index=buildIndex(catalog);
test('common aliases find the real manual titles',()=>{
  for(const [query,word] of [['电瓶','蓄电池'],['火嘴','火花塞'],['刹车','制动'],['刮水器','雨刷']]) {
    const rows=searchDocuments(index,query);
    assert.ok(rows.length,query);
    assert.ok(rows.some(r=>r.doc.title.includes(word)),query);
  }
  assert.ok(relatedTerms('电瓶').includes('蓄电池'));
});
test('WM code and DTC code match exact records first',()=>{
  assert.equal(searchDocuments(index,'WM 979255')[0].doc.code,'979255');
  assert.equal(searchDocuments(index,'P012B00')[0].doc.code,'P012B00');
  assert.equal(searchDocuments(index,'p012b')[0].doc.code,'P012B00');
});
test('minor Chinese typo has a clearly identified fallback',()=>{
  const rows=searchDocuments(index,'发动鸡');
  assert.ok(rows.some(r=>r.doc.title.includes('发动机')));
  assert.equal(rows[0].match,'fuzzy');
});
test('module filters are respected and all-document browse is complete',()=>{
  assert.equal(searchDocuments(index,'').length,catalog.documents.length);
  assert.ok(searchDocuments(index,'','4').every(r=>r.doc.module==='4'));
  assert.equal(searchDocuments(index,'P012B00','4').length,0);
});
test('multiple words narrow results; unrelated words do not invent a match',()=>{
  assert.ok(searchDocuments(index,'火花塞 拆卸').length);
  assert.equal(searchDocuments(index,'量子宇宙咖啡发射器').length,0);
});
test('aliases embedded in a phrase preserve the requested component',()=>{
  assert.ok(searchDocuments(index,'刹车盘').some(r=>r.doc.title.includes('制动盘')));
  assert.ok(searchDocuments(index,'刹车油').some(r=>r.doc.title.includes('制动液')));
  assert.ok(relatedTerms('换电瓶').includes('换蓄电池'));
});
