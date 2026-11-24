'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=s=>JSON.parse(JSON.stringify(run(s)))
;(async()=>{
 await run('loadContent()');context.fixture=require('./saves/Tester_start.json')
 run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
  replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
  player.wayfaring=ArtifactWayfaring.freshState();player.inventory=[];
  currentZ=0;map=surfaceMap;turnCount=100;enemies=[];npcs=[];
  player.hp=playerMaxHp();groundItems=[];occupied=new Set();
  globalThis.messages=[];log=s=>messages.push(s);
  globalThis.gem=()=>makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,'spell_cairn');
  globalThis.load=(idx,id)=>ArtifactGeomancy.activate(idx,{op:'load',scrollReplayId:id});
  globalThis.release=idx=>ArtifactGeomancy.activate(idx,{op:'release'});
  globalThis.anchor={x:player.x,y:player.y,z:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave};`)
 run(`player.inventory=[gem(),createItem('scrollOfFear',{count:2}),createItem('scrollOfDeathShield')];
  ensureReplayItemIds();globalThis.fearId=player.inventory[1].replayId;
  globalThis.shieldId=player.inventory[2].replayId;`)
 assert.equal(run('load(0,fearId)'),true)
 assert.equal(run('turnCount'),101)
 assert.equal(run('ArtifactGeomancy.cooldownRemaining("spell_cairn")'),0)
 assert.equal(run('load(0,shieldId)'),true)
 assert.deepEqual(copy('player.inventory[0].geomancyCairn.map(p=>p.kind)'),['scrollOfFear','scrollOfDeathShield'])
 context.saved=copy('buildSaveObject()')
 run('loadGameFromObject(structuredClone(saved),{isReplayInit:true})')
 assert.equal(await run('release(0)'),true)
 assert.equal(run('turnCount'),103)
 assert.equal(run('player.deathShieldReady'),true)
 assert.equal(run('player.inventory[0].geomancyCairn.length'),0)
 assert.equal(run('ArtifactGeomancy.cooldownRemaining("spell_cairn")'),499)
 run(`player.inventory.push(createItem('scrollOfFear'));
  ensureReplayItemIds();globalThis.extraId=player.inventory.at(-1).replayId;`)
 assert.equal(run('load(0,extraId)'),true,'loading allowed on cooldown')
 assert.equal(run('player.inventory[0].geomancyCairn.length'),1)
 run(`player.inventory=[gem(),createItem('wayfaringscroll',{destination:anchor}),
  createItem('homecomingscroll',{count:2})];ensureReplayItemIds();
  globalThis.wayId=player.inventory[1].replayId;
  globalThis.homeId=player.inventory[2].replayId;`)
 assert.equal(run('load(0,wayId)'),true)
 assert.equal(run('ArtifactGeomancy.boundCairn(player.inventory[0])'),true)
 assert.equal(run('player.inventory.some(i=>i.kind==="wayfaringscroll")'),false)
 assert.equal(run('ArtifactGeomancy.compatibleCairnScrolls(player.inventory[0]).some(i=>i.kind==="homecomingscroll")'),false)
 assert.equal(run('canDropInventoryItem(player.inventory[0])'),false)
 assert.equal(run('ArtifactGeomancy.carriedWayfaring().payload.destination.x'),run('anchor.x'))
 run(`player.inventory.push(gem());ensureReplayItemIds();
  globalThis.secondIndex=player.inventory.findIndex((i,k)=>k>0&&i.abilityId==='spell_cairn');
  player.wayfaring.cooldowns.spell_cairn=0;`)
 assert.equal(run('load(secondIndex,homeId)'),true)
 run('player.wayfaring.cooldowns.spell_cairn=0;player.x=anchor.x+3;player.y=anchor.y+2;')
 const stored=copy('ArtifactGeomancy.carriedWayfaring().payload.destination')
 assert.equal(await run('release(secondIndex)'),true)
 assert.deepEqual(copy('ArtifactGeomancy.carriedWayfaring().payload.destination'),stored)
 assert.equal(run('player.inventory.filter(i=>i.kind==="wayfaringscroll").length'),0)
 context.travelSaved=copy('buildSaveObject()')
 run('loadGameFromObject(structuredClone(travelSaved),{isReplayInit:true})')
 assert.deepEqual(copy('ArtifactGeomancy.carriedWayfaring().payload.destination'),stored)
 run(`player.wayfaring.cooldowns.spell_cairn=0;
  player.inventory=[gem()];player.inventory[0].geomancyCairn=[{kind:'scrollOfDeathShield'},{kind:'scrollOfFear'}];
  player.deathShieldReady=true;`)
 const blockedBefore=copy('player.inventory[0].geomancyCairn'),turnBefore=run('turnCount')
 assert.equal(await run('release(0)'),false,'blocked first payload')
 assert.deepEqual(copy('player.inventory[0].geomancyCairn'),blockedBefore)
 assert.equal(run('turnCount'),turnBefore)
 assert.equal(run('ArtifactGeomancy.cooldownRemaining("spell_cairn")'),0)
 context.invalid=copy('buildSaveObject()')
 context.invalid.player.inventory[0].geomancyCairn=[{kind:'wayfaringscroll',destination:stored}]
 context.invalid.player.inventory.push({...context.invalid.player.inventory[0],replayId:'second'})
 assert.throws(()=>run('loadGameFromObject(invalid,{isReplayInit:true})'),/Duplicate Scroll of Wayfaring/)
 // A successful first spell must not discard the blocked second payload.
 run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
  replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
  player.wayfaring=ArtifactWayfaring.freshState();turnCount=150;
  currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set();groundItems=[];
  player.inventory=[gem(),createItem('scrollOfFear'),createItem('scrollOfDeathShield')];
  player.deathShieldReady=true;ensureReplayItemIds();
  globalThis.pFear=player.inventory[1].replayId;
  globalThis.pShield=player.inventory[2].replayId;`)
 assert.equal(run('load(0,pFear)'),true)
 assert.equal(run('load(0,pShield)'),true)
 const partialBefore=run('turnCount')
 assert.equal(await run('release(0)'),true,'first Fear succeeds even when Death Shield is blocked')
 assert.deepEqual(copy('player.inventory[0].geomancyCairn.map(p=>p.kind)'),['scrollOfDeathShield'])
 assert.equal(run('turnCount'),partialBefore+1,'partial release spends exactly one turn')
 assert.equal(run('ArtifactGeomancy.cooldownRemaining("spell_cairn")'),499)
 assert.equal(run('player.deathShieldReady'),true)
 context.partialSaved=copy('buildSaveObject()')
 run('loadGameFromObject(structuredClone(partialSaved),{isReplayInit:true})')
 assert.deepEqual(copy('player.inventory[0].geomancyCairn.map(p=>p.kind)'),['scrollOfDeathShield'],
   'blocked second payload survives save/load')
 // A complete load -> release action sequence must match deterministic playback.
 run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
  replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
  player.wayfaring=ArtifactWayfaring.freshState();turnCount=200;
  enemies=[];occupied=new Set();npcs=[];groundItems=[];
  player.inventory=[gem(),createItem('scrollOfFear'),createItem('scrollOfDeathShield')];
  ensureReplayItemIds();startReplayRecording();
  globalThis.rid1=player.inventory[1].replayId;
  globalThis.rid2=player.inventory[2].replayId;`)
 assert.equal(run('load(0,rid1)'),true)
 assert.equal(run('load(0,rid2)'),true)
 assert.equal(await run('release(0)'),true)
 const expected=copy('({turnCount,slots:player.inventory[0].geomancyCairn,cd:ArtifactGeomancy.cooldownRemaining("spell_cairn"),rngState})')
 context.replay=copy('structuredClone(replayData)')
 assert.deepEqual(context.replay.actions.map(a=>a.action),['geomancyPower','geomancyPower','geomancyPower'])
 run(`replayRecording=false;loadGameFromObject(structuredClone(replay.initialState),{isReplayInit:true});
  activeReplay=replay;replayRngIndex=0;replayPlaying=true;
  replaySimulationMode=true;replayAnimationsDisabled=true;`)
 for(let i=0;i<context.replay.actions.length;i++){
   context.action=context.replay.actions[i]
   await run('runReplayAction(action)')
 }
 const reproduced=copy('({turnCount,slots:player.inventory[0].geomancyCairn,cd:ArtifactGeomancy.cooldownRemaining("spell_cairn"),rngState})')
 assert.deepEqual(reproduced,expected,'cairn should replay load + double release exactly')
 assert.equal(run('replayRngIndex'),context.replay.rng.length)
 console.log('PASS Spell Cairn two-slot load/release, cooldown, bound Wayfaring, Homecoming, saves')
})().catch(e=>{console.error(e);process.exitCode=1})
