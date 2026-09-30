describe('Swimming restrictions and visibility', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Swimming Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  it('blocks inventory actions in deep water without spending items or turns, except for Merlings', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        player.x = 50; player.y = 50; map[50][50] = 'water'
        player.race = 'human'
        player.inventory = [
          {kind: 'potion', name: 'Life Potion'},
          {kind: 'scroll', name: 'Scroll of Invisibility'},
          {kind: 'homecomingscroll', name: 'Scroll of Homecoming'},
          {kind: 'speedpotion', name: 'Potion of Speed'},
          {kind: 'herb', name: 'Healing Herb'},
          {kind: 'mushroom', name: 'Mushroom'},
          {kind: 'ediblemushroom', name: 'Edible Mushroom'},
          {kind: 'berries', name: 'Berries'},
          {kind: 'fish', name: 'Fish'},
          {kind: 'tombstone', name: 'Tombstone', inscription: 'Test'},
          {kind: 'weapon', name: 'Sword'},
          {kind: 'artifact', name: 'Artifact', noun: 'Relic', identified: false},
          {kind: 'idscroll', name: 'Scroll of Identification'},
          {kind: 'treasurecasket', name: 'Old Rotten Casket'},
          {kind: 'blackkey', name: 'Black Key'}
        ]
        const before = JSON.stringify(player.inventory)
        const turns = turnCount
        const actions = [usePotion, useScroll, useHomecomingScroll, useSpeedPotion,
          useHerb, useMushroom, useEdibleMushroom, useBerries, useFish, readTombstone]
        actions.forEach((action, index) => action(index))
        equipItem(10); identifyArtifact(11); openTreasureCasket(); toggleBlackKey()
        inspectTreasureMap()
        player.equip.weapon = {kind: 'weapon', name: 'Equipped sword'}
        unequipItem('weapon')
        const blocked = JSON.stringify(player.inventory) === before && turnCount === turns &&
          player.equip.weapon.name === 'Equipped sword' && !player.equip.blackkey
        player.race = 'merling'; player.hp = playerMaxHp() - 10
        usePotion(0)
        return {blocked, merling: player.inventory[0].kind === 'scroll' &&
          player.hp === playerMaxHp() && turnCount === turns + 1}
      })()`)
      expect(result).to.deep.equal({blocked: true, merling: true})
    })
    cy.get('#logpanel').should('contain.text', 'You cannot use items while swimming.')
  })

  it('shows only the top third of the player sprite while drowning', () => {
    cy.window().then(win => {
      const fractions = win.eval(`(() => {
        player.x = 50; player.y = 50; map[50][50] = 'water'
        player.race = 'human'; player.swimming = 1; player.swimTurns = 2
        player.hp = playerMaxHp()
        const original = drawSwimmingCreature
        const fractions = []
        try {
          drawSwimmingCreature = (...args) => {
            if (args.length === 4) fractions.push(args[3])
            return original(...args)
          }
          render()
          player.swimTurns = 0
          render()
          return fractions
        } finally {
          drawSwimmingCreature = original
        }
      })()`)
      expect(fractions).to.deep.equal([0.2631578947368421, 0.4])
    })
  })
})
