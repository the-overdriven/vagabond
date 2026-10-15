const {installOnlineMock}=require('../support/highscores-checks')
const {highscoreRows,layoutChecks,recordChecks,inputChecks,responseRaceChecks,replayOverlayChecks}=require('../support/highscores-ui-checks')
const boards={false:highscoreRows(false),true:highscoreRows(true)}

function visit(options={rows:boards}) {
  cy.visit('/',{onBeforeLoad:win=>installOnlineMock(win,options)})
  cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
}

describe('Highscores trophy and records UI',()=>{
  afterEach(()=>cy.then(()=>Cypress.automation('remote:debugger:protocol',{
    command:'Emulation.setTouchEmulationEnabled',params:{enabled:false}
  })))

  for(const [width,height,touch] of [[1440,900,false],[1280,800,false],[390,844,true],[320,568,true],[844,390,true]]) {
    it(`keeps the trophy, records and close control usable at ${width}x${height}`,()=>{
      cy.viewport(width,height)
      cy.then(()=>Cypress.automation('remote:debugger:protocol',{
        command:'Emulation.setTouchEmulationEnabled',params:{enabled:touch}
      }))
      visit()
      cy.get('#btnReplay').invoke('show')
      cy.get('#btnHighscores').should('be.visible').click()
      cy.get('#btnHighscoresClose').click()
      cy.window().then(win=>win.eval(`(${layoutChecks.toString()})()`))
      cy.window().then(win=>win.eval(`(${recordChecks.toString()})()`))
      cy.get('#btnHighscoresClose').click()
      cy.get('#raceOverlay').should('have.class','show')
    })
  }

  it('blocks live controls, preserves replay actions, and safely shares the Graveyard overlay',()=>{
    visit()
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__uiSave=save
      win.eval('loadGameFromObject(window.__uiSave,{isReplayInit:true})')
      delete win.__uiSave
      return win.eval(`(${inputChecks.toString()})()`)
    }))
  })

  it('handles pending reads, quick mode changes and closing before a response',()=>{
    visit({deferred:true})
    cy.window().then(win=>win.eval(`(${responseRaceChecks.toString()})()`))
  })

  it('continues recorded turn resolution while the replay-unavailable overlay is visible',()=>{
    visit()
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__uiSave=save
      win.eval('loadGameFromObject(window.__uiSave,{isReplayInit:true})')
      delete win.__uiSave
      return win.eval(`(${replayOverlayChecks.toString()})()`)
    }))
  })

  it('shows offline and failed-read states without blocking character selection',()=>{
    visit({offline:true})
    cy.get('#btnHighscores').click()
    cy.get('#highscoresStatus').should('have.text','Online Highscores unavailable while offline.')
    cy.get('#btnHighscoresClose').click()
    cy.get('#raceOverlay').should('have.class','show')
    visit({failReads:true})
    cy.get('#btnHighscores').click()
    cy.get('#highscoresStatus').should('have.text','Online Highscores unavailable.')
  })

  it('traps keyboard focus, allows details toggling, and returns focus on Escape',()=>{
    visit()
    cy.get('#btnHighscores').click()
    cy.get('#highscoresList > details').should('have.length',10)
    cy.get('#highscoresList > details:first-child summary').click()
    cy.get('#highscoresList > details:first-child').should('have.attr','open')
    cy.window().then(win=>{
      const close=win.document.getElementById('btnHighscoresClose')
      close.focus()
      win.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true}))
      expect(win.document.activeElement).to.equal(win.document.querySelector('#highscoresList > details:last-child summary'))
      win.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',cancelable:true}))
      expect(win.document.activeElement).to.equal(close)
      win.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',cancelable:true}))
    })
    cy.get('#highscoresOverlay').should('not.have.class','show')
    cy.get('#btnHighscores').should('have.focus')
  })
})
