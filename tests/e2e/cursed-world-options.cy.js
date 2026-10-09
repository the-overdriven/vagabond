// World dimensions are an explicit character-creation choice, not a cursed trait.
describe('World size and surface cursed traits', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
  })

  it('shows all six sizes independently of Cursed world on desktop and mobile', () => {
    cy.get('#worldSizeSelect').should('have.value', 'L').and('be.enabled')
      .find('option').then(options => {
        expect([...options].map(option => option.value))
          .to.deep.equal(['XS', 'S', 'M', 'L', 'XL', 'XXL'])
      })
    cy.get('#cursedWorldToggle').should('not.be.checked')
    cy.get('#worldSizeSelect').select('XS').should('have.value', 'XS')
    cy.get('#cursedWorldToggle').check()
    cy.get('#worldSizeSelect').should('have.value', 'XS')
    cy.viewport(390, 844)
    cy.get('#worldSizeSelect').should('be.visible').select('XXL')
    cy.get('#cursedWorldToggle').uncheck()
    cy.get('#worldSizeSelect').should('have.value', 'XXL')
  })

  it('excludes world size from the trait pool and resolves both new surface traits deterministically', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (value, message) => { if (!value) throw Error(message) }
      check(WORLD_TRAITS.length === 41, '41 traits after replacing the world-size trait')
      check(!WORLD_TRAITS.some(trait => trait.name === 'world_size'), 'size excluded from trait pool')
      const beast = WORLD_TRAITS.find(trait => trait.name === 'beast_kingdom')
      const drowned = WORLD_TRAITS.find(trait => trait.name === 'drowned_lands')
      const drought = WORLD_TRAITS.find(trait => trait.name === 'drought')
      check(beast && drowned && drought, 'all traits loaded')
      check(traitsConflict(beast, drought) && traitsConflict(drowned, drought), 'dry traits cannot negate flooded/beast worlds')
      check(!traitsConflict(beast, drowned), 'beasts and flooded lands can coexist')
      const resolve = trait => ({name: trait.name, flavor_text: trait.flavor_text,
        effects: trait.effects.map(effect => ({...effect, value: Array.isArray(effect.value) ? effect.value[0] : effect.value}))})
      applyWorldTraits([resolve(beast), resolve(drowned)], 'M')
      const c = WORLD_GEN_CONFIG
      check(MAP_W === 235 && MAP_H === 235, 'size independent of trait selection')
      check(c.surfaceEnemies.nonHumanoidRarityMultiplier === 2.5, 'beast rarity weight')
      check(Math.abs(c.surface.lakes.noiseThreshold - 0.66) < 1e-10, 'lake coverage')
      check(Math.abs(c.surface.lakes.carveAmount - 0.44) < 1e-10, 'lake depth')
      check(c.surface.rivers.maxSources === 17, 'river sources')
      check(c.surfaceLoot.submergedChests.countRange.join(',') === '20,38', 'submerged chest bounds')
      check(Math.abs(c.surfaceLoot.submergedChests.lakeShare - 0.55) < 1e-10, 'lake chest share')
      applyWorldTraits([], 'L')
      check(MAP_W === 260 && MAP_H === 260, 'reset to default')
      check(WORLD_GEN_CONFIG.surfaceEnemies.nonHumanoidRarityMultiplier === 1, 'no lingering beast effects')
      check(WORLD_GEN_CONFIG.surfaceLoot.submergedChests.countRange.join(',') === '15,30', 'no lingering water effects')
      return true
    })()`))
  })

  for (const {size, side, seed, traits} of [
    {size:'XS', side:184, seed:12345, traits:['beast_kingdom', 'drowned_lands']},
    {size:'XXL', side:320, seed:424242, traits:['drowned_lands']},
  ]) {
    it(`generates ${size} terrain, preserves the selected size and traits on save/load`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check = (value, message) => { if (!value) throw Error(message) }
        WORLD_SEED = ${seed}
        rngState = WORLD_SEED
        const traits = ${JSON.stringify(traits)}.map(name => {
          const trait = WORLD_TRAITS.find(t => t.name === name)
          return {name, flavor_text: trait.flavor_text, effects: trait.effects.map(effect => ({...effect}))}
        })
        applyWorldTraits(traits, '${size}')
        await generateNewWorld()
        check(MAP_W === ${side} && MAP_H === ${side}, 'selected square size')
        check(isBigBellReachableFromTemple(), 'Big Bell must be reachable from Temple')
        check(caves.length > 0 && !!dwarvenRuin, 'required cave and fort locations')
        const snapshot = buildSaveObject()
        check(snapshot.mapWidth === ${side} && snapshot.mapHeight === ${side}, 'saved dimensions')
        check(snapshot.worldTraits.map(t => t.name).join(',') === ${JSON.stringify(traits.join(','))}, 'saved traits')
        startReplayRecording()
        check(replayData.initialState.mapWidth === ${side}, 'replay initial world width')
        check(replayData.initialState.mapHeight === ${side}, 'replay initial world height')
        check(replayData.initialState.worldTraits.map(t => t.name).join(',') === ${JSON.stringify(traits.join(','))}, 'replay initial traits')
        loadGameFromObject(snapshot, {isReplayInit: true})
        check(MAP_W === ${side} && MAP_H === ${side}, 'restored dimensions')
        check(activeWorldTraits.map(t => t.name).join(',') === ${JSON.stringify(traits.join(','))}, 'restored traits')
        check(isBigBellReachableFromTemple(), 'Big Bell reachable after restoration')
        return true
      })()`))
    })
  }
})
