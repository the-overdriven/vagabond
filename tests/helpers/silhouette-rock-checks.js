module.exports=function silhouetteRockChecks(){
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const center={x:20,y:20},variants=new Set(),rngBefore=rngState
  for(let shape=0;shape<8;shape++) {
    const cells=silhouetteObstacleCells(center,3,'cavewall',shape)
    const keys=new Set(cells.map(p=>keyXY(p.x,p.y)))
    const width=Math.max(...cells.map(p=>p.x))-Math.min(...cells.map(p=>p.x))+1
    const height=Math.max(...cells.map(p=>p.y))-Math.min(...cells.map(p=>p.y))+1
    check(cells.length>=5&&cells.length<=8,'large rocks use 5–8 cells')
    check(cells.length<width*height,'large rocks are not filled rectangles')
    check(keys.has(keyXY(center.x,center.y)),'rock still interrupts the target run')
    const seen=new Set([keyXY(center.x,center.y)]),queue=[center]
    for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){
      const x=queue[i].x+dx,y=queue[i].y+dy,k=keyXY(x,y)
      if(!keys.has(k)||seen.has(k))continue;seen.add(k);queue.push({x,y})
    }
    check(seen.size===cells.length,'rock cluster is connected')
    variants.add([...keys].sort().join('|'))
    const small=silhouetteObstacleCells(center,2,'cavewall',shape)
    check(small.length===3&&small.some(p=>p.x===center.x&&p.y===center.y),'small rocks are target-covering L shapes')
  }
  check(variants.size===8,'eight distinct larger rock outlines')
  const cm=blankCaveMap()
  for(let y=15;y<=25;y++)for(let x=15;x<=25;x++)cm[y][x]='cavefloor2'
  for(let y=20;y<=21;y++)for(let x=20;x<=21;x++)cm[y][x]='cavewall'
  check(silhouetteRockIsRectangle(cm,center),'a square island is detected')
  cm[20][20]='cavefloor2'
  check(!silhouetteRockIsRectangle(cm,{x:21,y:21}),'a chipped island is accepted')
  check(!silhouetteRockIsRectangle(cm,{x:0,y:0}),'surrounding rock mass is excluded')
  check(rngState===rngBefore,'outline geometry and rectangle detection consume no RNG')
  return true
}
