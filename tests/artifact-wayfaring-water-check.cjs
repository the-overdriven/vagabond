'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const eq=(code,val,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(run(code))),val,msg)
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`globalThis.cleanE=()=>{loadGameFromObject(structuredClone(fixture),{isReplayInit:true});log=()=>{};
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();player.inventory=[];player.equip={weapon:null,shield:null,armor:null};
    player.race='human';player.hp=200;player.maxHp=200;player.swimming=0;player.godMode=false;player.invisibleTurns=0;
    player.rootTurns=0;player.poisonTurns=0;player.berserkTurns=0;currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;
    resetSwimming();player.wayfaring=ArtifactWayfaring.freshState();
    for(let y=25;y<=55;y++)for(let x=25;x<=55;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
    discovered.forEach(r=>r.fill(false));discoverPlayerSight('arrival');
    globalThis.sampleE=id=>makeArtifactTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    };cleanE();globalThis.actualPhase=resolveEnemyPhase;resolveEnemyPhase=()=>{}`)
  // Non-swimmer can cross water; normal actions use the same reserve, no practice.
  run(`player.inventory=[sampleE('water_walking'),createItem('herb')];map[40][41]='water';map[40][42]='water'`)
  eq('isWalkableForPlayer(41,40)',true);await run('tryMove(1,0)');eq('player.x',41)
  eq('isActuallySwimming()',false);eq('ArtifactWayfaring.waterRemaining()',7);eq('player.swimTurns',0);eq('canUseItemsWhileSwimming()',true)
  eq('playerTerrainEffects().speed',0);run('useHerb(1)');eq('ArtifactWayfaring.waterRemaining()',6)
  for(let i=0;i<6;i++)await run('skipTurn()')
  eq('ArtifactWayfaring.waterRemaining()',0);eq('isActuallySwimming()',true);eq('canUseItemsWhileSwimming()',false)
  eq('player.swimmingPractice',0);eq('player.hp',200)
  await run('skipTurn()');eq('player.hp',190);eq('isDrowning()',true)
  await run('tryMove(-1,0)');eq('ArtifactWayfaring.waterRemaining()',8);eq('isDrowning()',false)
  // Auto-path must not exceed the remaining reserve or learned endurance.
  run(`cleanE();player.inventory=[sampleE('water_walking')];for(let y=35;y<=45;y++)for(let x=35;x<=55;x++)map[y][x]='mountain';
    map[40][40]='grass';for(let x=41;x<=48;x++)map[40][x]='water';map[40][49]='grass';`)
  eq('findPlayerPath(49,40)?.length',9);run(`map[40][49]='water';map[40][50]='grass'`);eq('findPlayerPath(50,40)',null)
  run(`player.swimming=1`);eq('findPlayerPath(50,40)?.length',10)
  // Rush has one world turn even when charging several deep water steps.
  run(`cleanE();player.inventory=[sampleE('rush'),sampleE('water_walking')];for(let x=41;x<=44;x++)map[40][x]='water';ArtifactWayfaring.activate(0)`)
  for(let i=0;i<4;i++)eq('ArtifactWayfaring.rushStep(1,0)',true)
  eq('turnCount',1);eq('ArtifactWayfaring.waterRemaining()',7);eq('player.swimTurns',0)
  // Emberwalker pays per lava tile, no extra fee on the entry turn. God Mode does not protect it.
  run(`cleanE();player.godMode=true;player.inventory=[sampleE('emberwalker'),sampleE('rush')];for(let x=41;x<=44;x++)map[40][x]='lava';`)
  eq('isWalkableForPlayer(41,40)',true);await run('tryMove(1,0)');eq('player.hp',190);await run('skipTurn()');eq('player.hp',180)
  eq('ArtifactWayfaring.activate(1)',true);eq('ArtifactWayfaring.rushStep(1,0)',true);eq('player.hp',170)
  run('globalThis.mid=structuredClone(buildSaveObject());loadGameFromObject(mid,{isReplayInit:true})');eq('player.wayfaring.lavaPaid',true)
  eq('ArtifactWayfaring.rushStep(1,0)',true);eq('ArtifactWayfaring.rushStep(1,0)',true);eq('ArtifactWayfaring.finishRush()',true);eq('player.hp',150)
  run(`player.inventory.push(sampleE('ashen_wanderer'));`);await run('skipTurn()');eq('player.hp',150)
  eq('artifactIsCursed(sampleE("ashen_wanderer"))',true)
  // Real swimming even in God Mode or for Merlings; walking on water avoids the curse.
  run(`cleanE();player.race='merling';player.godMode=true;player.inventory=[sampleE('ashen_wanderer')];map[40][41]='water'`)
  await run('tryMove(1,0)');eq('player.hp',196);run(`carryItem(sampleE('water_walking'))`);await run('skipTurn()');eq('player.hp',196)
  // Fatal damage while swimming, even when Death Shield is ready. The destination is same Z.
  run(`cleanE();player.inventory=[sampleE('castaway'),sampleE('exile')];player.swimming=30;map[40][40]='water';player.deathShieldReady=true;player.hp=0;globalThis.safeShore=drowningShore(true)`)
  eq('absorbPlayerFatalDamage()',true);eq('player.hp',7);eq('currentZ',0);eq('player.x===safeShore.x&&player.y===safeShore.y',true);eq('player.deathShieldReady',true);eq('player.wayfaring.castawaySpent',true)
  run(`globalThis.savedE=structuredClone(buildSaveObject());loadGameFromObject(savedE,{isReplayInit:true})`);eq('player.wayfaring.castawaySpent',true)
  run(`tryTempleHeal()`);eq('player.wayfaring.castawaySpent',false);eq('player.hp',7)
  run(`cleanE();player.race='merling';player.inventory=[sampleE('castaway')];map[40][40]='water';player.hp=0`);eq('absorbPlayerFatalDamage()',true);eq('player.hp',21)
  // A real melee hit can trigger rescue; the attacker cannot follow through with knockback.
  run(`cleanE();player.inventory=[sampleE('castaway')];map[40][40]='water';player.hp=1;player.deathShieldReady=true;
    globalThis.realChance=chance;chance=()=>false;globalThis.foe=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,baseName:'Goblin',x:41,y:40,level:0,alive:true,hp:300,maxHp:300,atk:100,aware:true,equipment:null,abilities:['knockback']});occupied.add(keyXY(41,40));enemyAttackPlayer(foe,true);chance=realChance`)
  eq('player.wayfaring.castawaySpent',true);eq('player.hp',1);eq('player.deathShieldReady',true);eq('isActuallySwimming()',false)
  // Actual HP loss feeds existing pain-based gear even in God Mode.
  run(`cleanE();player.inventory=[sampleE('emberwalker')];player.equip.weapon={kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Test',identified:true,abilityId:'retribution',atk:1,grace:1};map[40][41]='lava';player.artifactRetributionStored=0`)
  await run('tryMove(1,0)');eq('player.artifactRetributionStored',10)
  // No legal shore leaves Castaway available and falls back to Death Shield.
  run(`cleanE();player.inventory=[sampleE('castaway')];for(let y=39;y<=41;y++)for(let x=39;x<=41;x++)map[y][x]='mountain';map[40][40]='water';player.hp=0;player.deathShieldReady=true`)
  eq('absorbPlayerFatalDamage()',true);eq('player.hp',1);eq('player.wayfaring.castawaySpent',false);eq('player.deathShieldReady',false)
  // Record and replay a real water/lava route with both mechanics and actual enemy phases.
  run(`cleanE();resolveEnemyPhase=actualPhase;player.inventory=[sampleE('water_walking'),sampleE('emberwalker')];map[40][41]='water';map[40][42]='lava';startReplayRecording()`)
  await run('tryMove(1,0)');await run('skipTurn()');await run('tryMove(1,0)');await run('skipTurn()');await run('tryMove(1,0)')
  const end=run('JSON.stringify({x:player.x,y:player.y,hp:player.hp,turn:turnCount,state:player.wayfaring})');context.recorded=JSON.parse(JSON.stringify(run('replayData')))
  run('loadGameFromObject(structuredClone(recorded.initialState),{isReplayInit:true});activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=true')
  for(const action of context.recorded.actions)await run(`runReplayAction(${JSON.stringify(action)})`)
  eq('JSON.stringify({x:player.x,y:player.y,hp:player.hp,turn:turnCount,state:player.wayfaring})',end)
  eq('replayRngIndex',context.recorded.rng.length)
  run(`cleanE();player.godArtifactStockGranted=false;grantGodArtifactStock()`)
  for(const id of ['water_walking','emberwalker','ashen_wanderer','castaway'])eq(`merchantStock.filter(i=>i.godTestArtifact&&i.abilityId==='${id}').length`,1)
  console.log('PASS Batch E: water turns, path budget, rush, lava, Ashen, Castaway, save and replay')
})().catch(err=>{console.error(err);process.exitCode=1})
