'use strict'
const assert = require('node:assert/strict')
const {run, context} = require('./helpers/node-game-runtime.cjs')

;(async () => {
  await run('loadContent()')
  const rng = run('rngState')
  const calls = new Map()
  let active = 0, maximum = 0
  const count = path => {
    calls.set(path, (calls.get(path) || 0) + 1)
    return calls.get(path)
  }
  // Model a stalled fetch/body with an abortable request, without waiting for
  // the real 15 second browser deadline.
  context.setTimeout = fn => setTimeout(fn, 5)
  context.clearTimeout = clearTimeout
  context.fetch = async (path, {signal}) => {
    if (count(path) === 1) return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('timed out', 'AbortError')), {once:true})
    })
    return {ok:true,json:async()=>({ok:true})}
  }
  assert.equal((await run('readStartupResource("timeout.json", r=>r.json())')).ok, true)
  assert.equal(calls.get('timeout.json'), 2)
  context.fetch = async path => {count(path);return {ok:false,status:404}}
  await assert.rejects(run('readStartupResource("missing.json", r=>r.json())'), /404/)
  assert.equal(calls.get('missing.json'), 1, 'missing content must not silently pass or retry')
  context.setTimeout = () => 0; context.clearTimeout = () => {}
  context.Image = class {constructor(){this.naturalWidth=16;this.naturalHeight=16} async decode() {}}
  context.fetch = async path => {
    const n = count(path)
    if (path === 'retry.png' && n === 1) throw new TypeError('connection closed')
    active++; maximum = Math.max(maximum, active)
    return {ok:true,blob:async()=>{
      await new Promise(resolve => setImmediate(resolve))
      active--
      return new Blob(['test'], {type:'image/png'})
    }}
  }
  await run('Promise.all([preloadImages(["retry.png"]),preloadImages(["retry.png"])])')
  assert.equal(calls.get('retry.png'), 2, 'overlapping requests share one retry sequence')
  assert.equal(run('preloadedImages.has("retry.png") && !imagePreloadsInFlight.size'), true)
  maximum = 0
  await run('preloadImages(Array.from({length:25},(_,i)=>"bounded-"+i+".png"))')
  assert.equal(maximum,8,'one preload batch bounds network concurrency')
  const frame = run('RENDER_STYLE.terrainTiles.water.frames[0]')
  await run('preloadImages('+JSON.stringify([frame])+')')
  assert.equal(run(`(()=>{const image=preloadedImages.get(${JSON.stringify(frame)});return scaledVisualCache.get(image).has(TILE_PX+'|1||false')})()`),true,'late frame prepared at current zoom')
  // A completed fetch does not guarantee a completed image decode. The
  // visual deadlines must work independently of browser animation frames.
  context.setTimeout = fn => setTimeout(fn, 5)
  context.clearTimeout = clearTimeout
  context.Image = class { decode() { return new Promise(() => {}) } }
  await run('preloadImages(["stalled-decode.png"])')
  assert.equal(run('failedImagePaths.has("stalled-decode.png") && !imagePreloadsInFlight.size'), true)
  assert.equal(run('imageSrc("stalled-decode.png")'), 'stalled-decode.png', 'failed decode retains fallback')
  assert.equal(await run('waitForStartupVisuals(new Promise(()=>{}))'), false, 'stalled visual batch releases startup')
  assert.equal(await run('waitForStartupVisuals(Promise.resolve())'), true, 'normal visual batch finishes immediately')
  await assert.rejects(run('waitForStartupVisuals(Promise.reject(new Error("unexpected failure")))'), /unexpected failure/)
  context.setTimeout = () => 0; context.clearTimeout = () => {}
  run('imagePreloadingStopped=true')
  await run('preloadImages(["old-page.png"])')
  assert.equal(calls.has('old-page.png'), false)
  assert.equal(run('rngState'),rng,'startup resource handling has no gameplay RNG effects')
  console.log('PASS startup: timeout recovery, HTTP failure, shared retries, bounded image requests, late frame preparation, visual deadlines, discarded page')
})().catch(err=>{console.error(err);process.exitCode=1})
