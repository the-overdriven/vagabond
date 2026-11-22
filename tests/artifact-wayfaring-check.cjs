'use strict'
// Headless gameplay rules, deliberately independent of HUD and animation.
const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
const copy = x => JSON.parse(JSON.stringify(x))
const eq = (code, value, msg) => assert.deepEqual(copy(run(code)), value, msg)
;(async()=>{
  await run('loadContent()')
  context.fixture = require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true})
    globalThis.lines=[];log=(msg)=>lines.push(msg);replayAnimationsDisabled=true;
    replayRecording=false;replayPlaying=false;enemies=[];npcs=[];groundItems=[];occupied=new Set();
    player.inventory=[];player.equip={weapon:null,shield:null,armor:null};player.race='human';
    player.maxHp=100;player.hp=100;player.baseAtk=20;player.baseDef=20;player.baseSpd=10;
    player.baseMf=0;player.lvl=1;player.berserkTurns=0;player.weakenTurns=0;player.stoneSkinTurns=0;
    player.slowTurns=0;player.gazeTurns=0;player.mummyCurseTurns=0;player.speedPotionTurns=0;
    player.curseDebuffs=[];player.godMode=false;currentZ=0;map=surfaceMap;player.x=40;player.y=40;
    for(let y=38;y<=42;y++)for(let x=38;x<=45;x++)map[y][x]='grass';
    globalThis.specimen=(id,noun='Feather')=>makeWayfaringTrinket(noun,ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id);
    globalThis.originalStats={atk:playerAtk(),def:playerDef(),spd:playerSpd(),mf:playerMf(),hp:playerMaxHp()};`)
  const nouns='Feather Girdle Tippet Scarf Anklet Flint Sextant Shoehorn Adze Amphora Jug Rope Bridle Saddle'.split(' ')
  eq('eligibleArtifactTrinketNouns(3).slice().sort()',nouns.sort())
  for (const tier of [1,3,4,5]) {
    const items=copy(run(`Array.from({length:40},()=>makeArtifactItem(${tier},0,{nonGearOnly:true}))`))
    for (const item of items) {
      assert(nouns.includes(item.noun));assert.equal(item.identified,false)
      assert.deepEqual(item.bonuses,{});assert.equal(item.maxHpPct,0)
      assert(item.abilityId);assert(item.tier<=Math.max(3,tier))
      if (['drifter','exile','troglodyte'].includes(item.abilityId)) assert.equal(item.curse,null)
      if (item.abilityId==='drifter') assert(item.drifterMf>=8&&item.drifterMf<=15)
    }
  }
  // Old trinkets continue to contribute the saved stats without regeneration.
  run(`player.inventory=[{kind:'artifact',artifactSlot:'trinket',noun:'Amulet',bonuses:{atk:4,mf:3},maxHpPct:5}];`)
  eq('playerAtk()-originalStats.atk',4);eq('playerMf()-originalStats.mf',3);eq('playerMaxHp()',105)
  // Highlander replaces the normal hill DEF bonus, and does not stack.
  run(`player.inventory=[specimen('highlander'),specimen('highlander')];map[40][40]='hill'`)
  eq('playerDef()-originalStats.def',4);eq('playerSpd()',run('originalStats.spd'));eq('playerTerrainEffects().defense',4)
  run(`player.baseDef=100`);eq('playerTerrainEffects().defense',5);run('player.baseDef=20')
  run(`map[40][41]='hill';globalThis.foe={id:'downhill-test',name:'Goblin',level:0,x:41,y:40,alive:true,hp:50,maxHp:50};
    enemies=[foe];rebuildActiveLevelOccupancy()`)
  eq('pushEnemyFromPlayer(foe)',true);eq('foe.x',43)
  run(`foe.x=41;map[40][43]='cavewall';rebuildActiveLevelOccupancy()`)
  eq('pushEnemyFromPlayer(foe)',true);eq('foe.x',42)
  run(`map[40][43]='grass';map[40][42]='hill';foe.x=41;rebuildActiveLevelOccupancy()`)
  eq('pushEnemyFromPlayer(foe)',true);eq('foe.x',42)
  run(`enemies=[];player.inventory=[specimen('adrenaline')];map[40][40]='grass';player.hp=25`)
  eq('playerSpd()',run('originalStats.spd'));run('player.hp=24');eq('playerSpd()-originalStats.spd',3)
  for(const [spd, bonus] of [[4,2],[5,3],[10,3],[15,4],[30,5]]) {
    run(`player.baseSpd=${spd};player.inventory=[specimen('adrenaline'),specimen('adrenaline')]`)
    eq('playerSpd(true)',spd);eq('playerSpd()',spd+bonus)
  }
  run(`player.baseSpd=10;player.inventory=[specimen('adrenaline')];player.speedPotionTurns=1;player.speedPotionBonus=10`)
  eq('playerSpd()',23);eq('playerSpd(true)',10)
  run(`map[40][40]='hill'`);eq('playerSpd()',23+run('playerTerrainSpeed()'))
  run(`player.speedPotionTurns=0;map[40][40]='grass';player.slowTurns=1`)
  eq('playerSpd()',run('slowedCombatSpeed(13)'));run('player.slowTurns=0')
  run(`player.inventory=[specimen('permafrost')];player.hp=75;map[40][40]='snow';player.freezing={active:true,turns:3};tickFreezing()`)
  eq('player.freezing',{active:false,turns:0});eq('playerDef()-originalStats.def',3);eq('player.hp',75)
  for (const tile of ['ice','crackingice','frozenriver','taiga','water','river']) {
    run(`map[40][40]='${tile}';tileUnderlays[keyXY(40,40)]='snow'`)
    eq('playerDef()-originalStats.def',3,tile)
  }
  run(`map[40][40]='sand'`);eq('playerDef()-originalStats.def',-3)
  run(`player.inventory=[specimen('exile')];player.hp=25;player.poisonTurns=2;player.x=spawnPoint.x;player.y=spawnPoint.y;tryTempleHeal()`)
  eq('player.hp',25);eq('player.poisonTurns',0);eq('playerAtk()-originalStats.atk',0)
  run(`currentZ=-100;map=undergroundMap`);eq('playerAtk()-originalStats.atk',10)
  eq('playerPermanentStats().atk',run('originalStats.atk'))
  run(`player.inventory=[specimen('drifter'),specimen('drifter'),createItem('homecomingscroll')];globalThis.beforeTurn=turnCount;globalThis.beforeRng=rngState;useHomecomingScroll(2)`)
  eq('playerMf()-originalStats.mf',22);eq('turnCount',run('beforeTurn'));eq('rngState',run('beforeRng'));eq('player.inventory[2].kind','homecomingscroll')
  run(`player.inventory.splice(0,1);useHomecomingScroll(1)`);eq('turnCount',run('beforeTurn'));eq('playerMf()-originalStats.mf',11)
  run(`player.inventory.shift()`);eq('playerMf()',run('originalStats.mf'));eq('playerHasArtifactAbility("drifter")',false)
  // Exile and Drifter block even a berserker's scroll attempt before RNG,
  // without changing an existing bound return scroll or exposing hidden powers.
  run(`currentZ=0;map=surfaceMap;player.x=40;player.y=40;player.berserkTurns=2;
    globalThis.frenzyProbe=frenzyTargets;frenzyTargets=()=>[{}];
    player.inventory=[specimen('exile'),createItem('homecomingscroll',{count:2}),createItem('wayfaringscroll',{destination:{x:40,y:40,z:-1,levelKind:'chain',caveIndex:0}})];
    startReplayRecording();globalThis.blockedBefore=JSON.stringify(player.inventory);globalThis.blockedTurn=turnCount;globalThis.blockedRng=rngState;lines.length=0`)
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(1)')
  eq('lines.at(-1)','Exile prevents you from reading the Scroll of Homecoming.')
  eq('JSON.stringify(player.inventory)',run('blockedBefore'));eq('turnCount',run('blockedTurn'));eq('rngState',run('blockedRng'));eq('replayData.actions.length',0)
  run('player.inventory[0].identified=false;lines.length=0')
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(1)')
  eq('lines.at(-1)','A strange power prevents you from reading the Scroll of Homecoming.')
  run("player.inventory.unshift(specimen('drifter'));lines.length=0")
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(2)')
  eq('lines.at(-1)','Drifter prevents you from reading the Scroll of Homecoming.');eq('replayData.actions.length',0)
  run('player.inventory=[];frenzyTargets=frenzyProbe;player.berserkTurns=0;replayRecording=false')
  // HP clamp is authoritative on entry/removal even with HUD stubbed out.
  run(`currentZ=0;map=surfaceMap;player.hp=100;globalThis.trog=specimen('troglodyte');carryItem(trog)`)
  eq('playerMaxHp()',80);eq('player.hp',80);eq('playerAtk()-originalStats.atk',-4)
  run(`currentZ=-4;markPlayerPositionChanged()`);eq('playerMaxHp()',100);eq('player.hp',80)
  run(`currentZ=-12;markPlayerPositionChanged()`);eq('playerMaxHp()',140);eq('player.hp',80);eq('playerAtk()-originalStats.atk',8)
  run(`player.hp=140;currentZ=0;map=surfaceMap;markPlayerPositionChanged()`);eq('player.hp',80)
  run(`currentZ=-12;player.hp=140;player.inventory=[trog];sellItem(0)`);eq('player.hp',100)
  // Test the real, recorded merchant purchase of a Drifter, then saving/replaying.
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});log=()=>{};player.inventory=[];
    replayRecording=false;replayPlaying=false;player.godMode=false;player.godArtifactStockGranted=false;
    startReplayRecording();useGodModeKey();globalThis.drifterSpec=merchantStock.find(i=>i.abilityId==='drifter'&&i.godTestArtifact);
    buyItem(drifterSpec)`)
  await Promise.resolve()
  eq('player.inventory.find(i=>i.abilityId==="drifter").drifterMf',11)
  const state = copy(run('replayData'))
  const save = copy(run('buildSaveObject()'))
  context.saved=save;context.recorded=state
  run('loadGameFromObject(structuredClone(saved),{isReplayInit:true})')
  eq('player.inventory.find(i=>i.abilityId==="drifter").drifterMf',11)
  const endMf=run('playerMf()')
  run('loadGameFromObject(structuredClone(recorded.initialState),{isReplayInit:true});activeReplay=recorded;replayRngIndex=0;replayPlaying=true;replayRecording=false')
  for (const a of state.actions) await run(`runReplayAction(${JSON.stringify(a)})`)
  eq('playerMf()',endMf);eq('player.inventory.find(i=>i.abilityId==="drifter").drifterMf',11)
  eq('replayRngIndex',state.rng.length)
  // A genuine recorded drop removes Exile and enables Homecoming again.
  // Saved start includes low-HP Adrenaline; replay must reproduce its speed.
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;log=()=>{};
    enemies=[];npcs=[];groundItems=[];occupied=new Set();currentZ=-1;currentCave=0;map=undergroundMap;undergroundDiscovered=undergroundDiscoveredL1;
    player.x=40;player.y=40;map[40][40]='cavefloor';player.inventory=[specimen('exile'),specimen('adrenaline'),createItem('homecomingscroll')];
    player.race='human';player.lvl=1;player.baseSpd=20;player.equip={weapon:null,shield:null,armor:null};player.hp=10;player.maxHp=100;player.berserkTurns=0;player.poisonTurns=0;player.speedPotionTurns=0;player.slowTurns=0;player.gazeTurns=0;player.curseDebuffs=[];player.godMode=false;
    rebuildActiveLevelOccupancy();startReplayRecording()`)
  eq('playerSpd()',24)
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(2)');eq('replayData.actions.length',0);eq('currentZ',-1)
  await run('ITEM_ACTION_HANDLERS.dropItem(0)');eq('ArtifactWayfaring.homecomingBlocker()',null)
  await run('ITEM_ACTION_HANDLERS.homecomingscroll(1)');eq('currentZ',0)
  context.recorded2=copy(run('replayData'));eq('replayData.actions.map(a=>a.action)',['dropItem','homecomingscroll'])
  const result2=run('JSON.stringify({x:player.x,y:player.y,z:currentZ,spd:playerSpd(),hp:player.hp,turn:turnCount,rng:rngState,inventory:player.inventory})')
  run('globalThis.saved2=structuredClone(buildSaveObject());loadGameFromObject(saved2,{isReplayInit:true})')
  eq('JSON.stringify({x:player.x,y:player.y,z:currentZ,spd:playerSpd(),hp:player.hp,turn:turnCount,rng:rngState,inventory:player.inventory})',result2)
  run('loadGameFromObject(structuredClone(recorded2.initialState),{isReplayInit:true});activeReplay=recorded2;replayRngIndex=0;replayPlaying=true;replayRecording=false;replayAnimationsDisabled=true;replaySimulationMode=true')
  eq('playerSpd()',24);eq('ArtifactWayfaring.homecomingBlocker()','exile')
  for(const action of context.recorded2.actions)await run(`runReplayAction(${JSON.stringify(action)})`)
  eq('JSON.stringify({x:player.x,y:player.y,z:currentZ,spd:playerSpd(),hp:player.hp,turn:turnCount,rng:rngState,inventory:player.inventory})',result2)
  eq('replayRngIndex',context.recorded2.rng.length)
  console.log('PASS Wayfaring Batch A: eligible loot, saved stats, all six powers, depth clamping, normal prices, save and deterministic replay')
})().catch(e=>{console.error(e);process.exitCode=1})
