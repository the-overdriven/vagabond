function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Invisibility Tester')
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Scroll of Invisibility', () => {
  it('stocks three scrolls at 200g and lasts 20 turns (25 for Wyrdlings)', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const stock = merchantStock.find(it => it.kind === 'scroll')
        player.inventory.push({kind: 'scroll', name: 'Scroll of Invisibility', count: 1})
        useScroll(player.inventory.length - 1)
        const humanTurns = player.invisibleTurns
        player.race = 'wyrdling'
        player.inventory.push({kind: 'scroll', name: 'Scroll of Invisibility', count: 1})
        useScroll(player.inventory.length - 1)
        return {stock: {count: stock.count, price: stock.merchantPrice}, humanTurns, wyrdlingTurns: player.invisibleTurns}
      })()`)
      expect(result.stock).to.deep.equal({count: 3, price: 200})
      expect(result.humanTurns).to.equal(19)
      expect(result.wyrdlingTurns).to.equal(24)
    })
  })

  it('reacts once to an invisible hit without chasing or wandering afterward', () => {
    beginGame()
    cy.window().then(win => win.eval(`(async () => {
      replayAnimationsDisabled = true
      const e = {
        name: 'Goblin', baseName: 'Goblin', tier: 2, aggro: 3, hp: 100, maxHp: 100,
        atk: 1, def: 0, spd: 2, x: player.x + 1, y: player.y,
        level: currentZ, alive: true, evades: false
      }
      map[e.y][e.x] = 'grass'
      enemies.push(e)
      occupied.add(keyXY(e.x, e.y))
      player.invisibleTurns = 20
      const originalRng = rng
      const rolls = [0.5, 0.5, 0.5, 0.05]
      rng = () => rolls.length ? rolls.shift() : 0.5
      try {
        await tryMove(1, 0)
        return {x: e.x, y: e.y, hp: e.hp, invisibleTurns: player.invisibleTurns, aware: e.aware}
      } finally {
        rng = originalRng
      }
    })()`).then(result => {
      expect(result.hp).to.be.lessThan(100)
      expect(result.invisibleTurns).to.equal(19)
      expect(result.aware).to.equal(false)
    }))
    cy.get('#logpanel').should('contain.text', 'The Goblin is confused at the unseen attack!')
    cy.get('#logpanel').should('not.contain.text', 'The Goblin has spotted you!')
  })

  it('flees to a free tile, reports being cornered, and lashes out at reduced accuracy', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        const e = {
          name: 'Goblin', baseName: 'Goblin', tier: 2, aggro: 3, hp: 100, maxHp: 100,
          atk: 1, def: 0, spd: 2, x: player.x + 1, y: player.y,
          level: currentZ, alive: true
        }
        enemies.push(e)
        occupied.add(keyXY(e.x, e.y))
        const originalRng = rng
        try {
          rng = () => 0.2
          reactToInvisibleAttack(e, 0)
          const fled = {x: e.x, y: e.y, occupied: occupied.has(keyXY(e.x, e.y))}
          for (const [dx, dy] of DIRS8) {
            const x = e.x + dx, y = e.y + dy
            if (map[y]?.[x] !== undefined) map[y][x] = 'cavewall'
          }
          reactToInvisibleAttack(e, 0)
          const cornered = {x: e.x, y: e.y}
          e.x = player.x + 1
          e.y = player.y
          player.hp = 50
          const rolls = [0.6, 0.1, 0.5, 0.5]
          rng = () => rolls.shift() ?? 0.5
          reactToInvisibleAttack(e, 0)
          const missedHp = player.hp
          const hitRolls = [0.6, 0.99, 0.5, 0.5]
          rng = () => hitRolls.shift() ?? 0.5
          reactToInvisibleAttack(e, 0)
          return {fled, cornered, missedHp, playerHp: player.hp}
        } finally {
          rng = originalRng
        }
      })()`)
      expect(result.fled.occupied).to.equal(true)
      expect(result.cornered).to.deep.equal({x: result.fled.x, y: result.fled.y})
      expect(result.missedHp).to.equal(50)
      expect(result.playerHp).to.be.lessThan(50)
    })
    cy.get('#logpanel').should('contain.text', 'But is cornered with no way to escape!')
    cy.get('#logpanel').should('contain.text', 'lashes out wildly into the empty air!')
  })

  it('uses damage, tier, and aggro in the flee threshold', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        const e = {
          name: 'Goblin', tier: 2, aggro: 3, hp: 100, maxHp: 100,
          atk: 1, def: 0, spd: 2, x: player.x + 1, y: player.y,
          level: currentZ, alive: true
        }
        enemies.push(e)
        occupied.add(keyXY(e.x, e.y))
        const originalRng = rng
        try {
          rng = () => 0.34
          reactToInvisibleAttack(e, 0)
          const withoutDamage = {x: e.x, y: e.y}
          reactToInvisibleAttack(e, 4)
          return {withoutDamage, withDamage: {x: e.x, y: e.y}}
        } finally {
          rng = originalRng
        }
      })()`)
      expect(result.withDamage).to.not.deep.equal(result.withoutDamage)
    })
  })
})
