const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run,context} = require('./helpers/node-game-runtime.cjs')
const plain = value => JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    turnCount=40;enemies=[];logHistory=[];log=s=>logHistory.push(s);
    spawnDamageNumber=()=>{};beginEnemyAttackAnim=()=>{};replayAnimationsDisabled=true;
    player.godMode=true;player.invisibleTurns=0;player.godInvisible=false;
    player.x=40;player.y=40;enemyIsVisibleOnMainView=()=>true;
    enemyInsideSanctuary=()=>false;playerInsideSanctuary=()=>false;
    enemyHasSight=()=>true;
    const makeDefenseEnemy=(name,x)=>{
      const t=ENEMY_TEMPLATE_BY_NAME[name]
      return addEnemy({...t,baseName:name,maxHp:t.hp,hp:t.hp,
        x,y:40,level:0,levelKind:null,alive:true,
        homeX:x,homeY:40,homeTileType:map[40][x],equipment:null})
    }
    vrakeber=makeDefenseEnemy('Vrakeber',41)
    tholosum=makeDefenseEnemy('Tholosum',42)
    caveTroll=makeDefenseEnemy('Cave Troll',43)
  `)
  assert.equal(run('vrakeber.exposedUntilTurn'),0,'new exposed timer initialized')
  assert.equal(run('tholosum.shellRetreatTurns'),0,'new shell timer initialized')
  assert.equal(run('tholosum.shellRetreatUsed'),false,'new one-time flag initialized')
  assert.equal(run('caveTroll.regenPhase'),0,'regen phase initialized')
  assert(run("ENEMY_TEMPLATE_BY_NAME['Cave Troll'].abilities.includes('regen')"))
  assert(run("ENEMY_TEMPLATE_BY_NAME['Tholosum'].abilities.includes('shellRetreat')"))
  assert(run("ENEMY_TEMPLATE_BY_NAME['Vrakeber'].abilities.includes('exposed')"))
  assert(!run("ENEMY_TEMPLATE_BY_NAME['Bellroach'].abilities.includes('exposed')"),
    'other species retain existing abilities')

  // A failed melee attack still opens the defense gap, but never causes damage.
  run('vrakeber.def+=5;vrakeber.gearBonuses={def:5};originalChance=chance;chance=()=>true')
  const ordinaryDef=run('enemyDef(vrakeber)')
  const hpBefore=run('player.hp')
  run('enemyAttackPlayer(vrakeber)')
  assert.equal(run('player.hp'),hpBefore)
  assert.equal(run('vrakeber.exposedUntilTurn'),41)
  assert.equal(run('enemyDef(vrakeber)'),ordinaryDef-9,
    'base DEF 12 becomes 3, preserving the independent +5 modifier and terrain')
  assert(run('tileInspectInfo(vrakeber.x,vrakeber.y).html.includes("Exposed")'),
    'inspection shows the exposure state')
  run('turnCount++')
  assert(!run('enemyExposed(vrakeber)'),'exposure expires after one complete responding action')
  assert.equal(run('enemyDef(vrakeber)'),ordinaryDef,'DEF returns without cumulative subtraction')
  // Prefixes are applied AFTER the exposed base is chosen: Sturdy 12 -> 20,
  // while the exposed base 3 -> 6. Equipment remains an independent +5.
  run(`vrakeber.def=12;vrakeber.gearBonuses=null;vrakeber.prefix='Sturdy';
    vrakeber.prefixBase={def:12};applyEnemyPrefix(vrakeber,'Sturdy');
    vrakeber.def+=5;vrakeber.gearBonuses={def:5};turnCount=41;
    exposeEnemyAfterMelee(vrakeber)`)
  assert.equal(run('enemyDef(vrakeber)'),11,'prefix and equipment apply after exposed base')
  run('vrakeber.prefix=null;vrakeber.prefixBase=null;vrakeber.def=17;vrakeber.gearBonuses={def:5}')
  run('chance=originalChance;vrakeber.alive=false')

  // Successful player attack crosses the health threshold but cannot prevent
  // lethal damage. The triggering action is not one of the four response turns.
  run('chance=()=>false;originalDamageRoll=damageRoll;damageRoll=()=>91')
  await run('playerAttackEnemy(tholosum)')
  assert.equal(run('tholosum.hp'),49)
  assert.equal(run('tholosum.shellRetreatUsed'),true)
  assert.equal(run('tholosum.shellRetreatTurns'),5)
  const shelledDef=run('enemyDef(tholosum)')
  run('tholosum.shellRetreatTurns=0')
  assert.equal(shelledDef-run('enemyDef(tholosum)'),12)
  run('tholosum.shellRetreatTurns=5')
  assert(run('tileInspectInfo(tholosum.x,tholosum.y).html.includes("Shell Retreat")'))

  run('enemyActions=0;enemyAttackPlayer=()=>{enemyActions++;return false};'
    +'caveTroll.alive=false;player.x=41;player.y=40')
  for(let i=0;i<5;i++){
    run('enemyTurn()')
    assert.equal(run('enemyActions'),0,'shell creature cannot attack during triggering/following turns')
    assert.equal(run('tholosum.shellRetreatTurns'),Math.max(0,4-i))
  }
  assert.equal(run('tholosum.shellRetreatUsed'),true)
  run('enemyTurn()')
  assert.equal(run('enemyActions'),1,'enemy resumes after four complete following player actions')
  assert.equal(run('tholosum.shellRetreatTurns'),0)
  run('tholosum.hp=1;triggerEnemyShellRetreat(tholosum)')
  assert.equal(run('tholosum.shellRetreatTurns'),0,'never reactivates after healing or damage')
  run('damageRoll=originalDamageRoll;tholosum.alive=false')

  // Regen is absolute per active simulation turn, even off-screen; no catch-up.
  run('caveTroll.alive=true;caveTroll.hp=caveTroll.maxHp-5;caveTroll.regenPhase=0;'
    +'enemyIsVisibleOnMainView=()=>false')
  const oldRng=run('rngState')
  run('tickEnemyRegeneration();tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),205)
  assert.equal(run('caveTroll.regenPhase'),2)
  run('tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),207)
  assert.equal(run('caveTroll.regenPhase'),0)
  assert.equal(run('rngState'),oldRng,'passive abilities consume no gameplay RNG')
  run('caveTroll.level=-2;tickEnemyRegeneration();tickEnemyRegeneration()')
  assert.equal(run('caveTroll.regenPhase'),0,'inactive floor pauses phase without catch-up')
  run('currentZ=-2;caveTroll.levelKind="chain";caveTroll.regenPhase=2;tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),209,'optional z:-2 cave troll regenerates under the same generic rule')
  assert.equal(run('caveTroll.regenPhase'),0)
  run('currentZ=0;caveTroll.levelKind=null')
  run('caveTroll.level=0;tickEnemyRegeneration()')
  assert.equal(run('caveTroll.regenPhase'),1)
  run('tickEnemyRegeneration();tickEnemyRegeneration();tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),210,'heal clamps to maximum HP')
  run('tickEnemyRegeneration();tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),210)
  run('caveTroll.hp=0;tickEnemyRegeneration()')
  assert.equal(run('caveTroll.hp'),0,'regen cannot revive')

  // A snapshot restores every gameplay-relevant counter exactly, including the
  // phase after two regen ticks and defensive status during a player response.
  run('caveTroll.hp=201;caveTroll.regenPhase=2;'
    +'tholosum.alive=true;tholosum.hp=49;tholosum.shellRetreatTurns=2;'
    +'tholosum.shellRetreatUsed=true;vrakeber.alive=true;vrakeber.exposedUntilTurn=turnCount+1')
  context.defenseSnapshot=plain(run('buildSaveObject()'))
  const names=['Vrakeber','Tholosum','Cave Troll']
  for(const name of names)assert(context.defenseSnapshot.enemies.some(e=>e.baseName===name))
  const rng=run('rngState')
  run('loadGameFromObject(defenseSnapshot,{isReplayInit:true})')
  assert.equal(run('rngState'),rng,'replay initialization does not advance RNG')
  const after=plain(run('enemies.filter(e=>["Vrakeber","Tholosum","Cave Troll"].includes(e.baseName))'))
  for(const e of after){
    const saved=context.defenseSnapshot.enemies.find(x=>x.id===e.id)
    for(const key of ['exposedUntilTurn','shellRetreatTurns','shellRetreatUsed','regenPhase'])
      assert.deepEqual(e[key],saved[key],`${e.baseName}: ${key} restored exactly`)
  }
  assert.equal(run('enemyDef(enemies.find(e=>e.baseName==="Vrakeber"))'),
    ordinaryDef-9,'post-load effective DEF still reflects exposure')
  assert.equal(run('enemyShellRetreating(enemies.find(e=>e.baseName==="Tholosum"))'),true)
  run('tickEnemyRegeneration()')
  assert.equal(run('enemies.find(e=>e.baseName==="Cave Troll").hp'),203,
    'restored phase produces exact next regeneration tick')
  console.log('PASS defensive mine abilities: attack misses, effective DEF, shell timing, regeneration, inactive floors and save/replay')
})().catch(err=>{console.error(err.stack);process.exitCode=1})
