import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const require=createRequire(import.meta.url);
function compile(relative,imports) {
  const filename=fileURLToPath(new URL(relative,import.meta.url));
  const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loaded={exports:{}};
  vm.runInNewContext(compiled,{module:loaded,exports:loaded.exports,require:name=>imports?.[name]??require(name),process:{env:{}},Date,Set,Map},{filename});
  return loaded.exports;
}
const affiliateHelpers=compile('../src/lib/events/affiliates.ts');
const plain=value=>JSON.parse(JSON.stringify(value));
function catalog(event,{queryError=null,availabilityError=null}={}) {
  const calls=[];
  const selection={eq(){return this;},async maybeSingle(){return {data:event,error:queryError};}};
  const db={from(table){assert.equal(table,'events');return {select(fields){calls.push(fields);return selection;}};},async rpc(name){assert.equal(name,'commerce_availability');return {data:{ws:25},error:availabilityError};}};
  const server=compile('../src/lib/commerce/server.ts',{
    '@supabase/supabase-js':{createClient:()=>db},
    '@/lib/i18n-utils':{getLocalizedText:input=>typeof input==='string'?input:input.it},
    './config':{parseCommerceConfig:input=>input},
    '@/lib/tickets/wallet':{},'./localization':{},
    '@/lib/events/affiliates':affiliateHelpers,
  });
  return {load:()=>server.getCommerceCatalog(event?.id??randomUUID()),calls};
}
const example=()=>({id:randomUUID(),titolo:{it:'Evento'},slug:'evento',data_inizio:new Date(Date.now()+86_400_000).toISOString(),attivo:true,cta_tipo:'stripe',commerce_config:{version:1,enabled:true},affiliates:[{id:randomUUID(),name:'Scuola A',active:true},{id:randomUUID(),name:'Non disponibile',active:false}]});

test('public commerce catalog returns active affiliate choices without internal flags or attendee data',async()=>{
  const event=example(); const {load,calls}=catalog(event); const result=await load();
  assert.deepEqual(plain(result.affiliates),[{id:event.affiliates[0].id,name:'Scuola A'}]);
  assert.deepEqual(plain(result.availability),{ws:25}); assert.equal(result.available,true);
  assert.equal(calls.length,1); assert.ok(calls[0].endsWith(',affiliates'));
  for(const forbidden of ['active','buyer_email','phone','documentNumber']) assert.equal(JSON.stringify(result.affiliates).includes(forbidden),false);
});

test('single-price tickets receive affiliate options without requiring advanced commerce',async()=>{
  const event={...example(),commerce_config:null}; const result=await catalog(event).load();
  assert.equal(result.config,null); assert.equal(result.affiliates.length,1); assert.equal(result.availability,undefined);
  assert.deepEqual(plain((await catalog({...event,affiliates:[]}).load()).affiliates),[]);
});

test('unavailable and malformed catalogs never reveal affiliate choices',async()=>{
  for(const event of [null,{...example(),attivo:false},{...example(),cta_tipo:'external'}]) {
    const result=await catalog(event).load(); assert.equal(result.config,null); assert.equal(result.affiliates,undefined);
  }
  const event=example(); event.affiliates[0].email='private@example.test';
  assert.deepEqual(plain((await catalog(event).load()).affiliates),[]);
  await assert.rejects(catalog(example(),{queryError:{code:'08006'}}).load(),/Catalogo momentaneamente/);
});
