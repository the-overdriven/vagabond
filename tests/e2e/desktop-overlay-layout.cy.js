const cdp = (command, params) =>
  Cypress.automation('remote:debugger:protocol', {command, params})

describe('Desktop overlay layout', () => {
  afterEach(() => {
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: false}))
  })

  beforeEach(() => {
    cy.viewport(1440, 900)
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
  })

  it('uses the desktop viewport without reserving space for side panels or the log', () => {
    let initialCanvas
    cy.get('#game').then($canvas => {
      const canvas = $canvas[0]
      initialCanvas = {width: canvas.width, height: canvas.height}
      const stage = canvas.parentElement
      const stageRect = stage.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      const style = canvas.ownerDocument.defaultView.getComputedStyle(stage)
      expect(stageRect.left).to.be.closeTo(0, 0.5)
      expect(stageRect.right).to.be.closeTo(1440, 0.5)
      expect(stageRect.bottom).to.be.closeTo(900, 0.5)
      expect(style.overflow).to.equal('hidden')
      expect(canvasRect.left).to.be.at.most(stageRect.left + 2)
      expect(canvasRect.right).to.be.at.least(stageRect.right - 2)
      expect(canvasRect.top).to.be.at.most(stageRect.top + 2)
      expect(canvasRect.bottom).to.be.at.least(stageRect.bottom - 2)
      expect(Math.abs((stageRect.left - canvasRect.left) - (canvasRect.right - stageRect.right))).to.be.lessThan(2)
    })

    cy.get('#btnSideCollapse').click({force: true})
    cy.get('#game').should($canvas => {
      expect($canvas[0].width).to.equal(initialCanvas.width)
      expect($canvas[0].height).to.equal(initialCanvas.height)
    })

    cy.get('#btnHintCollapse').click({force: true})
    cy.get('#game').should($canvas => {
      expect($canvas[0].width).to.equal(initialCanvas.width)
      expect($canvas[0].height).to.equal(initialCanvas.height)
    })
  })

  it('removes desktop root padding and resizes the log without changing the camera', () => {
    let initialCanvas
    let initialLog

    cy.get('#root').should($root => {
      const style = $root[0].ownerDocument.defaultView.getComputedStyle($root[0])
      expect(parseFloat(style.paddingTop)).to.equal(0)
      expect(parseFloat(style.paddingRight)).to.equal(0)
      expect(parseFloat(style.paddingBottom)).to.equal(0)
      expect(parseFloat(style.paddingLeft)).to.equal(0)
    })

    cy.get('#game').then($canvas => {
      initialCanvas = {width: $canvas[0].width, height: $canvas[0].height}
    })

    cy.get('#logpanel').then($log => {
      const rect = $log[0].getBoundingClientRect()
      initialLog = {width: rect.width, height: rect.height}
      cy.wrap($log)
        .trigger('pointerdown', {
          pointerId: 7, button: 0, buttons: 1,
          clientX: rect.right - 5, clientY: rect.top + 5, force: true
        })
        .trigger('pointermove', {
          pointerId: 7, button: 0, buttons: 1,
          clientX: rect.right + 100, clientY: rect.top - 60, force: true
        })
        .trigger('pointerup', {
          pointerId: 7, button: 0, buttons: 0,
          clientX: rect.right + 100, clientY: rect.top - 60, force: true
        })
    })

    cy.get('#logpanel').should($log => {
      const rect = $log[0].getBoundingClientRect()
      const stageRect = $log[0].ownerDocument.getElementById('stage').getBoundingClientRect()
      expect(rect.width).to.be.greaterThan(initialLog.width + 50)
      expect(rect.height).to.be.greaterThan(initialLog.height + 30)
      expect(rect.width).to.be.at.most(stageRect.width * 0.8 + 1)
      expect(rect.height).to.be.at.most(stageRect.height * 0.6 + 1)
      expect(rect.right).to.be.lessThan(stageRect.right)
      expect(rect.top).to.be.greaterThan(stageRect.top)
    })

    cy.get('#game').should($canvas => {
      expect($canvas[0].width).to.equal(initialCanvas.width)
      expect($canvas[0].height).to.equal(initialCanvas.height)
    })
  })

  it('floats the semi-transparent log over the canvas on desktop', () => {
    cy.get('#stage').then($stage => {
      const stageRect = $stage[0].getBoundingClientRect()
      cy.get('#logpanel').should($log => {
        const log = $log[0]
        const logRect = log.getBoundingClientRect()
        const style = log.ownerDocument.defaultView.getComputedStyle(log)
        expect(style.position).to.equal('fixed')
        expect(Number(style.zIndex)).to.be.greaterThan(0)
        expect(style.backgroundImage).to.include('rgba')
        expect(logRect.left).to.be.greaterThan(stageRect.left)
        expect(logRect.right).to.be.lessThan(stageRect.right)
        expect(logRect.top).to.be.lessThan(stageRect.bottom)
        expect(logRect.bottom).to.be.lessThan(stageRect.bottom)
      })
    })
  })

  it('keeps a right-edge inspection tooltip inside the canvas', () => {
    cy.get('#raceName').clear().type('Layout Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      win.eval(`
        const stageRect = document.getElementById('stage').getBoundingClientRect()
        const canvasRect = canvas.getBoundingClientRect()
        const visibleRightBufferX = Math.min(canvas.width - 2,
          (stageRect.right - canvasRect.left - 3) * canvas.width / canvasRect.width)
        const visibleMiddleBufferY = Math.min(canvas.height - 2,
          (stageRect.top + stageRect.height / 2 - canvasRect.top) * canvas.height / canvasRect.height)
        const probeX = Math.floor(camX) + Math.floor(visibleRightBufferX / TILE_PX)
        const probeY = Math.floor(camY) + Math.floor(visibleMiddleBufferY / TILE_PX)
        npcs.push({x: probeX, y: probeY, name: 'Layout Probe', portrait: 'old_hunter', trades: false})
        lastMousePx = visibleRightBufferX
        lastMousePy = visibleMiddleBufferY
        updateTooltip()
      `)
    })
    cy.get('#tooltip').should($tooltip => {
      const tooltipRect = $tooltip[0].getBoundingClientRect()
      const canvasRect = $tooltip[0].ownerDocument.getElementById('game').getBoundingClientRect()
      expect(tooltipRect.right).to.be.at.most(canvasRect.right)
      expect(tooltipRect.left).to.be.at.least(canvasRect.left)
    })
  })

  it('keeps the touch layout out of the desktop overlay rules', () => {
    cy.viewport(390, 844)
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: true}))
    cy.reload()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#logpanel').should($log => {
      const style = $log[0].ownerDocument.defaultView.getComputedStyle($log[0])
      expect(style.position).not.to.equal('fixed')
      expect(parseFloat(style.width)).to.be.within(360, 390)
    })
  })
})
