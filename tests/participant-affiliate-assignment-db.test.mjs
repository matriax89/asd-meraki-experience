import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import pg from 'pg';

const exec = promisify(execFile);
const binaries = process.env.MERAKI_PG_BIN || '/opt/homebrew/bin';
const bin = name => path.join(binaries, name);
const json = JSON.stringify;
test('staff assigns one participant atomically while preserving purchases, upgrades and audit history', { skip: !['initdb','pg_ctl'].every(name => existsSync(bin(name))), timeout: 90_000 }, async t => {
  const directory = await mkdtemp(path.join(tmpdir(),'meraki-participant-aff-pg-'));
  const dataDirectory = path.join(directory,'data');
  const listener = createServer();
  await new Promise((resolve,reject) => { listener.once('error',reject); listener.listen(0,'127.0.0.1',resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const clients = new Set(); let started = false;
  async function connect(role) {
    const client = new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
    await client.connect(); clients.add(client); if(role) await client.query(`set role ${role}`); return client;
  }
  t.after(async () => { await Promise.allSettled([...clients].map(client => client.end())); if(started) await exec(bin('pg_ctl'),['-D',dataDirectory,'-m','immediate','-w','stop']); await rm(directory,{recursive:true,force:true}); });
  await exec(bin('initdb'),['-D',dataDirectory,'-U','postgres','-A','trust','--no-instructions']);
  await exec(bin('pg_ctl'),['-D',dataDirectory,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -k ${directory}`,'-w','start']); started=true;
  const db=await connect();
  await db.query(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create table auth.users(id uuid primary key); create table storage.buckets(id text primary key,name text,public boolean);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
  const migrationDirectory=new URL('../supabase/migrations/',import.meta.url);
  for(const filename of (await readdir(migrationDirectory)).filter(name => /^\d+.*\.sql$/.test(name)).sort()) await db.query(await readFile(new URL(filename,migrationDirectory),'utf8'));
  const service=await connect('service_role');
  const actor=randomUUID();const editor=randomUUID();const viewer=randomUUID();
  for(const [id,role] of [[actor,'admin'],[editor,'editor'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.profiles(id,email,role) values($1,$2,$3)',[id,`${id}@example.test`,role]);}
  const affiliate=async(name,rate={commissionType:'eur',commissionCents:500,commissionCredits:0})=>(await service.query('select public.save_affiliate_profile(null,$1) a',[json({name,defaultCommissionType:rate.commissionType,defaultCommissionCents:rate.commissionCents,defaultCommissionCredits:rate.commissionCredits})])).rows[0].a;
  const a=await affiliate('Scuola A');const b=await affiliate('Scuola B',{commissionType:'credits',commissionCents:0,commissionCredits:2});const inactive=await affiliate('Inattiva');const foreign=await affiliate('Altro evento');
  const config={version:1,enabled:true,waitlistEnabled:true,upgradesEnabled:true,activities:[{id:'ws',name:'Workshop',kind:'workshop',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},{id:'mc',name:'Masterclass',kind:'masterclass',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]},{id:'cena',name:'Cena',kind:'dinner',capacity:100,startsAt:null,salesEnd:null,menuOptions:[]}],packages:[{id:'ws',name:'Workshop',description:'',activityIds:['ws'],prices:[{id:'std',label:'Standard',amountCents:3000,startsAt:null,endsAt:null}]},{id:'bundle',name:'Workshop + Masterclass',description:'',activityIds:['ws','mc'],prices:[{id:'std',label:'Standard',amountCents:6000,startsAt:null,endsAt:null}]}],addons:[{id:'dinner',name:'Cena',activityId:'cena',amountCents:2000}]};
  const person=(packageId='ws',firstName='Ada',addonIds=[])=>({firstName,lastName:'Rossi',packageId,addonIds,menuChoices:{}});const contact=(firstName='Ada')=>({firstName,lastName:'Rossi',email:'buyer@example.test',phone:'+393331234567',documentType:'codice_fiscale',documentCountry:'IT',documentNumber:'RSSMRA80A01H501U',marketingConsent:false});
  async function event(advanced=true,choices=[{id:a.id,name:a.name,active:true},{id:b.id,name:b.name,active:true},{id:inactive.id,name:inactive.name,active:false}]){const id=randomUUID();await db.query(`insert into public.events(id,slug,titolo,data_inizio,prezzo_cents,capacity,commerce_config,affiliates) values($1::uuid,$1::uuid::text,'{"it":"Assegnazione"}',now()+interval '30 days',3000,100,$2,$3)`,[id,json(advanced?config:null),json(choices)]);return id;}
  const legacyEvent=await event(false);const commerceEvent=await event();const otherEvent=await event(false,[{id:foreign.id,name:foreign.name,active:true}]);
  const assign=async(source,eventId,id,affiliateId,expectedAffiliateId=null,client=service,actorId=actor)=>(await client.query('select public.assign_participant_affiliate($1,$2,$3,$4,$5,$6) a',[source,eventId,id,affiliateId,expectedAffiliateId,actorId])).rows[0].a;
  const reserve=async(id,aff=null,{people=[person()],pass=null,request=randomUUID()}={})=>(await service.query('select public.reserve_event_commerce_affiliate($1,$2,$3,$4,$5,$6,$7,$8,$9,null,$10) a',[id,request,'buyer@example.test','it',json(people),pass?.id??null,pass?.qr_code??null,pass?null:json(people.map(p=>contact(p.firstName))),pass?null:'2026-10-18-v1',aff])).rows[0].a;
  const fulfill=async(order,session=`cs_${randomUUID()}`)=>(await service.query('select public.fulfill_event_commerce($1,$2,$3,$4,$5) a',[order.id,session,`pi_${session}`,order.amount_cents,order.buyer_email])).rows[0].a;
  const reserveLegacy=async(aff=null)=>(await service.query('select public.reserve_event_ticket_affiliate($1,$2,$3,$4,$5,$6,$7,$8,null,$9) a',[randomUUID(),legacyEvent,'buyer@example.test','Ada','Rossi','it',json(contact()),'2026-10-18-v1',aff])).rows[0].a.reservation;
  const fulfillLegacy=async(reservation,session)=>(await service.query('select public.fulfill_event_ticket($1,$2,$3,$4,$5,$6) a',[reservation.id,reservation.event_id,session,`pi_${session}`,reservation.buyer_email,reservation.amount_cents])).rows[0].a;
  const row=async(table,id)=>(await db.query(`select to_jsonb(target) a from public.${table} target where id=$1`,[id])).rows[0].a;
  const attribution=async(table,id)=>{const value=await row(table,id);return {affiliate_id:value.affiliate_id,affiliate_name:value.affiliate_name};};
  const audit=async(id)=>(await service.query('select * from public.participant_affiliate_audit where participant_id=$1 order by created_at,id',[id])).rows;
  const withoutAttribution=value=>Object.fromEntries(Object.entries(value).filter(([key])=>!['affiliate_id','affiliate_name'].includes(key)));
  await t.test('RPC and audit are private, actors must still be current staff and audit cannot be forged or rewritten directly',async()=>{
    for(const role of ['anon','authenticated']){const visitor=await connect(role);await assert.rejects(visitor.query('select * from public.participant_affiliate_audit'),{code:'42501'});await assert.rejects(assign('legacy',legacyEvent,randomUUID(),a.id,null,visitor),{code:'42501'});}
    await assert.rejects(assign('legacy',legacyEvent,randomUUID(),a.id,null,service,viewer),{code:'42501'});await assert.rejects(assign('legacy',legacyEvent,randomUUID(),a.id,null,service,randomUUID()),{code:'42501'});
    for(const query of ["insert into public.participant_affiliate_audit(source,participant_id,event_id,actor_id,new_affiliate_id,new_affiliate_name) values('legacy',gen_random_uuid(),$1,$2,$3,'Forged')",'update public.participant_affiliate_audit set actor_id=$2 where event_id=$1','delete from public.participant_affiliate_audit where event_id=$1'])await assert.rejects(service.query(query,query.startsWith('insert')?[legacyEvent,actor,a.id]:query.startsWith('update')?[legacyEvent,actor]:[legacyEvent]),{code:'42501'});
    await assert.rejects(service.query('select public.fulfill_event_ticket_before_cancellation(null,null,null,null,null,null)'),{code:'42501'});
  });
  await t.test('a paid legacy participant can be assigned, changed and removed without altering its purchase or webhook retry',async()=>{
    const reservation=await reserveLegacy();const session=`cs_${randomUUID()}`;const paid=await fulfillLegacy(reservation,session);assert.equal(paid.outcome,'fulfilled');const ticket=paid.ticket;const before=await row('tickets',ticket.id);const reservationBefore=await row('ticket_reservations',reservation.id);
    const assigned=await assign('legacy',legacyEvent,ticket.id,a.id);assert.equal(assigned.changed,true);assert.equal(assigned.participant.affiliateName,a.name);assert.deepEqual(withoutAttribution(await row('tickets',ticket.id)),withoutAttribution(before));assert.deepEqual(await row('ticket_reservations',reservation.id),reservationBefore);
    assert.equal((await fulfillLegacy(reservation,session)).ticket.affiliate_id,a.id);assert.equal((await assign('legacy',legacyEvent,ticket.id,a.id,a.id)).changed,false);assert.equal((await audit(ticket.id)).length,1);
    await assign('legacy',legacyEvent,ticket.id,b.id,a.id,service,editor);assert.equal((await fulfillLegacy(reservation,session)).ticket.affiliate_id,b.id);
    await assign('legacy',legacyEvent,ticket.id,null,b.id);assert.equal((await fulfillLegacy(reservation,session)).ticket.affiliate_id,null);assert.equal((await attribution('tickets',ticket.id)).affiliate_name,null);assert.deepEqual(await row('ticket_reservations',reservation.id),reservationBefore);
    const history=await audit(ticket.id);assert.deepEqual(history.map(item=>[item.old_affiliate_id,item.new_affiliate_id,item.actor_id]),[[null,a.id,actor],[a.id,b.id,editor],[b.id,null,actor]]);assert.ok(history.every(item=>item.event_id===legacyEvent&&item.source==='legacy'&&item.created_at instanceof Date));assert.equal(history[1].old_affiliate_name,a.name);assert.equal(history[1].new_affiliate_name,b.name);
    await db.query("update public.tickets set status='used',used_at=now() where id=$1",[ticket.id]);assert.equal((await assign('legacy',legacyEvent,ticket.id,a.id)).changed,true);assert.equal((await row('tickets',ticket.id)).status,'used');
  });
  await t.test('only one group participant changes while prices, QR, admissions, purchase snapshots and the other participant stay fixed',async()=>{
    const order=(await reserve(commerceEvent,a.id,{people:[person(),person('bundle','Luca')]})).order;const fulfilled=await fulfill(order);assert.equal(fulfilled.outcome,'fulfilled');const [first,second]=fulfilled.passes;const orderBefore=await row('commerce_orders',order.id);const firstBefore=await row('commerce_passes',first.id);const secondBefore=await row('commerce_passes',second.id);const rightsBefore=(await db.query('select to_jsonb(rights) a from public.commerce_entitlements rights where pass_id=any($1::uuid[]) order by id',[[first.id,second.id]])).rows;
    const result=await assign('commerce',commerceEvent,first.id,b.id,a.id);assert.equal(result.changed,true);assert.deepEqual(withoutAttribution(await row('commerce_passes',first.id)),withoutAttribution(firstBefore));assert.deepEqual(await row('commerce_passes',second.id),secondBefore);assert.deepEqual(await row('commerce_orders',order.id),orderBefore);assert.deepEqual((await db.query('select to_jsonb(rights) a from public.commerce_entitlements rights where pass_id=any($1::uuid[]) order by id',[[first.id,second.id]])).rows,rightsBefore);
    const retry=await fulfill(order,orderBefore.stripe_session_id);assert.equal(retry.passes.find(pass=>pass.id===first.id).affiliate_id,b.id);assert.equal(retry.passes.find(pass=>pass.id===second.id).affiliate_id,a.id);
    const rates=(await db.query('select affiliate_id,commission_type,commission_cents,commission_credits from public.event_affiliate_commissions where event_id=$1 order by affiliate_id',[commerceEvent])).rows;assert.equal(rates.find(rate=>rate.affiliate_id===b.id).commission_credits,2);assert.equal((await audit(first.id)).length,1);assert.equal((await audit(second.id)).length,0);
  });
  await t.test('pending and future upgrades retain the current participant attribution without rewriting older order snapshots',async()=>{
    const original=(await reserve(commerceEvent,a.id)).order;const pass=(await fulfill(original)).passes[0];const oldOrder=await row('commerce_orders',original.id);
    const request=randomUUID();const pending=(await reserve(commerceEvent,null,{people:[person('bundle')],pass,request})).order;assert.equal(pending.affiliate_id,a.id);const pendingBefore=await row('commerce_orders',pending.id);
    await assign('commerce',commerceEvent,pass.id,b.id,a.id);assert.deepEqual(await row('commerce_orders',pending.id),pendingBefore);
    const pendingRetry=await reserve(commerceEvent,null,{people:[person('bundle')],pass,request});assert.ok(pendingRetry.order,JSON.stringify(pendingRetry));assert.equal(pendingRetry.order.affiliate_id,a.id);assert.deepEqual(await row('commerce_orders',pending.id),pendingBefore,'an existing pending upgrade remains fully immutable when reserve is retried');
    const upgraded=await fulfill(pending);assert.equal(upgraded.outcome,'fulfilled');assert.equal(upgraded.passes[0].affiliate_id,b.id);assert.deepEqual(await row('commerce_orders',original.id),oldOrder);
    const fulfilledBefore=await row('commerce_orders',pending.id);const fulfilledRetry=await reserve(commerceEvent,null,{people:[person('bundle')],pass,request});assert.ok(fulfilledRetry.order,JSON.stringify(fulfilledRetry));assert.equal(fulfilledRetry.order.affiliate_id,a.id);assert.deepEqual(await row('commerce_orders',pending.id),fulfilledBefore,'a fulfilled upgrade remains fully immutable when reserve is retried after reassignment');
    const dinner=(await reserve(commerceEvent,a.id,{people:[person('bundle','Ada',['dinner'])],pass:upgraded.passes[0]})).order;assert.equal(dinner.affiliate_id,b.id);assert.equal(dinner.affiliate_name,b.name);assert.equal(dinner.amount_cents,2000);const dinnerPaid=await fulfill(dinner);assert.equal(dinnerPaid.outcome,'fulfilled');assert.equal(dinnerPaid.passes[0].id,pass.id);assert.equal(dinnerPaid.passes[0].affiliate_id,b.id);assert.equal(dinnerPaid.passes[0].qr_code,pass.qr_code);assert.equal((await audit(pass.id)).length,1);
    await assign('commerce',commerceEvent,pass.id,null,b.id);assert.equal((await fulfill(dinner,(await row('commerce_orders',dinner.id)).stripe_session_id)).passes[0].affiliate_id,null);assert.deepEqual(await row('commerce_orders',original.id),oldOrder);
  });
  await t.test('invalid, cross-event, inactive, deleted and unpaid/refunded participants produce no changes or audit',async()=>{
    const ticket=(await fulfillLegacy(await reserveLegacy(),`cs_${randomUUID()}`)).ticket;const old=await row('tickets',ticket.id);const history=await audit(ticket.id);
    for(const target of [inactive.id,foreign.id,randomUUID()])await assert.rejects(assign('legacy',legacyEvent,ticket.id,target),{code:'22023'});
    await assert.rejects(assign('legacy',otherEvent,ticket.id,a.id),{code:'22023'});await assert.rejects(assign('commerce',legacyEvent,ticket.id,a.id),{code:'22023'});await assert.rejects(assign('other',legacyEvent,ticket.id,a.id),{code:'22023'});await assert.rejects(assign('legacy',legacyEvent,ticket.id,a.id,b.id),{code:'40001'});
    const removed=await affiliate('Deleted target');await db.query('update public.affiliates set deleted_at=now() where id=$1',[removed.id]);await assert.rejects(assign('legacy',legacyEvent,ticket.id,removed.id),{code:'22023'});
    assert.deepEqual(await row('tickets',ticket.id),old);assert.deepEqual(await audit(ticket.id),history);
    for(const status of ['pending','refunded']){await db.query('update public.tickets set status=$2 where id=$1',[ticket.id,status]);await assert.rejects(assign('legacy',legacyEvent,ticket.id,a.id),{code:'22023'});}
    const pass=(await fulfill((await reserve(commerceEvent)).order)).passes[0];for(const status of ['refunded','canceled']){await db.query('update public.commerce_passes set status=$2 where id=$1',[pass.id,status]);await assert.rejects(assign('commerce',commerceEvent,pass.id,a.id),{code:'22023'});}
  });
  await t.test('concurrent operators with the same previous attribution cannot overwrite each other',async()=>{
    const ticket=(await fulfillLegacy(await reserveLegacy(),`cs_${randomUUID()}`)).ticket;const blocker=await connect();await blocker.query('begin');await blocker.query('select id from public.events where id=$1 for update',[legacyEvent]);const workers=await Promise.all([connect('service_role'),connect('service_role')]);const requests=[assign('legacy',legacyEvent,ticket.id,a.id,null,workers[0]),assign('legacy',legacyEvent,ticket.id,b.id,null,workers[1])];requests.forEach(request=>request.catch(()=>{}));
    let waiting=0;const deadline=Date.now()+5000;while(waiting<2&&Date.now()<deadline){waiting=(await db.query("select count(*)::int n from pg_stat_activity where wait_event_type='Lock' and query like 'select public.assign_participant_affiliate%'")).rows[0].n;if(waiting<2)await new Promise(resolve=>setTimeout(resolve,10));}await blocker.query('rollback');assert.equal(waiting,2);const settled=await Promise.allSettled(requests);assert.equal(settled.filter(result=>result.status==='fulfilled').length,1);assert.equal(settled.find(result=>result.status==='rejected').reason.code,'40001');assert.equal((await audit(ticket.id)).length,1);
  });
  await t.test('deletion or disabling committed before a waiting assignment makes the stale selection unavailable',async()=>{
    const target=await affiliate('Concurrent target');const id=await event(false,[{id:target.id,name:target.name,active:true}]);const ticketId=randomUUID();await db.query("insert into public.tickets(id,event_id,buyer_email,status) values($1,$2,'test@example.test','paid')",[ticketId,id]);const worker=await connect('service_role');await service.query('begin');await service.query('select public.set_affiliate_deleted($1,true)',[target.id]);const pending=assign('legacy',id,ticketId,target.id,null,worker);pending.catch(()=>{});await service.query('commit');await assert.rejects(pending,{code:'22023'});assert.equal((await attribution('tickets',ticketId)).affiliate_id,null);assert.equal((await audit(ticketId)).length,0);
  });
  await t.test('a failed audit insert rolls back the participant update in the same transaction',async()=>{
    const ticket=(await fulfillLegacy(await reserveLegacy(),`cs_${randomUUID()}`)).ticket;const before=await row('tickets',ticket.id);await db.query('alter table public.participant_affiliate_audit add constraint test_audit_failure check(false) not valid');await assert.rejects(assign('legacy',legacyEvent,ticket.id,a.id),{code:'23514'});await db.query('alter table public.participant_affiliate_audit drop constraint test_audit_failure');assert.deepEqual(await row('tickets',ticket.id),before);assert.equal((await audit(ticket.id)).length,0);
  });
});
