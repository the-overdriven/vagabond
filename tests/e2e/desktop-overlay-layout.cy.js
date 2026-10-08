const cdp = (command, params) =>
  Cypress.automation('remote:debugger:protocol', {command, params})

function expectHudSingleRow(hud) {
  const centers = [...hud.querySelectorAll(':scope > .stat')].map(el => {
    const rect = el.getBoundingClientRect()
    return (rect.top + rect.bottom) / 2
  })
  expect(Math.max(...centers) - Math.min(...centers), 'HUD stat vertical-center spread').to.be.lessThan(1.5)
}

describe('Desktop overlay layout', () => {
  afterEach(() => {
    cy.then(() => cdp('Emulation.setTouchEmulationEnabled', {enabled: false}))
  })

  beforeEach(() => {
    cy.viewport(1440, 900)
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
  })

  it('keeps the desktop map and hint panels in a compact upper-right stack', () => {
    cy.window().then(win => {
      const side = win.document.getElementById('sidePanel').getBoundingClientRect()
      const hint = win.document.getElementById('hint').getBoundingClientRect()
      const gap = hint.top - side.bottom
      expect(side.top).to.be.closeTo(90, 0.5)
      expect(hint.top).to.be.closeTo(335, 0.5)
      expect(gap, 'map-to-hints gap').to.be.greaterThan(0)
      expect(gap, 'map-to-hints gap').to.be.lessThan(45)
    })

    cy.get('#btnSideCollapse').click({force: true})
    cy.get('#btnSideCollapse').should($button => {
      expect($button[0].getBoundingClientRect().top).to.be.closeTo(90, 0.5)
    })
    cy.get('#btnHintCollapse').click({force: true})
    cy.get('#btnHintCollapse').should($button => {
      expect($button[0].getBoundingClientRect().top).to.be.closeTo(335, 0.5)
    })
  })

  it('keeps race selection above gameplay-side overlays while leaving the HUD on one row', () => {
    cy.get('#raceOverlay').should('have.class', 'show')

    cy.get('#hud').should($hud => {
      expectHudSingleRow($hud[0])
    })

    cy.window().then(win => {
      const race = win.document.getElementById('raceOverlay')
      for (const id of ['sidePanel', 'hint', 'logpanel']) {
        const el = win.document.getElementById(id)
        const rect = el.getBoundingClientRect()
        const x = Math.max(1, Math.min(win.innerWidth - 2, rect.left + rect.width / 2))
        const y = Math.max(1, Math.min(win.innerHeight - 2, rect.top + rect.height / 2))
        const top = win.document.elementFromPoint(x, y)
        expect(top === race || race.contains(top), `${id} must stay below race selection`).to.equal(true)
      }

      const hudBottom = win.document.getElementById('hud').getBoundingClientRect().bottom
      const panelTop = race.querySelector('.panelbox').getBoundingClientRect().top
      expect(panelTop).to.be.greaterThan(hudBottom)
    })
  })

  it('uses the full desktop viewport without reserving space for the HUD, side panels or log', () => {
    let initialCanvas
    cy.get('#game').then($canvas => {
      const canvas = $canvas[0]
      initialCanvas = {width: canvas.width, height: canvas.height}
      const stage = canvas.parentElement
      const stageRect = stage.getBoundingClientRect()
      const canvasRect = canvas.getBoundingClientRect()
      const style = canvas.ownerDocument.defaultView.getComputedStyle(stage)
      expect(stageRect.left).to.be.closeTo(0, 0.5)
      expect(stageRect.top).to.be.closeTo(0, 0.5)
      expect(stageRect.right).to.be.closeTo(1440, 0.5)
      expect(stageRect.bottom).to.be.closeTo(900, 0.5)
      expect(style.position).to.equal('absolute')
      expect(style.overflow).to.equal('hidden')
      expect(canvasRect.left).to.be.at.most(stageRect.left + 2)
      expect(canvasRect.right).to.be.at.least(stageRect.right - 2)
      expect(canvasRect.top).to.be.at.most(stageRect.top + 2)
      expect(canvasRect.bottom).to.be.at.least(stageRect.bottom - 2)
      expect(Math.abs((stageRect.left - canvasRect.left) - (canvasRect.right - stageRect.right))).to.be.lessThan(2)
    })

    let initialHudHeight
    cy.get('#hud').should($hud => {
      const hud = $hud[0]
      const hudRect = hud.getBoundingClientRect()
      const stageRect = hud.ownerDocument.getElementById('stage').getBoundingClientRect()
      const style = hud.ownerDocument.defaultView.getComputedStyle(hud)
      initialHudHeight = hudRect.height
      expect(style.position).to.equal('fixed')
      expect(style.flexWrap).to.equal('nowrap')
      expect(Number(style.zIndex)).to.be.greaterThan(30)
      expect(hudRect.top).to.be.closeTo(stageRect.top, 0.5)
      expect(hudRect.bottom).to.be.greaterThan(stageRect.top)
      expect(hudRect.bottom).to.be.lessThan(stageRect.bottom)
      expectHudSingleRow(hud)
    })

    // Even if CSS is deliberately forced to wrap the HUD, presentation-only
    // HUD height changes must not resize the map camera underneath it.
    cy.get('#hud').then($hud => {
      $hud[0].style.width = '360px'
      $hud[0].style.flexWrap = 'wrap'
    })
    cy.get('#hud').should($hud => {
      expect($hud[0].getBoundingClientRect().height).to.be.greaterThan(initialHudHeight)
    })
    cy.get('#game').should($canvas => {
      expect($canvas[0].width).to.equal(initialCanvas.width)
      expect($canvas[0].height).to.equal(initialCanvas.height)
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
          clientX: rect.right - 24, clientY: rect.top + 8, force: true
        })
        .trigger('pointermove', {
          pointerId: 7, button: 0, buttons: 1,
          clientX: rect.right + 76, clientY: rect.top - 52, force: true
        })
        .trigger('pointerup', {
          pointerId: 7, button: 0, buttons: 0,
          clientX: rect.right + 76, clientY: rect.top - 52, force: true
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
        expect(logRect.width, 'desktop log default width').to.be.lessThan(500)
        expect(logRect.height, 'desktop log default height').to.be.greaterThan(200)
        expect(stageRect.bottom - logRect.bottom, 'original desktop log bottom inset').to.be.closeTo(40, 0.5)
        expect(logRect.left).to.be.greaterThan(stageRect.left)
        expect(logRect.right).to.be.lessThan(stageRect.right)
        expect(logRect.top).to.be.lessThan(stageRect.bottom)
        expect(logRect.bottom).to.be.lessThan(stageRect.bottom)
      })
    })
  })

  it('keeps the log anchored when the status strip grows', () => {
    cy.get('#game').then($canvas => {
      const initialWidth = $canvas[0].width
      const initialHeight = $canvas[0].height
      cy.get('#logpanel').then($log => {
        const originalBottom = $log[0].getBoundingClientRect().bottom
        cy.get('#playerStatuses').then($statuses => {
          const statuses = $statuses[0]
          statuses.hidden = false
          statuses.querySelector('#playerStatusList').style.minHeight = '120px'
        })
        cy.get('#logpanel').should($updated => {
          expect($updated[0].getBoundingClientRect().bottom, 'log anchor is unchanged').to.be.closeTo(originalBottom, 0.5)
        })
      })
      cy.get('#game').should($canvasAfter => {
        expect($canvasAfter[0].width).to.equal(initialWidth)
        expect($canvasAfter[0].height).to.equal(initialHeight)
      })
    })
  })

  it('keeps the underground depth badge inside the visible clipped canvas', () => {
    cy.window().then(win => {
      const checkDepthBadge = () => {
        const badge = win.eval('depthLabelRect()')
        const canvas = win.document.getElementById('game')
        const canvasRect = canvas.getBoundingClientRect()
        const stageRect = win.document.getElementById('stage').getBoundingClientRect()
        const scaleX = canvasRect.width / canvas.width
        const scaleY = canvasRect.height / canvas.height
        const screen = {
          left: canvasRect.left + badge.x * scaleX,
          top: canvasRect.top + badge.y * scaleY,
          right: canvasRect.left + (badge.x + badge.width) * scaleX,
          bottom: canvasRect.top + (badge.y + badge.height) * scaleY
        }
        expect(screen.left, 'depth badge left').to.be.at.least(stageRect.left + 1.5)
        expect(screen.top, 'depth badge top').to.be.at.least(stageRect.top + 1.5)
        expect(screen.right, 'depth badge right').to.be.at.most(stageRect.right - 1.5)
        expect(screen.bottom, 'depth badge bottom').to.be.at.most(stageRect.bottom - 1.5)
      }

      checkDepthBadge()
      win.eval('setTileSize(52)')
      checkDepthBadge()
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
    cy.get('#sidePanel').should('have.css', 'display', 'none')
    cy.get('#hint').should('have.css', 'display', 'none')
  })
})
