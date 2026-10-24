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

  // An isolated five-floor mine exercises the optional deepest tier as well.
  // This avoids depending on portrait assets used by unrelated cave generation.
  for(const seed of [610061,610063,554433]){
    run(`MAP_W=184;MAP_H=184;WORLD_SEED=${seed};rngState=WORLD_SEED;
      enemies=[];groundItems=[];occupied=new Set();nextEnemyId=1;
      deepLevels=Array.from({length:7},()=>({kind:'unused'}));
      var isolatedMine=[];
      for(let i=0;i<5;i++){
        let level=null
        for(let retry=0;retry<12 && !level;retry++)level=mineFloorCandidate(i,5)
        if(!level)throw Error('Mine layout failed for '+i)
        isolatedMine.push(level)
      }
      if(!mineAlignCageShaft(isolatedMine) || !mineFloodSideChambers(isolatedMine))throw Error('Mine flood/shaft failed');
      deepLevels.push(...isolatedMine);
      spawnDwarvenMinesEncounters()`)
    const encounters=plain(run('enemies.map(e=>({name:e.baseName,z:e.level,x:e.x,y:e.y}))'))
    for(const [index,names] of [groups.early,groups.middle,groups.late].entries())
      for(const name of names)assert(encounters.some(e=>e.name===name && e.z===-10-index),
        `seed ${seed}: ${name} must appear on its designated floor`)
    const respite=new Set(['Giant Rat','Giant Bat','Scarab','Giant Spider'])
    const first=encounters.filter(e=>e.z===-9)
    assert(first.length>0 && first.every(e=>respite.has(e.name)),`seed ${seed}: respite contains only weak creatures / optional Spider`)
    assert(first.filter(e=>e.name==='Giant Spider').length<=1,'at most one Giant Spider on respite floor')
    assert(encounters.every(e=>species.includes(e.name) || (e.z===-9 && respite.has(e.name))),
      `seed ${seed}: no unintended cross-ecosystem spawns`)
    assert(!encounters.some(e=>['Banshee','Ogre'].includes(e.name)),
      `seed ${seed}: Fort monsters cannot enter mine encounter groups`)
    for(const encounter of encounters.filter(e=>e.z<=-10)) {
      const group=groups.early.includes(encounter.name)?'early':groups.middle.includes(encounter.name)?'middle':'late'
      const firstDepth={early:10,middle:11,late:12}[group]
      assert(Math.abs(encounter.z)>=firstDepth,`${encounter.name} is not above its intended tier`)
      assert(run(`enemyDepthBiomeEligible(ENEMY_TEMPLATE_BY_NAME[${JSON.stringify(encounter.name)}],${encounter.z})`),
        `${encounter.name} satisfies its minimum-depth biome on z${encounter.z}`)
    }
  }
  assert.equal(run('WORLD_GEN_CONFIG.dungeons.dwarvenMines.visibilityRadius'),5)
  assert.equal(run('UndergroundFov.RADIUS'),8)
  assert.equal(run('TILE.dwarvenminessealed.mini'),run('TILE.dwarvenminesopen.mini'),
    'collapsed mine entrance uses the existing red map exit color')
  for(const stair of ['up','down']){
    assert.equal(run(`RENDER_STYLE.terrainTiles.minestairs${stair}.image`),
      `img/tiles/shoddy-mine-stairs-${stair}.png`)
    assert.equal(run(`RENDER_STYLE.terrainTiles.minestairs${stair}.baseTileKey`),'cavefloorBrown')
  }
  assert.equal(run('RENDER_STYLE.terrainTiles.cavefloorBrown.image'),
    'img/tiles/cave-floor-brown-dark.png','mines reuse the existing brown cave floor asset')
  const miniature=plain(run(`(() => {
    const ctx={fillStyle:null,clearRect(){},fillRect(){this.last=this.fillStyle}}
    const base={scale:1,ctx}
    const mineLayer=deepLevels[chainDepthForZ(-9)-2]
    const pos=mineLayer.map.flatMap((row,y)=>row.map((tile,x)=>tile==='cavefloor2'?{x,y}:null))
      .find(Boolean)
    paintMiniTile(base,pos.x,pos.y,{z:-9,terrain:mineLayer.map,
      seen:{[pos.y]:{[pos.x]:true}}})
    const mineColor=ctx.last
    currentZ=-9;map=mineLayer.map
    const mineImage=terrainVisual('cavefloor2',pos.x,pos.y)?.image
    const sand=[["sand"]],seen=[[true]]
    dugSandTiles=new Set(['0,0'])
    paintMiniTile(base,0,0,{z:0,terrain:sand,seen})
    return {mineColor,mineImage,dugColor:ctx.last}
  })()`))
  assert.equal(miniature.mineColor,run('RENDER_STYLE.minimap.brownCave'))
  assert.equal(miniature.mineImage,run('RENDER_STYLE.terrainTiles.cavefloorBrown.image'))
  assert.equal(miniature.dugColor,run('RENDER_STYLE.specialTiles.dugSand.bg'))
  assert.equal(run('MERCHANT_STOCK_CONFIG.scrolls.homecomingScroll.merchantPrice'),70)
  assert.equal(run('itemDefinition("homecomingscroll").baseValue'),70)
  console.log('PASS Mine population guarantees, surface exclusion and radius/pricing config')
})().catch(err=>{console.error(err.stack);process.exitCode=1})
