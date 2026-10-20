const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')
;(async()=>{
  await run('loadContent()')
  run(`CaveSilhouettes.prepare = async seed => {
    CAVE_SILHOUETTES=[{id:CaveSilhouettes.idForSeed(seed),sourceIds:['mock-a','mock-b'],
      rows:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>(x-15)**2+(y-15)**2<212?'1':'0').join(''))}]
    return CAVE_SILHOUETTES[0]
  }; log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false`)
  const aggregate=[]
  for(const [seed,traits] of [[12345,[]],[67893,[]],[98765,[]],[12345,['things_below']]]){
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;
      applyWorldTraits(${JSON.stringify(traits)}.map(n=>WORLD_TRAITS.find(t=>t.name===n)),'XS');
      player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0;
      enemies=[];groundItems=[];caveSpoor=[];occupied=new Set()`)
    await run('generateNewWorld()')
    const summary=run(`(()=>{
      const level=deepLevels[0],indices=new Map()
      for(const c of level.complexes)for(const i of c.members)indices.set(i,c.id)
      const rewards=groundItems.filter(g=>g.level===-2&&g.levelKind==='chain'&&
        ['chest','potion','scrollOfInvisibility'].includes(g.kind))
      const chests=rewards.filter(g=>g.kind==='chest'),loose=rewards.filter(g=>g.kind!=='chest')
      const onePerTile=new Set(rewards.map(g=>keyXY(g.x,g.y)))
      const invalidItems=rewards.filter(g=>level.caveMaps[g.caveIndex]?.[g.y]?.[g.x]!=='cavefloor2'||
        level.map[g.y]?.[g.x]!=='cavefloor2'||enemies.some(e=>e.alive&&e.level===-2&&e.levelKind==='chain'&&e.x===g.x&&e.y===g.y))
      const componentStats=level.complexes.map(c=>({members:c.members.length,area:c.rewards?.dryArea,
        chests:c.rewards?.chests,provisions:c.rewards?.provisions}))
      const unique=componentStats.reduce((a,c)=>a+c.chests+c.provisions,0)
      const hints=caveSpoor.map(s=>({...s}))
      const badSpoor=hints.filter(s=>s.level!==-2||s.levelKind!=='chain'||
        level.map[s.y]?.[s.x]!=='cavefloor2'||
        !enemies.some(e=>e.alive&&e.level===-2&&e.levelKind==='chain'&&
          indices.get(e.caveIndex)===s.complexId&&e.baseName===s.species))
      const corpseClue=hints[0] ? inspectCaveSpoor(hints[0]) : null
      return {chests:chests.length,loose:loose.length,items:rewards.length,
        uniqueItemPositions:onePerTile.size,invalidItems:invalidItems.length,
        complexBudgetTotal:unique,complexes:componentStats,spoors:hints,badSpoor:badSpoor.length,
        clueOverlap:hints.some(p=>groundItems.some(g=>g.level===-2&&g.levelKind==='chain'&&g.x===p.x&&g.y===p.y)),
        corpseClue,saveVersion:SAVE_VERSION,gameVersion:self.VAGABOND_GAME_VERSION,
        snapshot:JSON.stringify({rewards,caveSpoor,complexes:level.complexes,decorations:caveDecorations,rng:rngState})}
    })()`)
    assert.equal(summary.uniqueItemPositions,summary.items,'no overlapping chests and loose items')
    assert.equal(summary.invalidItems,0,'all rewards on source-owned, unoccupied dry floor')
    assert.equal(summary.complexBudgetTotal,summary.items,'one reward allocation shared across complexes')
    assert(summary.chests>0&&summary.loose>0,'world retains treasure and supplies')
    assert.equal(summary.badSpoor,0,'all cave spoor on floor and sourced from a real inhabitant')
    assert(summary.spoors.every(p=>p.direction>=0&&p.direction<8),'valid directional clue')
    assert.equal(summary.clueOverlap,false,'spoor does not obscure rewards')
    const before=JSON.parse(summary.snapshot),save=JSON.parse(JSON.stringify(run('buildSaveObject()')))
    assert.equal(JSON.stringify(save.caveSpoor),JSON.stringify(summary.spoors),'current save serializes static spoor')
    assert.equal(save.version,103,'save schema updated for permanent clue data')
    run('loadGameFromObject('+JSON.stringify(save)+',{isReplayInit:true})')
    const after=run(`JSON.stringify({rewards:groundItems.filter(g=>g.level===-2&&g.levelKind==='chain'&&
      ['chest','potion','scrollOfInvisibility'].includes(g.kind)),caveSpoor,
      complexes:deepLevels[0].complexes,decorations:caveDecorations,rng:rngState})`)
    assert.deepEqual(JSON.parse(after),before,'save/replay restores exact rewards, clues and RNG')
    const decorationRng=run('rngState')
    const decorations=run('JSON.stringify(caveDecorations)')
    run('spawnCaveDecorations()')
    assert.equal(run('rngState'),decorationRng,'decoration rendering consumes no gameplay RNG')
    assert.equal(run('JSON.stringify(caveDecorations)'),decorations,'decoration placement remains deterministic')
    if(summary.spoors.length){
      const hint=summary.spoors[0]
      const beforeRotation=run('({width:MAP_W,height:MAP_H,clue:{...caveSpoor[0]},rng:rngState})')
      run('rotateGeneratedWorld(1)')
      const rotated=run('({...caveSpoor[0]})')
      assert.equal(rotated.x,beforeRotation.height-1-hint.y,'spoor x coordinate rotates')
      assert.equal(rotated.y,hint.x,'spoor y coordinate rotates')
      assert.equal(rotated.direction,(hint.direction+2)%8,'old spoor bearing rotates')
      assert.equal(run('rngState'),beforeRotation.rng,'rotation consumes no RNG')
      run('rotateGeneratedWorld(3)')
      assert.equal(JSON.stringify(run('caveSpoor[0]')),JSON.stringify(hint),'four quarter turns restore the clue')
      run(`currentZ=-2;map=deepLevels[0].map;player.trackingLearned=true;
        player.killsBySpecies[${JSON.stringify(hint.species)}]=1`)
      const named=run('inspectCaveSpoor(caveSpoor[0])')
      assert(named.toLowerCase().includes(hint.species.toLowerCase()),'known tracked species identified')
      const hinted=run(`caveSpoorAt(${hint.x},${hint.y})`)
      assert.equal(hinted.species,hint.species,'underground clue can be inspected')
      run('currentZ=0;map=surfaceMap')
    }
    aggregate.push({seed,traits,chests:summary.chests,supplies:summary.loose,complexes:summary.complexes.length,
      spoors:summary.spoors.length})
  }
  console.log('PASS Deep Caves 2.0 reward budget and persistent clues',JSON.stringify(aggregate))
})().catch(e=>{console.error(e);process.exitCode=1})
