// Test the real optional-link pass, not just the configuration math.
// Cavern geometry is synthetic so PNG availability cannot affect the result.
const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const cfg=run('structuredClone(WORLD_GEN_CONFIG.caves.deep.merging)')
  const chances=run('([2,4,5,7,8,9,12,13].map(d=>deepCaveMergeDistanceChance(WORLD_GEN_CONFIG.caves.deep.merging,d)))')
  assert.equal(JSON.stringify(chances.map(n=>Number(n.toFixed(2)))),JSON.stringify([.85,.70,.60,.4667,.40,.30,.16,0].map(n=>Number(n.toFixed(2)))),
    'piecewise distance bands, zero chance beyond maximum rock gap')
  assert.equal(JSON.stringify(cfg.affinity),JSON.stringify([85,115]),'nonzero but varied world merging affinity')
  assert.equal(cfg.mergeDecay,.6,'large complexes remain discouraged')
  const gaps=[2,7,12,13]
  const summaries=run(`(() => {
    MAP_W=84;MAP_H=58
    const gaps=${JSON.stringify(gaps)},results=[]
    const rect=(cm,x0)=>{
      for(let y=20;y<=30;y++)for(let x=x0;x<x0+11;x++)cm[y][x]='cavefloor2'
      cm[25][x0+5]='caveup'
      return {x:x0+5,y:25}
    }
    for(const gap of gaps){
      let links=0,invalid=0
      for(let seed=1;seed<=80;seed++){
        WORLD_SEED=seed*373+gap;rngState=WORLD_SEED
        const sources=[blankCaveMap(),blankCaveMap()]
        const entrances=[rect(sources[0],12),rect(sources[1],23+gap)]
        const shared=blankCaveMap()
        for(const cm of sources)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
          if(cm[y][x]!=='cavewall')shared[y][x]=cm[y][x]
        const before=sources.map(cm=>JSON.stringify(cm))
        const level=deepCaveComplexes({map:shared,caveMaps:sources,caves:entrances.map(e=>({entrances:[e]}))})
        if(level.links.length){
          links++
          if(level.links.length!==1 || level.links[0].cells.length!==gap ||
             level.complexes.length!==1 || level.complexes[0].members.length!==2)invalid++
          for(const cell of level.links[0].cells)if(shared[cell.y][cell.x]!=='cavefloor2')invalid++
        }
        if(before.some((old,i)=>old!==JSON.stringify(sources[i])))invalid++
        if(level.caves.some((c,i)=>shared[entrances[i].y][entrances[i].x]!=='caveup'))invalid++
      }
      results.push({gap,links,invalid})
    }
    return results
  })()`)
  for(const sample of summaries)assert.equal(sample.invalid,0,'corridors preserve source masks and stairs')
  assert(summaries[0].links>=45,'2-rock gaps commonly connect')
  assert(summaries[1].links>=19 && summaries[1].links<=56,'7-rock gaps sometimes connect')
  assert(summaries[2].links>=4 && summaries[2].links<=30,'12-rock gaps rarely connect')
  assert.equal(summaries[3].links,0,'13-rock gaps cannot connect')
  assert(summaries[0].links>summaries[1].links && summaries[1].links>summaries[2].links,
    'observed merge frequency falls with rock distance')
  console.log('PASS deep cave merge odds:',JSON.stringify(summaries))
})().catch(e=>{console.error(e);process.exitCode=1})
