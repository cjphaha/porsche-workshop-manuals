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
    assert.ok(data.parts.length>=15);
    for(const part of data.parts){
      assert.ok(!ids.has(part.id),`duplicate ${model}/${part.id}`);ids.add(part.id);
      assert.ok(categories.has(part.category));
      assert.ok(part.fitment && (part.genuine.length || part.genuineNote) && part.alternatives.length && part.sources.length);
      if(!part.genuine.length)assert.match(part.id,/^refrigerant-/);
      for(const item of [...part.genuine,...part.alternatives])assert.ok(item.number && !/示例|待核实/.test(item.number));
      for(const source of part.sources)assert.match(source.url,/^https:\/\//);
    }
    for(const id of ['brake-fluid','coolant','manual-gear-oil','pdk-clutch-fluid','pdk-gear-diff-oil','pdk-pan-filter','front-wiper-set'])
      assert.ok(ids.has(id),`missing ${model}/${id}`);
    const clutch=data.parts.find(item=>item.id==='pdk-clutch-fluid');
    const gear=data.parts.find(item=>item.id==='pdk-gear-diff-oil');
    assert.notEqual(clutch.genuine[0].number,gear.genuine[0].number);
    assert.match(clutch.fitment,/PDK/);
    if(model==='982'){
      assert.ok(ids.has('engine-oil-a40') && ids.has('engine-oil-c40'));
      assert.ok(ids.has('refrigerant-r134a') && ids.has('refrigerant-r1234yf'));
    }
  }
});
