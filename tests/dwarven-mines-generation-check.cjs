const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
const plain = value => JSON.parse(JSON.stringify(value))

;(async () => {
  await run('loadContent()')
  // This source-only export intentionally excludes the pre-existing portrait
  // PNGs. The mine silhouettes are sufficient for a real decoded-alpha test.
  const newIds = ['glaber','marsutal','duiwel','trogloraptor','sifulian','vrakeber',
    'tmusapod','akravis','adelocosa','bellroach','barolg','alacran','amplyg',
    'wyrdhag','tholosum','xibal','naledi','troglodyte','cave_troll']
  context.newSilhouetteIds = newIds
  const before = run('rngState')
  const loaded = plain(await run(`Promise.all(CAVE_SILHOUETTE_SOURCES
    .filter(source=>newSilhouetteIds.includes(source.id)).map(CaveSilhouettes.load))`))
  assert.equal(loaded.length, 19, 'all 19 transparent mine portraits participate in z:-2 silhouettes')
  assert(loaded.every(image => image.rows.length > 10 && image.rows[0].length > 10 &&
    image.rows.some(row=>row.includes('0') && row.includes('1'))), 'valid extracted alpha shapes')
  assert.equal(run('rngState'), before, 'image decoding consumes no gameplay RNG')

  run(`CAVE_SILHOUETTE_SOURCES=CAVE_SILHOUETTE_SOURCES.filter(source=>newSilhouetteIds.includes(source.id));
    log=()=>{};renderInventory=()=>{};replayAnimationsDisabled=true;replayRecording=false;raceOpen=false`)
  const observed = []
  for (const seed of [610061,610063,554433]) {
    // Exercise the natural short-Ruins transition and the boundary case where
    // five Ruins floors end immediately above the fixed z:-9 Mines.
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits([],'XS');
      player.inventory=[];player.curseDebuffs=[];player.poisonTurns=0;
      player.berryRegenTurns=0;enemies=[];groundItems=[];occupied=new Set()`)
    if (seed===554433)run('WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange=[5,5]')
    await run('generateNewWorld()')
    const floors = plain(run(`dungeonPackageLevels('dwarvenMines').map(({level,z})=>({
      z,dungeonFloor:level.dungeonFloor,floorCount:level.floorCount,
      upstairs:level.mineUpstairs,downstairs:level.mineDownstairs,
      up:level.mineTransitions.up,down:level.mineTransitions.down || null,
      cage:level.mineCagePad,
      map:level.map
    }))`))
    const ruins = plain(run('dungeonPackageLevels("dwarvenRuins").map(({z})=>z)'))
    assert(ruins.length >= 3 && ruins.length <= 5, 'Ruins floor count remains unchanged')
    if (seed===554433) assert.equal(ruins.length,5,'five-floor Ruins end at z:-8')
    assert([3,4].includes(floors.length), 'Mines have 3 or 4 floors')
    assert(floors.every((floor,i)=>floor.z === -9-i && floor.dungeonFloor === i+1 &&
      floor.floorCount===floors.length), 'Mines occupy fixed contiguous depths beginning z:-9')
    const cageShortcut=plain(run('dwarvenMinesCageShortcut()'))
    assert(cageShortcut && !cageShortcut.unlocked,'the cage begins locked for both 3- and 4-floor mines')
    assert.equal(cageShortcut.upper.z,-9)
    assert.equal(cageShortcut.lower.z,floors.at(-1).z)
    assert.deepEqual({x:cageShortcut.upper.x,y:cageShortcut.upper.y},floors[0].cage)
    assert.deepEqual({x:cageShortcut.lower.x,y:cageShortcut.lower.y},floors.at(-1).cage)
    assert(floors[0].up.z===ruins.at(-1), 'Mines lead directly back to the last Ruins floor')
    for (let i=0; i<floors.length; i++) {
      const f=floors[i]
      assert.equal(f.map[f.upstairs.y][f.upstairs.x], 'minestairsup')
      if (i<floors.length-1) {
        assert.equal(f.map[f.downstairs.y][f.downstairs.x], 'minestairsdown')
        assert.equal(f.down.z, floors[i+1].z)
        assert.deepEqual([f.down.x,f.down.y],[floors[i+1].upstairs.x,floors[i+1].upstairs.y])
      } else assert(!f.downstairs && !f.down,'bottom mine has no downward stair')
      assert.equal(f.map[f.cage.y][f.cage.x],
        i===0?'minecageupperoff':i===floors.length-1?'minecageloweroff':'cavefloor2',
        'only first and last mine floors have a locked cage endpoint')
      const reachable = plain(run(`(()=>{
        const f=dungeonPackageLevels('dwarvenMines')[${i}].level
        return dungeonWalkDistances(f.map,f.mineUpstairs).size
      })()`))
      const total=f.map.flat().filter(tile=>['cavefloor2','minestairsup','minestairsdown',
        'minecageupperoff','minecageloweroff'].includes(tile)).length
      assert.equal(reachable,total,`seed ${seed}: mine floor ${i+1} is all accessible on foot`)
    }
    const monsters=plain(run(`enemies.filter(e=>e.alive && e.level<=-9).map(e=>({name:e.baseName,z:e.level}))`))
    assert(monsters.length>10,`seed ${seed}: mines populated`)
    const linked=plain(run(`enemies.filter(e=>e.alive && e.level<=-9 && e.abilities.includes('collectiveMind'))
      .map(e=>({id:e.id,z:e.level,pack:e.collectiveMindPackId}))`))
    assert(linked.every(e=>typeof e.pack==='string' && e.pack.length>0),
      'all initially placed collective-mind holders have deterministic pack identities')
    const packs=new Map()
    for(const member of linked){
      const packKey=`${member.z}:${member.pack}`
      packs.set(packKey,(packs.get(packKey)||0)+1)
    }
    assert([...packs.values()].every(count=>count>=1 && count<=3),
      'each initial Naledi pack respects the configured 1–3 members')
    const allowed = new Set(newIds.map(id=>id.toLowerCase()))
    assert(monsters.every(e=>allowed.has(e.name.toLowerCase().replace(/ /g,'_'))), 'no existing ecosystem monster is drawn into mines')
    const ambushers=plain(run(`enemies.filter(e=>e.alive && e.level<=-9 && e.abilities.includes('wallAmbush')).map(e=>({
      z:e.level,x:e.x,y:e.y,hidden:e.wallAmbushHidden,spent:e.wallAmbushSpent
    }))`))
    for(const ambush of ambushers){
      const terrain=floors.find(f=>f.z===ambush.z).map
      const nearWall=plain(run(`enemyWallAmbushWallAt(dungeonPackageLevels('dwarvenMines')
        .find(e=>e.z===${ambush.z}).level.map,${ambush.x},${ambush.y})`))
      assert(ambush.hidden ? nearWall && !ambush.spent : ambush.spent,
        'concealed wall ambushes require solid walls; fallback enemies remain visible')
      assert.equal(terrain[ambush.y][ambush.x],'cavefloor2',
        'hidden and fallback ambushers occupy walkable non-transition tiles')
      const floor=floors.find(f=>f.z===ambush.z)
      const clearance=run('WORLD_GEN_CONFIG.dungeons.dwarvenMines.encounters.entranceClearance')
      for(const stair of [floor.upstairs,...(floor.downstairs?[floor.downstairs]:[])])
        assert(Math.max(Math.abs(stair.x-ambush.x),Math.abs(stair.y-ambush.y))>clearance,
          'wall ambush never occupies protected stair approaches')
    }
    const axe=plain(run('groundItems.filter(g=>g.kind===\'pickaxe\').map(g=>({z:g.level,x:g.x,y:g.y}))'))
    assert.equal(axe.length,1,`seed ${seed}: exactly one pickaxe`)
    assert.equal(axe[0].z,ruins[Math.max(0,ruins.length-2)], 'pickaxe is on penultimate Ruins floor')
    if(seed===610063) {
      run('WORLD_GEN_CONFIG.dungeons.dwarvenMines.encounters.caveTrollZ2Chance=1;maybeSpawnCaveTrollInDeepCaves();maybeSpawnCaveTrollInDeepCaves()')
      assert.equal(run(`enemies.filter(e=>e.alive&&e.baseName==='Cave Troll'&&
        e.level===-2&&e.levelKind==='chain').length`),1,'z:-2 bonus troll is independently capped at one')
    }

    context.mineSnapshot=plain(run('buildSaveObject()'))
    const rng=run('rngState')
    run('loadGameFromObject(mineSnapshot,{isReplayInit:true})')
    assert.equal(run('rngState'),rng,'save restoration does not consume gameplay RNG')
    assert.deepEqual(plain(run('dwarvenMinesCageShortcut()')),cageShortcut,
      'three- and four-floor cage metadata survives save/replay initialization')
    assert.deepEqual(plain(run(`enemies.filter(e=>e.alive && e.level<=-9 &&
      e.abilities.includes('collectiveMind')).map(e=>({id:e.id,z:e.level,pack:e.collectiveMindPackId}))`)),
      linked,`seed ${seed}: coordination pack identity survives loading`)
    const after=plain(run(`dungeonPackageLevels('dwarvenMines').map(({level,z})=>({
      z,map:level.map,up:level.mineTransitions.up,down:level.mineTransitions.down || null,
      upstairs:level.mineUpstairs,downstairs:level.mineDownstairs,cage:level.mineCagePad
    }))`))
    assert.deepEqual(after,floors.map(({z,map,up,down,upstairs,downstairs,cage})=>({
      z,map,up,down,upstairs,downstairs,cage
    })),`seed ${seed}: Mines layout, tile identities and transitions survive save/replay initialization`)
    if (seed === 610061) {
      run(`(()=>{
        const last=dungeonPackageLevels('dwarvenRuins').at(-1)
        const access=minePlacedStair(last.level,'dwarvenminessealed')
        currentZ=last.z;currentCave=-1;map=last.level.map;
        undergroundDiscovered=last.level.discovered;player.x=access.x;player.y=access.y;
        player.inventory=[]
      })()`)
      assert.equal(run('map[player.y][player.x]'),'dwarvenminessealed')
      const noPickaxeTurn=run('turnCount')
      assert(run('enterCave()'),'sealed mine entrance can be inspected')
      assert.equal(run('turnCount'),noPickaxeTurn,'inspection without a Pickaxe is free')
      assert.equal(run('currentZ'),ruins.at(-1))
      run('addInventoryItem("pickaxe")')
      assert(run('enterCave()'),'Pickaxe clears the rock')
      assert.equal(run('map[player.y][player.x]'),'dwarvenminesopen')
      assert.equal(run('currentZ'),ruins.at(-1),'excavation does not automatically descend')
      assert(run('enterCave()'),'opened entrance descends')
      assert.equal(run('currentZ'),-9)
      assert.equal(run('map[player.y][player.x]'),'minestairsup')
      run(`(()=>{
        const enemy=enemies.find(e=>e.alive && e.level===-9 && e.levelKind==='chain')
        if(!enemy)throw Error('expected a mine monster for departure test')
        markEnemyAbility(enemy,'rupture',[{x:player.x,y:player.y}])
        mineWarningEnemyId=enemy.id
      })()`)
      assert.equal(run('enemies.find(e=>e.id===mineWarningEnemyId).pendingAbility.type'),'rupture')
      assert(run('enterCave()'),'upstairs returns to actual last Ruins floor')
      assert.equal(run('currentZ'),ruins.at(-1))
      assert.equal(run('map[player.y][player.x]'),'dwarvenminesopen')
      assert.equal(run('enemies.find(e=>e.id===mineWarningEnemyId).pendingAbility'),null,
        'mine warning is canceled when leaving by the actual stair')
      assert.equal(run('enemies.find(e=>e.id===mineWarningEnemyId).abilityCooldowns.rupture'),5,
        'departure starts the full cooldown')
      context.mineOpened=plain(run('buildSaveObject()'))
      run('loadGameFromObject(mineOpened,{isReplayInit:true})')
      assert.equal(run('map[player.y][player.x]'),'dwarvenminesopen','excavation persists')
      assert(run('player.inventory.some(item=>item.kind===\'pickaxe\')'),'pickaxe remains in inventory after excavation')
    }
    observed.push({seed,ruins:ruins.length,mines:floors.length,monsters:monsters.length})
  }
  console.log('PASS Dwarven Mines fixed-depth floors, all 19 new silhouettes, spawn scope, topology and persistence',observed)
})().catch(err=>{console.error(err.stack);process.exitCode=1})
