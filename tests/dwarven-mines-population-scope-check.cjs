'use strict'
const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  const groups=plain(run('minePackageConfig().encounters.groups'))
  const species=[...groups.early,...groups.middle,...groups.late]
  assert.equal(species.length,19)
  assert.equal(new Set(species).size,19)
  assert(run('minePackageConfig().encounters.guaranteeEachSpecies'))
  assert(species.every(name=>run(`!surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME[${JSON.stringify(name)}])`)),
    'mine species cannot enter ordinary surface spawning')
  assert(run('surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME.GiantRat)') ||
    run('surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME["Giant Rat"])'),
    'ordinary surface enemies remain eligible')

  // An isolated three-floor mine is sufficient to exercise population rules.
  // This avoids depending on portrait assets used by unrelated cave generation.
  for(const seed of [610061,610063,554433]){
    run(`MAP_W=184;MAP_H=184;WORLD_SEED=${seed};rngState=WORLD_SEED;
      enemies=[];groundItems=[];occupied=new Set();nextEnemyId=1;
      deepLevels=Array.from({length:7},()=>({kind:'unused'}));
      for(let i=0;i<3;i++){
        let level=null
        for(let retry=0;retry<12 && !level;retry++)level=mineFloorCandidate(i,3)
        if(!level)throw Error('Mine layout failed for '+i)
        deepLevels.push(level)
      }
      spawnDwarvenMinesEncounters()`)
    const encounters=plain(run('enemies.map(e=>({name:e.baseName,z:e.level,x:e.x,y:e.y}))'))
    for(const [index,names] of [groups.early,groups.middle,groups.late].entries())
      for(const name of names)assert(encounters.some(e=>e.name===name && e.z===-9-index),
        `seed ${seed}: ${name} must appear on its designated floor`)
    assert(encounters.every(e=>species.includes(e.name)),`seed ${seed}: no cross-ecosystem spawns`)
  }
  assert.equal(run('WORLD_GEN_CONFIG.dungeons.dwarvenMines.visibilityRadius'),5)
  assert.equal(run('UndergroundFov.RADIUS'),8)
  assert.equal(run('MERCHANT_STOCK_CONFIG.scrolls.homecomingScroll.merchantPrice'),70)
  assert.equal(run('itemDefinition("homecomingscroll").baseValue'),70)
  console.log('PASS Mine population guarantees, surface exclusion and radius/pricing config')
})().catch(err=>{console.error(err.stack);process.exitCode=1})
