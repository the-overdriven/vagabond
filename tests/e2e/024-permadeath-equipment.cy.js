describe('Permadeath equipment distribution', () => {
  it('reserves corpse gear and upgrades humanoids only by strict weighted score', () => {
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.get('#raceName').clear().type('Equipment Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', { timeout: 60000 }).should(($overlay) => {
      expect($overlay.text(), 'world generation status').not.to.include('failed')
      expect($overlay, 'world generation finished').not.to.be.visible
    })
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const weapon = {kind: 'weapon', name: 'Player sword', tier: 2, atk: 4}
      const armor = {kind: 'armor', name: 'Corpse armor', tier: 9, def: 1}
      const old = {kind: 'weapon', name: 'Old sword', tier: 1, atk: 5}
      const scenarios = [
        {name: 'only weapon belongs exclusively to corpse', weapon, corpse: weapon},
        {name: 'armor on corpse leaves weapon for unarmed humanoid', weapon, armor, corpse: armor, takes: true},
        {name: 'grace outweighs lower raw attack', weapon: {...weapon, grace: 4}, armor, old, corpse: armor, takes: true},
        {name: 'primary modifier contributes to weighted attack', weapon: {...weapon, mod: 'atk', modAmt: 2}, armor, old, corpse: armor, takes: true},
        {name: 'HP bonus is normalized', weapon: {...weapon, mod: 'hp', modAmt: 12}, armor, old, corpse: armor, takes: true},
        {name: 'XP bonus is normalized and rounded', weapon: {...weapon, mod: 'xp', xpBonus: 11}, armor, old, corpse: armor, takes: true},
        {name: 'higher tier and raw attack lose to weighted bonuses', weapon: {...weapon, atk: 6}, armor, old: {...old, grace: 4}, corpse: armor},
        {name: 'equal weighted score retains old despite higher tier', weapon: {...weapon, grace: 3}, armor, old, corpse: armor},
        {name: 'weaker weapon retains old equipment', weapon, armor, old, corpse: armor},
        {name: 'nonhumanoid cannot take remaining weapon', weapon, armor, humanoid: false, corpse: armor},
        {name: 'null killer still leaves corpse', weapon, armor, noKiller: true, corpse: armor},
        {name: 'empty equipment still leaves gold', corpse: null},
        {name: 'shield is not a remaining weapon', armor, shield: {kind: 'shield', tier: 1, name: 'Shield'}, corpse: armor},
      ]

      for (const scenario of scenarios) {
        const result = win.eval(`((scenario) => {
          const savedEquip = player.equip
          const savedGold = player.gold
          const groundCount = groundItems.length
          const killer = scenario.noKiller ? null : {
            name: 'Goblin', humanoid: scenario.humanoid !== false,
            equipment: scenario.old || null
          }
          try {
            player.equip = {weapon: scenario.weapon || null, armor: scenario.armor || null, shield: scenario.shield || null}
            player.gold = 129
            createPermadeathBody(killer)
            const body = groundItems[groundCount]
            return {
              gear: body.gear, gold: body.gold,
              equipment: killer && killer.equipment,
              keptOldReference: !killer || killer.equipment === (scenario.old || null),
              clonedWeapon: !!killer && killer.equipment !== scenario.weapon,
              clonedCorpse: !body.gear || !Object.values(player.equip).includes(body.gear),
              drops: groundItems.length - groundCount,
              oldInWorld: !!scenario.old && groundItems.slice(groundCount).some(i =>
                (i.item && i.item.name === scenario.old.name) || (i.gear && i.gear.name === scenario.old.name))
            }
          } finally {
            player.equip = savedEquip
            player.gold = savedGold
            groundItems.splice(groundCount)
          }
        })(${JSON.stringify(scenario)})`)
        expect(result.gear, scenario.name).to.deep.equal(scenario.corpse)
        expect(result.gold, scenario.name).to.equal(12)
        expect(result.drops, scenario.name).to.equal(1)
        expect(result.clonedCorpse, scenario.name).to.equal(true)
        expect(result.oldInWorld, scenario.name).to.equal(false)
        expect(result.equipment, scenario.name).to.deep.equal(scenario.takes ? scenario.weapon : scenario.old || null)
        expect(result.keptOldReference, scenario.name).to.equal(!scenario.takes)
        if (scenario.takes) expect(result.clonedWeapon, scenario.name).to.equal(true)
      }
    })
  })
})
