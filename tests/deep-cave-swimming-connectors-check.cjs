const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const original=run('structuredClone(WORLD_GEN_CONFIG.caves.deep.merging)')
  const cases=[]
  for(const flooded of [false,true]){
    const result=run(`(()=>{
      MAP_W=95; MAP_H=85; WORLD_SEED=222; rngState=WORLD_SEED
      const spots=[[10,10],[32,10]]
      const maps=spots.map(([sx,sy])=>{
        const cm=blankCaveMap()
        for(let y=sy;y<sy+12;y++)for(let x=sx;x<sx+12;x++)cm[y][x]='cavefloor2'
        cm[sy+6][sx+6]='caveup'; return cm
      })
      const shared=blankCaveMap()
      for(const cm of maps)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
        if(cm[y][x]!=='cavewall')shared[y][x]=cm[y][x]
      const cfg=WORLD_GEN_CONFIG.caves.deep.merging
      Object.assign(cfg,{affinity:[100,100],distanceBands:cfg.distanceBands.map(b=>({...b,nearChance:1,farChance:1})),
        mergeDecay:1,areaScale:1e12,waterPassageChance:1,waterPassageFloodChance:${flooded?1:0}})
      const level=deepCaveComplexes({map:shared,caveMaps:maps,caves:spots.map(([sx,sy],i)=>({
        style:i?'burrow':'silhouette',brownFloor:!!i,entrances:[{x:sx+6,y:sy+6}]}))})
      const link=level.links[0]
      const key=p=>p.x+','+p.y
      const wetSet=new Set(link.waterCells.map(key))
      const submerged=link.cells.filter(p=>wetSet.has(key(p)))
      const isDry=p=>level.map[p.y][p.x]==='cavefloor2'
      const stairOk=spots.every(([sx,sy])=>level.map[sy+6][sx+6]==='caveup')
      const path=(canSwim)=>{
        const start={x:16,y:16},end={x:38,y:16},seen=new Set([key(start)]),queue=[start],dirs=[[0,1],[0,-1],[1,0],[-1,0]]
        for(let head=0;head<queue.length;head++){
          const p=queue[head];if(key(p)===key(end))return true
          for(const [dx,dy]of dirs){const q={x:p.x+dx,y:p.y+dy},k=key(q),t=level.map[q.y]?.[q.x]
            if(!seen.has(k)&&(t==='cavefloor2'||t==='caveup'||(canSwim&&t==='water'))){seen.add(k);queue.push(q)}
          }
        }
        return false
      }
      level.discovered=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false))
      deepLevels=[level];map=blankCaveMap();surfaceMap=map;undergroundMap=blankCaveMap();caveMaps=[];caves=[]
      discovered=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false))
      undergroundDiscoveredL1=Array.from({length:MAP_H},()=>new Array(MAP_W).fill(false))
      // The saved flooded path and its new tile semantics must rotate with the map.
      const wetBefore=structuredClone(link.waterCells)
      rotateGeneratedWorld(1)
      const rotated=wetBefore.every((p,i)=>level.links[0].waterCells[i].x===85-1-p.y &&
        level.links[0].waterCells[i].y===p.x && level.map[p.x][85-1-p.y]==='water')
      rotateGeneratedWorld(3)
      const save=JSON.parse(JSON.stringify(buildSaveObject()))
      const current=JSON.stringify({map:level.map,links:level.links,complexes:level.complexes,territories:level.territories})
      loadGameFromObject(save,{isReplayInit:true})
      const restored=JSON.stringify({map:deepLevels[0].map,links:deepLevels[0].links,
        complexes:deepLevels[0].complexes,territories:deepLevels[0].territories})===current
      return {linkLength:link.cells.length,submerged:submerged.length,
        endpointsDry:isDry(link.cells[0])&&isDry(link.cells[link.cells.length-1]),
        dryPass:path(false),swimPass:path(true),stairOk,
        waterPersist:submerged.every(p=>deepLevels[0].map[p.y][p.x]==='water'),
        unmodified:maps.every((cm,i)=>JSON.stringify(cm)===JSON.stringify(deepLevels[0].caveMaps[i])),
        rotated,restored,version:save.version,dryTiles:level.complexes[0].dryTiles}
    })()`)
    assert(result.linkLength>=3,'connector is long enough')
    assert.equal(result.stairOk,true,'both source stairs remain accessible')
    assert.equal(result.endpointsDry,true,'safe dry landing at both ends')
    assert.equal(result.swimPass,true,'Swimming permits passage')
    assert.equal(result.dryPass,!flooded,'dry crossing blocked only for flooded connectors')
    assert.equal(result.unmodified,true,'source caves are not modified')
    assert.equal(result.rotated,true,'flooded connector cells rotate with their links')
    assert.equal(result.restored,true,'save and replay preserve the complete shared map')
    assert.equal(result.version,103,'new current-save schema')
    assert.equal(result.waterPersist,true,'submerged cells restore as water')
    if(flooded)assert(result.submerged>=1&&result.submerged<=3,'short crossing fits Swimming 5')
    else assert.equal(result.submerged,0,'ordinary water-lined links keep dry causeway')
    cases.push({flooded,...result})
  }
  run('WORLD_GEN_CONFIG.caves.deep.merging='+JSON.stringify(original))
  console.log('PASS ordinary and swimming-only deep cave connectors:',JSON.stringify(cases))
})().catch(e=>{console.error(e);process.exitCode=1})
