describe('Mine-only encounters and darkness', () => {
  it('keeps 19 species in the mines, limits their sight radius, and persists their population', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Mine Population Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async()=>{
      const check=(condition,message)=>{if(!condition)throw Error(message)}
      replayRecording=false;replayAnimationsDisabled=true
      applyWorldTraits([],'XS')
      WORLD_SEED=610061;rngState=WORLD_SEED
      await generateNewWorld()

      const cfg=minePackageConfig(),groups=cfg.encounters.groups
      const names=[...groups.early,...groups.middle,...groups.late]
      const ec=cfg.encounters
      const chances=Array.from({length:minePackageConfig().floorCounts.at(-1)},(_,i)=>
        Math.min(ec.prefixChanceCap,ec.prefixBaseChance+i*ec.prefixGrowthPerFloor))
      check(JSON.stringify(chances)===JSON.stringify([0.11,0.135,0.16,0.185]),
        'mine prefix rates rise from 11% to 18.5% by floor')
      check(cfg.encounters.guaranteeEachSpecies && names.length===19 && new Set(names).size===19,
        'all 19 unique species have a guaranteed encounter')
      const mine=dungeonPackageLevels('dwarvenMines')
      const monsters=enemies.filter(e=>e.alive && names.includes(e.baseName) && e.levelKind==='chain')
      check(monsters.filter(e=>e.humanoid).every(e=>
        ['Wyrdhag','Naledi','Troglodyte','Cave Troll'].includes(e.baseName)),
        'only the four humanoid mine species can receive ordinary equipment')
      check(monsters.some(e=>e.humanoid&&e.equipment),
        'humanoid mine inhabitants receive equipment through the normal rolls')
      check(monsters.every(e=>e.humanoid||!e.equipment),
        'nonhumanoid creatures never carry normal gear')
      check(monsters.filter(e=>e.prefix).every(e=>e.prefix!=='Champion' &&
        e.name===e.prefix+' '+e.baseName && e.prefixBase),
        'mine prefixes follow ordinary non-Champion naming and stat rules')
      for(const [floor,namesOnFloor] of [[0,groups.early],[1,groups.middle],[2,groups.late]]) {
        check(namesOnFloor.every(name=>monsters.some(e=>e.baseName===name && e.level===mine[floor].z)),
          'floor '+(floor+1)+' includes every assigned species')
      }
      check(enemies.filter(e=>e.level===0).every(e=>!names.includes(e.baseName)),
        'no mine-exclusive species appears on the surface')
      check(names.every(name=>!surfaceSpawnEligible(ENEMY_TEMPLATE_BY_NAME[name])),
        'depth-only templates are excluded before any surface spawn roll')

      const first=mine[0]
      currentZ=first.z;currentCave=-1;map=first.level.map
      undergroundDiscovered=first.level.discovered
      player.x=first.level.mineUpstairs.x;player.y=first.level.mineUpstairs.y
      invalidateUndergroundFov()
      const shown=currentUndergroundFov()
      const expected=UndergroundFov.compute(map,player.x,player.y,5)
      check(shown.size===expected.size && [...shown].every(p=>expected.has(p)),
        'mine visibility is exactly the radius-five FOV')
      check(UndergroundFov.RADIUS===8,'other underground FOV remains eight tiles')
      check(MERCHANT_STOCK_CONFIG.scrolls.homecomingScroll.merchantPrice===70 &&
        itemDefinition('homecomingscroll').baseValue===70,'Homecoming costs 70g')

      const roster=monsters.map(e=>[e.id,e.baseName,e.level,e.x,e.y,e.prefix,e.prefixBase,e.equipment,e.gearScale,e.gearBonuses])
      const saved=JSON.parse(JSON.stringify(buildSaveObject())),rng=rngState
      loadGameFromObject(saved,{isReplayInit:true})
      check(rngState===rng,'save restoration does not consume RNG')
      check(JSON.stringify(enemies.filter(e=>e.alive && names.includes(e.baseName) && e.levelKind==='chain')
        .map(e=>[e.id,e.baseName,e.level,e.x,e.y,e.prefix,e.prefixBase,e.equipment,e.gearScale,e.gearBonuses]))===JSON.stringify(roster),
        'mine representatives, prefixes and worn equipment persist after restore')
      return true
    })()`))
  })
})
