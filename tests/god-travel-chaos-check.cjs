'use strict'

// Run with Node; no browser, Cypress, rendering or animation is required.
const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')

;(async () => {
  await run('loadContent()')
  context.fixture = require('./saves/Tester_start.json')
  run('loadGameFromObject(fixture,{isReplayInit:true});log=()=>{}')

  const before = run('({x:player.x,y:player.y,turn:turnCount,rng:rngState})')
  run(`replayRecording=false;startReplayRecording();useGodModeKey()`)
  const stock = () => JSON.parse(run('JSON.stringify(merchantStock.filter(i=>i.godTestArtifact))'))
  const fullStock = stock()
  const expected = run(`[...new Set([['weapon',WEAPONS],['shield',SHIELDS],['armor',ARMORS]].flatMap(([slot,catalog])=>
    catalog.flatMap(base=>artifactAbilityPool({...base,kind:'artifact',artifactSlot:slot,base:base.name})
      .map(id=>(slot==='weapon'?(base.rangedAtk?'bow':'melee'):slot)+':'+id))).concat(
    ARTIFACT_ABILITIES.domains.wayfaring.map(id=>'trinket:'+id)))]`)
  const category = i=>i.artifactSlot==='weapon'?(i.rangedAtk?'bow':'melee'):i.artifactSlot
  assert.equal(fullStock.length,expected.length)
  assert.equal(new Set(fullStock.map(i=>i.replayId)).size,expected.length)
  assert.equal(new Set(fullStock.map(i=>i.name)).size,expected.length,'identically named power variants remain distinguishable')
  assert.deepEqual(fullStock.map(i=>category(i)+':'+i.abilityId),Array.from(expected))
  assert.ok(fullStock.every(i=>run(`artifactAbilityPool(${JSON.stringify(i)}).includes(${JSON.stringify(i.abilityId)})`)))
  assert.ok(fullStock.every(i=>i.identified&&!i.curse&&!Object.keys(i.bonuses).length))
  const purchase = fullStock[0].replayId
  run(`buyItem(merchantStock.find(i=>i.replayId===${JSON.stringify(purchase)}));
    useGodModeTravel(-1);useGodModeTravel(-1);useGodModeTravel(1)`)
  assert.equal(stock().length,expected.length-1)
  assert.ok(run(`player.inventory.some(i=>i.replayId===${JSON.stringify(purchase)})`))
  const afterStock = stock()
  await Promise.resolve() // finish the synchronous replay action scope
  const actions = JSON.parse(JSON.stringify(run('replayData.actions')))
  assert.deepEqual(actions.map(a=>a.type),['godMode','buy','godTravel','godTravel','godTravel'])
  assert.deepEqual(actions.slice(2).map(a=>a.direction),[-1,-1,1])
  assert.equal(run('replayData.rng.length'),0)
  assert.equal(run('currentZ'),-1)
  assert.equal(run('map===undergroundMap'),true)

  context.recorded = JSON.parse(JSON.stringify(run('replayData')))
  run('loadGameFromObject(recorded.initialState,{isReplayInit:true});replayPlaying=true;replayRecording=false')
  try {
    for (const action of context.recorded.actions)
      await run(`runReplayAction(${JSON.stringify(action)})`)
  } finally {
    run('replayPlaying=false')
  }
  assert.equal(run('currentZ'),-1)
  assert.equal(run('map===undergroundMap'),true)
  assert.equal(run('player.godMode'),true)
  assert.deepEqual(stock(),afterStock,'replay reconstructs identical stock and purchase')
  assert.ok(run(`player.inventory.some(i=>i.replayId===${JSON.stringify(purchase)})`))
  assert.deepEqual(JSON.parse(JSON.stringify(run('({x:player.x,y:player.y,turn:turnCount,rng:rngState})'))),
    JSON.parse(JSON.stringify(before)))

  run('globalThis.testStockSave=structuredClone(buildSaveObject());loadGameFromObject(testStockSave,{isReplayInit:true})')
  assert.equal(run('player.godArtifactStockGranted'),true)
  run('useGodModeKey(true);useGodModeKey()')
  assert.deepEqual(stock(),afterStock,'save/load and toggles do not replenish purchased items')

  // A chain hole must not become a visitable level, even in god mode.
  run(`deepLevels[2].kind='unused';currentZ=-3;map=deepLevels[1].map`)
  assert.equal(run('useGodModeTravel(-1)'),true)
  assert.equal(run('currentZ'),-5)

  // Test actual Chaos teleportation, not only the terrain flood helper.
  for (const barrier of ['dwarvenprisonbars','dwarvenprisondoorlocked','dwarvenprisondoorclosed']) {
    const destination=run(`(() => {
      currentZ=0;currentCave=-1;map=surfaceMap;replayRecording=false
      player.godMode=false;player.godInvisible=false
      const x=40,y=40
      for(let yy=y-2;yy<=y+2;yy++)for(let xx=x-2;xx<=x+2;xx++)map[yy][xx]='cavewall'
      player.x=x-1;player.y=y
      map[y][x-1]='marble';map[y][x]='${barrier}';map[y][x+1]='marble'
      applyChaosScroll({radius:0,destinationRadius:3})
      return {x:player.x,y:player.y}
    })()`)
    assert.deepEqual(JSON.parse(JSON.stringify(destination)),{x:41,y:40},
      `Chaos must cross ${barrier}`)
  }
  run('resetForNewCharacter()')
  assert.equal(stock().length,0)
  assert.equal(run('player.godArtifactStockGranted'),false)
  console.log(`PASS ${fullStock.length} legal God Mode artifact variants, purchase, save/load, replay, reset, depth travel and Chaos`)
})().catch(err => {console.error(err);process.exitCode=1})
