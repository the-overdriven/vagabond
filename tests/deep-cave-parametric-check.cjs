// v194: fixed-seed deep-cave parameters, measured topology and deterministic restore.
// This is a rule-level check with intentionally synthetic cave shapes, not visual verification.
const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const results=[]
  for(const seed of [115,24680,67890,70123,85697,99901,111223,454321]){
    const sample=run(`(()=>{
      MAP_W=126;MAP_H=95;WORLD_SEED=${seed};rngState=WORLD_SEED;
      enemies=[];groundItems=[];caves=[];caveMaps=[];caveSpoor=[];caveDecorations=[];
      worldKilledSpecies=new Set();
      surfaceMap=Array.from({length:MAP_H},()=>Array(MAP_W).fill('grass'));map=surfaceMap;
      undergroundMap=blankCaveMap();undergroundDiscoveredL1=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false));
      discovered=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false));
      spawnPoint={x:3,y:3};player.x=3;player.y=3;currentZ=0;currentCave=-1;
      const spots=[[12,12],[43,14],[92,53]],masks=spots.map(([sx,sy],i)=>{
        const cm=blankCaveMap()
        for(let y=sy;y<sy+25;y++)for(let x=sx;x<sx+27;x++)cm[y][x]='cavefloor2'
        for(let y=sy+8;y<sy+17;y++)for(let x=sx+6;x<sx+13;x++)cm[y][x]='water'
        cm[sy+12][sx+12]='caveup';return cm
      })
      const shared=blankCaveMap()
      masks.forEach(cm=>cm.forEach((row,y)=>row.forEach((t,x)=>{
        if(t!=='cavewall')shared[y][x]=t
      })))
      const descriptors=spots.map(([sx,sy],i)=>({style:['silhouette','grotto','burrow'][i],
        entrances:[{x:sx+12,y:sy+12}],rooms:[],topology:{alternativeRouteTarget:null}}))
      const link=WORLD_GEN_CONFIG.caves.deep.merging
      Object.assign(link,{affinity:[100,100],nearChance:1,farChance:1,mergeDecay:1,areaScale:1e12})
      const layer=deepCaveComplexes({map:shared,caveMaps:masks,caves:descriptors})
      layer.discovered=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false));
      deepLevels=[layer];spawnCaveScenarios()
      measureDeepCaveExploration(layer)
      const rngBefore=rngState,metricBefore=JSON.stringify(layer.complexes.map(c=>c.exploration))
      measureDeepCaveExploration(layer)
      const deterministic=metricBefore===JSON.stringify(layer.complexes.map(c=>c.exploration))&&rngState===rngBefore
      const stats={seed:${seed},caves:layer.caves.map(c=>c.tierWeights),
        champions:layer.complexes.map(c=>c.ecosystem?.champions||0),
        championCandidates:layer.complexes.map(c=>c.ecosystem?.championCandidates||0),
        territories:layer.territories.map(t=>({population:t.population,threatBudget:t.threatBudget,
          threatUsed:t.threatUsed,clusters:t.clusterCenters,clusterRadius:t.clusterRadius})),
        audits:layer.complexes.map(c=>c.exploration),deterministic,
        heroSafe:enemies.filter(e=>e.alive&&e.level===-2&&e.levelKind==='chain').every(e=>
          layer.caves.every(c=>c.entrances.every(p=>
            e.baseName==='Fungus'||Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))>=8))),
        synergyBase:deepCaveThreatCost(ENEMY_TEMPLATE_BY_NAME.Goblin,{x:7,y:7},null,[],WORLD_GEN_CONFIG.cavePopulation.ecosystem),
        synergyGroup:deepCaveThreatCost(ENEMY_TEMPLATE_BY_NAME.Goblin,{x:7,y:7},null,
          [{alive:true,level:-2,levelKind:'chain',x:8,y:7,baseName:'Goblin',
            abilities:['gangPower','shooterStones'],prefix:'Champion'}],WORLD_GEN_CONFIG.cavePopulation.ecosystem)}
      const save=structuredClone(buildSaveObject())
      loadGameFromObject(save,{isReplayInit:true})
      stats.restored=JSON.stringify(deepLevels[0].complexes)===JSON.stringify(layer.complexes)&&
        JSON.stringify(deepLevels[0].territories)===JSON.stringify(layer.territories)&&
        JSON.stringify(deepLevels[0].caves)===JSON.stringify(layer.caves)&&rngState===rngBefore
      const oldHeight=MAP_H,oldClusters=deepLevels[0].territories.map(t=>
        t.clusterCenters.map(p=>({...p})))
      const rotateRng=rngState
      rotateGeneratedWorld(1)
      stats.rotated=deepLevels[0].territories.every((t,i)=>t.clusterCenters.every((p,j)=>
        p.x===oldHeight-1-oldClusters[i][j].y && p.y===oldClusters[i][j].x))&&rngState===rotateRng
      return stats
    })()`)
    assert.equal(sample.caves.length,3)
    assert(sample.caves.every(a=>a.length===3 && Math.abs(a.reduce((x,y)=>x+y,0)-1)<.0002), 'tier weights normalized per cave')
    assert(sample.territories.every(t=>t.threatBudget>=0 && t.threatUsed<=t.threatBudget*1.15+.01), 'territory budgets enforced')
    assert(sample.territories.every(t=>t.clusters.length<=8),'clusters respect budget and ceiling')
    assert(sample.championCandidates.every(n=>Number.isInteger(n)&&n>=0&&n<=5),'champions sampled 0–5')
    assert(sample.champions.every((n,i)=>n<=sample.championCandidates[i]),'realized champions never exceed sampled')
    assert(sample.audits.every(m=>m.dryTiles>0&&m.longestEmptyStretch>=0&&m.emptyDeadEndReturnCost>=0&&m.alternativeRouteShare>=0&&m.alternativeRouteShare<=1),'route audit nonnegative and bounded')
    assert(sample.synergyGroup>sample.synergyBase+1,'gang/champion synergy raises threat cost')
    assert(sample.deterministic,'measurement does not consume RNG and repeats exactly')
    assert(sample.restored,'worldgen metadata is restored without rerolling')
    assert(sample.rotated,'cluster centers rotate with the source map without RNG')
    assert(sample.heroSafe,'ordinary monsters have safe stairs')
    results.push(sample)
  }
  const signatures=new Set(results.flatMap(r=>r.caves.map(a=>a.join(','))))
  assert(signatures.size>=4,'different source caves and seeds receive independent tier profiles')
  assert(results.some(r=>r.championCandidates.some(n=>n===0)) && results.some(r=>r.championCandidates.some(n=>n>1)), 'both empty and multi-champion candidates occur')
  console.log('PASS deep-cave v194 independent tiers, territorial clusters/budgets, 0–5 champions, synergy, route metrics and save/replay:',
    JSON.stringify(results.map(r=>({seed:r.seed,champions:r.champions,candidates:r.championCandidates,territories:r.territories.length,
      loopAudits:r.audits.map(a=>a.alternativeRouteShare),empty:r.audits.map(a=>a.longestEmptyStretch)}))))
})().catch(e=>{console.error(e);process.exitCode=1})
