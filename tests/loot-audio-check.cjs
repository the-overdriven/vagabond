'use strict'
const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path')
const root = path.resolve(__dirname, '..')

test('loot audio unlock, priority, mute, background and persistent preference', async () => {
  const listeners = {}, buttonEvents = {}, attributes = {}, sources = []
  const storage = new Map()
  const button = {setAttribute(k,v){attributes[k]=v},addEventListener(k,v){buttonEvents[k]=v}}
  const document = {hidden:false,getElementById:()=>button,addEventListener(k,v){listeners[k]=v}}
  class MockAudioContext {
    constructor(){this.state='suspended'; this.destination={}}
    async resume(){this.state='running'}
    async decodeAudioData(data){return data}
    createGain(){return {gain:{},connect(){},disconnect(){}}}
    createBufferSource(){
      const source = {connect(){},disconnect(){},start(){sources.push(this)},
        stop(){this.stopped=true;this.onended?.()}}
      return source
    }
  }
  const ctx=vm.createContext({document,window:{AudioContext:MockAudioContext},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
    fetch:async url=>({ok:true,arrayBuffer:async()=>fs.readFileSync(path.join(root,url))})})
  const code=['musicAudio.js','lootAudio.js'].map(name=>fs.readFileSync(path.join(root,'src',name),'utf8')).join('\n')
  const run=code=>vm.runInContext(code,ctx)
  run(code)
  assert.equal(button.textContent,'🔊')
  run('LootAudio.play(4)')
  assert.equal(sources.length,0,'no audio before user gesture')
  listeners.pointerdown()
  await new Promise(resolve=>setImmediate(resolve))
  run('LootAudio.play(1); LootAudio.play(4); LootAudio.play(2)')
  assert.equal(sources.length,2,'a higher cue replaces existing audio; lower cue is ignored')
  assert.equal(sources[0].stopped,true)
  assert.equal(sources[1].stopped,undefined)
  buttonEvents.click()
  assert.equal(sources[1].stopped,true)
  assert.equal(button.textContent,'🔇')
  assert.equal(attributes['aria-pressed'],'false')
  assert.equal(storage.get('vagabond_sound_muted'),'1')
  run('LootAudio.play(4)'); assert.equal(sources.length,2)
  buttonEvents.click()
  run('LootAudio.play(2)'); assert.equal(sources.length,3)
  document.hidden=true;listeners.visibilitychange()
  assert.equal(sources[2].stopped,true)
  run('LootAudio.play(4)');assert.equal(sources.length,3)
  buttonEvents.click()
  vm.runInNewContext(code,{document,window:{},localStorage:{getItem:k=>storage.get(k)}})
  assert.equal(button.textContent,'🔇','a new page restores the preference even without Web Audio')
})

test('live loot classifier and replay guard', async () => {
  const {run}=require('./helpers/node-game-runtime.cjs')
  await run('loadContent()')
  run(`globalThis.cues=[];LootAudio.play=p=>cues.push(p);
    globalThis.gear=a=>({kind:'weapon',base:'Dagger',tier:1,mod:'atk',modAmt:a});
    rng=()=>{throw Error('presentation used gameplay RNG')};
    for (const item of [{kind:'gold'},{kind:'potion'},gear(2),gear(5),gear(13),{kind:'artifact'}])
      playLootSound(lootSoundPriority(item,1));
    replayPlaying=true;playLootSound(4);replayPlaying=false;
    replaySimulationMode=true;playLootSound(4);replaySimulationMode=false;
    replayAnimationsDisabled=true;playLootSound(4);replayAnimationsDisabled=false;`)
  assert.equal(run('JSON.stringify(cues)'),'[1,2,3,4]')
})

