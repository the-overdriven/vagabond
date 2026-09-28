const cdp = (command, params) =>
  Cypress.automation('remote:debugger:protocol', {command, params})

// Send real browser mouse input: Cypress trigger('mouseover') does not set :hover.
function moveMouse(selector) {
  cy.get(selector).then($element => {
    const element = $element[0]
    const rect = element.getBoundingClientRect()
    const win = element.ownerDocument.defaultView
    const frame = window.top.document.querySelector('iframe.aut-iframe').getBoundingClientRect()
    return cdp('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: frame.left + (rect.left + rect.width / 2) * frame.width / win.innerWidth,
      y: frame.top + (rect.top + rect.height / 2) * frame.height / win.innerHeight,
    })
  })
}

describe('Startup assets and character creation UI', () => {
  afterEach(() => {
    cy.then(() => cdp('Emulation.setEmulatedMedia', {features: []}))
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: false}))
  })

  it('preloads and decodes the Hauberk armor icon', () => {
    cy.intercept('GET', '**/img/icons/Hauberk.svg').as('hauberk')
    cy.visit('/')
    cy.wait('@hauberk', {requestTimeout: 60000}).its('response.statusCode').should('equal', 200)
    cy.window().then(win => {
      const image = new win.Image()
      image.src = 'img/icons/Hauberk.svg'
      return image.decode().then(() => expect(image.naturalWidth).to.equal(24))
    })
  })

  for (const mobile of [false, true]) {
    for (const reduced of [false, true]) {
      it(`spins the loading skull on ${mobile ? 'touch mobile' : 'desktop'} with ${reduced ? 'reduced' : 'normal'} motion`, () => {
        cy.viewport(mobile ? 390 : 1280, mobile ? 844 : 900)
        cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: mobile}))
        cy.then(() => cdp('Emulation.setEmulatedMedia', {
          features: [{name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference'}],
        }))
        cy.intercept('GET', '**/content/gear_armors.json', req => {
          req.continue(res => res.setDelay(3000))
        }).as('armors')
        cy.visit('/')
        cy.get('#loadingOverlay').should('be.visible')
        cy.get('.loading-skull')
          .should('have.css', 'animation-name', 'loading-spin')
          .and('have.css', 'animation-duration', reduced ? '12s' : '2.4s')
          .then($skull => {
            const win = $skull[0].ownerDocument.defaultView
            const initial = win.getComputedStyle($skull[0]).transform
            cy.wrap($skull).should($current => {
              expect(win.getComputedStyle($current[0]).transform).not.to.equal(initial)
            })
          })
        cy.wait('@armors')
        cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
      })
    }
  }

  it('shows the desktop warning only while hovered, even after clicking', () => {
    cy.viewport(1280, 900)
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    moveMouse('.cursed-world-option')
    cy.get('.cursed-world-tip').should('be.visible')
    cy.get('#cursedWorldToggle').click().should('be.checked').and('be.focused')
    moveMouse('#raceError')
    cy.get('#cursedWorldToggle').should('be.focused')
    cy.get('.cursed-world-tip').should('not.be.visible')
    moveMouse('.cursed-world-option')
    cy.get('.cursed-world-tip').should('be.visible')
  })

  it('shows the mobile note only when cursed world is checked', () => {
    cy.viewport(390, 844)
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: true}))
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('.cursed-world-mobile-note').should('not.be.visible')
    cy.get('#cursedWorldToggle').check()
    cy.get('.cursed-world-mobile-note').should('be.visible')
    cy.get('.cursed-world-tip').should('not.be.visible')
    cy.get('#cursedWorldToggle').uncheck()
    cy.get('.cursed-world-mobile-note').should('not.be.visible')
  })
})
