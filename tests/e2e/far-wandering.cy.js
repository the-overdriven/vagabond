describe('Far wandering after a chase', () => {
  it('rebuilds its route after the player escapes to water and never skips tiles', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Wander Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        for (let y = 30; y <= 45; y++) for (let x = 30; x <= 55; x++) map[y][x] = 'grass'
        player.x = 40; player.y = 40
        const e = {name: 'Wolf', baseName: 'Wolf', x: 45, y: 40, homeX: 45, homeY: 40,
          level: currentZ, alive: true, wander: 'far', aware: true, aggro: 6,
          hp: 50, maxHp: 50, atk: 1, def: 0, spd: 1, tier: 1,
          farTargetX: 52, farTargetY: 40,
          farPath: [{x: 46, y: 40}, {x: 47, y: 40}]}
        enemies = [e]; npcs = []; occupied = new Set([keyXY(e.x, e.y)])
        const originalRng = rng
        try {
          rng = () => 0.9
          enemyTurn()
          const chased = {x: e.x, y: e.y, routeCleared: e.farPath === null}
          player.x = 32; player.y = 32; map[32][32] = 'water'
          e.farPath = [{x: e.x + 5, y: e.y}]
          const positions = []
          for (let i = 0; i < 5; i++) {
            const before = {x: e.x, y: e.y}
            enemyTurn()
            positions.push({x: e.x, y: e.y,
              distance: Math.max(Math.abs(e.x - before.x), Math.abs(e.y - before.y)),
              occupied: occupied.has(keyXY(e.x, e.y))})
          }
          return {chased, positions}
        } finally {
          rng = originalRng
        }
      })()`)
      expect(result.chased.x).to.be.lessThan(45)
      expect(result.chased.routeCleared).to.equal(true)
      expect(result.positions.every(position => position.distance <= 1 && position.occupied)).to.equal(true)
      expect(result.positions.some(position => position.distance === 1)).to.equal(true)
      expect(result.positions[4].x).to.be.greaterThan(result.chased.x)
    })
  })
})
