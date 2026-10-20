const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  run(`CaveSilhouettes.prepare = async (seed) => {
    CAVE_SILHOUETTES = [{id:CaveSilhouettes.idForSeed(seed),sourceIds:['mock-a','mock-b'],
      rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>
        ((x-15)**2+(y-15)**2<212?'1':'0')).join(''))}]
    return CAVE_SILHOUETTES[0]
  }; log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false`)
  for (const [seed,traits] of [[67893,[]],[12345,['things_below']]]) {
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;
      applyWorldTraits(${JSON.stringify(traits)}.map(name=>WORLD_TRAITS.find(t=>t.name===name)),'XS');
      player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;
      enemies=[];groundItems=[];occupied=new Set()`)
    await run('generateNewWorld()')
    const summary=run(`(()=>{
      const lvl=deepLevels[0],mob=enemies.filter(e=>e.level===-2 && e.levelKind==='chain')
      const excluded=new Set(WORLD_GEN_CONFIG.cavePopulation.ecosystem.excludedSpecies)
      return {seed:WORLD_SEED,styles:lvl.caves.map(c=>c.style),complexes:lvl.complexes.length,
        territories:lvl.territories.length,enemies:mob.length,species:new Set(mob.map(e=>e.baseName)).size,
        illegal:mob.filter(e=>excluded.has(e.baseName)||e.tier===5||ENEMY_TEMPLATE_BY_NAME[e.baseName]?.ultraRare).length,
        ordinaryScenario:lvl.caves.some(c=>c.scenario||!c.populated),
        sourceValid:mob.every(e=>lvl.caveMaps[e.caveIndex]?.[e.y]?.[e.x]==='cavefloor2'),
        valid:validateDwarvenRuinsStratum().ok,
        vampire:enemies.some(e=>e.baseName==='Vampire' && e.level<0),
        snapshot:JSON.stringify({map:lvl.map,caves:lvl.caves,links:lvl.links,complexes:lvl.complexes,territories:lvl.territories,mobs:mob.map(e=>({baseName:e.baseName,prefix:e.prefix,x:e.x,y:e.y,caveIndex:e.caveIndex})),rng:rngState})}
    })()`)
    assert(summary.styles.includes('silhouette')&&summary.styles.includes('grotto')&&summary.styles.includes('burrow'),'required cave layout styles')
    assert.equal(summary.illegal,0,'ineligible deep-cave monster')
    assert.equal(summary.ordinaryScenario,false,'deep caves no longer use named scenarios')
    assert.equal(summary.sourceValid,true,'deep spawns have correct source cave')
    assert(summary.enemies>0 && summary.species>=2,'nontrivial population')
    assert.equal(summary.valid,true,'world validates with population')
    assert.equal(summary.vampire,true,'vampire guarantee survives ecosystem update')
    const save=JSON.parse(JSON.stringify(run('buildSaveObject()')))
    assert.equal(save.version,run('SAVE_VERSION'))
    run('loadGameFromObject('+JSON.stringify(save)+',{isReplayInit:true})')
    const restored=run(`JSON.stringify({map:deepLevels[0].map,caves:deepLevels[0].caves,links:deepLevels[0].links,complexes:deepLevels[0].complexes,territories:deepLevels[0].territories,mobs:enemies.filter(e=>e.level===-2 && e.levelKind==='chain').map(e=>({baseName:e.baseName,prefix:e.prefix,x:e.x,y:e.y,caveIndex:e.caveIndex})),rng:rngState})`)
    {const a=JSON.parse(summary.snapshot),b=JSON.parse(restored);for (const key of Object.keys(a))assert.equal(JSON.stringify(a[key]),JSON.stringify(b[key]),'save/replay restores '+key)}
    console.log('PASS seeded world ecosystem',seed,traits,JSON.stringify({...summary,snapshot:undefined}))
  }
})().catch(e=>{console.error(e);process.exitCode=1})
