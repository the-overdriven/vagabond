function beginGame() {
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.get('#raceName').clear().type('Crit Tester')
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Critical hits', () => {
  it('shows the actual player crit chance and only exceptional enemy crit chances', () => {
    beginGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        renderInventory()
        const enemy = {
          name: 'Goblin', baseName: 'Goblin', tier: 2, hp: 20, maxHp: 20,
          atk: 2, def: 0, spd: 2, aggro: 4, x: player.x + 1, y: player.y,
          level: currentZ, alive: true
        }
        enemies.push(enemy)
        try {
          const normal = tileInspectInfo(enemy.x, enemy.y).html
          enemy.prefix = 'Fierce'
          const fierce = tileInspectInfo(enemy.x, enemy.y).html
          enemy.prefix = 'Deadly'
          enemy.crit = true
          const deadly = tileInspectInfo(enemy.x, enemy.y).html
          return {stats: document.getElementById('statGrid').textContent, normal, fierce, deadly}
        } finally {
          enemies.pop()
        }
      })()`)
      expect(result.stats).to.match(/Crit Chance\s*5%/)
      expect(result.normal).not.to.include('chance to crit')
      expect(result.fierce).to.include('10% chance to crit')
      expect(result.deadly).to.include('15% chance to crit')
      for (const html of [result.normal, result.fierce, result.deadly]) {
        expect(html).not.to.include('double damage')
      }
    })
  })
})
