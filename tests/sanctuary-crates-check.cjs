// Run with: node tests/sanctuary-crates-check.cjs
// Rule-level deterministic checks; browser presentation is covered by E2E specs.
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
const check = (expression, message) => assert(run(expression), message)
const snapshot = () => JSON.parse(JSON.stringify(run('buildSaveObject()')))
async function main() {
  await run('loadContent()')
  const reset = () => run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    log=()=>{};replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
    replaySimulationMode=false;raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;
    deathTransition=null;cameraAnimating=false;attackAnim=null;
    player.maxHp=1000;player.hp=1000;player.curseDebuffs=[];
    player.berryRegenTurns=0;player.poisonTurns=0;player.godMode=false;
    enemies=[];npcs=[];groundItems=[];occupied=new Set();`)
  reset()
  run(`currentZ=0;map=surfaceMap;spawnPoint={x:50,y:50};player.x=60;player.y=50;
    for(let y=42;y<68;y++)for(let x=42;x<75;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
    enemies=[{id:'holy-test',name:'Goblin',baseName:'Goblin',tier:1,level:0,x:61,y:50,
      homeX:61,homeY:50,alive:true,hp:100,maxHp:100,atk:5,def:0,spd:2,
      aggro:8,abilities:[],humanoid:false,aware:true,alarmed:false,sleeping:false,wander:false}];
    occupied.add('61,50');player.equip.weapon={kind:'weapon',name:'Test Club',atk:1,grace:3}`)
  check('FLEE_DISTANCE===10 && playerInsideSanctuary()', 'inclusive 10-tile sanctuary')
  check('!enemyInsideSanctuary(enemies[0]) && !enemyCanPathThrough(enemies[0],60,50)', 'outer monster cannot enter')
  check('!enemyAttackPlayer(enemies[0]) && !enemyRangedAttackPlayer(enemies[0])', 'no melee or ranged inward')
  const savedRng=run('rngState'), oldTurn=run('turnCount')
  await run('tryMove(1,0)')
  assert.equal(run('turnCount'),oldTurn,'protected attacker spends no turn')
  check('enemies[0].hp===100', 'protected attacker cannot hit foe')
  run('enemyTurn()')
  check('Math.max(Math.abs(enemies[0].x-player.x),Math.abs(enemies[0].y-player.y))>=2','adjacent attacker retreats')
  const prev=run('keyXY(enemies[0].x,enemies[0].y)')
  for(let i=0;i<12;i++){run('enemyTurn()');assert.equal(run('keyXY(enemies[0].x,enemies[0].y)'),prev,'no oscillation')}
  let saved=snapshot();context.testSave=saved;run('loadGameFromObject(testSave,{isReplayInit:true});replayAnimationsDisabled=true')
  assert.equal(run('keyXY(enemies[0].x,enemies[0].y)'),prev,'sanctuary enemy persists')
  run('currentZ=-1;enemies[0].level=-1')
  check('!playerInsideSanctuary()&&!enemyInsideSanctuary(enemies[0])','underground unprotected')
  console.log('PASS sanctuary boundary, attacks, pursuit, oscillation, save/replay restore')

  reset()
  run(`currentZ=chainZForDepth(4);map=deepLevels[2].map;currentCave=-1;
    player.x=100;player.y=100;player.baseAtk=1;
    player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3};
    for(let y=98;y<103;y++)for(let x=98;x<103;x++)map[y][x]='marble';
    map[100][101]='dwarvencrate';deepLevels[2].crates=[{x:101,y:100,hp:8,lootKind:null}]`)
  const damage=run('Math.max(1,playerAtk())'), initial=run('turnCount')
  run('player.equip.weapon=null')
  await run('tryMove(1,0)')
  assert.equal(run('turnCount'),initial,'unarmed crate does not advance a turn')
  run("player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3}")
  await run('tryMove(1,0)')
  assert.equal(run('deepLevels[2].crates[0].hp'),8-damage,'crate damaged once')
  saved=snapshot();context.testSave=saved;run('loadGameFromObject(testSave,{isReplayInit:true});replayAnimationsDisabled=true')
  assert.equal(run('deepLevels[2].crates[0].hp'),8-damage,'partial HP persists')
  for(let i=0;i<8&&run('map[100][101]')==='dwarvencrate';i++)await run('tryMove(1,0)')
  check("map[100][101]==='dwarvencratepieces'&&!deepLevels[2].crates.some(c=>c.x===101&&c.y===100)", 'empty crate destroyed')
  check('!groundItems.some(g=>g.x===101&&g.y===100)','empty crate dropped nothing')
  saved=snapshot();context.testSave=saved;run('loadGameFromObject(testSave,{isReplayInit:true});replayAnimationsDisabled=true')
  check("map[100][101]==='dwarvencratepieces'&&!deepLevels[2].crates.some(c=>c.x===101&&c.y===100)", 'empty crate cannot respawn')
  console.log('PASS unarmed, durability, empty crate, partial save, destroyed save')

  reset()
  run(`currentZ=chainZForDepth(4);map=deepLevels[2].map;currentCave=-1;
    player.x=100;player.y=100;player.baseAtk=100;
    player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3};
    for(let y=98;y<103;y++)for(let x=98;x<103;x++)map[y][x]='marble';
    map[100][101]='dwarvencrate';deepLevels[2].crates=[{x:101,y:100,hp:8,lootKind:'potion'}]`)
  run('startReplayRecording()')
  await run('tryMove(1,0)')
  check("map[100][101]==='dwarvencratepieces' && groundItems.filter(g=>g.kind==='potion'&&g.x===101).length===1", 'pre-rolled potion drops once')
  const expected=JSON.stringify(run("({tile:map[100][101],drops:groundItems.filter(g=>g.kind==='potion').length})"))
  context.recorded=JSON.parse(JSON.stringify(run('replayData')))
  saved=snapshot();context.testSave=saved;run('loadGameFromObject(testSave,{isReplayInit:true});replayAnimationsDisabled=true')
  check("groundItems.filter(g=>g.kind==='potion'&&g.x===101).length===1", 'potion remains after save')
  run(`loadGameFromObject(recorded.initialState,{isReplayInit:true});
    replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded;replayPlaying=true;
    replayRecording=false;replayRngIndex=0`)
  for(const action of context.recorded.actions){context.action=action;await run('runReplayAction(action)')}
  assert.equal(JSON.stringify(run("({tile:map[100][101],drops:groundItems.filter(g=>g.kind==='potion').length})")),expected,'replay result')
  check('replayRngIndex===recorded.rng.length','crate replay consumes same rng')
  run('replayPlaying=false;replaySimulationMode=false;activeReplay=null')
  await run('tryMove(1,0)')
  check("player.x===101&&!groundItems.some(g=>g.x===101&&g.kind==='potion')&&player.inventory.some(i=>i.kind==='potion')",'potion pickup')
  console.log('PASS potion drop, save, replay, RNG and pickup')

  reset()
  run(`currentZ=chainZForDepth(4);map=deepLevels[2].map;currentCave=-1;
    player.x=100;player.y=100;player.baseAtk=100;
    player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3};
    for(let y=98;y<103;y++)for(let x=98;x<103;x++)map[y][x]='marble';
    map[100][101]='dwarvencrate';deepLevels[2].crates=[{x:101,y:100,hp:1,lootKind:'scrollOfInvisibility'}]`)
  await run('tryMove(1,0)')
  check("groundItems.some(g=>g.kind==='scrollOfInvisibility'&&g.x===101)", 'scroll drop')
  run("map[100][101]='dwarvendoorlocked';groundItems=[]")
  const doorTurn=run('turnCount')
  await run('tryMove(1,0)')
  assert.equal(run('turnCount'),doorTurn,'first lock bump free')
  check('inspectedDungeonLocks.has(dungeonLockIdAt(101,100))','lock inspected')
  saved=snapshot();context.testSave=saved;run('loadGameFromObject(testSave,{isReplayInit:true});replayAnimationsDisabled=true')
  check('inspectedDungeonLocks.has(dungeonLockIdAt(101,100))','inspection persists')
  await run('tryMove(1,0)')
  check("map[100][101]==='dwarvendoorbreached'",'second lock bump breaks')
  assert.equal(run('turnCount'),doorTurn+1,'second lock bump costs one turn')
  console.log('PASS scroll drop, lock inspection save, second-bump breach')

  for(const seed of [12345, 992341]) {
    reset()
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;initializeDwarvenCrates()`)
    const first=JSON.stringify(run(`deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins')
      .map(l=>({crates:l.crates,rng:rngState}))`))
    check(`deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins').every(l=>{
      const tiles=[];for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
        if(l.map[y]?.[x]==='dwarvencrate')tiles.push(keyXY(x,y));
      return tiles.length===l.crates.length && l.crates.every(c=>tiles.includes(keyXY(c.x,c.y)) &&
        c.hp===WORLD_GEN_CONFIG.dungeons.dwarvenRuins.crates.hp &&
        [null,'potion','speedpotion','scrollOfInvisibility',...TACTICAL_CONSUMABLE_KINDS].includes(c.lootKind))
    })`, 'crate generation matches blocking tiles, configured HP and valid loot')
    run('rngState=WORLD_SEED;initializeDwarvenCrates()')
    assert.equal(JSON.stringify(run(`deepLevels.filter(l=>l.dungeonPackage==='dwarvenRuins')
      .map(l=>({crates:l.crates,rng:rngState}))`)),first, 'same seed generates identical contents and RNG')
    console.log('PASS fixed-seed crate initialization',seed)
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1})
