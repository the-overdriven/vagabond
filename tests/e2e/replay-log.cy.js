describe('Replay log animation', () => {
  it('finishes in-flight text and shows replay messages instantly', () => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    // Log animation does not depend on world generation. Start from a fixed
    // save so an unrelated procedural generation timeout cannot mask this test.
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__replayLogFixture = save
      try {
        win.eval('loadGameFromObject(window.__replayLogFixture, {isReplayInit: true})')
        win.eval('replayRecording = false; replayData = null; startReplayRecording()')
      } finally {
        delete win.__replayLogFixture
      }
    }))
    cy.window().should(win => expect(win.eval('replayRecording')).to.equal(true))
    cy.window().then(win => {
      win.eval('inspect()')
      return win.eval('waitForLogIdle()')
    })

    const message = 'This message began typing before replay playback started.'
    cy.window().then(win => {
      const cypress = win.Cypress
      win.Cypress = undefined
      try {
        win.eval(`log(${JSON.stringify(message)})`)
        expect(win.eval('logEl.lastElementChild.textContent.length')).to.be.lessThan(message.length)
        win.eval('startReplayPlayback(); pauseReplay()')
      } finally {
        win.Cypress = cypress
      }
    })
    cy.get('#logpanel').should('contain.text', message)
    cy.window().then(win => {
      expect(win.eval('replayPlaying')).to.equal(true)
      win.eval("log('Replay messages are immediate.')")
      expect(win.eval('logEl.lastElementChild.textContent')).to.equal('Replay messages are immediate.')
      win.eval('resumeReplay()')
    })
    cy.window().should(win => {
      expect(win.eval('replayPlaying')).to.equal(false)
      expect(win.eval('replayRecording')).to.equal(true)
    })
    cy.window().then(win => win.eval('waitForLogIdle()'))
    cy.window().then(win => {
      const cypress = win.Cypress
      win.Cypress = undefined
      try {
        win.eval("log('Normal gameplay text still animates.')")
        expect(win.eval('logEl.lastElementChild.textContent.length'))
          .to.be.lessThan('Normal gameplay text still animates.'.length)
      } finally {
        win.Cypress = cypress
      }
    })
  })
})
