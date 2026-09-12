import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';

test('981 and 982 use line-art covers in all themes without deleting original files', async () => {
  const registry=JSON.parse(await readFile(new URL('../site/data/models.json',import.meta.url),'utf8'));
  for(const model of registry.models.filter(model=>['981','982'].includes(model.model))) {
    assert.ok(model.coverImage,`${model.model} is missing its line-art cover`);
    assert.equal(model.image,undefined,`${model.model} still references its original cartoon`);
    const asset=await stat(new URL(`../site/${model.coverImage}`,import.meta.url));
    assert.ok(asset.size>0,`${model.model} line-art cover is empty`);
  }
  for(const filename of ['981-cartoon-cute.jpg','982-cayman-cartoon.jpg'])
    assert.ok((await stat(new URL(`../site/assets/${filename}`,import.meta.url))).size>0);
  assert.match(registry.models.find(model=>model.model==='982').years,/^2016/);
});
