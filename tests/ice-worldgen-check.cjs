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
  run('var iceRolls=[];chance=p=>{iceRolls.push(p);return p!==.01};enemyTurn()')
  check("map[30][30]==='crackingice' && player.hp===100 && iceRolls.length===2 && iceRolls[0]===.01 && iceRolls[1]===.02", '2% advances one stage without falling through')
  run("beastTracks.set('30,30',{x:30,y:30,direction:0,species:'Wolf',age:0})")
  run('enemyTurn()')
  check("map[30][30]==='water' && surfaceMap[30][30]==='water' && iceRolls[2]===.1", '10% breaks cracked ice')
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
  run('replayAnimationsDisabled=false;chance=p=>p!==.01;enemyTurn();enemyTurn()')
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
  run("autoPath=[{x:31,y:30}];chance=p=>p!==.01;enemyTurn()")
  check('!autoPath', 'cracking stops auto-travel')

  for (const [dx,dy] of [[1,0],[1,1]]) {
    reset()
    run(`map[30][31]='ice';map[30+${dy}][31+${dx}]='crackingice';chance=p=>{if(p!==.01)throw Error('only the instant-break roll precedes automatic cracking');return false}`)
    await run('tryMove(1,0)')
    check("map[30][31]==='crackingice' && map[30][30]==='ice' && player.hp===100 && !player.drowning", 'walking beside cardinal/diagonal cracking ice advances only the stepped-on tile, one stage')
    run('var spreadRolls=[];chance=p=>{spreadRolls.push(p);return false};skipTurn()')
    check('spreadRolls.length===1 && spreadRolls[0]===.1', 'the next turn uses the normal 10% break chance')
  }
  reset()
  run("map[30][31]='crackingice';var idleSpreadRolls=[];chance=p=>{idleSpreadRolls.push(p);return false};skipTurn()")
  check("map[30][30]==='ice' && idleSpreadRolls.length===2 && idleSpreadRolls[0]===.01 && idleSpreadRolls[1]===.02", 'waiting beside cracking ice retains the 2% chance')
  for (const neighbor of ['water','frozenriver']) {
    reset()
    run(`map[30][31]='ice';map[30][32]=${JSON.stringify(neighbor)};var nonSpreadRolls=[];chance=p=>{nonSpreadRolls.push(p);return false}`)
    await run('tryMove(1,0)')
    check("map[30][31]==='ice' && nonSpreadRolls.length===2 && nonSpreadRolls[0]===.01 && nonSpreadRolls[1]===.02", neighbor+' does not propagate cracking')
  }
  reset()
  run("map[30][31]='ice';map[30][32]='crackingice';player.godMode=true;chance=()=>{throw Error('god mode spread RNG')}")
  await run('tryMove(1,0)')
  check("map[30][31]==='ice'", 'god mode still prevents automatic cracking')
  run('useGodModeKey(true);chance=p=>p!==.01;enemyTurn()')
  check("map[30][31]==='crackingice'", 'disabling god mode restores normal ice cracking')

  for (const [dx,dy] of [[1,0],[1,1]]) {
    reset('crackingice')
    run(`map[30+${dy}][30+${dx}]='ice';var stepBreakRolls=[];chance=p=>{stepBreakRolls.push(p);return p===.1}`)
    await run(`tryMove(${dx},${dy})`)
    check(`stepBreakRolls.length===2&&stepBreakRolls[0]===.01&&stepBreakRolls[1]===.1&&map[30+${dy}][30+${dx}]==='water'&&map[30][30]==='water'`, 'stepping from cracking ice checks 1% first, then the extra 10%, including diagonal movement')
    check('player.hp===95&&player.drowning&&player.swimTurns===1', 'same-step break applies only one drowning check')
  }
  reset('crackingice')
  run("map[30][31]='ice';var safeStepRolls=[];chance=p=>{safeStepRolls.push(p);return false}")
  await run('tryMove(1,0)')
  check("safeStepRolls.length===2&&safeStepRolls[1]===.1&&map[30][31]==='crackingice'&&map[30][30]==='crackingice'&&player.hp===100", 'failed same-step recheck leaves both cracking tiles intact')
  reset('crackingice')
  run("map[30][31]='ice';map[30][32]='ice';chance=p=>{if(p!==.01)throw Error('instant break must skip the extra recheck');return true}")
  await run('tryMove(1,0)')
  check("map[30][31]==='water'&&map[30][30]==='water'&&map[30][32]==='crackingice'&&player.hp===95", 'instant break keeps priority when moving from cracking ice')
  for(const origin of ['grass','ice','frozenriver','water']) {
    reset(origin)
    run("map[30][31]='ice';map[31][32]='crackingice';var otherOriginRolls=[];chance=p=>{otherOriginRolls.push(p);return false}")
    await run('tryMove(1,0)')
    check("otherOriginRolls.length===1&&otherOriginRolls[0]===.01&&map[30][31]==='crackingice'", origin+' origins do not get the extra break recheck')
  }

  reset('crackingice')
  run(`for(const [dx,dy] of DIRS8){
    map[30+dy][30+dx]='crackingice';
    beastTracks.set(keyXY(30+dx,30+dy),{x:30+dx,y:30+dy,direction:0,species:'Wolf',age:0});
  }
  map[30][32]='crackingice';chance=p=>{if(p!==.1)throw Error('cracked ice uses only its 10% roll');return true};enemyTurn()`)
  check("DIRS8.every(([dx,dy])=>map[30+dy][30+dx]==='water'&&surfaceMap[30+dy][30+dx]==='water'&&tileUnderlays[keyXY(30+dx,30+dy)]==='snow'&&!beastTracks.has(keyXY(30+dx,30+dy)))", 'all eight already-cracking neighbors collapse, retain cold and lose tracks')
  check("map[30][32]==='crackingice' && player.hp===95 && player.swimTurns===1", 'neighbor collapse never chains or adds extra drowning checks')
  run('var collapsedSave=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(collapsedSave,{isReplayInit:true})')
  check("DIRS8.every(([dx,dy])=>map[30+dy][30+dx]==='water'&&tileUnderlays[keyXY(30+dx,30+dy)]==='snow')&&map[30][32]==='crackingice'", 'save restores collapsed neighbors and untouched second ring')

  reset('crackingice')
  run("map[30][31]='ice';map[31][31]='frozenriver';map[29][29]='river';map[30][29]='crackingice';map[29][30]='water';chance=()=>true;enemyTurn()")
  check("map[30][29]==='water'&&map[30][31]==='ice'&&map[31][31]==='frozenriver'&&map[29][29]==='river'&&map[29][30]==='water'&&map[31][30]==='grass'", 'normal break changes only neighbors that were already cracking')

  reset()
  run(`for(const [dx,dy] of DIRS8)map[30+dy][30+dx]='ice';
    map[29][30]='crackingice';map[30][31]='frozenriver';map[31][29]='grass';map[30][32]='ice';
    var instantRolls=[];chance=p=>{instantRolls.push(p);return true};enemyTurn()`)
  check("instantRolls.length===1&&instantRolls[0]===.01&&map[30][30]==='water'&&map[29][30]==='water'", 'instant break skips the ordinary cracking roll and collapses already-cracking neighbors')
  check("DIRS8.filter(([dx,dy])=>map[30+dy][30+dx]==='crackingice').length===5&&map[30][32]==='ice'&&map[30][31]==='frozenriver'&&map[31][29]==='grass'", 'instant break cracks only adjacent intact ice, without immediately collapsing it')
  check("player.hp===95&&player.swimTurns===1&&player.freezing.active&&ruleMessages.some(s=>s.includes('Cracks spread'))", 'instant entry drowns once, stays cold and logs the nearby cracking')
  reset('grass')
  run("map[30][31]='ice';map[31][32]='crackingice';var priorityRolls=[];chance=p=>{priorityRolls.push(p);return true}")
  await run('tryMove(1,0)')
  check("priorityRolls.length===1&&priorityRolls[0]===.01&&map[30][31]==='water'&&map[31][32]==='water'&&player.drowning", '1% instant break takes priority over guaranteed adjacent-step cracking')
  reset()
  run("player.x=0;player.y=0;map[0][0]='ice';map[0][1]='crackingice';map[1][1]='ice';map[1][0]='snow';chance=()=>true;tickLakeIce()")
  check("map[0][0]==='water'&&map[0][1]==='water'&&map[1][1]==='crackingice'&&map[1][0]==='snow'", 'one-ring changes stay within bounds at world corners')

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
    if(rng()>=.01&&rng()<.02&&rng()<.1) break
  }
  reset()
  run(`rngState=${seed};startReplayRecording();skipTurn();skipTurn()`)
  await run('tryMove(1,0)')
  const state=()=>plain(run(`({map:encodeTileGrid(surfaceMap,'g'),underlays:tileUnderlays,
    hp:player.hp,x:player.x,y:player.y,swimTurns:player.swimTurns,drowning:player.drowning,
    practice:player.swimmingPractice,freezing:player.freezing,turn:turnCount,steps:player.steps})`))
  const expected=state()
  context.iceReplay=plain(run('replayForSave()'))
  assert.equal(context.iceReplay.rng.length,3)
  assert.equal(context.iceReplay.actions.length,3)
  async function verifyReplay(expected) {
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
  }
  await verifyReplay(expected)

  reset('grass')
  run(`map[30][31]='ice';map[31][32]='crackingice';rngState=${seed};startReplayRecording()`)
  await run('tryMove(1,0)')
  check("map[30][31]==='crackingice' && replayData.rng.length===1", 'recorded adjacent step checks instant break before guaranteed cracking')
  run('skipTurn()')
  check("map[30][31]==='water' && player.drowning", 'propagated cracking can break on the following turn')
  await run('tryMove(-1,0)')
  const spreadExpected=state()
  context.iceReplay=plain(run('replayForSave()'))
  assert.equal(context.iceReplay.rng.length,2)
  await verifyReplay(spreadExpected)

  // A real recorded instant break changes both neighboring stages. Replaying
  // the action must reproduce the same ring without additional RNG requests.
  let instantSeed=1
  for(;;instantSeed++) {
    let state=(instantSeed+0x6D2B79F5)|0
    let t=Math.imul(state^(state>>>15),1|state)
    t=(t+Math.imul(t^(t>>>7),61|t))^t
    if(((t^(t>>>14))>>>0)/4294967296<.01) break
  }
  reset()
  run(`map[30][31]='crackingice';map[31][31]='ice';map[30][32]='crackingice';rngState=${instantSeed};startReplayRecording();skipTurn()`)
  check("map[30][30]==='water'&&map[30][31]==='water'&&map[31][31]==='crackingice'&&map[30][32]==='crackingice'", 'recording captures instant break, neighbor collapse and new cracking without a chain')
  const instantExpected=state()
  context.iceReplay=plain(run('replayForSave()'))
  assert.equal(context.iceReplay.rng.length,1)
  await verifyReplay(instantExpected)

  reset('crackingice')
  run(`map[30][31]='ice';map[30][32]='ice';map[31][32]='crackingice';map[31][33]='crackingice';rngState=${seed};startReplayRecording()`)
  await run('tryMove(1,0)')
  check("map[30][31]==='water'&&map[30][30]==='water'&&map[31][32]==='water'&&map[30][32]==='ice'&&map[31][33]==='crackingice'", 'extra 10% break collapses the original cracking neighbors without instant-break spread or chaining')
  const stepBreakExpected=state()
  context.iceReplay=plain(run('replayForSave()'))
  assert.equal(context.iceReplay.rng.length,2)
  await verifyReplay(stepBreakExpected)
  run('chance=originalIceCheckChance')
  console.log('PASS ice stages, instant break, cracking-origin step recheck, one-ring collapse, forced drowning, protection, freezing, feedback, saves, rotation and replay')
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

async function main(){await run('loadContent()');await rules();if(!process.argv.includes('--rules-only'))await worldgen()}
main().catch(error=>{console.error(error);process.exitCode=1})
