const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run,context} = require('./helpers/node-game-runtime.cjs')

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    logHistory=[];log=message=>logHistory.push(message);spawnDamageNumber=()=>{};
    player.x=40;player.y=40;player.rootTurns=0;player.rootFlavor=null;
    player.rootSourceId=null;turnCount=10;enemies=[];ROOT_CONFIG.hitChance=1`)
  run(`(() => {
    const t=ENEMY_TEMPLATE_BY_NAME.Akravis
    attacker=addEnemy({...t,baseName:t.name,x:39,y:40,alive:true,level:0,
      maxHp:t.hp,homeX:39,homeY:40,homeTileType:'grass'})
    applyEnemyContactStatuses(attacker)
  })()`)
  assert.equal(run('player.rootTurns'),3)
  assert.equal(run('player.rootFlavor'),'akravis','root has configurable source-specific messages')
  assert(run('logHistory.some(s=>s.includes("pincers"))'),'correct root onset message')
  assert.equal(run('attacker.rootReadyTurn'),16,'shared root cooldown is instance-specific')
  context.saved=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  assert.equal(context.saved.player.rootFlavor,'akravis')
  assert.equal(context.saved.player.rootSourceId,run('attacker.id'))
  run('loadGameFromObject(saved,{isReplayInit:true});attacker=enemies[0]')
  assert.equal(run('player.rootFlavor'),'akravis','root flavor survives replay initialization')
  run('tickMonsterStatuses();tickMonsterStatuses();tickMonsterStatuses()')
  assert.equal(run('player.rootTurns'),0)
  assert.equal(run('player.rootSourceId'),null)
  assert(run('logHistory.some(s=>s.includes("grip loosens"))'),'correct source-specific recovery message')

  run(`(() => {
    const t=ENEMY_TEMPLATE_BY_NAME.Marsutal
    blind=addEnemy({...t,baseName:t.name,x:37,y:40,level:0,alive:true,
      maxHp:t.hp,homeX:37,homeY:40,homeTileType:'grass'})
    player.invisibleTurns=5;player.godMode=false;player.godInvisible=false
  })()`)
  assert(!run('playerHiddenFromEnemy(blind)'),'blind sense bypasses player invisibility')
  assert.equal(run('playerCriticalHitChance(blind)'),run('BASE_CRIT_CHANCE'),'blind sense blocks invisibility crit advantage')
  run('ordinary={abilities:[],alarmed:false}')
  assert(run('playerHiddenFromEnemy(ordinary)'),'ordinary monster remains blind to invisibility')
  assert.equal(run('playerCriticalHitChance(ordinary)'),run('BASE_CRIT_CHANCE+0.20'))
  run(`for(let y=39;y<=41;y++)for(let x=39;x<=41;x++)map[y][x]='grass';
    enemyFindStep=()=>({x:38,y:40});enemyIsVisibleOnMainView=()=>false;chance=()=>true`)
  assert(run('blindPursuitHesitates(blind,3)'),'blind hesitation is reused by any monster with the ability')
  run(`setBlindOpenings=(monsterOptions,playerOptions)=>{
      for(const center of [blind,player])for(const [dx,dy] of DIRS8)
        map[center.y+dy][center.x+dx]='dwarvenwall'
      const choices=[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]]
      for(const [center,count] of [[blind,monsterOptions],[player,playerOptions]])
        for(const [dx,dy] of choices.slice(0,count))map[center.y+dy][center.x+dx]='grass'
    };
    recordedBlindChances=[];chance=p=>{recordedBlindChances.push(p);return true};
    setBlindOpenings(2,2)`)
  assert(!run('blindPursuitHesitates(blind,3)'),
    'both hunter and player confined to two exits means 0% hesitation')
  assert.equal(run('recordedBlindChances.length'),0,'0% case does not consume RNG')
  run('setBlindOpenings(2,3)')
  assert(run('blindPursuitHesitates(blind,3)'))
  assert.equal(run('recordedBlindChances.at(-1)'),0.20,'open player and constrained hunter: 20%')
  run('setBlindOpenings(3,2)')
  assert(run('blindPursuitHesitates(blind,3)'))
  assert.equal(run('recordedBlindChances.at(-1)'),0.40,'open hunter overrides player corridor: 40%')
  run('setBlindOpenings(3,3)')
  assert(run('blindPursuitHesitates(blind,3)'))
  assert.equal(run('recordedBlindChances.at(-1)'),0.60,'both open: 60% takes priority')
  assert(!run('blindPursuitHesitates(ordinary,3)'),'ordinary pursuit does not use blind hesitation')
  console.log('PASS generic mine abilities: root flavors/cooldown/save/replay, blind sensing/crit/hesitation')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
