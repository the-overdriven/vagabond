// Run with: node tests/ice-worldgen-check.cjs
// Rule checks only. No browser, automation framework or third-party dependency.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
context.ruleMessages = []
const plain = value => JSON.parse(JSON.stringify(value))
const check = (code, message) => assert(run(code), message)

function reset(tile='ice', race='human', swimming=0) {
  run(`loadGameFromObject(structuredClone(fixture), {isReplayInit:true});
    currentZ=0;map=surfaceMap;enemies=[];npcs=[];groundItems=[];occupied=new Set();
    player.x=30;player.y=30;player.race=${JSON.stringify(race)};player.maxHp=100;
    player.equip={weapon:null,shield:null,armor:null,blackkey:null};player.hp=playerMaxHp();
    player.swimming=${swimming};player.swimmingPractice=0;resetSwimming();
    player.freezing={active:false,turns:0};player.poisonTurns=0;player.berryRegenTurns=0;
    player.curseDebuffs=[];player.godMode=false;player.permadeath=false;
    for(let y=27;y<=33;y++)for(let x=27;x<=33;x++){
      map[y][x]='grass';delete tileUnderlays[keyXY(x,y)];
    }
    map[30][30]=${JSON.stringify(tile)};tileUnderlays['30,30']='snow';
    turnCount=0;consecutiveWaitTurns=0;cameraAnimating=false;attackAnim=null;
    invOpen=false;mapOpen=false;tradeOpen=false;raceOpen=false;deathTransition=null;
    replayAnimationsDisabled=true;replaySimulationMode=false;
    chance=originalIceCheckChance;ruleMessages.length=0;damageAnims.length=0;
    log=(message)=>ruleMessages.push(message);`)
}

