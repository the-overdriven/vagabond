const assert = require('node:assert/strict')
const {run} = require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  // Three independently seeded silhouette selections can use disjoint image
  // sources; loading is completed before generation, not in an RNG-driven loop.
  const sourceSets=run(`(()=>{
    let available=CAVE_SILHOUETTE_SOURCES.slice(),result=[]
    for(let i=0;i<3;i++){
      const salt=i===0?12345:CaveSilhouettes.sourceForSeed(12345+i,available).id.length*12345+i
      const chosen=CaveSilhouettes.sourcesForSeed(salt,available)
      result.push(chosen.map(s=>s.id))
      available=available.filter(s=>!chosen.some(c=>c.id===s.id))
    }
    return result
  })()`)
  assert.equal(new Set(sourceSets.flat()).size,sourceSets.flat().length,'distinct selected images for different silhouettes')
  const original=run('structuredClone(WORLD_GEN_CONFIG.caves.deep)')
  const observations=[]
  for(const seed of [42,12345,67893,79113,111223,1535226484]){
    const result=run(`(()=>{
      applyWorldTraits([],'S');MAP_W=430;MAP_H=430;WORLD_SEED=${seed};rngState=WORLD_SEED;
      // The complete game normally loads these from distinct PNG source sets.
      // Synthetic masks exercise worldgen without relying on browser assets.
      const shapes=[
        (x,y)=>((x-15)**2+(y-15)**2<215),
        (x,y)=>Math.abs(x-15)<9 || (Math.abs(y-15)<7 && x>8 && x<26),
        (x,y)=>((x-15)**2/170+(y-15)**2/70<1) || (x>=13&&x<=19&&y<28)
      ];
      CAVE_SILHOUETTES=shapes.map((test,i)=>({id:'shape-'+i,sourceIds:['source-'+i],
        rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>test(x,y)?'1':'0').join(''))}));
      const anchors=[[68,70],[210,70],[345,70],[68,330],[210,330],[345,330]],local=[],parent=blankCaveMap()
      for(const [ax,ay] of anchors){
        const cm=blankCaveMap()
        for(let y=ay-13;y<=ay+13;y++)for(let x=ax-13;x<=ax+13;x++){
          cm[y][x]='cavefloor';parent[y][x]='cavefloor'
        }
        local.push(cm)
      }
      const parents=anchors.map(([x,y])=>({x,y,entrances:[{x,y}]}))
      const deep=generateDeepLevel(parents,local,parent,'cavefloor','cavefloor2','cavedown','caveup')
      const ids=deep.caves.filter(c=>c.style==='silhouette').map(c=>c.silhouetteId)
      const dry=t=>t==='cavefloor2'||t==='caveup';
      const floors=deep.caveMaps.map(cm=>cm.reduce((sum,row)=>sum+row.filter(dry).length,0))
      const own=deep.caves.every((c,i)=>{
        const p=c.entrances[0]
        return deep.caveMaps[i][p.y][p.x]==='caveup' && parent[p.y][p.x]==='cavedown'
      })
      return {styles:deep.caves.map(c=>c.style),ids,stairsValid:own,links:deep.links.length,floors}
    })()`)
    assert(result.styles.includes('silhouette') && result.styles.includes('grotto') && result.styles.includes('burrow'),'required styles survive optional replacements')
    assert.equal(result.stairsValid,true,'every staircase is paired')
    assert(result.ids.length<=3,'silhouette maximum respected')
    assert.equal(new Set(result.ids).size,result.ids.length,'every silhouette uses a different source composite')
    assert(result.floors.every(n=>n>=120),'usable cave geometry')
    observations.push({seed,styles:result.styles,ids:result.ids})
  }
  assert(observations.some(o=>o.ids.length>1),'multiple silhouette caves actually appear for fixed seeds')
  assert(observations.some(o=>o.ids.length===1),'more than one silhouette is not guaranteed')
  // Merging uses the shared map only; water flank cells are optional visual
  // landscape and never overwrite a traversable connection or source floor.
  const wet=run(`(()=>{
    MAP_W=95;MAP_H=85;WORLD_SEED=222;rngState=WORLD_SEED
    const spots=[[10,10],[32,10]],maps=spots.map(([sx,sy])=>{
      const cm=blankCaveMap()
      for(let y=sy;y<sy+12;y++)for(let x=sx;x<sx+12;x++)cm[y][x]='cavefloor2'
      cm[sy+6][sx+6]='caveup';return cm
    })
    const shared=blankCaveMap()
    for(const cm of maps)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(cm[y][x]!=='cavewall')shared[y][x]=cm[y][x]
    const before=JSON.stringify(maps)
    const cfg=WORLD_GEN_CONFIG.caves.deep.merging
    Object.assign(cfg,{affinity:[100,100],distanceBands:cfg.distanceBands.map(b=>({...b,nearChance:1,farChance:1})),
      mergeDecay:1,areaScale:1e12,waterPassageChance:1})
    const level=deepCaveComplexes({map:shared,caveMaps:maps,caves:spots.map(([sx,sy],i)=>({
      style:i?'burrow':'silhouette',brownFloor:!!i,entrances:[{x:sx+6,y:sy+6}]}))})
    const link=level.links[0]
    level.discovered=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false));
    deepLevels=[level];map=blankCaveMap();surfaceMap=map;undergroundMap=blankCaveMap();caveMaps=[];caves=[];
    discovered=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false));
    undergroundDiscoveredL1=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false))
    const originalWater=structuredClone(link.waterCells)
    rotateGeneratedWorld(1)
    const rotated=originalWater.every((p,i)=>level.links[0].waterCells[i].x===85-1-p.y&&
      level.links[0].waterCells[i].y===p.x && level.map[p.x][85-1-p.y]==='water')
    rotateGeneratedWorld(3)
    const encoded=JSON.stringify({map:level.map,links:level.links})
    const save=JSON.parse(JSON.stringify(buildSaveObject()))
    loadGameFromObject(save,{isReplayInit:true})
    const restored=JSON.stringify({map:deepLevels[0].map,links:deepLevels[0].links})===encoded
    return {length:link.cells.length,water:link.waterCells.length,unchanged:before===JSON.stringify(level.caveMaps),
      dry:link.cells.every(p=>level.map[p.y][p.x]==='cavefloor2'),
      wet:link.waterCells.every(p=>level.map[p.y][p.x]==='water'),rotated,restored}
  })()`)
  assert(wet.length>=3,'a full dry connector exists')
  assert(wet.water>0,'water-lined connector can be generated')
  assert(wet.dry && wet.wet && wet.unchanged && wet.rotated && wet.restored,'water and dry route survive rotation without source map edits')
  run('WORLD_GEN_CONFIG.caves.deep='+JSON.stringify(original))
  console.log('PASS multiple independent silhouette caves (with occasional single silhouettes), source geometry, optional water-lined dry connectors, tile preservation and rotation:',JSON.stringify(observations))
})().catch(e=>{console.error(e);process.exitCode=1})
