const assert = require('node:assert/strict')
const {run, context} = require('./helpers/node-game-runtime.cjs')

async function main() {
  await run('loadContent()')
  context.fixture = require('./saves/Tester_start.json')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    log=()=>{};showDesktopCombatTooltip=()=>{};updateMobileInfoPanel=()=>{};
    enemyIsVisibleOnMainView=()=>false;currentZ=0;map=surfaceMap;
    enemies=[];occupied=new Set();turnCount=100;
    window.makePoisonVictim=(id,hp)=>addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
      id,x:40,y:40,hp,maxHp:hp,level:0,alive:true,equipment:null});`)

  for (const [hp, budget, perTurn] of [
    [14,20,2],[43,20,2],[100,20,2],[108,21,2],
    [125,25,2],[132,26,2],[200,40,3],[300,60,4]
  ]) {
    run(`enemies=[];window.victim=makePoisonVictim('poison-${hp}',${hp});applyPlayerVenomToEnemy(victim)`)
    assert(run(`victim.poisonDamageRemaining===${budget} &&
      victim.poisonDamagePerTurn===${perTurn} &&
      victim.poisonTurns===Math.ceil(${budget}/${perTurn})`), `poison scale at ${hp} HP`)
  }

  run(`enemies=[];window.victim=makePoisonVictim('partial',125);
    applyPlayerVenomToEnemy(victim);turnCount=victim.poisonAppliedTurn+1;tickEnemyPoison();`)
  assert(run('victim.hp===125&&victim.poisonDamageRemaining===25'), 'application turn does not tick')
  run('for(let n=0;n<12;n++){turnCount++;tickEnemyPoison()}')
  assert(run('victim.hp===101&&victim.poisonDamageRemaining===1&&victim.poisonTurns===1'),
    'twelve ticks use 24 damage')
  context.saved = run('JSON.parse(JSON.stringify(buildSaveObject()))')
  run('loadGameFromObject(saved,{isReplayInit:true});window.victim=enemies.find(e=>e.id===\'partial\')')
  assert(run('victim.hp===101&&victim.poisonDamageRemaining===1&&victim.poisonDamagePerTurn===2'),
    'last partial tick is persisted and restored')
  run('turnCount++;tickEnemyPoison()')
  assert(run('victim.hp===100&&victim.poisonDamageRemaining===0&&victim.poisonTurns===0'),
    'final tick deals exactly one HP and expires')

  run(`applyPlayerVenomToEnemy(victim);turnCount=victim.poisonAppliedTurn+2;tickEnemyPoison();
    applyPlayerVenomToEnemy(victim)`)
  assert(run('victim.poisonDamageRemaining===25&&victim.poisonTurns===13'),
    'reapplication refreshes rather than stacking damage')
  run('currentZ=-1;turnCount+=10;tickEnemyPoison()')
  assert(run('victim.poisonDamageRemaining===25'), 'inactive level does not tick')
  run(`currentZ=0;enemies=[];window.skeleton=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Skeleton,
    x:40,y:40,hp:18,maxHp:18,alive:true,level:0});
    window.gargoyle=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Gargoyle,
    x:41,y:40,hp:60,maxHp:60,alive:true,level:0});
    applyPlayerVenomToEnemy(skeleton);applyPlayerVenomToEnemy(gargoyle);`)
  assert(run('skeleton.poisonTurns===0&&gargoyle.poisonTurns===0&&gargoyle.family===\'construct\''),
    'undead and constructs remain immune')

  run(`enemies=[];window.doomed=makePoisonVictim('poison-kill',50);doomed.hp=1;
    window.killsBeforePoison=player.kills;applyPlayerVenomToEnemy(doomed);
    turnCount=doomed.poisonAppliedTurn+2;tickEnemyPoison();`)
  assert(run('!doomed.alive&&player.kills===killsBeforePoison+1'),
    'poison remains lethal and credits the player with the kill')

  run(`const oldRng=rng;const oldChance=chance;
    rng=()=>0.5;chance=()=>true;player.hp=playerMaxHp();player.poisonTurns=0;
    applyEnemyPoison({name:'Scorpion',abilities:['poison']});
    window.playerPoisonStart=player.hp;tickPlayerPoison();rng=oldRng;chance=oldChance;`)
  assert(run('player.hp===playerPoisonStart-1'), 'poison inflicted on the player remains 1 HP/turn')
  console.log('PASS poison budget, scaling, delayed and partial ticks, refresh, save/load, floor pause, immunity and kill credit')
}

main().catch(error => {console.error(error.stack);process.exitCode = 1})