async function rules() {
  run('var originalIceCheckChance=chance')
  reset()
  run('var iceRolls=[];chance=p=>{iceRolls.push(p);return true};enemyTurn()')
  check("map[30][30]==='crackingice' && player.hp===100 && iceRolls.length===1 && iceRolls[0]===.02", '2% advances one stage without falling through')
  run("beastTracks.set('30,30',{x:30,y:30,direction:0,species:'Wolf',age:0})")
  run('enemyTurn()')
  check("map[30][30]==='water' && surfaceMap[30][30]==='water' && iceRolls[1]===.1", '10% breaks cracked ice')
  check("player.hp===95 && player.swimTurns===1 && player.drowning && player.freezing.active && player.freezing.turns===2 && player.swimmingPractice===0", 'forced entry drowns once, grants no practice and remains cold')
  check("!beastTracks.has('30,30')", 'water washes away tracks when the ice breaks')
  run('skipTurn()')
  check('player.hp===90 && player.swimTurns===2 && turnCount===3', 'subsequent wait causes one normal drowning tick')
  run("map[30][31]='ice';tileUnderlays['31,30']='snow';chance=()=>false")
  await run('tryMove(1,0)')
  check('player.x===31 && !player.drowning && player.swimTurns===0 && player.freezing.turns===4', 'non-swimmer can escape onto intact ice without ending cold exposure')
  await run('tryMove(1,0)')
  check('!player.freezing.active && player.freezing.turns===0', 'warm land ends cold exposure')

  for (const [race,swimming] of [['human',5],['merling',0]]) {
    reset('crackingice',race,swimming)
    run('chance=()=>true;enemyTurn()')
    check("map[30][30]==='water' && !player.drowning && player.hp===playerMaxHp() && player.swimmingPractice===0", race+' uses normal swimming protection')
  }
  reset('ice')
  run('replayAnimationsDisabled=false;chance=()=>true;enemyTurn();enemyTurn()')
  check("damageAnims.some(a=>a.amount==='Ice cracking!') && damageAnims.some(a=>a.amount==='Ice breaks!')", 'both transition popups are queued')
  check("ruleMessages.some(s=>s.includes('ice cracks')) && ruleMessages.some(s=>s.includes('ice breaks')) && ruleMessages.some(s=>s.includes('drowning'))", 'transition and drowning messages are logged')
  check("player.hp===95 && map[30][30]==='water'", 'animation setting does not change rule results')

  for (const terrain of ['river','frozenriver','grass','water']) {
    reset(terrain)
    run('chance=()=>{throw Error("unexpected ice RNG")};tickLakeIce()')
    check(`map[30][30]===${JSON.stringify(terrain)}`, terrain+' cannot crack')
  }
  reset()
  run('player.godMode=true;chance=()=>{throw Error("god mode ice RNG")};tickLakeIce()')
  check("map[30][30]==='ice'", 'god mode does not break ice')
  reset()
  run('currentZ=-1;chance=()=>{throw Error("underground ice RNG")};tickLakeIce();currentZ=0')
  check("map[30][30]==='ice'", 'underground tiles cannot crack')
  reset('grass')
  run("map[30][31]='ice';chance=()=>{throw Error('unoccupied ice RNG')};finishEnemyMove({x:31,y:30,level:0,alive:true,abilities:[],wander:'roam'},32,30);enemyTurn()")
  check("map[30][31]==='ice'", 'monsters do not crack ice')

  reset()
  run("map[30][31]='mountain';chance=()=>{throw Error('blocked move ice RNG')}")
  await run('tryMove(1,0)')
  check('turnCount===0', 'blocked movement spends no turn and makes no ice roll')
  reset()
  run("autoPath=[{x:31,y:30}];chance=()=>true;enemyTurn()")
  check('!autoPath', 'cracking stops auto-travel')

  for (const terrain of ['ice','crackingice','water']) {
    reset(terrain)
    run("player.freezing={active:true,turns:3};if(deepSwimmingWater(30,30))advanceSwimming(false);var savedIce=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(savedIce,{isReplayInit:true})")
    check(`map[30][30]===${JSON.stringify(terrain)} && tileUnderlays['30,30']==='snow' && player.freezing.turns===3`, 'save restores '+terrain+' and cold exposure')
    if(terrain==='water') check('player.drowning && player.swimTurns===1 && player.hp===95', 'save restores forced drowning')
  }
  reset('crackingice')
  run("chance=()=>true;enemyTurn();var beforeRotation={...player};const iceW=MAP_W,iceH=MAP_H;rotateGeneratedWorld(1);player.x=iceH-1-beforeRotation.y;player.y=beforeRotation.x")
  check("map[player.y][player.x]==='water' && tileUnderlays[keyXY(player.x,player.y)]==='snow'", 'rotation preserves broken water and its cold marker')

  // Find a fixed Mulberry seed producing a crack followed by a break, using
  // real rng(), recording and the normal replay action dispatcher below.
  let seed=1
  for(;;seed++) {
    let state=seed
    const rng=()=>{state=(state+0x6D2B79F5)|0;let t=Math.imul(state^(state>>>15),1|state);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296}
    if(rng()<.02&&rng()<.1) break
  }
  reset()
  run(`rngState=${seed};startReplayRecording();skipTurn();skipTurn()`)
  await run('tryMove(1,0)')
  const state=()=>plain(run(`({map:encodeTileGrid(surfaceMap,'g'),underlays:tileUnderlays,
    hp:player.hp,x:player.x,y:player.y,swimTurns:player.swimTurns,drowning:player.drowning,
    practice:player.swimmingPractice,freezing:player.freezing,turn:turnCount,steps:player.steps})`))
  const expected=state()
  context.iceReplay=plain(run('replayForSave()'))
  assert.equal(context.iceReplay.rng.length,2)
  assert.equal(context.iceReplay.actions.length,3)
  for(const disabled of [false,true]) {
    run(`loadGameFromObject(structuredClone(iceReplay.initialState),{isReplayInit:true});
      activeReplay=iceReplay;replayRngIndex=0;replayPlaying=true;replayRecording=false;
      replayAnimationsDisabled=${disabled};replaySimulationMode=${disabled};`)
    for(let index=0;index<context.iceReplay.actions.length;index++) {
      // Camera timing is not simulated by this rule harness.
      run('cameraAnimating=false;attackAnim=null')
      await run(`runReplayAction(iceReplay.actions[${index}])`)
    }
    assert.deepEqual(state(),expected,'replay reproduces ice and drowning with animations '+disabled)
    check('replayRngIndex===activeReplay.rng.length', 'replay consumes every recorded RNG value')
    run('stopReplayPlayback()')
  }
  run('chance=originalIceCheckChance')
  console.log('PASS ice stages, forced drowning, protection, freezing, feedback, saves, rotation and replay')
}

