import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);const participantId='aaaaaaaa-1111-4111-8111-111111111111';const eventId='bbbbbbbb-2222-4222-8222-222222222222';const affiliateId='cccccccc-3333-4333-8333-333333333333';const actorId='dddddddd-4444-4444-8444-444444444444';
const plain=value=>JSON.parse(JSON.stringify(value));
function load(file,mocks={}){const compiledModule={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:compiledModule,exports:compiledModule.exports,require:name=>name in mocks?mocks[name]:require(name)});return compiledModule.exports;}
const affiliatesDomain=load('lib/events/affiliates.ts');const input=(overrides={})=>({source:'commerce',id:participantId,eventId,affiliateId,expectedAffiliateId:null,...overrides});
const acknowledgement=(overrides={})=>({changed:true,participant:{source:'commerce',id:participantId,eventId,affiliateId,affiliateName:'Scuola A'},...overrides});
function fixture({denied=false,user={id:actorId},authError=null,rpcError=null,rpcData=acknowledgement(),event={affiliates:[{id:affiliateId,name:'Snapshot',active:true}]},eventError=null,rows=[{id:affiliateId,name:'Scuola A'}],readError=null}={}){
 let authorized=false;const calls=[];const revalidated=[];let identityReads=0;
 const db={rpc:async(name,args)=>{assert.ok(authorized);calls.push({rpc:name,args});return {data:rpcData,error:rpcError};},from(table){assert.ok(authorized);const call={table};calls.push(call);return {select(fields){call.fields=fields;return this;},eq(key,value){call.eq=[key,value];return this;},in(key,value){call.in=[key,value];return this;},is(key,value){call.is=[key,value];return this;},order(key){(call.order??=[]).push(key);return this;},async maybeSingle(){return {data:event,error:eventError};},then(resolve,reject){return Promise.resolve({data:rows,error:readError}).then(resolve,reject);}};}};
 const actions=load('app/api/admin/participants/affiliate-actions.ts',{'@/lib/commerce/admin-auth':{requireCommerceStaff:async()=>{if(denied)throw Error('Denied');authorized=true;return db;}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>{identityReads++;return {data:{user},error:authError};}}})},'@/lib/events/affiliates':affiliatesDomain,'next/cache':{revalidatePath:(...args)=>revalidated.push(args)}});
 return {...actions,calls,revalidated,get identityReads(){return identityReads;}};
}
test('staff authorization precedes private options or assignment calls and the actor is session-derived',async()=>{
 const denied=fixture({denied:true});assert.equal((await denied.assignParticipantAffiliate(input())).success,false);assert.equal((await denied.loadAssignableParticipantAffiliates(eventId)).success,false);assert.deepEqual(denied.calls,[]);assert.equal(denied.identityReads,0);
 for(const settings of [{user:null},{authError:{message:'secret'}}]){const expired=fixture(settings);assert.equal((await expired.assignParticipantAffiliate(input())).success,false);assert.deepEqual(expired.calls,[]);}
 const allowed=fixture();assert.equal((await allowed.assignParticipantAffiliate(input())).success,true);assert.deepEqual(plain(allowed.calls),[{rpc:'assign_participant_affiliate',args:{p_source:'commerce',p_event_id:eventId,p_participant_id:participantId,p_affiliate_id:affiliateId,p_expected_affiliate_id:null,p_actor_id:actorId}}]);assert.equal(allowed.revalidated.length,4);assert.ok(allowed.revalidated.some(([path,kind])=>path==='/it/admin'&&kind==='layout'));
});
test('forged actors, malformed source, UUIDs and omitted expected-current fields never reach mutation RPC',async()=>{
 for(const invalid of [input({actorId}),input({source:'order'}),input({id:'invalid'}),input({eventId:'invalid'}),input({affiliateId:'direct'}),input({expectedAffiliateId:undefined}),input({affiliateId:undefined})]){const api=fixture();const result=await api.assignParticipantAffiliate(invalid);assert.equal(result.success,false);assert.equal(result.code,'invalid');assert.deepEqual(api.calls,[]);}
});
test('legacy assignment removal is explicit null and returns only verified participant attribution',async()=>{
 const request=input({source:'legacy',affiliateId:null,expectedAffiliateId:affiliateId});const result={changed:true,participant:{source:'legacy',id:participantId,eventId,affiliateId:null,affiliateName:null}};const api=fixture({rpcData:result});assert.deepEqual(plain(await api.assignParticipantAffiliate(request)),{success:true,...result});assert.equal(api.calls[0].args.p_affiliate_id,null);assert.equal(api.calls[0].args.p_expected_affiliate_id,affiliateId);
 const noop=fixture({rpcData:acknowledgement({changed:false})});assert.equal((await noop.assignParticipantAffiliate(input())).changed,false);
});
test('conflicts and unavailable options return actionable safe messages without exposing SQL content',async()=>{
 for(const [code,expected] of [['40001','conflict'],['22023','unavailable'],['08006',undefined],['42501',undefined]]){const api=fixture({rpcError:{code,message:'PRIVATE SQL CUSTOMER'}});const result=await api.assignParticipantAffiliate(input());assert.equal(result.success,false);assert.equal(result.code,expected);assert.doesNotMatch(result.error,/PRIVATE|CUSTOMER|SQL/);assert.equal(api.revalidated.length,0);}
});
test('malformed, mismatched or missing acknowledgements never report assignment success',async()=>{
 for(const response of [null,{},acknowledgement({changed:'yes'}),{changed:true,participant:{...acknowledgement().participant,id:actorId}},{changed:true,participant:{...acknowledgement().participant,affiliateId:null}},{changed:true,participant:{...acknowledgement().participant,eventId:actorId}},{changed:true,participant:{...acknowledgement().participant,source:'legacy'}}]){const api=fixture({rpcData:response});assert.equal((await api.assignParticipantAffiliate(input())).success,false);assert.equal(api.revalidated.length,0);}
});
test('option loading scopes active event IDs against undeleted registry entries and exposes names only',async()=>{
 const api=fixture();assert.deepEqual(plain(await api.loadAssignableParticipantAffiliates(eventId)),{success:true,affiliates:[{id:affiliateId,name:'Scuola A'}]});assert.deepEqual(plain(api.calls),[{table:'events',fields:'affiliates',eq:['id',eventId]},{table:'affiliates',fields:'id,name',in:['id',[affiliateId]],is:['deleted_at',null],order:['name','id']}]);
 const inactive=fixture({event:{affiliates:[{id:affiliateId,name:'Old',active:false}]}});assert.deepEqual(plain(await inactive.loadAssignableParticipantAffiliates(eventId)),{success:true,affiliates:[]});assert.equal(inactive.calls.length,1);
 const archived=fixture({rows:[]});assert.deepEqual(plain(await archived.loadAssignableParticipantAffiliates(eventId)),{success:true,affiliates:[]});
});
test('unreadable or malformed options fail explicitly instead of silently enabling an unsafe choice',async()=>{
 for(const options of [{event:null},{eventError:{message:'PRIVATE'}},{event:{affiliates:[{id:affiliateId,name:'Bad',active:'true'}]}},{readError:{message:'PRIVATE'}},{rows:null},{rows:[{id:'invalid',name:'Forged'}]}]){const api=fixture(options);const result=await api.loadAssignableParticipantAffiliates(eventId);assert.equal(result.success,false);assert.doesNotMatch(result.error,/PRIVATE/);}
 const invalid=fixture();assert.equal((await invalid.loadAssignableParticipantAffiliates('bad')).success,false);assert.deepEqual(invalid.calls,[]);
});
