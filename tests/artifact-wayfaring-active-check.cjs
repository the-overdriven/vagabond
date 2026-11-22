'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const eq=(code,val,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(run(code))),val,msg)
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`globalThis.cleanD=()=>{loadGameFromObject(structuredClone(fixture),{isReplayInit:true});log=()=>{};
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();player.inventory=[];player.equip={weapon:null,shield:null,armor:null};
    player.race='human';player.hp=200;player.maxHp=200;player.baseAtk=10;player.swimming=10;player.godMode=false;player.invisibleTurns=0;
    player.rootTurns=0;player.poisonTurns=0;player.berserkTurns=0;currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;
    for(let y=25;y<=55;y++)for(let x=25;x<=55;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
    player.wayfaring=ArtifactWayfaring.freshState();discovered.forEach(r=>r.fill(false));discoverPlayerSight('arrival');
    globalThis.sampleD=id=>makeWayfaringTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    globalThis.foeD=(name,x,y)=>{const t=ENEMY_TEMPLATE_BY_NAME[name];const e=addEnemy({...t,baseName:name,x,y,level:0,alive:true,hp:300,maxHp:300,aware:true,equipment:null,homeX:x,homeY:y,homeTileType:'grass'});occupied.add(keyXY(x,y));return e};
    };cleanD();globalThis.originalChance=chance;globalThis.actualPhase=resolveEnemyPhase;globalThis.phaseCalls=0;resolveEnemyPhase=()=>{phaseCalls++}`)
  run(`player.inventory=[sampleD('rush')];player.inventory[0].identified=false`)
  eq('ArtifactWayfaring.activate(0)',false);eq('turnCount',0)
  run(`player.inventory[0].identified=true;player.rootTurns=2`)
  eq('ArtifactWayfaring.activate(0)',false);run('player.rootTurns=0')
  eq('ArtifactWayfaring.activate(0)',true);eq('ArtifactWayfaring.rushRemaining()',4);assert(await run('skipTurn()'));eq('ArtifactWayfaring.rushRemaining()',0);eq('turnCount',0);eq('ArtifactWayfaring.cooldownRemaining("rush")',0)
  eq('ArtifactWayfaring.activate(0)',true)
  run(`map[40][41]='cavewall'`);eq('ArtifactWayfaring.rushStep(1,0)',false);eq('player.wayfaring.rush.steps',0)
  run(`map[40][41]='grass';player.poisonTurns=2;player.wayfaring.longstriderThreshold=5`)
  assert(await run('tryMove(1,0)'));eq('player.x',41);eq('turnCount',0);eq('player.poisonTurns',2);eq('ArtifactWayfaring.rushRemaining()',3)
  assert(await run('tryMove(0,1)'));eq('player.y',41);eq('turnCount',0);eq('ArtifactWayfaring.rushRemaining()',2);eq('startPlannedAutoPath([{x:42,y:41}])',false)
  run('globalThis.mid=structuredClone(buildSaveObject());loadGameFromObject(mid,{isReplayInit:true})');eq('player.wayfaring.rush.steps',2)
  eq('ArtifactWayfaring.rushStep(1,0)',true);eq('ArtifactWayfaring.rushStep(0,1)',true)
  eq('player.wayfaring.rush',null);eq('turnCount',1);eq('phaseCalls',1);eq('player.poisonTurns',1);eq('ArtifactWayfaring.cooldownRemaining("rush")',499)
  eq('player.wayfaring.history.map(p=>[p.turn,p.x,p.y])',[[0,40,40],[1,42,42]])
  run(`player.inventory.push(sampleD('rush'))`);eq('ArtifactWayfaring.activate(1)',false)
  // A trap interrupts immediately without another opportunity to choose steps.
  run(`cleanD();player.inventory=[sampleD('rush')];globalThis.originalTrigger=DungeonTraps.isTrigger;DungeonTraps.isTrigger=()=>true;ArtifactWayfaring.activate(0)`)
  eq('ArtifactWayfaring.rushStep(1,0)',true);eq('player.wayfaring.rush',null);eq('turnCount',1);run('DungeonTraps.isTrigger=originalTrigger')
  // Blink uses strict connected terrain even in God Mode and does not consume a turn on failure.
  run(`cleanD();player.inventory=[sampleD('blink')];player.godMode=true;
    for(let y=25;y<=55;y++)for(let x=25;x<=55;x++)map[y][x]='cavewall';map[40][40]='grass';map[40][42]='grass'`)
  eq('ArtifactWayfaring.activate(0)',false);eq('turnCount',0);eq('ArtifactWayfaring.cooldownRemaining("blink")',0)
  run(`map[40][41]='grass';player.rootTurns=3;player.godMode=false`)
  eq('ArtifactWayfaring.blinkTargets().map(p=>[p.x,p.y,p.steps])',[[41,40,1],[42,40,2]])
  eq('ArtifactWayfaring.activate(0)',true);eq('currentZ',0);eq('turnCount',1);assert(run('player.x===41||player.x===42'))
  // Backtrack samples completed turns, including waits; refuses wrong map or occupied target.
  run(`cleanD();player.inventory=[sampleD('backtrack')];player.hp=100`)
  await run('tryMove(1,0)');await run('skipTurn()');await run('tryMove(1,0)')
  eq('ArtifactWayfaring.backtrackTarget().x',40);run(`player.wayfaring.history[0].kind='crypt2'`);eq('ArtifactWayfaring.activate(0)',false)
  run(`player.wayfaring.history[0].kind='surface';occupied.add(keyXY(40,40))`);eq('ArtifactWayfaring.activate(0)',false)
  run(`occupied.delete(keyXY(40,40));player.rootTurns=3;player.hp=73`)
  eq('ArtifactWayfaring.activate(0)',true);eq('player.x',40);eq('player.hp',73);eq('turnCount',4)
  // Phantom redirects melee, ranged, and debuffs; true sight does not roll.
  run(`cleanD();player.inventory=[sampleD('phantom_trail')];globalThis.foe=foeD('Goblin',41,40);foe.abilities=[];chance=()=>true;
    player.wayfaring.phantom={x:40,y:41,z:0,kind:'surface',until:5};globalThis.baseHp=player.hp;enemyAttackPlayer(foe)`)
  eq('player.hp===baseHp',true);eq('player.wayfaring.phantomSurprise.includes(foe.id)',true)
  eq('ArtifactWayfaring.takeSurprise(foe)',true);eq('ArtifactWayfaring.takeSurprise(foe)',false)
  run(`foe.abilities=['trueSight'];globalThis.rolls=0;chance=()=>{rolls++;return true}`);eq('ArtifactWayfaring.divert(foe,1)',null);eq('rolls',0)
  run(`foe.abilities=[];chance=()=>true;globalThis.mark=ArtifactWayfaring.divert(foe,5,true)`);eq('!!mark',true)
  run(`player.equip.weapon={kind:'artifact',artifactSlot:'weapon',abilityId:'shadow_strike',identified:true};`)
  assert(Math.abs(run('playerCriticalHitChance(foe,{phantom:true})')-.15)<1e-8)
  eq('artifactPlayerStrikeMultiplier({melee:true,phantom:true})',1.25);eq('artifactPlayerStrikeMultiplier({melee:true,phantom:true,invisible:true})',1.5)
  run(`foe.abilities=['weaken'];player.weakenTurns=0;chance=()=>true`);eq('tryEnemySpell(foe)',true);eq('player.weakenTurns',0)
  run(`player.equip.weapon=null;foe.abilities=[];player.wayfaring.phantomSurprise=[];enemyRangedAttackPlayer(foe,null,DEATH_BOLT_CONFIG)`)
  eq('player.hp===baseHp',true);eq('player.wayfaring.phantomSurprise.includes(foe.id)',true)
  // The illusion starts under the player, stays behind, and distracts a pursuing
  // enemy even when the player is no longer in melee range.
  run(`cleanD();player.inventory=[sampleD('phantom_trail')];chance=()=>true`)
  eq('ArtifactWayfaring.activate(0)',true)
  eq('ArtifactWayfaring.phantomPosition()', {x:40,y:40,z:0,kind:'surface',until:8})
  run(`globalThis.foe=foeD('Goblin',39,40);foe.abilities=[];foe.aggro=4`)
  eq('ArtifactWayfaring.divert(foe,1)',null)
  run(`player.x=41;player.y=40;foe.aware=true;foe.alarmed=true;globalThis.oldHp=player.hp`)
  eq('ArtifactWayfaring.distractPursuer(foe)',true)
  eq('player.hp',200);eq('foe.x',39);eq('ArtifactWayfaring.takeSurprise(foe)',true)
  run(`foe.abilities=['trueSight']`);eq('ArtifactWayfaring.distractPursuer(foe)',false)
  run(`foe.abilities=[];chance=()=>false`);eq('ArtifactWayfaring.distractPursuer(foe)',false)
  // Test the real pursuit phase, not just its helper. A slower player cannot
  // cause the speed-based disengagement branch to swallow the decoy attack.
  run(`foe.aware=true;foe.alarmed=true;foe.spd=30;chance=p=>p===0.5;actualPhase(null,null,false)`)
  eq('ArtifactWayfaring.takeSurprise(foe)',true);eq('foe.x',39)
  // Ranged pursuit wastes actual ammo at the old position.
  run(`foe.x=38;foe.shooterAbility='shooterArrows';foe.shooterMode='ranged';foe.shotsRemaining=3;rebuildActiveLevelOccupancy();chance=()=>true`)
  eq('ArtifactWayfaring.distractPursuer(foe)',true);eq('foe.shotsRemaining',2)
  eq('ArtifactWayfaring.takeSurprise(foe)',true)
  // Actual activation, expiry, and real record/playback (unmocked seeded RNG).
  run(`cleanD();resolveEnemyPhase=actualPhase;chance=originalChance;player.inventory=[sampleD('rush'),sampleD('blink'),sampleD('backtrack'),sampleD('phantom_trail'),sampleD('trailblazer')];startReplayRecording()`)
  eq('ArtifactWayfaring.activate(0)',true);eq('ArtifactWayfaring.rushStep(1,0)',true);eq('ArtifactWayfaring.rushStep(0,1)',true);eq('ArtifactWayfaring.finishRush()',true)
  await run('tryMove(1,0)');await run('tryMove(1,0)');eq('ArtifactWayfaring.activate(2)',true);eq('ArtifactWayfaring.activate(1)',true);eq('ArtifactWayfaring.activate(3)',true)
  assert(run('!!ArtifactWayfaring.phantomPosition()'));const snapshot=JSON.parse(JSON.stringify(run('buildSaveObject()')));context.snapshot=snapshot
  const end=run('JSON.stringify({x:player.x,y:player.y,hp:player.hp,turn:turnCount,state:player.wayfaring})');const recorded=JSON.parse(JSON.stringify(run('replayData')));context.recorded=recorded
  run('loadGameFromObject(structuredClone(snapshot),{isReplayInit:true})');eq('JSON.stringify({x:player.x,y:player.y,hp:player.hp,turn:turnCount,state:player.wayfaring})',end)
  run('loadGameFromObject(structuredClone(recorded.initialState),{isReplayInit:true});activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=true')
  for(const a of recorded.actions)await run(`runReplayAction(${JSON.stringify(a)})`)
  eq('JSON.stringify({x:player.x,y:player.y,hp:player.hp,turn:turnCount,state:player.wayfaring})',end);eq('replayRngIndex',recorded.rng.length)
  run(`replayPlaying=false;replaySimulationMode=false;for(let i=0;i<6;i++)enemyTurn()`);assert(run('!!ArtifactWayfaring.phantomPosition()'));run('enemyTurn()');eq('ArtifactWayfaring.phantomPosition()',null)
  run(`cleanD();player.godArtifactStockGranted=false;grantGodArtifactStock()`)
  for(const id of ['rush','blink','backtrack','phantom_trail'])eq(`merchantStock.filter(i=>i.godTestArtifact&&i.abilityId==='${id}').length`,1)
  console.log('PASS Batch D: active powers, legal targets, Rush and trap interruption, Phantom direct attacks, stock, mid-Rush save and replay')
})().catch(e=>{console.error(e);process.exitCode=1})
