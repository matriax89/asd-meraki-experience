import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(name){const filename=fileURLToPath(new URL(`../src/lib/commerce/${name}.ts`,import.meta.url));const compiled=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const compiledModule={exports:{}};vm.runInNewContext(compiled,{module:compiledModule,exports:compiledModule.exports,require,Date,Set},{filename});return compiledModule.exports;}
const {discountQuote}=load('discounts');const {previewCommerceQuote}=load('config');
const plain=value=>JSON.parse(JSON.stringify(value));
const code=(overrides={})=>({code:'FIVE',name:'Five euros',active:true,startsAt:null,endsAt:null,discountType:'fixed_amount',discountValue:500,minSubtotalCents:0,maxUses:null,targetType:'order',targetIds:[],allowedTierIds:[],...overrides});
const line=(overrides={})=>({kind:'package',packageId:'ws',label:'Workshop',quantity:1,unitAmountCents:6500,totalCents:6500,activityIds:['ws'],activityAmounts:{ws:6500},tierId:'std',participantIndex:0,...overrides});
const quote=(lines)=>({participants:[],lines,totalCents:lines.reduce((sum,item)=>sum+item.totalCents,0),discountExcludedActivityIds:['evening-meal']});
const dinner=()=>line({kind:'addon',packageId:undefined,addonId:'meal',label:'Cena',unitAmountCents:2000,totalCents:2000,activityIds:['evening-meal'],activityAmounts:{'evening-meal':2000}});
test('a five euro order coupon applies only to packages while the dinner stays twenty euros',()=>{
 const result=discountQuote(quote([line(),dinner()]),code(),'code');assert.equal(result.totalCents,8000);assert.equal(result.discount.eligibleCents,6500);assert.deepEqual(plain(result.lines.map(item=>[item.totalCents,item.discountCents])),[[6000,500],[2000,0]]);
 const percent=discountQuote(quote([line(),dinner()]),code({discountType:'percentage',discountValue:20}),'code');assert.equal(percent.totalCents,7200);assert.equal(percent.lines[1].totalCents,2000);
});
test('mixed packages protect dinner using its kind metadata and cap fixed coupons at non-dinner value',()=>{
 const mixed=line({packageId:'bundle',unitAmountCents:8000,totalCents:8000,activityIds:['ws','evening-meal'],activityAmounts:{ws:6000,'evening-meal':2000}});
 for(const targetType of ['order','package','activity']){const result=discountQuote(quote([mixed]),code({targetType,targetIds:targetType==='package'?['bundle']:targetType==='activity'?['ws','evening-meal']:[],discountValue:10000}),'code');assert.equal(result.totalCents,2000);assert.equal(result.discountCents,6000);assert.equal(result.discount.eligibleCents,6000);assert.deepEqual(plain(result.lines[0].activityAmounts),{ws:6000,'evening-meal':2000});}
 const missing=line({...mixed,activityAmounts:undefined});assert.equal(discountQuote(quote([missing]),code(),'code').error,'discount_not_applicable');
});
test('dinner-only targets cannot apply while explicitly targeted other add-ons retain their promotion',()=>{
 assert.equal(discountQuote(quote([line(),dinner()]),code({targetType:'addon',targetIds:['meal']}),'code').error,'discount_not_applicable');
 assert.equal(discountQuote(quote([line(),dinner()]),code({targetType:'activity',targetIds:['evening-meal']}),'code').error,'discount_not_applicable');
 const extra=line({kind:'addon',packageId:undefined,addonId:'extra',unitAmountCents:700,totalCents:700,activityIds:['extra'],activityAmounts:{extra:700}});
 const result=discountQuote(quote([line(),dinner(),extra]),code({targetType:'addon',targetIds:['extra']}),'code');assert.equal(result.lines[2].totalCents,200);assert.equal(result.lines[1].totalCents,2000);
 assert.equal(discountQuote(quote([line(),dinner(),extra]),code(),'code').lines[2].totalCents,700);
});
test('fixed order discounts distribute exact cents equally over equal package values and leave add-ons unchanged',()=>{
 const result=discountQuote(quote([line(),line({participantIndex:1}),dinner()]),code({discountValue:1001}),'code');assert.deepEqual(plain(result.lines.map(item=>item.discountCents)),[500,501,0]);assert.equal(result.totalCents,13999);
});
test('preview derives dinner exclusions from configured activity kinds rather than names or client selections',()=>{
 const config={version:1,enabled:true,waitlistEnabled:false,upgradesEnabled:false,activities:[{id:'arbitrary-id',name:'Evening',kind:'dinner',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},{id:'ws',name:'Dinner dance',kind:'workshop',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]}],packages:[{id:'ws',name:'Workshop',description:'',activityIds:['ws'],prices:[{id:'std',label:'Standard',amountCents:6500,startsAt:null,endsAt:null}]}],addons:[{id:'meal',name:'Dinner',activityId:'arbitrary-id',amountCents:2000}]};
 const result=previewCommerceQuote(config,[{firstName:'Ada',lastName:'Rossi',packageId:'ws',addonIds:['meal'],menuChoices:{}}]);assert.deepEqual(plain(result.discountExcludedActivityIds),['arbitrary-id']);assert.equal(discountQuote(result,code(),'code').lines[1].totalCents,2000);
});
