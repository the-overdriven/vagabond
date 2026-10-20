// The actual generated world, not an approximate procedural mock.
module.exports = function deepCaveTopologyChecks() {
  const level = deepLevels[0]
  const styles = new Set(level.caves.filter(c=>!c.crypt).map(c=>c.style))
  for (const name of ['silhouette','grotto','burrow']) if (!styles.has(name)) throw Error('Missing cave style: '+name)
  for (let i=0;i<level.caves.length;i++) {
    const cave=level.caves[i],cm=level.caveMaps[i],start=cave.entrances[0]
    const walkable = tile => tile==='cavefloor2'||tile==='caveup'
    if(!walkable(cm[start.y]?.[start.x]))throw Error('No accessible stair landing')
    const seen=new Set([start.x+','+start.y]),q=[start]
    for(let k=0;k<q.length;k++)for(const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const x=q[k].x+dx,y=q[k].y+dy,key=x+','+y
      if(!walkable(cm[y]?.[x])||seen.has(key))continue
      seen.add(key);q.push({x,y})
    }
    let dry=0,water=0
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
      const tile=cm[y][x]
      if(walkable(tile))dry++
      else if(tile==='water')water++
      if(tile!=='cavewall' && tile!==level.map[y][x])throw Error('Local/shared cave mismatch')
    }
    if(dry!==seen.size)throw Error('Dry disconnected component '+i)
    if(cave.hasWater!==(water>0))throw Error('Water metadata mismatch '+i)
    if(cave.style==='burrow' && !cave.brownFloor && !level.caves.some(c=>c.brownFloor))throw Error('Brown burrow missing')
  }
  return true
}
