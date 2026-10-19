module.exports=function silhouetteOutlineChecks(){
  const check=(ok,msg)=>{if(!ok)throw Error(msg)}
  const bounds={x1:10,y1:10,x2:65,y2:65},spot={x:35,y:35},tile='cavefloor2'
  const make=()=>{
    const cm=blankCaveMap()
    for(let y=15;y<=60;y++)for(let x=15;x<=60;x++)cm[y][x]=tile
    // A protected enclosed rock island, as distinct from exterior contour.
    for(let y=30;y<=32;y++)for(let x=25;x<=27;x++)cm[y][x]='cavewall'
    return cm
  }
  const rngBefore=rngState,first=make(),before=first.map(row=>row.slice())
  const floor=before.flat().filter(t=>t===tile).length
  const changed=softenSilhouetteOutline(first,bounds,spot,tile)
  check(changed>0,'flat rectangular contour is softened')
  check(changed<=Math.floor(floor*WORLD_GEN_CONFIG.caves.deep.silhouette.outlineChangeFraction),'bounded contour changes')
  let actual=0,westChanged=false
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    if(first[y][x]!==before[y][x]){
      actual++;check(x>bounds.x1&&x<bounds.x2&&y>bounds.y1&&y<bounds.y2,'reserved boundary remains solid')
      if(x<=16)westChanged=true
    }
  }
  check(actual===changed&&westChanged,'west cut-off edge gains a contour')
  for(let y=30;y<=32;y++)for(let x=25;x<=27;x++)check(first[y][x]==='cavewall','enclosed rock hole preserved')
  for(let y=34;y<=36;y++)for(let x=34;x<=36;x++)check(first[y][x]===tile,'stair landing preserved')
  check(silhouetteDryFloorConnected(first,bounds,spot,tile),'dry connectivity preserved')
  const second=make();softenSilhouetteOutline(second,bounds,spot,tile)
  check(JSON.stringify(first)===JSON.stringify(second),'same seed produces identical smoothing')
  check(rngState===rngBefore,'contour hash consumes no gameplay RNG')
  // A one-tile branch and its junction must survive without any contour edits.
  const narrow=blankCaveMap()
  for(let y=30;y<=40;y++)for(let x=30;x<=40;x++)narrow[y][x]=tile
  for(let x=15;x<30;x++)narrow[35][x]=tile
  const oldBranch=Array.from({length:15},(_,i)=>narrow[35][15+i])
  softenSilhouetteOutline(narrow,bounds,spot,tile)
  check(oldBranch.every((value,i)=>narrow[35][15+i]===value),'one-tile limb and junction preserved')
  check(silhouetteDryFloorConnected(narrow,bounds,spot,tile),'branch stays connected')
  // Stair safety applies even when the landing lies along the flat outer edge.
  const edge=make(),edgeSpot={x:16,y:35}
  softenSilhouetteOutline(edge,bounds,edgeSpot,tile)
  for(let y=34;y<=36;y++)for(let x=15;x<=17;x++)check(edge[y][x]===tile,'edge landing preserved')
  return true
}