test('soundtrack waits for interaction, observes the two-minute gap and shares mute', async () => {
  const listeners = {}, attrs = {}, buttonEvents = {}, timers = new Map()
  const button = {setAttribute(k,v){attrs[k]=v},addEventListener(k,v){buttonEvents[k]=v}}
  const document = {hidden:false,getElementById:()=>button,addEventListener(k,v){listeners[k]=v}}
  let now = 1, timerId = 0, audio
  class MockAudio {
    constructor(){ audio=this; this.paused=true; this.events={}; this.plays=0; this.loads=0 }
    set src(value){ this.file=value; this.loads++; this.currentTime=0; this.paused=true }
    addEventListener(k,v){ this.events[k]=v }
    async play(){ this.plays++; if(this.rejectPlay) throw Error('autoplay blocked'); this.paused=false }
    pause(){ this.paused=true }
    finish(){ this.paused=true; this.events.ended() }
    fail(){ this.paused=true; this.events.error() }
  }
  const ctx=vm.createContext({document,window:{Audio:MockAudio},localStorage:{getItem:()=>null,setItem(){}},
    replayPlaying:false,replaySimulationMode:false,replayAnimationsDisabled:false,
    Date:{now:()=>now},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,at:now+ms});return timerId},
    clearTimeout:id=>timers.delete(id)})
  const run=code=>vm.runInContext(code,ctx)
  for(const file of ['musicAudio.js','lootAudio.js']) run(fs.readFileSync(path.join(root,'src',file),'utf8'))
  const settle=()=>new Promise(resolve=>setImmediate(resolve))
  async function advance(ms){now+=ms; for(const [id,t] of timers) if(t.at<=now){timers.delete(id);t.fn()} await settle()}
  await advance(999999)
  assert.equal(audio.plays,0)
  listeners.pointerdown({target:{closest:()=>button}})
  assert.equal(audio.plays,0,'speaker gesture does not start audio before toggle')
  audio.rejectPlay=true; listeners.pointerdown(); await settle()
  assert.equal(audio.plays,1); assert.equal(audio.paused,true)
  audio.rejectPlay=false; listeners.pointerup(); listeners.click(); await settle()
  assert.equal(audio.plays,2); assert.equal(audio.loads,1)
  assert.equal(audio.volume,0.25)
  audio.currentTime=55; buttonEvents.click(); assert.equal(audio.paused,true)
  buttonEvents.click(); await settle(); assert.equal(audio.currentTime,55); assert.equal(audio.plays,3)
  audio.finish(); assert.equal(timers.size,1)
  await advance(119999); assert.equal(audio.plays,3)
  listeners.click(); assert.equal(audio.plays,3,'input cannot skip the gap')
  await advance(1); assert.equal(audio.plays,4); assert.equal(audio.loads,2)
  document.hidden=true; listeners.visibilitychange(); assert.equal(audio.paused,true)
  document.hidden=false; listeners.visibilitychange(); await settle(); assert.equal(audio.plays,5)
  run('replayPlaying=true; MusicAudio.suspend()'); assert.equal(audio.paused,true)
  listeners.click(); assert.equal(audio.plays,5)
  run('replayPlaying=false; LootAudio.syncMusic()'); await settle(); assert.equal(audio.plays,6)
  audio.finish(); buttonEvents.click(); assert.equal(timers.size,0)
  await advance(120000); assert.equal(audio.plays,6)
  buttonEvents.click(); await settle(); assert.equal(audio.plays,7)
  audio.fail(); await advance(120000); assert.equal(audio.plays,8,'failed media retries after gap')
})

test('offline audio serves full files and valid byte ranges', async () => {
  const bytes=Buffer.from([0,1,2,3,4,5,6,7,8,9])
  const cache={match:async()=>new Response(bytes,{headers:{'Content-Type':'audio/mpeg'}})}
  const ctx=vm.createContext({self:{VAGABOND_GAME_VERSION:'test',addEventListener(){}},
    importScripts(){},caches:{open:async()=>cache},Request,Response,URL})
  vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx)
  const call=range=>{ctx.req=new Request('https://example.com/audio/music/test.mp3',
    range?{headers:{Range:range}}:{});return vm.runInContext('audioResponse(req)',ctx)}
  const full=await call(); assert.equal(full.status,200); assert.deepEqual(Buffer.from(await full.arrayBuffer()),bytes)
  for(const [range,expected,start,end] of [['bytes=2-5',[2,3,4,5],2,5],['bytes=8-',[8,9],8,9],['bytes=-2',[8,9],8,9],['bytes=7-99',[7,8,9],7,9]]) {
    const res=await call(range);assert.equal(res.status,206)
    assert.equal(res.headers.get('Content-Range'),`bytes ${start}-${end}/10`)
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())],expected)
  }
  assert.equal((await call('bytes=10-')).status,416)
  assert.equal((await call('bytes=5-2')).status,416)
})


test('worker precaches and serves all soundtrack and loot files without a network', async () => {
  const hooks = {}, files = new Map(), fetches = []
  const cache = {
    async match(req) { return files.get(req.url)?.clone() },
    async put(req, res) { files.set(req.url, res) }
  }
  const ctx = vm.createContext({URL, Request, Response, console,
    self: {VAGABOND_GAME_VERSION:'test', location:{origin:'https://example.com'},
      addEventListener(name, fn){hooks[name]=fn}},
    importScripts(){}, caches:{open:async()=>cache},
    fetch:async req=>{fetches.push(req);return new Response('test audio')}
  })
  vm.runInContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),ctx)
  const assets = vm.runInContext('PRECACHE_URLS.filter(url=>url.startsWith("./audio/"))',ctx)
  const sourceFiles = ['musicAudio.js','lootAudio.js']
  for (const name of sourceFiles) assert.ok(vm.runInContext('PRECACHE_URLS',ctx).includes('./src/'+name))
  assert.equal(assets.length,5)
  for(const asset of assets){
    const bytes=fs.readFileSync(path.join(root,asset))
    const url=new URL(asset,'https://example.com/vagabond/').href
    files.set(url,new Response(bytes))
    let promise
    hooks.fetch({request:new Request(url,{headers:{Range:'bytes=0-3'}}),respondWith(p){promise=p}})
    const res=await promise
    assert.equal(res.status,206)
    assert.deepEqual(Buffer.from(await res.arrayBuffer()),bytes.subarray(0,4))
  }
  assert.equal(fetches.length,0)
  // If precaching missed a file, a range request must fetch the full asset,
  // not poison the cache with the server's partial response.
  const url='https://example.com/vagabond/audio/music/new.mp3'
  let promise
  hooks.fetch({request:new Request(url,{headers:{Range:'bytes=0-3'}}),respondWith(p){promise=p}})
  assert.equal((await promise).status,206)
  assert.equal(fetches.length,1)
  assert.equal(fetches[0].headers.get('Range'),null)
  assert.equal(await files.get(url).text(),'test audio')
})
