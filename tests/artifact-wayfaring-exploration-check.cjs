'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const eq=(code,val,msg)=>assert.deepEqual(JSON.parse(JSON.stringify(run(code))),val,msg)
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});log=()=>{};
    replayRecording=false;replayAnimationsDisabled=true;enemies=[];npcs=[];groundItems=[];occupied=new Set();
    player.inventory=[];player.equip={weapon:null,shield:null,armor:null};player.race='elf';
    player.hp=50;player.maxHp=200;player.lvl=1;player.godMode=false;player.poisonTurns=0;player.berryRegenTurns=0;
    currentZ=0;map=surfaceMap;player.x=40;player.y=40;turnCount=0;
    for(let y=29;y<=52;y++)for(let x=29;x<=52;x++)map[y][x]='grass';
    discovered.forEach(row=>row.fill(false));player.wayfaring=ArtifactWayfaring.freshState();
    globalThis.sample=id=>makeArtifactTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    globalThis.clean=()=>{player.wayfaring=ArtifactWayfaring.freshState();player.inventory=[];player.hp=50;player.maxHp=200;player.lvl=1;player.xp=0;player.totalXpEarned=0;player.lastTempleHealXp=0;player.race='elf';player.berryRegenTurns=0;player.campRestProgress=0;turnCount=0;currentZ=0;map=surfaceMap;player.x=40;player.y=40;player.godMode=false};`)
  eq('discoverPlayerSight("arrival")',197,'fixed circular radius 8')
  eq('discovered[40][48]',true);eq('discovered[40][49]',false);eq('discovered[48][48]',false)
  eq('discoverPlayerSight()',0)
  run(`const originalFog=JSON.stringify(discovered);const originalOtherFog=JSON.stringify(undergroundDiscoveredL1);useGodModeKey()`)
  eq('JSON.stringify(discovered)===originalFog && JSON.stringify(undergroundDiscoveredL1)===originalOtherFog',true)
  eq('exploredMapLevels().some(l=>l.key==="chain:1")',true)
  run('useGodModeKey(true)');eq('JSON.stringify(discovered)===originalFog',true)
  run(`clean();player.inventory=[sample('pilgrim')];tryTempleHeal()`)
  eq('player.hp',120);run(`player.hp=50;player.inventory.push(sample('exile'));tryTempleHeal()`);eq('player.hp',50)
  run(`player.inventory=[sample('pilgrim')];player.hp=50;ArtifactWayfaring.discover(699);ArtifactWayfaring.discover(700,'farsight')`)
  eq('player.wayfaring.pilgrimTiles',699);eq('player.totalXpEarned',0)
  run(`globalThis.rewardLogs=[];log=msg=>rewardLogs.push(msg);ArtifactWayfaring.discover(3)`)
  eq('player.wayfaring.pilgrimTiles',2);eq('player.totalXpEarned',30);eq('player.hp',70)
  eq(`rewardLogs.slice(0,2)`,['Pilgrim rewards your exploration: +20 HP.','You gain 30 XP.'])
  run(`rewardLogs.length=0;player.hp=195;player.inventory[0].identified=false;ArtifactWayfaring.discover(700)`)
  eq('player.hp',200);eq(`rewardLogs.slice(0,2)`,['A strange power rewards your exploration: +5 HP.','You gain 30 XP.']);eq(`rewardLogs[2].startsWith('You reached Level 2!')`,true)
  run(`rewardLogs.length=0;player.hp=playerMaxHp();ArtifactWayfaring.discover(700)`)
  eq(`rewardLogs.includes('A strange power rewards your exploration.')`,true)
  eq(`rewardLogs.some(msg=>msg.includes('+0 HP'))`,false)
  run('log=()=>{}')
  run(`clean();player.inventory=[sample('trailblazer')];globalThis.rngBefore=rngState;ArtifactWayfaring.discover(20)`)
  eq('rngState===rngBefore',true);eq('player.wayfaring.cooldowns',{})
  // Future activations are not shipped in Batch B. Inject a temporary definition to exercise their registry.
  run(`ARTIFACT_ABILITIES.domains.wayfaring.push('test_rush','test_blink');
    ARTIFACT_ABILITIES.abilities.test_rush={cooldown:500};ARTIFACT_ABILITIES.abilities.test_blink={cooldown:500};
    ArtifactWayfaring.startCooldown('test_rush');ArtifactWayfaring.startCooldown('test_blink');ArtifactWayfaring.discover(6)`)
  eq('ArtifactWayfaring.cooldownRemaining("test_rush")',499);eq('ArtifactWayfaring.cooldownRemaining("test_blink")',499);eq('player.wayfaring.trailblazerTiles',1)
  run(`player.equip.weapon={mod:'xp',xpBonus:20};player.equip.armor={mod:'xp',xpBonus:10};globalThis.rolls=[];globalThis.realChance=chance;chance=p=>{rolls.push(p);return true};ArtifactWayfaring.discover(4);chance=realChance;player.equip={weapon:null,shield:null,armor:null}`)
  eq('rolls.length',1);assert(Math.abs(run('rolls[0]')-.3)<1e-8);eq('ArtifactWayfaring.cooldownRemaining("test_rush")',497)
  run(`ARTIFACT_ABILITIES.domains.wayfaring.splice(-2);delete ARTIFACT_ABILITIES.abilities.test_rush;delete ARTIFACT_ABILITIES.abilities.test_blink;clean();currentZ=-1;ArtifactWayfaring.visitDepth();player.inventory=[sample('expedition')];ArtifactWayfaring.visitDepth()`)
  eq('player.totalXpEarned',0)
  run('rewardLogs.length=0;log=msg=>rewardLogs.push(msg);currentZ=-3;ArtifactWayfaring.visitDepth()')
  eq('player.totalXpEarned',100);eq('player.hp',100);eq('player.wayfaring.visitedZ',[-1,-3])
  eq('rewardLogs.slice(0,2)',['Expedition rewards your descent.','You gain 100 XP.'])
  eq(`rewardLogs[2].startsWith('You reached Level 2!')`,true)
  run('rewardLogs.length=0;currentZ=-1;ArtifactWayfaring.visitDepth()');eq('player.totalXpEarned',100);eq('rewardLogs',[])
  run(`player.inventory[0].identified=false;player.equip.weapon={mod:'xp',xpBonus:20};currentZ=-4;ArtifactWayfaring.visitDepth()`)
  eq('player.totalXpEarned',220);eq('rewardLogs.slice(0,2)',['A strange power rewards your descent.','You gain 120 XP.'])
  run('log=()=>{};player.equip.weapon=null')
  run(`clean();player.inventory=[sample('prospector')];player.mining=10;globalThis.mineDepth=chainDepthForZ(-9);deepLevels[mineDepth-2]={kind:'dwarvenMines'};currentZ=chainZForDepth(mineDepth);ArtifactWayfaring.visitDepth()`)
  assert(run('mineDepth>=2'));eq('ArtifactWayfaring.effectiveMining()',35);eq('player.mining',10)
  run('turnCount=99');eq('ArtifactWayfaring.effectiveMining()',35);run('turnCount=100');eq('ArtifactWayfaring.effectiveMining()',10)
  run('currentZ=0;ArtifactWayfaring.visitDepth();currentZ=chainZForDepth(mineDepth);ArtifactWayfaring.visitDepth()');eq('ArtifactWayfaring.effectiveMining()',10)
  run('deepLevels.length=fixture.deepLevels.length')
  run(`clean();player.inventory=[sample('firekeeper')];globalThis.fire={kind:'campfire',level:0,x:40,y:41,burnUntil:50};groundItems=[fire];player.hp=30;Campfires.perform(fire,'rest');Campfires.perform(fire,'rest')`)
  eq('player.hp',31,'food-free rest in two turns')
  run(`clean();player.inventory=[sample('endurance')];for(let i=0;i<19;i++){ArtifactWayfaring.ordinaryStep();ArtifactWayfaring.finishTurn()}`)
  eq('player.wayfaring.enduranceSteps',19);eq('player.hp',50);run('ArtifactWayfaring.ordinaryStep();artifactLosePlayerHp(1);ArtifactWayfaring.finishTurn()');eq('player.wayfaring.enduranceSteps',0)
  run('for(let i=0;i<20;i++){ArtifactWayfaring.ordinaryStep();ArtifactWayfaring.finishTurn()}');eq('player.hp',51)
  run(`clean();player.inventory=[sample('nomads_curse')];player.berryRegenTurns=20;turnCount=5;Campfires.tickFood()`);eq('player.hp',50);eq('player.berryRegenTurns',19)
  run('ArtifactWayfaring.discover(1);ArtifactWayfaring.finishTurn();turnCount=10;Campfires.tickFood()');eq('player.hp',52);eq('player.berryRegenTurns',18)
  run('ArtifactWayfaring.finishTurn();turnCount=15;Campfires.tickFood()');eq('player.hp',52)
  // Replay real walking with carried Endurance and Pilgrim; intentionally render no frames.
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;log=()=>{};
    player.inventory=[sample('pilgrim'),sample('endurance')];player.hp=30;player.maxHp=100;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();map=surfaceMap;currentZ=0;player.x=40;player.y=40;
    for(let y=25;y<=55;y++)for(let x=25;x<=80;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
    player.wayfaring=ArtifactWayfaring.freshState();discovered.forEach(row=>row.fill(false));discoverPlayerSight('arrival');player.wayfaring.pilgrimTiles=680;startReplayRecording()`)
  eq('discoverPlayerSight()',0,'already discovered sight cannot advance Pilgrim')
  eq('player.wayfaring.pilgrimTiles',680)
  for(let i=0;i<22;i++)await run('tryMove(1,0)')
  assert(run('player.totalXpEarned')>=30,'real walking across new terrain triggers Pilgrim')
  const snapshot=JSON.parse(JSON.stringify(run('replayData')))
  assert.equal(snapshot.actions.length,22)
  const end=run('JSON.stringify({state:player.wayfaring,hp:player.hp,xp:player.totalXpEarned,seen:encodeBoolGrid(discovered),x:player.x,turn:turnCount,rng:rngState})')
  context.recorded=snapshot;run('globalThis.savedB=structuredClone(buildSaveObject());loadGameFromObject(savedB,{isReplayInit:true})')
  eq('JSON.stringify({state:player.wayfaring,hp:player.hp,xp:player.totalXpEarned,seen:encodeBoolGrid(discovered),x:player.x,turn:turnCount,rng:rngState})',end)
  run('loadGameFromObject(structuredClone(recorded.initialState),{isReplayInit:true});activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=true')
  for(const action of snapshot.actions)await run(`runReplayAction(${JSON.stringify(action)})`)
  eq('JSON.stringify({state:player.wayfaring,hp:player.hp,xp:player.totalXpEarned,seen:encodeBoolGrid(discovered),x:player.x,turn:turnCount,rng:rngState})',end)
  eq('replayRngIndex',snapshot.rng.length)
  console.log('PASS Batch B: exploration, all seven powers, cooldown registry, God overlay, save and walking replay')
})().catch(e=>{console.error(e);process.exitCode=1})
