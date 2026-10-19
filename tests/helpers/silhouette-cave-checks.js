// Shared by the focused Node and browser suites. Uses the real game functions.
module.exports = function silhouetteCaveChecks() {
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const level=deepLevels[0]
  check(level.caves.length>=3,'three required deep caves')
  for(const style of ['silhouette','grotto','burrow']) check(level.caves.some(c=>c.style===style),'required '+style)
  check(level.caves.some(c=>c.style==='burrow'&&c.brownFloor),'brown burrow retained')
  check(!caves.some(c=>c.style==='silhouette'),'no shallow silhouette')
  const occupied=new Set()
  for(let i=0;i<level.caves.length;i++) {
    const cave=level.caves[i],cm=level.caveMaps[i],e=cave.entrances[0]
    check(undergroundMap[e.y][e.x]==='cavedown'&&cm[e.y][e.x]==='caveup','paired stairs')
    const seen=new Set([keyXY(e.x,e.y)]),queue=[e]
    for(let n=0;n<queue.length;n++) for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x=queue[n].x+dx,y=queue[n].y+dy,k=keyXY(x,y)
      if(!TILE[cm[y]?.[x]]?.walk||seen.has(k))continue
      seen.add(k);queue.push({x,y})
    }
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++) if(cm[y][x]!=='cavewall') {
      const k=keyXY(x,y)
      check(!occupied.has(k),'deep caves never overlap');occupied.add(k)
      if(TILE[cm[y][x]]?.walk) check(seen.has(k),'all dry floors reachable from stairs')
      check(level.map[y][x]===cm[y][x],'shared map matches local cave')
    }
    if(cave.style==='silhouette') {
      check(cm.reduce((sum,row)=>sum+row.filter(t=>TILE[t]?.walk).length,0)>=WORLD_GEN_CONFIG.caves.deep.silhouette.minFloorTiles,'silhouette retains at least 500 dry tiles after separators')
      check(Array.isArray(cave.silhouetteIds)&&[2,3,4].includes(cave.silhouetteIds.length)&&new Set(cave.silhouetteIds).size===cave.silhouetteIds.length,'two to four distinct source silhouettes')
      check(cave.silhouetteIds.every(id=>CAVE_SILHOUETTE_SOURCES.some(p=>p.id===id)),'real image sources')
      check(cave.silhouetteId===cave.silhouetteIds.join('+'),'combined prototype identity')
      check(cave.silhouetteIds.length===CaveSilhouettes.sourceCountForSeed(WORLD_SEED),'seeded silhouette count')
      check(cave.hasWater===cm.some(row=>row.includes('water')),'water metadata matches map')
      for(const [dx,dy] of [[1,0],[0,1]])for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++){
        if(!TILE[cm[y][x]]?.walk||TILE[cm[y-dy]?.[x-dx]]?.walk)continue
        let length=0
        for(let xx=x,yy=y;TILE[cm[yy]?.[xx]]?.walk;xx+=dx,yy+=dy)length++
        check(length<=15,'silhouette cardinal floor runs never exceed 15 tiles')
      }
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)check(TILE[cm[e.y+dy][e.x+dx]]?.walk,'clear stair landing')
    }
  }
  check(isBigBellReachableFromTemple()&&isTempleConnectedToEdge(),'surface reachability')
  check(dwarvenRuin&&surfaceReachableFromTemple().has(keyXY(dwarvenRuin.x,dwarvenRuin.y)),'fort accessible')
  check(caves.filter(c=>!c.crypt).every(c=>(c.entrances||[]).every(e=>
    surfaceMap[e.y][e.x]==='caveentrance'&&Math.max(Math.abs(e.x-dwarvenRuin.x),Math.abs(e.y-dwarvenRuin.y))>15)), 'entrance rendering and fort separation')
  return true
}
