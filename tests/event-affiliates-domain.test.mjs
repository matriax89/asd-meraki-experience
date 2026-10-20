import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require=createRequire(import.meta.url);
const filename=fileURLToPath(new URL('../src/lib/events/affiliates.ts',import.meta.url));
const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const compiledModule={exports:{}};
vm.runInNewContext(compiled,{module:compiledModule,exports:compiledModule.exports,require,Set},{filename});
const {eventAffiliatesSchema,parseEventAffiliates,publicEventAffiliates}=compiledModule.exports;
const a=()=>({id:randomUUID(),name:'Scuola Meraki',active:true});
const plain=value=>JSON.parse(JSON.stringify(value));

test('affiliate names normalize safely and active options reveal only identifiers and public names',()=>{
  const enabled=a(); const disabled={...a(),name:'Disattivato',active:false};
  const parsed=eventAffiliatesSchema.parse([{...enabled,id:enabled.id.toUpperCase(),name:'  Scuola Meraki  '},disabled]);
  assert.equal(parsed[0].name,'Scuola Meraki'); assert.equal(parsed[0].id,enabled.id);
  assert.deepEqual(plain(publicEventAffiliates(parsed)),[{id:enabled.id,name:'Scuola Meraki'}]);
  assert.equal(JSON.stringify(publicEventAffiliates(parsed)).includes('active'),false);
});

test('malformed affiliate lists, duplicate active names, and injected private fields are rejected',()=>{
  const enabled=a();
  for(const bad of [null,{},[{}],[{...enabled,name:''}],[{...enabled,name:'Name\nEmail'}],[{...enabled,name:'A'.repeat(121)}],[{...enabled,id:'abc'}],[{...enabled,active:'true'}],[{...enabled,email:'private@example.test'}],[enabled,enabled],[enabled,{...a(),name:'scuola meraki'}],Array.from({length:101},(_,index)=>({...a(),name:`Affiliate ${index}`}))]) {
    assert.equal(eventAffiliatesSchema.safeParse(bad).success,false,JSON.stringify(bad));
    assert.deepEqual(plain(parseEventAffiliates(bad)),[]);
    assert.deepEqual(plain(publicEventAffiliates(bad)),[]);
  }
  assert.equal(eventAffiliatesSchema.safeParse([enabled,{...a(),name:enabled.name,active:false}]).success,true);
});

test('legacy and empty affiliate settings produce no checkout selector options',()=>{
  for(const value of [undefined,null,[],{}]) assert.deepEqual(plain(publicEventAffiliates(value)),[]);
  assert.deepEqual(plain(publicEventAffiliates([{...a(),active:false}])),[]);
});
