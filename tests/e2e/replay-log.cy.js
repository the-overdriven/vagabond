describe('Replay log animation', () => {
  it('finishes in-flight text and shows replay messages instantly', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Log Tester')
    cy.get('#replayToggle').check()
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
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
