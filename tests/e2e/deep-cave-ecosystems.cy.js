describe('Deep Caves 2.0 parametric ecosystem', () => {
  it('produces territory populations without predictable cave scenarios and preserves their save/replay state', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Ecosystem Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      replayRecording=false;replayPlaying=false;currentZ=0;currentCave=-1;map=surfaceMap
      WORLD_SEED=67893;rngState=WORLD_SEED;applyWorldTraits([], 'XS');
      await generateNewWorld()
      const cfg=WORLD_GEN_CONFIG.cavePopulation.ecosystem
      const level=deepLevels[0]
      const check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      check(['silhouette','grotto','burrow'].every(style=>level.caves.some(c=>c.style===style)),
        'all three layout types survive population generation')
      check(level.caves.every(c=>c.populated&&!c.scenario),'no named z:-2 scenarios')
      const mobs=enemies.filter(e=>e.alive&&e.level===-2&&e.levelKind==='chain')
      const excluded=new Set(cfg.excludedSpecies)
      check(mobs.every(e=>e.baseName==='Cave Troll'||
        (!excluded.has(e.baseName)&&e.tier<=4&&
          !ENEMY_TEMPLATE_BY_NAME[e.baseName]?.ultraRare)),
        'no excluded species except the optional Cave Troll')
      check(mobs.every(e=>level.caveMaps[e.caveIndex][e.y]?.[e.x]==='cavefloor2'),
        'every monster occupies its source cave floor')
      check(level.territories.every(t=>Number.isInteger(t.population)&&Array.isArray(t.species)),
        'territory population metadata recorded')
      check(level.complexes.every(c=>c.ecosystem && Number.isFinite(c.ecosystem.threatBudget)),
        'each connected complex gets a seeded shared budget')
      check(level.caves.every(c=>c.entrances.every(e=>!caveScenarioClue(-2,e.x,e.y) &&
        !caveScenarioIntro(-2,e.x,e.y))), 'population hidden on cave entry')
      const before=JSON.stringify({caves:level.caves,territories:level.territories,
        complexes:level.complexes,spawns:mobs.map(e=>[e.id,e.baseName,e.prefix,e.x,e.y,e.caveIndex]),rng:rngState})
      const save=structuredClone(buildSaveObject())
      loadGameFromObject(save,{isReplayInit:true})
      const restored=deepLevels[0]
      const after=JSON.stringify({caves:restored.caves,territories:restored.territories,
        complexes:restored.complexes,spawns:enemies.filter(e=>e.alive&&e.level===-2&&e.levelKind==='chain')
          .map(e=>[e.id,e.baseName,e.prefix,e.x,e.y,e.caveIndex]),rng:rngState})
      check(before===after,'deep ecosystem restores without rerolling or replay RNG desync')
    })()`))
  })
})
