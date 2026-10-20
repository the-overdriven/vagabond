// Fixed-seed regression for dry deep caves, reusable contour smoothing and
// spatially distributed cave rewards. Synthetic map avoids full-world assets.
const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const result=run(`(()=>{
    MAP_W=110;MAP_H=92;WORLD_SEED=1531786804;rngState=WORLD_SEED;
    enemies=[];groundItems=[];
    const floor='cavefloor2',start={x:20,y:20};
    const plain=blankCaveMap();
    for(let y=12;y<=75;y++)for(let x=12;x<=95;x++)plain[y][x]=floor;
    const before=plain.map(row=>row.slice());
    const smoothing=softenSilhouetteOutline(plain,{x1:10,y1:10,x2:100,y2:81},{x:20,y:20},floor,
      {outlineMinStraightRun:8,outlineChangeFraction:.025,expandOnly:true});
    const initialDry=before.flat().filter(t=>t===floor).length;
    const afterDry=plain.flat().filter(t=>t===floor).length;
    // Force dry separators; they must never put a water tile on the map.
    const dryMask=blankCaveMap();
    for(let y=11;y<=40;y++)for(let x=11;x<=52;x++)dryMask[y][x]=floor;
    const dryPossible=breakLongSilhouetteRuns(dryMask,{x1:9,y1:9,x2:55,y2:44},
      {x:15,y:15},floor,0);
    const dryWater=dryMask.flat().filter(t=>t==='water').length;
    // The world reward budget is large enough to expose any clustering bug.
    const deepMap=blankCaveMap();
    for(let y=11;y<=80;y++)for(let x=11;x<=98;x++)deepMap[y][x]=floor;
    deepMap[start.y][start.x]='caveup';
    const complex={id:0,members:[0],ecosystem:{threatBudget:50}}
    const deep={map:deepMap,caveMaps:[deepMap],caves:[{entrances:[start]}],complexes:[complex]}
    populateDeepCaveRewards(deep)
    const rewards=groundItems.filter(g=>g.level===-2&&g.levelKind==='chain'&&
      ['chest','potion','scrollOfInvisibility'].includes(g.kind));
    const c=WORLD_GEN_CONFIG.cavePopulation.rewards;
    const close=(a,b,r)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))<=r;
    const overcrowded=rewards.filter(p=>rewards.filter(q=>p!==q&&close(p,q,c.localRewardRadius)).length>=c.maxUnguardedLocalRewards);
    const closeChests=rewards.filter(p=>p.kind==='chest'&&rewards.some(q=>q!==p&&q.kind==='chest'&&
      Math.max(Math.abs(p.x-q.x),Math.abs(p.y-q.y))<c.minimumChestSpacing));
    return {smoothing,initialDry,afterDry,dryPossible,dryWater,
      count:rewards.length,chests:rewards.filter(g=>g.kind==='chest').length,
      overcrowded:overcrowded.length,closeChests:closeChests.length,
      budgetCount:complex.rewards.chests+complex.rewards.provisions,
      dryChance:WORLD_GEN_CONFIG.caves.deep.silhouette.dryChance,
      waterMax:WORLD_GEN_CONFIG.caves.deep.silhouette.waterChancePercentRange[1]}
  })()`)
  assert(result.smoothing>0,'long straight exterior walls should be softened')
  assert(result.afterDry>=result.initialDry,'non-destructive grotto/burrow smoothing does not cut floor')
  assert.equal(result.dryWater,0,'0% silhouette water means all rock separators')
  assert(result.count>7,'world budget should produce substantial cave rewards')
  assert.equal(result.count,result.budgetCount,'spatial limits preserve count in roomy caves')
  assert.equal(result.overcrowded,0,'unguarded areas are not overstocked locally')
  assert.equal(result.closeChests,0,'chests obey minimum distance')
  assert.equal(result.dryChance,.4,'silhouette caves have a chance to be fully dry')
  assert.equal(result.waterMax,25,'silhouette cave per-obstruction water ratio caps at 25%')
  console.log('PASS dry silhouettes, gentle contour reuse, local reward spacing',result)
})().catch(e=>{console.error(e);process.exitCode=1})
