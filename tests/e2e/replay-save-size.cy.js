describe('Replay save diagnostics', () => {
  it('keeps recording data but discards old RNG stack traces on load and save', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Replay Tester')
    cy.get('#replayToggle').check()
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    cy.window().then(win => {
      const result = win.eval(`(() => {
        recordReplayAction({type: 'skipTurn'})
        rng()
        recordReplayAction({type: 'skipTurn'})
        const snapshot = buildSaveObject()
        const traces = Array(10000).fill({stack: ['a'.repeat(100)]})
        const oldSave = {...snapshot, replay: {...snapshot.replay, _rngCallers: [traces]}}
        replayRngCallers = traces
        loadGameFromObject(oldSave)
        const cleaned = buildSaveObject()
        return {
          debugEnabled: RNG_DEBUG,
          actions: cleaned.replay.actions.length,
          rngValues: cleaned.replay.rng.length,
          liveTraces: replayRngCallers.length,
          loadedTraces: Object.hasOwn(replayData, '_rngCallers'),
          savedTraces: Object.hasOwn(cleaned.replay, '_rngCallers'),
          recording: replayRecording,
          bloatedSize: JSON.stringify(oldSave).length,
          cleanedSize: JSON.stringify(cleaned).length
        }
      })()`)
      expect(result).to.include({
        debugEnabled: false, actions: 2, rngValues: 1, liveTraces: 0,
        loadedTraces: false, savedTraces: false, recording: true
      })
      expect(result.cleanedSize).to.be.lessThan(result.bloatedSize / 2)
    })
  })

  it('restores the live recording after watching it and keeps recording new actions', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Replay Tester')
    cy.get('#replayToggle').check()
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')

    let before
    cy.window().then(win => {
      win.eval('inspect()')
      win.eval('turnCount = 17; consecutiveWaitTurns = 3; oldHunterQuestSerial = 7')
      before = win.eval('buildSaveObject()')
      win.eval('startReplayPlayback()')
    })
    cy.window().should(win => {
      expect(win.eval('replayPlaying')).to.equal(false)
      expect(win.eval('replayRecording')).to.equal(true)
      expect(win.eval('rngState')).to.equal(before.rngState)
      expect(win.eval('player.steps')).to.equal(before.player.steps)
      expect(win.eval('turnCount')).to.equal(17)
      expect(win.eval('consecutiveWaitTurns')).to.equal(3)
      expect(win.eval('oldHunterQuestSerial')).to.equal(7)
      expect(win.eval('replayData.actions.length')).to.equal(before.replay.actions.length)
    })
    cy.window().then(win => {
      win.eval('inspect()')
      const saved = win.eval('buildSaveObject()')
      expect(saved.replay.actions).to.have.length(before.replay.actions.length + 1)
      expect(saved.replay).not.to.have.property('_rngCallers')
      win.eval('loadGameFromObject')(saved)
      expect(win.eval('replayRecording')).to.equal(true)
      expect(win.eval('replayData.actions.length')).to.equal(saved.replay.actions.length)
      win.eval('replayData.actions[0]._rngStart = -100; startReplayPlayback()')
    })
    cy.window().should(win => {
      expect(win.eval('replayPlaying')).to.equal(false)
      expect(win.eval('replayRecording')).to.equal(true)
      expect(win.eval('rngState')).to.equal(before.rngState)
      expect(win.eval('replayData.actions.length')).to.equal(before.replay.actions.length + 1)
    })
  })
})
