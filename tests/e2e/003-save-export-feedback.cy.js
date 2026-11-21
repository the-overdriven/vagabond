describe('Save export and recovery', () => {
  it('preserves the latest manual save even when downloading fails or silently does nothing', () => {
    let expected, expectedJson
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceName').clear().type('Save Recovery Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay', {timeout: 60000}).should('not.have.class', 'show')
    cy.window().then({timeout: 60000}, async win => {
      const alert = cy.stub(win, 'alert').as('saveErrorAlert')
      const click = cy.stub(win.HTMLAnchorElement.prototype, 'click')
      // The game also creates Blob URLs during background image preloading.
      // Simulate failures only for the JSON export, not unrelated startup assets.
      const nativeCreate = win.URL.createObjectURL.bind(win.URL)
      const nativeRevoke = win.URL.revokeObjectURL.bind(win.URL)
      const create = cy.stub().returns('blob:save-test')
      const revoke = cy.stub()
      const createUrl = cy.stub(win.URL, 'createObjectURL').callsFake(blob =>
        blob.type === 'application/json' ? create(blob) : nativeCreate(blob))
      const revokeUrl = cy.stub(win.URL, 'revokeObjectURL').callsFake(url =>
        url === 'blob:save-test' ? revoke(url) : nativeRevoke(url))
      // Exercise the reported location using an actual generated mine floor.
      win.eval(`(()=>{
        const first = dungeonPackageLevels('dwarvenMines')[0]
        currentZ = first.z; currentCave = -1; map = first.level.map
        undergroundDiscovered = first.level.discovered
        player.x = first.level.mineUpstairs.x; player.y = first.level.mineUpstairs.y
        rebuildActiveLevelOccupancy(); invalidateUndergroundFov()
      })()`)
      // A browser may accept a click without actually writing any file.
      await win.eval('saveGame()')
      expect(click).to.have.been.calledOnce
      expect(revoke).not.to.have.been.called
      const first = await win.eval('readRecoverySave()')
      expect(await create.firstCall.args[0].text()).to.equal(first.json)
      expect(JSON.parse(first.json).version).to.equal(win.eval('SAVE_VERSION'))
      expect(alert).not.to.have.been.called

      // Explicit download failure must still preserve the new manual snapshot.
      win.eval('player.gold += 7')
      create.throws(new Error('download blocked'))
      await win.eval('saveGame()')
      const latest = await win.eval('readRecoverySave()')
      expected = JSON.parse(latest.json)
      expectedJson = latest.json
      expect(expected.player.gold).to.equal(JSON.parse(first.json).player.gold + 7)
      expect(alert).to.have.been.calledOnceWith(
        'Save download failed: download blocked\nYour game was saved locally. Use Load local save on character selection to recover it.')

      // An unsuccessful later write must not destroy the committed backup.
      win.eval('player.gold += 9')
      const unavailable = cy.stub(win.indexedDB, 'open').throws(new Error('storage unavailable'))
      await win.eval('saveGame()')
      expect(alert.secondCall.args[0]).to.equal(
        'Failed to save the game: download blocked\nLocal backup also failed: storage unavailable')
      unavailable.restore()
      expect((await win.eval('readRecoverySave()')).json).to.equal(expectedJson)
      // A broken serializer must not replace the earlier snapshot either.
      const brokenSerializer = cy.stub(win, 'buildSaveObject').throws(new Error('serialization error'))
      win.eval('saveGame()')
      expect(alert.thirdCall.args[0]).to.equal('Failed to save the game: serialization error')
      brokenSerializer.restore()
      expect((await win.eval('readRecoverySave()')).json).to.equal(expectedJson)
      createUrl.restore()
      click.restore()
      revokeUrl.restore()
      alert.restore()
      // A requested file download alone is not a verified disk write.
      expect(win.eval('logQueue.map(entry => entry.msg).join(" ")') +
        win.document.getElementById('logpanel').textContent).not.to.contain('Game saved to file.')
      win.__saveRecoveryBeforeNavigation = true
    })

    // Navigate to a fresh document on the same origin (and thus the same
    // IndexedDB), without reusing the Cypress reload lifecycle of the old page.
    cy.visit('/?save-recovery=1')
    cy.get('#loadingOverlay', {timeout: 60000}).should($overlay => {
      expect($overlay.find('#loadingText').text()).not.to.contain('Loading failed')
      expect($overlay).not.to.be.visible
    })
    cy.window().then(win => {
      expect(win.__saveRecoveryBeforeNavigation).to.equal(undefined)
    })
    cy.get('#btnRaceRecover', {timeout: 15000}).should('be.visible').click()
    cy.get('#raceOverlay', {timeout: 60000}).should('not.have.class', 'show')
    cy.window().then(win => {
      const restored = win.eval('JSON.parse(JSON.stringify(buildSaveObject()))')
      expect(restored.version).to.equal(expected.version)
      expect(restored.worldSeed).to.equal(expected.worldSeed)
      expect(restored.currentZ).to.equal(expected.currentZ)
      expect(restored.turnCount).to.equal(expected.turnCount)
      expect(restored.rngState).to.equal(expected.rngState)
      expect(restored.player.name).to.equal(expected.player.name)
      expect(restored.player.gold).to.equal(expected.player.gold)
      expect(restored.map).to.equal(expected.map)
      expect(restored.deepLevels).to.have.length(expected.deepLevels.length)
      // Replay playback must never overwrite recovery.
      win.eval('replayPlaying = true; saveGame(); replayPlaying = false')
      return win.eval('readRecoverySave()').then(record => {
        expect(record.json).to.equal(expectedJson)
      })
    })
  })
})
