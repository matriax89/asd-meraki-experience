import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const plain=value=>JSON.parse(JSON.stringify(value));
function load(file,mocks={}) {const compiled={exports:{}};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{module:compiled,exports:compiled.exports,require:name=>name in mocks?mocks[name]:require(name),Date,URL,Request,Response,console:{error(){}},Set,Map,Object});return compiled.exports;}
const config=load('lib/commerce/config.ts'),attendee=load('lib/commerce/attendee.ts');
const http=load('lib/commerce/http.ts',{'./config':config});
const schema=load('lib/commerce/manual-schema.ts',{'./config':config,'./attendee':attendee});
const eventId='11111111-1111-4111-8111-111111111111',orderId='22222222-2222-4222-8222-222222222222',passId='33333333-3333-4333-8333-333333333333',actor='44444444-4444-4444-8444-444444444444';
const person={firstName:'Ada',lastName:'Rossi',packageId:'ws',addonIds:[],menuChoices:{}};
const contact={...person,email:'ada@example.test',phone:'+393331234567',documentType:'codice_fiscale',documentCountry:'IT',documentNumber:'RSSMRA85T10A562S',marketingConsent:false};delete contact.packageId;delete contact.addonIds;delete contact.menuChoices;
const body=(extra={})=>({requestId:'55555555-5555-4555-8555-555555555555',eventId,buyerEmail:'ada@example.test',participants:[person],attendees:[contact],expectedTotalCents:2500,paymentMethod:'cash',paidAt:new Date().toISOString(),confirm:true,...extra});
const request=(input,url='https://meraki.test/api/admin/manual-enrollments',origin='https://meraki.test')=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(input)});
function service(staff,mocks={}) {return load('lib/commerce/manual-service.ts',{'./config':config,'./http':http,'./manual-schema':schema,'@/lib/i18n-utils':{getLocalizedText:(value,locale)=>value[locale]||value.it},'@/lib/events/affiliates':{publicEventAffiliates:items=>items.filter(item=>item.active).map(({id,name})=>({id,name}))},'@/lib/stripe/commerce':{deliverCommerceOrder:async()=>{}},...mocks});}
function api({denied=false,result={orderId,passIds:[passId],replayed:false},delivery='sent',deliveryError=false}={}) {let authorized=false;const calls=[];const staff={admin:{},userId:actor};const manualHttp=load('lib/commerce/manual-http.ts',{'./admin-auth':{requireCommerceStaffIdentity:async()=>{calls.push('auth');if(denied)throw Error('PRIVATE');authorized=true;return staff;}},'./http':http});const route=load('app/api/admin/manual-enrollments/route.ts',{'@/lib/commerce/http':http,'@/lib/commerce/manual-http':manualHttp,'@/lib/commerce/manual-schema':schema,'@/lib/commerce/manual-service':{recordManualEnrollment:async(s,b)=>{assert.ok(authorized);calls.push(['record',s.userId,plain(b)]);return result;},deliverManualEnrollment:async()=>{calls.push('email');if(deliveryError)throw Error('SMTP outage');return delivery;}}});return {...route,calls};}
test('authorization precedes parsing, every private read, and mutation; responses are private',async()=>{
 const denied=api({denied:true});const response=await denied.POST(new Request('https://meraki.test/api/admin/manual-enrollments',{method:'POST',body:'invalid json'}));assert.equal(response.status,403);assert.deepEqual(denied.calls,['auth']);assert.match(response.headers.get('cache-control'),/private, no-store/);
 const okay=api();const accepted=await okay.POST(request(body()));assert.equal(accepted.status,201);assert.equal(okay.calls[1][1],actor);assert.equal(okay.calls[1][2].feeCents,0);assert.deepEqual(await accepted.json(),{orderId,passIds:[passId],replayed:false,emailStatus:'sent'});
});
test('forged actors, unconfirmed payments, mismatched fees, oversized groups and cross-origin requests never mutate',async()=>{
 for(const invalid of [body({actorId:actor}),body({confirm:false}),body({paymentMethod:'bank_transfer'}),body({feeCents:1}),body({paymentMethod:'pos',feeCents:2501}),body({participants:Array(11).fill(person)}),body({paidAt:'2099-01-01T12:00:00Z'})]) {const route=api();assert.equal((await route.POST(request(invalid))).status,400);assert.deepEqual(route.calls,['auth']);}
 const cross=api();assert.equal((await cross.POST(request(body(),undefined,'https://evil.test'))).status,403);assert.deepEqual(cross.calls,['auth']);
 const missing=api();assert.equal((await missing.POST(new Request('https://meraki.test/api/admin/manual-enrollments',{method:'POST',body:JSON.stringify(body())}))).status,403);assert.deepEqual(missing.calls,['auth']);
});
test('durable enrollment remains successful when email fails; replay returns the same identifiers',async()=>{
 const route=api({deliveryError:true});const response=await route.POST(request(body()));assert.equal(response.status,201);assert.equal((await response.json()).emailStatus,'pending');assert.equal(route.calls.filter(c=>Array.isArray(c)&&c[0]==='record').length,1);
 const replay=api({result:{orderId,passIds:[passId],replayed:true},delivery:'pending'});const repeated=await replay.POST(request(body()));assert.equal(repeated.status,200);assert.equal((await repeated.json()).replayed,true);
 const changed=api({result:{error:'price_changed'}});const conflict=await changed.POST(request(body()));assert.equal(conflict.status,409);assert.equal((await conflict.json()).code,'price_changed');assert.ok(!changed.calls.includes('email'));
});
test('manual service rejects missing/invalid documents and marketing delegation before the RPC',async()=>{
 let calls=0;const staff={userId:actor,admin:{rpc:async()=>{calls++;return {data:{orderId,passIds:[passId],replayed:false}};}}};const domain=service(staff);
 for(const c of [{...contact,documentNumber:''},{...contact,documentNumber:'RSSMRA85T10A562A'},{...contact,marketingConsent:true}])await assert.rejects(domain.recordManualEnrollment(staff,schema.manualEnrollmentSchema.parse(body({attendees:[c]}))),/codice fiscale/);
 assert.equal(calls,0);
 const foreign={...contact,documentType:'foreign_id',documentCountry:'DE',documentNumber:'C1234567'};await domain.recordManualEnrollment(staff,schema.manualEnrollmentSchema.parse(body({attendees:[foreign]})));assert.equal(calls,1);
});
test('only session actor and canonical pass identity/buyer/QR reach the upgrade RPC',async()=>{
 const calls=[];const pass={id:passId,event_id:eventId,order_id:orderId,first_name:'Existing',last_name:'Person',package_id:'ws',package_activity_ids:['ws'],package_paid_cents:2500,qr_code:'PRIVATE_QR',status:'paid'};
 const admin={from(){return {select(){return this;},eq(){return this;},maybeSingle:async()=>({data:pass}),single:async()=>({data:{buyer_email:'original@example.test'}})};},rpc:async(name,args)=>{calls.push([name,plain(args)]);return {data:{orderId,passIds:[passId],replayed:false}};}};
 const staff={admin,userId:actor},domain=service(staff);const input=schema.manualEnrollmentSchema.parse(body({attendees:undefined,upgradePassId:passId,buyerEmail:'forged@example.test',participants:[{...person,firstName:'Forged'}]}));
 await domain.recordManualEnrollment(staff,input);const args=calls[0][1];assert.equal(args.p_actor_id,actor);assert.equal(args.p_buyer_email,'original@example.test');assert.equal(args.p_participants[0].firstName,'Existing');assert.equal(args.p_attendees,null);assert.equal(args.p_affiliate_id,null);assert.equal('p_upgrade_token' in args,false);
 await domain.manualEnrollmentQuote(staff,{eventId,participants:[person],upgradePassId:passId});assert.equal(calls[1][1].p_upgrade_token,'PRIVATE_QR');
});
test('protected context exposes a whitelist with owned admissions/menu but never QR credentials',async()=>{
 const c={version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[{id:'ws',name:'WS',kind:'workshop',capacity:20,startsAt:null,salesEnd:null,menuOptions:[]}],packages:[{id:'ws',name:'WS',description:'',activityIds:['ws'],prices:[{id:'std',label:'Std',amountCents:2500,startsAt:null,endsAt:null}]}],addons:[]};
 const pass={id:passId,order_id:orderId,first_name:'Existing',last_name:'Person',package_id:'ws',package_activity_ids:['ws'],package_paid_cents:2500,qr_code:'PRIVATE_QR',status:'paid'};
 const admin={from(table){return {select(){return this;},eq(){return this;},in(){return Promise.resolve({data:[{activity_id:'dinner',menu_choice:'Classico'}]});},maybeSingle:async()=>({data:table==='events'?{id:eventId,titolo:{it:'Evento'},data_inizio:'2099-01-01T00:00:00Z',attivo:true,commerce_config:c,affiliates:[]}:pass}),single:async()=>({data:{buyer_email:'original@example.test'}})};},rpc:async name=>({data:name==='commerce_availability'?{ws:19}:false})};
 const staff={admin,userId:actor},domain=service(staff);const context=await domain.manualEnrollmentContext(staff,eventId,passId,'it');assert.equal(context.upgrade.buyerEmail,'original@example.test');assert.deepEqual(plain(context.upgrade.ownedActivityIds),['dinner']);assert.equal(context.upgrade.menuChoices.dinner,'Classico');assert.doesNotMatch(JSON.stringify(context),/PRIVATE_QR|qr_code|document_number/);
});
test('email retry scopes offline orders and uses the existing upgrade pass without issuing or charging',async()=>{
 const calls=[];let sent=false;const admin={from(table){calls.push(table);return {select(){return this;},eq(key,value){calls.push([key,value]);return this;},in(){return this;},maybeSingle:async()=>({data:{id:orderId,upgrade_pass_id:passId,state:'fulfilled',email_sent_at:null}}),single:async()=>({data:{email_sent_at:sent?'now':null}}),then(resolve){return Promise.resolve({data:[{id:passId}]}).then(resolve);}};}};
 const domain=service(null,{'@/lib/stripe/commerce':{deliverCommerceOrder:async(order,passes)=>{assert.equal(order.id,orderId);assert.equal(passes[0].id,passId);sent=true;}}});assert.equal(await domain.deliverManualEnrollment({admin,userId:actor},orderId),'sent');assert.ok(calls.some(item=>Array.isArray(item)&&item[0]==='id'&&item[1]===passId));assert.ok(!calls.includes('rpc'));
});
