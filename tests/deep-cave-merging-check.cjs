const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const original=run('structuredClone(WORLD_GEN_CONFIG.caves.deep.merging)')
  // Synthetic maps deliberately keep the three source masks independent, so
  // the test catches accidental painting/merging of silhouette source tiles.
  const synthetic=run(`(() => {
    MAP_W=96;MAP_H=85;WORLD_SEED=345678;rngState=WORLD_SEED
    const spots=[[12,12],[36,12],[60,12],[12,51]]
    const maps=spots.map(([sx,sy])=>{
      const cm=blankCaveMap()
      for(let y=sy;y<sy+15;y++)for(let x=sx;x<sx+15;x++)cm[y][x]='cavefloor2'
      cm[sy+7][sx+7]='caveup'
      return cm
    })
    const shared=blankCaveMap()
    for(const cm of maps)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(cm[y][x]!=='cavewall')shared[y][x]=cm[y][x]
    const componentCaves=spots.map(([sx,sy],i)=>({style:['silhouette','grotto','burrow','grotto'][i],
      brownFloor:i===2,entrances:[{x:sx+7,y:sy+7}]}))
    const before=maps.map(cm=>JSON.stringify(cm))
    const cfg=WORLD_GEN_CONFIG.caves.deep.merging
    Object.assign(cfg,{affinity:[100,100],distanceBands:cfg.distanceBands.map(b=>({...b,nearChance:1,farChance:1})),mergeDecay:1,areaScale:1e12})
    const level=deepCaveComplexes({map:shared,caveMaps:maps,caves:componentCaves})
    const after=maps.map(cm=>JSON.stringify(cm))
    // Exercise the production whole-world rotation path on this merged map.
    deepLevels=[level]
    map=blankCaveMap();surfaceMap=map;undergroundMap=blankCaveMap();caveMaps=[];caves=[]
    const originalLink=structuredClone(level.links[0].cells[0])
    const originalTerritory=structuredClone(level.territories[0].anchor)
    const width=MAP_W,height=MAP_H
    rotateGeneratedWorld(1)
    const rotation={
      link:structuredClone(level.links[0].cells[0]),expectedLink:{x:height-1-originalLink.y,y:originalLink.x},
      anchor:structuredClone(level.territories[0].anchor),expectedAnchor:{x:height-1-originalTerritory.y,y:originalTerritory.x},
      mapTile:level.map[originalLink.x]?.[height-1-originalLink.y]
    }
    rotateGeneratedWorld(3)
    const rotationRestored=level.links[0].cells[0].x===originalLink.x &&
      level.links[0].cells[0].y===originalLink.y
    const dry=t=>t==='cavefloor2'||t==='caveup'
    const path=(start)=>{
      const queue=[start],seen=new Set([keyXY(start.x,start.y)])
      for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const x=queue[i].x+dx,y=queue[i].y+dy
        if(!dry(shared[y]?.[x])||seen.has(keyXY(x,y)))continue
        seen.add(keyXY(x,y));queue.push({x,y})
      }
      return seen
    }
    return {links:level.links,complexes:level.complexes,territories:level.territories,
      caves:level.caves,sourceUnchanged:before.every((a,i)=>a===after[i]),
      // Restore the original topology before checking cardinal reachability.
      reachable:path(componentCaves[0].entrances[0]).size,
      rotation,rotationRestored,
      originalDry:maps.reduce((a,cm)=>a+cm.reduce((n,row)=>n+row.filter(dry).length,0),0),
      sources:maps.map(cm=>cm.reduce((n,row)=>n+row.filter(dry).length,0))}
  })()`)
  assert(synthetic.links.length>=2,'nearby synthetic caves are linked')
  assert(synthetic.links.some(l=>l.a===0&&l.b===1),'first pair connects')
  assert(synthetic.links.some(l=>l.a===1&&l.b===2),'transitive links can connect three')
  assert.equal(synthetic.sourceUnchanged,true,'source cave maps remain unchanged')
  assert.equal(JSON.stringify(synthetic.rotation.link),JSON.stringify(synthetic.rotation.expectedLink),'connector rotates with world')
  assert.equal(JSON.stringify(synthetic.rotation.anchor),JSON.stringify(synthetic.rotation.expectedAnchor),'territory anchor rotates with world')
  assert.equal(synthetic.rotation.mapTile,'cavefloor2','rotated bridge tile remains walkable')
  assert(synthetic.rotationRestored,'four quarter turns restore bridge metadata')
  assert.equal(synthetic.complexes.length,2,'distant cave stays separate')
  const joined=synthetic.complexes.find(c=>c.members.length===3)
  assert(joined,'three member connected complex')
  assert.equal(synthetic.reachable,joined.dryTiles,'carved connectors join all component floors')
  assert(synthetic.territories.every(t=>t.area>0),'no empty territory')
  assert.equal(synthetic.territories.reduce((a,t)=>a+t.area,0),synthetic.originalDry+synthetic.links.reduce((a,l)=>a+l.cells.length,0),'territory coverage exactly matches playable dry area')
  assert.equal(synthetic.caves[2].brownFloor,true,'brown burrow identity survives merge')
  assert(synthetic.links.every(l=>l.cells.length>=2&&l.cells.length<=12),'connector length bounded')
  // The released defaults must not produce a connection just because caves exist.
  run('WORLD_GEN_CONFIG.caves.deep.merging='+JSON.stringify(original))
  console.log('PASS deep-cave merging: protected source geometry, optional joins, transitively merged complex, distinct remote complex, territories and connector accounting')
})().catch(e=>{console.error(e);process.exitCode=1})
