const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const fixture=require('./fixtures/silhouette-flat-west.json')
const checks=require('./helpers/silhouette-outline-checks.js')
;(async()=>{
  await run('loadContent()')
  for(const seed of [12345,1420044060,67893]){
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED`)
    assert(run('('+checks.toString()+')()'))
  }
  context.flatWest=fixture
  run(`MAP_W=flatWest.mapWidth;MAP_H=flatWest.mapHeight;WORLD_SEED=flatWest.worldSeed;
    var realCave=blankCaveMap();
    flatWest.rows.forEach((row,y)=>Array.from(row).forEach((cell,x)=>{
      realCave[flatWest.bounds.y1+y][flatWest.bounds.x1+x]=cell==='.'?'cavefloor2':cell==='~'?'water':'cavewall'
    }));
    var originalRealCave=realCave.map(row=>row.slice());
    var westernEdgeRun=cm=>{
      let longest=0;
      for(let x=flatWest.bounds.x1+1;x<flatWest.bounds.x2;x++){
        let length=0;for(let y=flatWest.bounds.y1+1;y<flatWest.bounds.y2;y++){
          length=cm[y][x]!=='cavewall'&&cm[y][x-1]==='cavewall'?length+1:0;
          longest=Math.max(longest,length)
        }
      }
      return longest
    };
    var westRunBefore=westernEdgeRun(realCave);
    var realChanges=softenSilhouetteOutline(realCave,flatWest.bounds,flatWest.spot,'cavefloor2');`)
  assert(run('realChanges>0 && westernEdgeRun(realCave)<westRunBefore'),'reported cut-off western edge softened')
  assert(run("silhouetteDryFloorConnected(realCave,flatWest.bounds,flatWest.spot,'cavefloor2')"),'reported cave retains dry routes')
  assert(run("originalRealCave.every((row,y)=>row.every((tile,x)=>tile!=='water'||realCave[y][x]==='water'))"),'reported pools preserved')
  assert(run(`[-1,0,1].every(dy=>[-1,0,1].every(dx=>realCave[flatWest.spot.y+dy][flatWest.spot.x+dx]==='cavefloor2'))`),'reported stairs preserved')
  console.log('PASS exact Gargoyle+Dreadling regression:',run('realChanges'),'boundary cells changed; longest west edge',run('westRunBefore'),'->',run('westernEdgeRun(realCave)'))
  console.log('PASS flat western edges softened; contour budget, solid bounds, enclosed holes, narrow branches, edge stairs, connectivity and deterministic RNG')
})().catch(e=>{console.error(e);process.exitCode=1})
