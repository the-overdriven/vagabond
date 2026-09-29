function beginGodModeGame() {
  cy.visit('/')
  cy.get('#raceName').clear().type('God Mode Tester')
  cy.get('#btnBegin').click()
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Disabling god mode in hazardous terrain', () => {
  it('blocks mountains and water entry, but allows an already-submerged player to swim to shore', () => {
    beginGodModeGame()
    cy.window().then(async win => {
      const result = await win.eval(`(async () => {
        replayAnimationsDisabled = true
        enemies = []; npcs = []; occupied = new Set()
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'G', shiftKey: true}))
        const shiftIgnoredWhileOn = player.godMode
        player.x = 50; player.y = 50
        map[50][50] = 'mountain'; map[50][51] = 'mountain'
        map[50][49] = 'grass'; map[50][48] = 'water'
        map[52][51] = 'water'; map[52][52] = 'water'; map[51][52] = 'grass'
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))
        const disabled = !player.godMode && !player.godInvisible && player.swimming === 0
        player.swimming = 1
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'G', shiftKey: true}))
        const shiftIgnoredWhileOff = !player.godMode && player.swimming === 1
        player.swimming = 0
        await tryMove(1, 0)
        const mountainBlocked = player.x === 50 && player.y === 50
        await tryMove(-1, 0)
        await tryMove(-1, 0)
        const entryBlocked = player.x === 49 && player.y === 50
        player.x = 51; player.y = 52
        await tryMove(1, 0)
        const canSwimWhileSubmerged = player.x === 52 && player.y === 52 &&
          player.swimTurns === 1 && player.hp < playerMaxHp()
        await tryMove(0, -1)
        await tryMove(0, 1)
        const cannotReenter = player.x === 52 && player.y === 51 && player.swimTurns === 0
        return {disabled, shiftIgnoredWhileOn, shiftIgnoredWhileOff,
          mountainBlocked, entryBlocked, canSwimWhileSubmerged, cannotReenter}
      })()`)
      expect(result).to.deep.equal({
        disabled: true, shiftIgnoredWhileOn: true, shiftIgnoredWhileOff: true,
        mountainBlocked: true, entryBlocked: true,
        canSwimWhileSubmerged: true, cannotReenter: true
      })
    })
  })

  it('allows enough waits to drown with god-mode HP after disabling it', () => {
    beginGodModeGame()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayAnimationsDisabled = true
        enemies = []; npcs = []; occupied = new Set()
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))
        player.x = 50; player.y = 50; map[50][50] = 'water'
        const beforeTurns = turnCount
        for (let i = 0; i < 11; i++) skipTurn()
        const godWaitCap = turnCount - beforeTurns === 10
        window.dispatchEvent(new KeyboardEvent('keydown', {key: 'g'}))
        const before = player.deaths
        let waits = 0
        while (player.deaths === before && waits < 25) {
          skipTurn()
          waits++
        }
        return {waits, godWaitCap, deaths: player.deaths - before, x: player.x, y: player.y,
          templeX: spawnPoint.x, templeY: spawnPoint.y, godMode: player.godMode}
      })()`)
      expect(result.waits).to.be.greaterThan(10)
      expect(result.godWaitCap).to.equal(true)
      expect(result.deaths).to.equal(1)
      expect([result.x, result.y]).to.deep.equal([result.templeX, result.templeY])
      expect(result.godMode).to.equal(false)
    })
  })
})
