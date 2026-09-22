const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
let nextFrame; const map=new Map(), storage=new Map(), downloads=[];
const context2d=new Proxy({}, {get:()=>()=>{}});
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={setProperty(){}};this.hidden=false;this.value='';this.textContent='';this.checked=false;this.disabled=false;this.files=[];}
 set id(value){this._id=value;map.set(value,this)} get id(){return this._id}
 append(...items){this.children.push(...items);if(this.tagName==='select'&&!this.value&&items[0])this.value=items[0].value||'';}
 replaceChildren(...items){this.children=[];this.append(...items)}
 querySelectorAll(query){const out=[];const visit=n=>{for(const c of n.children||[]){if(c.tagName==='input'&&(!query.includes(':checked')||c.checked))out.push(c);visit(c)}};visit(this);return out;}
 setAttribute(k,v){this[k]=v} scrollIntoView(){} focus(){} remove(){} getContext(){return context2d} click(){if(this.download)downloads.push(this.download);this.onclick?.();}
}
function setup(){
 map.clear();const html=fs.readFileSync('outputs/index.html','utf8');for(const match of html.matchAll(/<([a-z0-9]+)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const e=new Element(match[1]);e.id=match[2];e.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';e.hidden=/\bhidden\b/.test(match[0]);}map.get('speed').value='1';
 const doc={getElementById:id=>map.get(id),createElement:t=>new Element(t),createTextNode:text=>({textContent:text}),addEventListener(){},body:new Element('body')};
 const scope=vm.createContext({document:doc,Image:class extends Element{constructor(){super('img');this.complete=true;this.naturalWidth=160;this.naturalHeight=160;}async decode(){}},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},requestAnimationFrame(fn){nextFrame=fn},setTimeout(){},URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},Blob});
 for(const f of ['abilities.js','ability-packs.js','missile-ability.js','characters.js','engine.js','sound.js','countdown.js','app.js'])vm.runInContext(fs.readFileSync('outputs/'+f,'utf8'),scope);
 return scope;
}
(async()=>{
 setup();const get=id=>map.get(id),submit=id=>get(id).onsubmit({preventDefault(){}});
 assert.equal(get('pick0').value,'blue');assert.equal(get('pick1').value,'coral');
 get('toggle-editor').onclick();assert.equal(get('editor').hidden,false);
 get('new-ability').onclick();get('ability-name').value='테스트 불꽃';get('ability-type').value='projectile';get('ability-type').onchange();get('param-bounces').value='2';submit('ability-form');
 let saved=JSON.parse(storage.get('bounce.roster.v1'));assert.equal(saved.abilities.length,9);const aid=saved.abilities.at(-1).id;assert.equal(saved.abilities.at(-1).params.bounces,2);
 get('new-character').onclick();get('character-name').value='나의 캐릭터';get('character-hp').value='180';get('character-abilities').querySelectorAll('input').find(x=>x.value===aid).checked=true;submit('character-form');
 saved=JSON.parse(storage.get('bounce.roster.v1'));assert.equal(saved.characters.length,6);assert.equal(get('pick0').value,saved.characters.at(-1).id);assert.equal(get('hp0').textContent,'180 / 180');assert.equal(get('skills0').children[0].children[0].textContent,'테스트 불꽃');
 const before=storage.get('bounce.roster.v1');for(const el of get('character-abilities').querySelectorAll('input').slice(0,4))el.checked=true;submit('character-form');assert.equal(storage.get('bounce.roster.v1'),before);assert.ok(get('save-status').textContent.includes('최대 3개'));
 setup();assert.equal(get('pick0').children.length,6);assert.equal(get('ability-list').children.length,10);
 get('export').onclick();get('export-defaults').onclick();assert.deepEqual(downloads,['bounce-roster.json','characters.js']);
 await get('import').onchange({target:{files:[{size:20,text:async()=>'{"version":2}'}]}});assert.equal(storage.get('bounce.roster.v1'),before);assert.equal(get('import-preview').hidden,true);
 await get('import').onchange({target:{files:[{size:before.length,text:async()=>before}]}});assert.equal(get('import-preview').hidden,false);get('apply-import').onclick();assert.equal(get('import-preview').hidden,true);assert.equal(get('pick0').children.length,6);
 get('start').onclick();assert.equal(get('overlay').hidden,true);get('pause').onclick();assert.equal(get('battle-state').textContent,'PAUSED');get('pause').onclick();assert.equal(get('battle-state').textContent,'GET READY');assert.equal(get('clock').textContent,'00:00');for(let i=1;i<=190;i++)nextFrame(i*1000/60);assert.equal(get('battle-state').textContent,'LIVE ARENA');assert.equal(get('countdown').hidden,true);get('reset').onclick();assert.equal(get('battle-state').textContent,'READY');
 console.log('앱 로직 검사 통과: 능력 생성, 캐릭터 생성/장착/대전 반영, 저장/재실행, 3개 제한, 내보내기, 잘못된 파일 거부, 가져오기, 시작/일시정지/리셋 (모의 DOM 사용; 시각 검사는 아님)');
})().catch(e=>{console.error(e);process.exitCode=1});
