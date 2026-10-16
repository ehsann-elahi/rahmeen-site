import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import * as catalogue from '../dist/catalogue.js';

// Verify the shared API can recover after an owner signs in in another tab.
const oldFetch=globalThis.fetch, requests=[];
const responses=[{csrf:'old'},{error:'Invalid CSRF token.'},{csrf:'new'},{order:{id:'confirmed'}}];
globalThis.fetch=async (url,options)=>{
  requests.push({url,options});
  const payload=responses.shift();
  return new Response(JSON.stringify(payload),{status:payload.error?403:200,headers:{'content-type':'application/json'}});
};
const client=await import('../dist/store-api.js');
const result=await client.apiRequest('orders',{method:'POST',body:{requestId:'unchanged-request-id'}});
assert.equal(result.order.id,'confirmed');
assert.equal(requests[1].options.headers['X-CSRF-Token'],'old');
assert.equal(requests[3].options.headers['X-CSRF-Token'],'new');
assert.equal(JSON.parse(requests[3].options.body).requestId,'unchanged-request-id');
assert.equal(requests.filter(row=>row.url.includes('orders')).length,2);
globalThis.fetch=oldFetch;

// Exercise interrupted checkout without a browser or a live customer order.
const stored=new Map(), ui={}, calls=[];
const noop=()=>{};
const button={innerHTML:'Place order',textContent:'',disabled:false,dataset:{}};
const error={textContent:'',focus:noop,after:noop};
const fields=Object.fromEntries(Object.entries({name:'Test Customer',phone:'03001234567',email:'',address:'1 Test Street',city:'Karachi',postalCode:'',province:'Sindh',notes:''}).map(([name,value])=>[name,{value,setAttribute:noop}]));
fields.namedItem=name=>fields[name];
const dialog={innerHTML:'',open:false,showModal(){this.open=true;},close(){this.open=false;},querySelector:()=>button,querySelectorAll:()=>[]};
const form={elements:fields,isConnected:true,reportValidity:()=>true,querySelectorAll:()=>[],querySelector:()=>button,setAttribute:noop,removeAttribute:noop,closest:()=>dialog};
ui['c-review-dialog']=dialog;ui['c-checkout-form']=form;ui['c-checkout-error']=error;
let scope='scope-original', apiOutcome='network-error', catalogueLoads=0;
const context={
  ...catalogue,esc:catalogue.escapeHTML,storeSettings:{available:true,orderingEnabled:true,codEnabled:true,demoMode:true,shippingFee:250},
  crypto:globalThis.crypto,setTimeout,clearTimeout,console,
  sessionStorage:{setItem:(key,value)=>stored.set(key,value),getItem:key=>stored.get(key)||null,removeItem:key=>stored.delete(key)},
  localStorage:{setItem:noop,getItem:()=>null},
  getSession:async()=>({checkoutScope:scope}),
  loadCatalogue:async()=>{catalogueLoads++;return {ok:true};},
  apiRequest:async (route,options)=>{
    calls.push({route,body:options.body});
    if(apiOutcome==='network-error')throw Object.assign(new Error('Connection interrupted'),{status:0});
    if(apiOutcome==='scope-error')throw Object.assign(new Error('Session changed'),{status:409,details:{checkoutScope:'expired'}});
    return {order:{id:'order-one',number:'RA-TEST-ONE',demoMode:true,status:'pending',items:[],subtotal:100,shippingFee:250,total:350}};
  },
  document:{activeElement:null,getElementById:id=>ui[id]||null,querySelector:()=>null,querySelectorAll:()=>[],body:{classList:{add:noop,remove:noop}},createElement:()=>({})},
};
const source=(await readFile(new URL('../dist/commerce.js',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
vm.runInNewContext(source+`\nglobalThis.subject={persistCheckout,restoreCheckout,openCheckout,submitCheckout,renderGallery,priceMarkup,setDraft(value){checkoutDraft=value},getDraft(){return checkoutDraft},setBag(value){bag=value},getBag(){return bag}};`,context);
const subject=context.subject;
const draft={requestId:'checkout-request-123456789',checkoutScope:scope,items:[{id:'saffron-muse',size:'M',color:'Ivory',quantity:1}],quote:{items:[],subtotal:100,shippingFee:250,total:350,demoMode:true},customer:{name:'Private customer'},pending:true};
subject.setDraft(draft);subject.setBag(draft.items);subject.persistCheckout();
const saved=JSON.parse([...stored.values()][0]);
assert.equal(saved.requestId,draft.requestId);assert.equal(saved.checkoutScope,scope);assert.equal('customer' in saved,false);
subject.setDraft(null);subject.restoreCheckout();
assert.equal(subject.getDraft().requestId,draft.requestId);
await subject.openCheckout();
assert.equal(catalogueLoads,0,'Pending orders must not re-quote depleted inventory');
assert.match(error.textContent,/same order safely/);
await subject.submitCheckout(form);
assert.equal(subject.getDraft().pending,true);assert.equal(calls[0].body.requestId,draft.requestId);
assert.equal(calls[0].body.expectedCheckoutScope,scope);
assert.equal(stored.size,1,'A lost response keeps the pending receipt');
apiOutcome='scope-error';await subject.submitCheckout(form);
assert.equal(subject.getDraft().pending,true,'Session mismatch must retain the uncertain receipt');
assert.match(dialog.innerHTML,/shopping session has expired/);
const beforeCalls=calls.length;scope='different-session';await subject.openCheckout();
assert.equal(calls.length,beforeCalls,'Expired sessions must never re-submit the pending order');
scope=draft.checkoutScope;apiOutcome='success';await subject.submitCheckout(form);
assert.equal(calls.at(-1).body.requestId,draft.requestId,'Every retry must retain the original order identity');
assert.equal(subject.getDraft(),null);assert.equal(stored.size,0);assert.equal(subject.getBag().length,0);
assert.match(dialog.innerHTML,/RA-TEST-ONE/);

// All merchant media and compare-at prices are visible and escaped.
const gallery=subject.renderGallery({...catalogue.products[0],imageAlt:'./assets/hero-detail.webp',images:['./assets/hero.webp','./assets/sage.webp']});
assert.equal((gallery.match(/data-image-index=/g)||[]).length,4);
assert.match(subject.priceMarkup({price:100,compareAtPrice:150}),/<del/);
console.log('Frontend regression checks passed: CSRF rotation, non-PII receipt persistence, retry identity, expired session guard, success cleanup, full gallery and sale pricing.');
