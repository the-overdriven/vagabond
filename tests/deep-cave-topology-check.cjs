// Geometry-only seeded checks. No enemy image assets or rendering required.
const assert = require('node:assert/strict')
const {run} = require('./helpers/node-game-runtime.cjs')
;(async () => {
  await run('loadContent()')
  const results=[]
  for (const traits of [[], ['halls_below'], ['wormways'], ['flooded_depths'], ['great_caverns']]) {
    const traitNames=JSON.stringify(traits)
    run(`applyWorldTraits(${traitNames}.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'S')`)
    for (const seed of [12345,67893,1423288048,220912,311111,42]) {
      const result=run(`(() => {
        WORLD_SEED=${seed};rngState=WORLD_SEED;
        const spot={x:Math.floor(MAP_W/2),y:Math.floor(MAP_H/2)}
        const layouts=[carveDeepDungeon(spot,'cavefloor2',[]),carveBurrowDungeon(spot,'cavefloor2',[])]
        return layouts.map((layout,i)=>{
          if(!layout)return null
          const dry=layout.cm.reduce((sum,row)=>sum+row.filter(t=>t==='cavefloor2').length,0)
          const water=layout.cm.reduce((sum,row)=>sum+row.filter(t=>t==='water').length,0)
          const connected=caveDryReachable(layout.cm,spot,'cavefloor2').size
          const width=layout.bounds.x2-layout.bounds.x1+1,height=layout.bounds.y2-layout.bounds.y1+1
          // No water or rock can cut the only walkable route to a room.
          return {style:i?'burrow':'grotto',dry,water,connected,width,height,
            rooms:layout.rooms.length,hasWater:layout.hasWater,
            floorAtEntrance:layout.cm[spot.y][spot.x]}
        })
      })()`)
      assert(result.every(Boolean),`both styles generated at seed ${seed}, traits ${traits}`)
      for(const r of result){
        assert(r.dry>=120,'enough playable floor')
        assert.equal(r.connected,r.dry,`all ${r.style} floor is cardinally reachable`)
        assert.equal(r.hasWater,r.water>0,'water metadata must match tiles')
        assert.equal(r.floorAtEntrance,'cavefloor2')
        assert(r.rooms>=4,'multiple chambers or branch tips')
        if(r.style==='burrow')assert(r.dry/(r.width*r.height)<.63,'burrows remain tunnel-dominated')
      }
      results.push({seed,traits,result})
    }
  }
  const samples=results.filter(r=>!r.traits.length)
  for(const styleIndex of [0,1]){
    const areas=new Set(samples.map(r=>r.result[styleIndex].dry))
    assert(areas.size>=4,'seed should produce visibly different cave footprints')
    const rooms=new Set(samples.map(r=>r.result[styleIndex].rooms))
    assert(rooms.size>=3,'seed should vary chamber/branch count')
  }
  assert(results.some(r=>r.result[0].water>0),'grotto pools possible')
  assert(results.some(r=>r.result[1].water>0),'burrow pools possible')
  assert.equal(run('WORLD_GEN_CONFIG.caves.deep.silhouette.waterChance'),.3,
    'silhouette obstruction chance remains unchanged')
  // Integration without the PNG assets absent from the source-only upload:
  // feed the unchanged silhouette carver a synthetic valid mask, then exercise
  // its real neighbor placement and all three local/shared map styles.
  run("applyWorldTraits([], 'S'); MAP_W=400; MAP_H=400; WORLD_SEED=12345; rngState=WORLD_SEED")
  const integration=run(`(()=>{
    const anchors=[[90,90],[290,90],[90,290],[290,290]]
    const local=anchors.map(([ax,ay])=>{
      const cm=blankCaveMap()
      for(let y=ay-14;y<=ay+14;y++)for(let x=ax-14;x<=ax+14;x++)cm[y][x]='cavefloor'
      return cm
    })
    const parent=blankCaveMap()
    for(const cm of local)for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)
      if(cm[y][x]==='cavefloor')parent[y][x]='cavefloor'
    CAVE_SILHOUETTES=[{id:'synthetic',sourceIds:['mock-a','mock-b'],
      rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>
        ((x-15)**2+(y-15)**2<216?'1':'0')).join(''))}]
    const parents=anchors.map(([x,y])=>({x,y,entrances:[{x,y}]}))
    const level=generateDeepLevel(parents,local,parent,'cavefloor','cavefloor2','cavedown','caveup')
    const occupied=new Set()
    for(let i=0;i<level.caves.length;i++){
      const cave=level.caves[i],cm=level.caveMaps[i],entrance=cave.entrances[0]
      if(parent[entrance.y][entrance.x]!=='cavedown'||cm[entrance.y][entrance.x]!=='caveup')
        throw Error('Unpaired cave stairs')
      const reachable=caveDryReachable(cm,entrance,'cavefloor2')
      let count=0
      for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
        const t=cm[y][x]
        if(t==='cavewall')continue
        const key=keyXY(x,y)
        if(occupied.has(key))throw Error('Cave overlap')
        occupied.add(key)
        if(t==='cavefloor2')count++
        if(t!==level.map[y][x])throw Error('Shared map disagrees with local')
        if((t==='cavefloor2'||t==='caveup')&&!reachable.has(key))throw Error('Inaccessible floor')
      }
      if(count<100)throw Error('Unusable cave')
    }
    return {styles:level.caves.map(c=>c.style),count:occupied.size}
  })()`)
  for(const style of ['grotto','burrow','silhouette'])assert(integration.styles.includes(style),'required integrated cave style '+style)
  assert(integration.count>1000,'substantial explorable underground complex generated')
  console.log('PASS Deep Caves 2.0 geometry: 30 seeded grotto/burrow pairs plus synthetic-silhouette integration, cardinal reachability, trait combinations, tunnel identity, water and variety')
})().catch(err => {console.error(err);process.exitCode=1})
