describe('Desktop UI typography', () => {
  it('enlarges UI text on desktop without changing narrow-screen text', () => {
    cy.viewport(1440, 900)
    cy.visit('/')
    cy.get('.race-card').should('exist')
    cy.window().then(win => {
      const fontSize = selector => parseFloat(win.getComputedStyle(win.document.querySelector(selector)).fontSize)
      expect(fontSize('#hud')).to.be.closeTo(15.6, 0.1)
      expect(fontSize('#logpanel')).to.be.closeTo(14.4, 0.1)
      expect(fontSize('#tooltip')).to.be.closeTo(14.4, 0.1)
      expect(fontSize('.race-card')).to.be.closeTo(12, 0.1)
      expect(win.document.querySelector('#hud').getBoundingClientRect().width).to.be.at.most(1440)
    })

    cy.viewport(1024, 768)
    cy.get('#hud').should($hud => {
      expect($hud[0].getBoundingClientRect().width).to.be.at.most(1024)
    })

    cy.viewport(720, 900)
    cy.window().then(win => {
      const fontSize = selector => parseFloat(win.getComputedStyle(win.document.querySelector(selector)).fontSize)
      expect(fontSize('#hud')).to.be.closeTo(13, 0.1)
      expect(fontSize('#logpanel')).to.be.closeTo(12, 0.1)
      expect(fontSize('.race-card')).to.be.closeTo(10, 0.1)
    })
  })
})
