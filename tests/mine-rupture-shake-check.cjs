'use strict'

const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')

;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    log=()=>{};enemyIsVisibleOnMainView=()=>false;
    replayAnimationsDisabled=false;replaySimulationMode=false;
    player.x=40;player.y=40;player.hp=1000;
    spawnDamageNumber=()=>{};damageRoll=()=>17;
    checkPlayerHealthWarning=()=>{};updateHud=()=>{};`)

  const stage=context.document.getElementById('stage')
  const changes=[]
  stage.classList={
    add(name){changes.push(['add',name])},
    remove(name){changes.push(['remove',name])}
  }
  const before=run('rngState')
  run(`resolveEnemyRupture({name:'Duiwel'}, {tiles:[{x:39,y:39}]})`)
  assert.deepEqual(changes,[['remove','rupture-shake'],['add','rupture-shake']],
    'an avoided eruption still triggers the screen shake')
  assert.equal(run('player.hp'),1000,'shake has no damage effect on a missed Rupture')
  assert.equal(run('rngState'),before,'screen shake does not consume gameplay RNG')

  changes.length=0
  run(`resolveEnemyRupture({name:'Duiwel'}, {tiles:[{x:40,y:40}]})`)
  assert.deepEqual(changes,[['remove','rupture-shake'],['add','rupture-shake']],
    'a successful hit also restarts the visual effect')
  assert.equal(run('player.hp'),983,'ordinary damage resolution remains unchanged')
  assert.equal(run('rngState'),before)

  changes.length=0
  run(`replayAnimationsDisabled=true;
    resolveEnemyRupture({name:'Duiwel'}, {tiles:[{x:39,y:39}]})`)
  assert.deepEqual(changes,[],'fast replay omits cosmetic screen shake')
  assert.equal(run('rngState'),before,'fast replay preserves RNG state')
  console.log('PASS Rupture shake on hit/miss, replay suppression and RNG independence')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
