const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  const all=[]
  for(const seed of [12345,24680,67890,70123,85697,99901,111223,454321]){
    const state=run(`(()=>{
      MAP_W=126; MAP_H=95; WORLD_SEED=${seed};rngState=WORLD_SEED;
      enemies=[];groundItems=[];caves=[];caveMaps=[];undergroundMap=blankCaveMap();worldKilledSpecies=new Set();
      const spots=[[12,12],[42,14],[95,53]]
      const masks=spots.map(([sx,sy],i)=>{
        const cm=blankCaveMap()
        for(let y=sy;y<sy+25;y++)for(let x=sx;x<sx+27;x++)cm[y][x]='cavefloor2'
        for(let y=sy+8;y<sy+17;y++)for(let x=sx+6;x<sx+13;x++)cm[y][x]='water'
        cm[sy+12][sx+12]='caveup'
        return cm
      })
      const shared=blankCaveMap()
      masks.forEach(cm=>cm.forEach((row,y)=>row.forEach((t,x)=>{if(t!=='cavewall')shared[y][x]=t})))
      const descriptors=spots.map(([sx,sy],i)=>({style:['silhouette','grotto','burrow'][i],entrances:[{x:sx+12,y:sy+12}],rooms:[]}))
      const linkConfig=WORLD_GEN_CONFIG.caves.deep.merging
      Object.assign(linkConfig,{affinity:[100,100],distanceBands:linkConfig.distanceBands.map(b=>({...b,nearChance:1,farChance:1})),mergeDecay:1,areaScale:1e12})
      const layer=deepCaveComplexes({map:shared,caveMaps:masks,caves:descriptors})
      deepLevels=[layer]
      const prepare=prepareEnemyEquipment, preparationCounts=new Map()
      try {
        prepareEnemyEquipment=(e,prefix)=>{
          if(e.humanoid)preparationCounts.set(e,(preparationCounts.get(e)||0)+1)
          return prepare(e,prefix)
        }
        spawnCaveScenarios()
      } finally {prepareEnemyEquipment=prepare}
      const defined=new Set(WORLD_GEN_CONFIG.cavePopulation.ecosystem.excludedSpecies)
      const deepMobs=enemies.filter(e=>e.level===-2)
      const snapshot={seed:${seed},mobs:deepMobs.map(e=>({name:e.baseName,caveIndex:e.caveIndex,x:e.x,y:e.y,prefix:e.prefix})),
        boxes:groundItems.filter(g=>g.level===-2).length,complexes:structuredClone(layer.complexes),
        territories:structuredClone(layer.territories),caves:structuredClone(layer.caves),
        illegal:deepMobs.filter(e=>defined.has(e.baseName)||e.tier>=5||ENEMY_TEMPLATE_BY_NAME[e.baseName].ultraRare).map(e=>e.baseName),
        safe:deepMobs.every(e=>layer.caveMaps[e.caveIndex][e.y]?.[e.x]==='cavefloor2' &&
          (e.baseName==='Fungus' ||
          layer.caves.every(c=>c.entrances.every(p=>Math.max(Math.abs(e.x-p.x),Math.abs(e.y-p.y))>=8)))),
        dupes:deepMobs.length-new Set(deepMobs.map(e=>keyXY(e.x,e.y))).size,
        aquaticValid:deepMobs.filter(e=>['Slurper','Murkspawn','Giant Crab','Giant Toad','Lizard Man'].includes(e.baseName))
          .every(e=>{for(let y=Math.max(0,e.y-8);y<Math.min(MAP_H,e.y+9);y++)
            for(let x=Math.max(0,e.x-8);x<Math.min(MAP_W,e.x+9);x++)
              if(Math.abs(x-e.x)+Math.abs(y-e.y)<=8&&layer.map[y][x]==='water')return true;return false}),
        populated:layer.caves.every(c=>c.populated&&!c.scenario),
        clue:caveScenarioClue(-2,layer.caves[0].entrances[0].x,layer.caves[0].entrances[0].y),
        spawnsByTerritory:layer.territories.map(t=>t.population)}
      // Ordinary ecosystem humanoids must use the shared equipment generator
      // exactly once at spawn, whether or not their gear roll succeeds.
      const humanoids=deepMobs.filter(e=>e.humanoid)
      snapshot.equipmentCandidates=humanoids.length
      snapshot.allHumanoidsPrepared=humanoids.every(e=>preparationCounts.get(e)===1)
      snapshot.noBeastGear=deepMobs.filter(e=>!e.humanoid).every(e=>!e.equipment)
      snapshot.equipped=humanoids.filter(e=>e.equipment).length
      return snapshot
    })()`)
    assert(state.allHumanoidsPrepared&&state.noBeastGear,'one shared preparation per ordinary humanoid, no gear for beasts')
    assert.equal(state.illegal.length,0,'excluded or tier-5 monster must never spawn')
    assert.equal(state.safe,true,'spawns must be on owned floor, away from stairs')
    assert.equal(state.dupes,0,'no overlapping monsters')
    assert.equal(state.aquaticValid,true,'conditional water species stay near actual water')
    assert.equal(state.populated,true,'descriptors mark new ecosystem without named scenario')
    assert(state.complexes.some(c=>c.members.length>1),'adjacent caves are actually populated as a shared complex')
    assert.equal(state.clue,null,'deep-cave entrance must not reveal population')
    assert(state.mobs.length>0,'synthetic cave supports enemy population')
    assert.equal(state.territories.reduce((n,t)=>n+t.population,0),state.mobs.filter(m=>m.name!=='Fungus').length,'territory population counters match normal mobs')
    assert(state.mobs.every(e=>e.caveIndex>=0&&e.caveIndex<3),'source ownership preserved')
    all.push({seed,monsters:state.mobs.length,species:new Set(state.mobs.map(e=>e.name)).size,
      champions:state.mobs.filter(e=>e.prefix==='Champion').length,complexes:state.complexes.length,
      territories:state.territories.length,chests:state.boxes,humanoids:state.equipmentCandidates,equipped:state.equipped})
  }
  assert(all.some(x=>x.equipped>0),'actual ecosystem generates armed humanoids')
  assert(all.some(x=>x.humanoids>x.equipped),'some humanoids remain unarmed')
  assert(new Set(all.map(x=>x.species)).size>=3,'species diversity varies by seed')
  assert(all.some(x=>x.champions===0)&&all.some(x=>x.champions>0),'champions are optional')
  console.log('PASS parametric deep-cave ecosystems:',JSON.stringify(all))
  // Re-populate the previously skipped shallow caves and Ruins using the
  // existing world fixture: check one preparation, actual prefix, and XYZ.
  context.fixture=require('./saves/Tester_start.json')
  for (const [seed,traits] of [[610061,[]],[610063,['drought']]]) {
    const result=run(`(()=>{
      loadGameFromObject(fixture,{isReplayInit:true});applyWorldTraits(${JSON.stringify(traits)}.map(n=>WORLD_TRAITS.find(t=>t.name===n)),'L');rngState=${seed};
      const prepare=prepareEnemyEquipment,counts=new Map(),prefixes=new Map();
      prepareEnemyEquipment=(e,p)=>{if(e.humanoid){counts.set(e,(counts.get(e)||0)+1);prefixes.set(e,p??e.prefix??null)}return prepare(e,p)};
      const maps=JSON.stringify([undergroundMap,deepLevels.map(l=>l.map)]);
      const ruinsZ=new Set(dungeonPackageLevels('dwarvenRuins').map(r=>r.z));
      const shallow=e=>e.level===-1&&e.levelKind==='chain'&&!e.towerMazeResident&&!caves[e.caveIndex]?.crypt;
      const ruin=e=>ruinsZ.has(e.level)&&e.dungeonRole;
      enemies=enemies.filter(e=>!shallow(e)&&!ruin(e));
      groundItems=groundItems.filter(g=>!(g.level===-1&&g.levelKind==='chain'&&!caves[g.caveIndex]?.crypt));
      for(const c of caves)if(!c.crypt)delete c.scenario;
      const oldDeep=deepLevels;deepLevels=[];
      try {spawnCaveScenarios();deepLevels=oldDeep;spawnDwarvenRuinsEncounters()}
      finally {prepareEnemyEquipment=prepare;deepLevels=oldDeep}
      const h=enemies.filter(e=>e.humanoid&&(shallow(e)||ruin(e)));
      const prepared=h.every(e=>counts.get(e)===1&&prefixes.get(e)===(e.prefix??null));
      const safe=h.every(e=>shallow(e)?undergroundMap[e.y]?.[e.x]==='cavefloor':
        deepLevels[-e.level-2].map[e.y]?.[e.x]==='marble'&&DungeonTraps.safeSpawn(e.x,e.y,e.level));
      return {shallow:h.filter(shallow).length,ruins:h.filter(ruin).length,
        gear:h.filter(e=>e.equipment).length,prefixed:h.filter(e=>e.prefix).length,prepared,safe,
        geometry:maps===JSON.stringify([undergroundMap,deepLevels.map(l=>l.map)]),
        unique:new Set(h.map(e=>[e.level,e.x,e.y].join(','))).size===h.length}
    })()`)
    assert(result.shallow>0&&result.ruins>0&&result.gear>0&&result.prefixed>0)
    assert(result.prepared&&result.safe&&result.geometry&&result.unique,
      'all ordinary humanoids prepared once with valid prefix and coordinates')
    console.log('PASS fixture cave/Ruins repopulation',seed,traits,JSON.stringify(result))
  }

})().catch(e=>{console.error(e);process.exitCode=1})
