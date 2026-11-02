const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const { outputText } = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/backend/pagination.ts'),'utf8'), {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
});
const exportsObject={};
vm.runInNewContext(outputText,{exports:exportsObject,Date,Set,Error});
const {calendarMonthWindow,upcomingWindow,readAllPages}=exportsObject;

test('calendar local-midnight UTC window spans DST and month boundaries',()=>{
  const previous=process.env.TZ;process.env.TZ='America/Los_Angeles';
  try {
    const window=calendarMonthWindow(2026,2);
    assert.equal(window.from,'2026-03-01T08:00:00.000Z');
    assert.equal(window.to,'2026-04-12T07:00:00.000Z');
    assert.equal((Date.parse(window.to)-Date.parse(window.from))/3600000,42*24-1);
    const december=calendarMonthWindow(2026,11);
    assert.equal(new Date(december.to).getFullYear(),2027);
  } finally {if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});

test('dense windows collect every page and explicit end without inventing a count',async()=>{
  const cursors=[];
  const items=await readAllPages(async cursor=>{
    cursors.push(cursor);
    return cursor?{items:[3],nextCursor:null,hasMore:false}:{items:[1,2],nextCursor:'page2',hasMore:true};
  },()=>{});
  assert.deepEqual(Array.from(items),[1,2,3]);
  assert.deepEqual(cursors,[undefined,'page2']);
});

test('expiry or filter change during page request rejects all retained results',async()=>{
  let current=true,resolve;
  const result=readAllPages(()=>new Promise(done=>{resolve=done;}),()=>{if(!current)throw new Error('changed');});
  current=false;resolve({items:['private'],nextCursor:'more',hasMore:true});
  await assert.rejects(result,/changed/);
});

test('broken or repeating cursor and resource ceiling never silently return incomplete list',async()=>{
  await assert.rejects(readAllPages(async()=>({items:[],nextCursor:null,hasMore:true}),()=>{}),/Invalid page/);
  await assert.rejects(readAllPages(async()=>({items:[],nextCursor:'same',hasMore:true}),()=>{}),/did not advance/);
  let index=0;
  await assert.rejects(readAllPages(async()=>({items:[index],nextCursor:String(++index),hasMore:true}),()=>{},2),/too many/);
  assert.equal(index,2);
});

test('upcoming bound is explicit93days',()=>{
  const window=upcomingWindow(new Date('2026-10-01T00:00:00Z'));
  assert.equal(Date.parse(window.to)-Date.parse(window.from),93*86400000);
});
