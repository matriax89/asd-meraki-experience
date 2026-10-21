import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const filename = fileURLToPath(new URL('../src/lib/commerce/config.ts', import.meta.url));
const compiled = ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const compiledModule={exports:{}};
vm.runInNewContext(compiled,{module:compiledModule,exports:compiledModule.exports,require,Date,Set},{filename});
const {parseCommerceConfig,configSchema,previewCommerceQuote,activePrice}=compiledModule.exports;
const config=()=>({version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[
  {id:'ws',name:'Workshop',kind:'workshop',capacity:5,startsAt:'2027-02-01T10:00:00Z',salesEnd:null,menuOptions:[]},
  {id:'mc',name:'Masterclass',kind:'masterclass',capacity:5,startsAt:'2027-02-01T14:00:00Z',salesEnd:null,menuOptions:[]},
  {id:'dinner',name:'Cena',kind:'dinner',capacity:5,startsAt:'2027-02-01T19:00:00Z',salesEnd:'2027-01-30T10:00:00Z',menuOptions:['Classico','Vegetariano']},
],packages:[{id:'solo-ws',name:'Solo Workshop',description:'',activityIds:['ws'],prices:[{id:'early',label:'Early Bird',amountCents:2500,startsAt:null,endsAt:'2027-01-15T00:00:00Z'},{id:'standard',label:'Standard',amountCents:3000,startsAt:'2027-01-15T00:00:00Z',endsAt:null}]}],addons:[{id:'cena',name:'Cena',activityId:'dinner',amountCents:2500}]});
const person=(overrides={})=>({firstName:'Ada',lastName:'Rossi',packageId:'solo-ws',addonIds:[],menuChoices:{},...overrides});
const plain=v=>JSON.parse(JSON.stringify(v));
test('commerce config accepts valid schedules and rejects duplicate IDs, dangling activities and overlapping tiers',()=>{
  assert.ok(parseCommerceConfig(config()));
  assert.equal(parseCommerceConfig(null),null);
  let c=config(); c.activities.push({...c.activities[0]});assert.equal(parseCommerceConfig(c),null);
  c=config(); c.packages[0].activityIds=['missing'];assert.equal(parseCommerceConfig(c),null);
  c=config(); c.packages[0].prices[1].startsAt='2027-01-14T00:00:00Z';assert.equal(parseCommerceConfig(c),null);
  c=config(); c.packages[0].prices[1].amountCents=12.5;assert.equal(parseCommerceConfig(c),null);
  c=config(); c.activities[0].capacity=-1;assert.equal(parseCommerceConfig(c),null);
  c=config(); c.activities[2].salesEnd='2027-02-02T00:00:00Z';assert.equal(parseCommerceConfig(c),null);
  c=config(); c.packages[0].id='unsafe<script>';assert.equal(parseCommerceConfig(c),null);
  c=config(); c.enabled=false;c.activities=[];c.packages=[];c.addons=[];assert.ok(configSchema.safeParse(c).success);
});
test('activity check-in and finishing times are optional, preserved and independent of pricing',()=>{
  const legacy=config();
  assert.equal(parseCommerceConfig(legacy).activities[0].endsAt,undefined);
  assert.equal(parseCommerceConfig(legacy).activities[0].checkInStartsAt,undefined);
  const scheduled=config();
  scheduled.activities[0].checkInStartsAt='2027-02-01T09:30:00Z';
  scheduled.activities[0].endsAt='2027-02-01T13:00:00Z';
  scheduled.activities[1].checkInStartsAt=null;
  scheduled.activities[1].endsAt=null;
  const parsed=parseCommerceConfig(scheduled);
  assert.equal(parsed.activities[0].checkInStartsAt,'2027-02-01T09:30:00Z');
  assert.equal(parsed.activities[0].endsAt,'2027-02-01T13:00:00Z');
  assert.equal(parsed.activities[1].checkInStartsAt,null);
  assert.deepEqual(plain(previewCommerceQuote(parsed,[person()],new Date('2027-01-01T00:00:00Z'))),plain(previewCommerceQuote(legacy,[person()],new Date('2027-01-01T00:00:00Z'))));
});
test('activity schedules reject reversed times and malformed instants while allowing previous-day check-in',()=>{
  for(const [field,value] of [['endsAt','2027-02-01T09:59:00Z'],['checkInStartsAt','2027-02-01T10:01:00Z'],['endsAt','not-a-date'],['checkInStartsAt','2027-02-01T09:00']]){
    const current=config(); current.activities[0][field]=value;
    const result=configSchema.safeParse(current);
    assert.equal(result.success,false,`${field}: ${value}`);
    assert.ok(result.error.issues.some(issue=>issue.path[0]==='activities'&&issue.path[1]===0&&issue.path[2]===field));
  }
  const overnight=config();
  overnight.activities[0].checkInStartsAt='2027-01-31T20:00:00Z';
  overnight.activities[0].endsAt='2027-02-02T02:00:00Z';
  assert.ok(parseCommerceConfig(overnight));
  overnight.activities[0].checkInStartsAt=overnight.activities[0].startsAt;
  overnight.activities[0].endsAt=overnight.activities[0].startsAt;
  assert.ok(parseCommerceConfig(overnight));
});
test('price boundaries are inclusive at start and exclusive at end',()=>{
  const tiers=config().packages[0].prices;
  assert.equal(activePrice(tiers,new Date('2027-01-14T23:59:59Z')).id,'early');
  assert.equal(activePrice(tiers,new Date('2027-01-15T00:00:00Z')).id,'standard');
  assert.equal(activePrice([{...tiers[0],startsAt:'2027-01-10T00:00:00Z'}],new Date('2027-01-01T00:00:00Z')),null);
});
test('preview prices every participant and selected add-on with required menu',()=>{
  const result=previewCommerceQuote(config(),[person(),person({firstName:'Luca',addonIds:['cena'],menuChoices:{dinner:'Vegetariano'}})],new Date('2027-01-01T00:00:00Z'));
  assert.equal(result.totalCents,7500);assert.equal(result.lines.length,3);assert.equal(result.participants.length,2);
  assert.deepEqual(plain(result.lines.map(x=>x.kind)),['package','package','addon']);
  for(const p of [person({addonIds:['cena']}),person({addonIds:['cena','cena'],menuChoices:{dinner:'Classico'}}),person({menuChoices:{dinner:'Classico'}}),person({addonIds:['missing']})]) assert.equal(previewCommerceQuote(config(),[p],new Date('2027-01-01T00:00:00Z')),null);
  assert.equal(previewCommerceQuote(config(),[person({addonIds:['cena'],menuChoices:{dinner:'Classico'}})],new Date('2027-01-31T00:00:00Z')),null);
});