async function worldgen() {
  for(const [seed,names] of [[12345,[]],[67890,[]],[20261015,[]],[12345,['cold_world','drowned_lands']],[67890,['wild_weather','drought']]]) {
    context.traitNames=names
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;
      applyWorldTraits(traitNames.map(name=>{
        const trait=WORLD_TRAITS.find(t=>t.name===name);
        return {...trait,effects:trait.effects.map(e=>({...e,value:Array.isArray(e.value)?(e.value[0]+e.value[1])/2:e.value}))}
      }), 'XS');MAP_W=unrotatedWorldWidth;MAP_H=unrotatedWorldHeight;generateMap();initDiscovered()`)
    const result=plain(run(`(() => {
      let south=0,northWater=0,ice=0,coldWater=0,frozenRiver=0
      for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
        if(y>=MAP_H*.7&&map[y][x]==='mountain')south++
        if(y<4&&map[y][x]==='water')northWater++
        if(map[y][x]==='ice')ice++
        if(map[y][x]==='water'&&tileUnderlays[keyXY(x,y)]==='snow')coldWater++
        if(map[y][x]==='frozenriver')frozenRiver++
      }
      const reachable=surfaceReachableFromTemple()
      const entranceTiles=caves.every(c=>c.entrances.every(p=>c.crypt ? map[p.y][p.x]==='ruinedchapel' : map[p.y][p.x]==='caveentrance'||map[p.y][p.x]==='dwarvengate'))
      const fortEntry=!!dwarvenRuin && reachable.has(keyXY(dwarvenRuin.x,dwarvenRuin.y)) && deepLevels[1].map[dwarvenRuin.y][dwarvenRuin.x]==='dwarvenfortexit'
      return {south,northWater,ice,coldWater,frozenRiver,bell:isBigBellReachableFromTemple(),edge:isTempleConnectedToEdge(),
        fortEntry,entranceTiles,validCaves:deepLevels[0]?.caves?.length>=2,temple:map[spawnPoint.y][spawnPoint.x]==='temple'}
    })()`))
    assert(result.south>0,'southern mountains: '+seed)
    assert.equal(result.northWater,0);assert.equal(result.coldWater,0)
    assert(result.ice>0&&result.frozenRiver>0,'ice lakes and safe frozen rivers generated')
    for(const key of ['bell','edge','fortEntry','entranceTiles','validCaves','temple'])assert(result[key],key+': '+seed)
    run('spawnEnemies();spawnNpcs();placeFisherman()')
    check("enemies.filter(e=>e.alive&&(e.level??0)===0).every(e=>TILE[map[e.y][e.x]]?.walk||enemyHasAbility(e,'fly')||enemyHasAbility(e,'ethereal'))", 'valid surface enemy spawns')
    check("npcs.every(n=>!isLakeIce(map[n.y][n.x])&&map[n.y][n.x]!=='water'&&map[n.y][n.x]!=='river')", 'NPCs avoid water and fragile ice')
    check('!fishermanHut||fishermanFootReachable().has(keyXY(fishermanHut.x,fishermanHut.y))', 'Fisherman never requires fragile ice')
    console.log('PASS seed',seed,names.join('+')||'normal',JSON.stringify(result))
  }
}

async function main(){await run('loadContent()');await rules();await worldgen()}
main().catch(error=>{console.error(error);process.exitCode=1})
