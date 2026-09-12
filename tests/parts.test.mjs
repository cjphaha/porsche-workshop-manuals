import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const registry=JSON.parse(readFileSync(new URL('../site/data/models.json',import.meta.url)));

test('published parts keep a vehicle scope and traceable original/brand numbers',()=>{
  for(const model of ['981','982']){
    const entry=registry.models.find(item=>item.model===model);
    assert.equal(entry.partsCatalog,`data/parts/${model}.json`);
    const data=JSON.parse(readFileSync(new URL(`../site/${entry.partsCatalog}`,import.meta.url)));
    assert.equal(data.model,model);
    const categories=new Set(data.categories.map(item=>item.id));
    const ids=new Set();
    assert.ok(data.parts.length>=5);
    for(const part of data.parts){
      assert.ok(!ids.has(part.id),`duplicate ${model}/${part.id}`);ids.add(part.id);
      assert.ok(categories.has(part.category));
      assert.ok(part.fitment && part.genuine.length && part.alternatives.length && part.sources.length);
      for(const item of [...part.genuine,...part.alternatives])assert.ok(item.number && !/示例|待核实/.test(item.number));
      for(const source of part.sources)assert.match(source.url,/^https:\/\//);
    }
  }
});
