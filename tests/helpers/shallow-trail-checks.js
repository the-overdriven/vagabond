module.exports=function shallowTrailChecks(){
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  for(const cave of caves.filter(c=>!c.crypt&&c.entrances?.length>1)){
    const cm=caveMaps[caves.indexOf(cave)],start=cave.entrances[0],seen=new Set([keyXY(start.x,start.y)]),queue=[start]
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
      if(!['cavefloor','caveentrance','cavedown'].includes(cm[y]?.[x])||seen.has(k))continue
      seen.add(k);queue.push({x,y})
    }
    for(const e of cave.entrances){
      check(cm[e.y][e.x]==='caveentrance'&&undergroundMap[e.y][e.x]==='caveentrance','entrances preserved in local and merged maps')
      check(seen.has(keyXY(e.x,e.y)),'paired entrances have a cardinal dry route')
    }
  }
  const crypt=caves.find(c=>c.crypt),start=crypt?.entrances?.[0]
  if(start){
    const seen=new Set([keyXY(start.x,start.y)]),queue=[start]
    for(let i=0;i<queue.length;i++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue
      const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
      if(!TILE[undergroundMap[y]?.[x]]?.walk||seen.has(k))continue
      seen.add(k);queue.push({x,y})
    }
    check(caves.filter(c=>!c.crypt).every(c=>(c.entrances||[]).every(e=>!seen.has(keyXY(e.x,e.y)))),'crypt remains separate after merge/rotation')
  }
  return true
}
