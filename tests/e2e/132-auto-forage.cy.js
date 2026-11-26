describe('Auto-Forage', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__autoForageFixture = save
      win.eval('loadGameFromObject(window.__autoForageFixture, {isReplayInit: true})')
      delete win.__autoForageFixture
    }))
  })

  it('resolves additional forest turns and preserves replay RNG', () => {
    cy.readFile('tests/helpers/auto-forage-checks.js', 'utf8').then(source =>
      cy.window().then({timeout: 60000}, win => win.eval(`${source}\n;autoForageChecks()`)))
  })

  it('distinguishes keyboard shortcuts, touch taps, long holds and cancellations', () => {
    cy.clock(Date.now(), ['setTimeout', 'clearTimeout'])
    cy.window().then(win => {
      win.eval(`window.__manualForage = lootSkeletonOrForage;
        window.__forageTaps = 0;
        lootSkeletonOrForage = () => window.__forageTaps++`)
      const key = (k, opts = {}) => win.dispatchEvent(new win.KeyboardEvent('keydown', {
        key: k, cancelable: true, bubbles: true, ...opts
      }))
      expect(key('f', {ctrlKey: true}), 'browser Find stays available').to.equal(true)
      expect(win.__forageTaps).to.equal(0)
      key('F', {shiftKey: true})
      expect(win.eval('autoForageEnabled')).to.equal(true)
      key('F', {shiftKey: true, repeat: true})
      expect(win.eval('autoForageEnabled')).to.equal(true)
      key('f')
      expect(win.__forageTaps).to.equal(1)
      key('F', {shiftKey: true})
      expect(win.eval('autoForageEnabled')).to.equal(false)
    })
    const pointer = type => cy.window().then(win => {
      win.document.getElementById('touchForage').dispatchEvent(new win.PointerEvent(type, {
        pointerId: 7, isPrimary: true, pointerType: 'touch', button: 0, bubbles: true, cancelable: true
      }))
    })
    const pointerClick = () => cy.window().then(win => {
      win.document.getElementById('touchForage').dispatchEvent(new win.MouseEvent('click', {
        detail: 1, bubbles: true, cancelable: true
      }))
    })
    pointer('pointerdown'); cy.tick(100); pointer('pointerup'); pointerClick()
    cy.window().then(win => expect(win.__forageTaps).to.equal(2))
    pointer('pointerdown'); cy.tick(500)
    cy.get('#touchForage').should('have.attr', 'aria-pressed', 'true')
    cy.get('#autoForageIndicator')
      .should('not.have.attr', 'hidden')
      .and('have.text', '🌿')
      .and('have.attr', 'title', 'Auto-Forage active: automatically searches unsearched forest tiles when safe.')
    pointer('pointerup'); pointerClick()
    cy.window().then(win => expect(win.__forageTaps).to.equal(2))
    pointer('pointerdown'); cy.tick(100); pointer('pointercancel'); cy.tick(600)
    cy.get('#touchForage').should('have.attr', 'aria-pressed', 'true')
    pointer('pointerdown'); cy.tick(500); pointer('pointerup'); pointerClick()
    cy.get('#touchForage').should('have.attr', 'aria-pressed', 'false')
    cy.get('#autoForageIndicator').should('have.attr', 'hidden')
    cy.window().then(win => {
      expect(win.__forageTaps).to.equal(2)
      win.eval('lootSkeletonOrForage = window.__manualForage; delete window.__manualForage')
    })
  })
})
