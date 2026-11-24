'use strict'
// Fixed-seed checks exercise stone placement against shared Z maps without
// requiring the image assets absent from the source-only project archive.
const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const seeds=[101,202,303]
  for(const seed of seeds){
    const report=run(`(()=>{
      applyWorldTraits([],'S');MAP_W=120;MAP_H=120;
      WORLD_SEED=${seed};rngState=${seed};tileUnderlays={};groundItems=[];
      const blank=()=>blankCaveMap()
      const room=(x1,y1,x2,y2,floor)=>{
        const cm=blank()
        for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)cm[y][x]=floor
        return cm
      }
      const merge=(masks)=>{
        const out=blank()
        for(const cm of masks)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
          if(cm[y][x]!=='cavewall')out[y][x]=cm[y][x]
        return out
      }
      caveMaps=[room(10,10,38,39,'cavefloor'),room(73,12,105,43,'cavefloor')]
      caves=[{x:22,y:23,entrances:[{x:22,y:23}]},{x:90,y:25,entrances:[{x:90,y:25}]}]
      for(let i=0;i<2;i++){const p=caves[i];caveMaps[i][p.y][p.x]='caveup'}
      undergroundMap=merge(caveMaps)
      const deepCaves=[room(10,10,38,39,'cavefloor2'),room(73,12,105,43,'cavefloor2')]
      deepCaves[0][23][22]='caveup';deepCaves[1][25][90]='caveup'
      const fort=room(8,53,49,108,'marble'),ruins=room(57,54,113,112,'marble')
      fort[62][21]='dwarvenfortexit';ruins[60][76]='dwarvenruinexit'
      const mine=room(15,48,108,114,'cavefloor2');mine[55][22]='minelift'
      deepLevels=[
        {kind:'caves',map:merge(deepCaves),caveMaps:deepCaves},
        {kind:'dwarvenFort',map:fort,caveMaps:[fort]},
        {kind:'dwarvenRuins',map:ruins,caveMaps:[ruins],rooms:[
          {x:57,y:54,w:57,h:25,stairRoom:true},{x:57,y:79,w:57,h:24,gallery:{}}]},
        {kind:'dwarvenMines',map:mine,caveMaps:[mine],mineExcavations:[]}
      ]
      const before=[undergroundMap,...deepLevels.map(l=>l.map)].map(m=>m.map(row=>row.slice()))
      if(!placeGeomancyStoneObstacles())throw Error('worldgen rejected a wide-open layout')
      const mapList=[undergroundMap,...deepLevels.map(l=>l.map)]
      for (const room of deepLevels[2].rooms)
        if (dwarvenRoomInterior(room).some(p=>ruins[p.y][p.x]==='boulder'))
          throw Error('rock placed in a protected room')
      const numbers=mapList.map(m=>m.flat().filter(t=>t==='boulder').length)
      const rubble=mine.flat().filter(t=>t==='dwarvenrubble').length
      for(let i=0;i<mapList.length;i++){
        const z=-i-1,src=before[i],map=mapList[i]
        for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
          if(map[y][x]===src[y][x])continue
          if(!['boulder','dwarvenrubble'].includes(map[y][x]))throw Error('unexpected tile mutation')
          if(tileUnderlays[tileUnderlayKey(x,y,z)]!==src[y][x])throw Error('underlay lost')
          const masks=i?deepLevels[i-1].caveMaps:caveMaps
          if(!masks.some(cm=>cm[y][x]===map[y][x]))throw Error('shared cave mask not synchronized')
        }
      }
      // Exact-level connections must stay untouched and have adjacent clear cells.
      for(const [i,x,y] of [[0,22,23],[0,90,25],[1,22,23],[1,90,25],[2,21,62]]){
        const map=mapList[i]
        if(map[y][x]!==before[i][y][x])throw Error('vertical transition moved')
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)
          if(map[y+dy]?.[x+dx]==='boulder')throw Error('entrance safety violated')
      }
      return {numbers,rubble}
    })()`)
    assert(report.numbers[0]>=2&&report.numbers[0]<=6,'-1: rocks per two caves')
    assert(report.numbers[1]>=2&&report.numbers[1]<=6,'-2: rocks per two caves')
    assert(report.numbers[2]>=3&&report.numbers[2]<=6,'fort rocks')
    assert(report.numbers[3]>=3&&report.numbers[3]<=6,'ruins rocks')
    assert(report.numbers[4]>=5&&report.numbers[4]<=9,'mine rocks')
    assert(report.rubble>=1&&report.rubble<=2,'mine rubble')
  }
  // Regression: optional stones must NEVER reject a valid, narrow cave or
  // force world regeneration because its safe stone quota is unachievable.
  const constrained=run(`(()=>{
    applyWorldTraits([],'S');MAP_W=35;MAP_H=35;
    WORLD_SEED=222;rngState=222;groundItems=[];tileUnderlays={};
    const cm=blankCaveMap();
    for(let x=5;x<=29;x++)cm[17][x]='cavefloor';
    cm[17][5]='caveup';cm[17][29]='cavedown';
    caveMaps=[cm];caves=[{x:5,y:17,entrances:[{x:5,y:17}]}];
    undergroundMap=cm.map(row=>row.slice());
    const deep=blankCaveMap();deep[17][5]='caveup';
    for(let x=6;x<=29;x++)deep[17][x]='cavefloor2';
    deepLevels=[{kind:'caves',map:deep,caveMaps:[deep]}];
    const target=WORLD_GEN_CONFIG.geomancyStones;
    const oldShallow=target.shallowCaves,oldDeep=target.deepCaves;
    target.shallowCaves=[3,3];target.deepCaves=[3,3];
    try {
      const accepted=placeGeomancyStoneObstacles();
      return {accepted,unchanged:undergroundMap[17].filter(t=>t==='boulder').length===0,
        stairs:undergroundMap[17][5]==='caveup'&&deep[17][5]==='caveup'};
    } finally {target.shallowCaves=oldShallow;target.deepCaves=oldDeep;}
  })()`)
  assert.deepEqual(JSON.parse(JSON.stringify(constrained)),
    {accepted:true,unchanged:true,stairs:true},
    'infeasible decorative rock quotas may not invalidate mandatory passages')
  console.log('PASS Geomancy worldgen: 3 fixed seeds, underground stone/rubble density, underlays, shared 3D maps, safe stair landings')
})().catch(err=>{console.error(err);process.exitCode=1})
