describe('God Mode artifact identification',()=>{
  it('grants a missing Pickaxe once, keeps it after disabling and preserves it in saves',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('God Pickaxe Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>{
      cy.stub(win,'confirm').returns(true)
      win.eval(`(()=>{
        const check=(condition,description)=>{if(!condition)throw Error(description)}
        player.inventory=player.inventory.filter(item=>item.kind!=='pickaxe')
        player.godMode=false
        const turn=turnCount,random=rngState
        useGodModeKey()
        check(player.godMode&&player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          'enabling God Mode grants one missing Pickaxe')
        useGodModeKey()
        check(!player.godMode&&player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          'disabling God Mode keeps the granted Pickaxe')
        useGodModeKey()
        check(player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          're-enabling God Mode does not duplicate the Pickaxe')
        check(turnCount===turn&&rngState===random,'toggling God Mode costs no turn or RNG')
        const saved=buildSaveObject()
        loadGameFromObject(saved,{isReplayInit:true})
        check(player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          'the granted Pickaxe survives save and replay initialization')
      })()`)
    })
  })
  it('identifies without scrolls on desktop/mobile and preserves normal scroll use',()=>{
    cy.visit('/')
    // The exact-save loader validates adaptive state against loaded content.
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__identifyBootstrapSave=save
      win.eval(`(() => {
        loadGameFromObject(window.__identifyBootstrapSave,{isReplayInit:true})
        raceOpen=false;document.getElementById('raceOverlay').classList.remove('show')
        replayRecording=false;enemies=[];npcs=[];occupied=new Set()
        player.inventory=[
          {kind:'artifact',name:'Test Amulet',noun:'Amulet',description:'A test artifact.',identified:false,tier:1},
          {kind:'artifact',name:'Test Ring',noun:'Ring',description:'A second test artifact.',identified:false,tier:1}]
        player.godMode=true;player.godInvisible=true
        invTab='all';toggleInv(true)
      })()`)
      delete win.__identifyBootstrapSave
    }))
    cy.get('#invOverlay button[title="Identify (free in God Mode)"]').should('have.length',2)
    cy.window().then(win=>{win.__turnBeforeIdentification=win.eval('turnCount')})
    cy.get('#invOverlay button[title="Identify (free in God Mode)"]').first().click()
    cy.window().should(win=>{
      expect(win.eval('player.inventory[0].identified')).to.equal(true)
      expect(win.eval('player.inventory.filter(i=>i.kind==="idscroll").length')).to.equal(0)
      expect(win.eval('turnCount')).to.equal(win.__turnBeforeIdentification+1)
    })
    cy.viewport(390,844)
    cy.window().then(win=>win.eval(`player.godMode=false;player.godInvisible=false;
      player.inventory.push({kind:'idscroll',name:'Scroll of Identification',count:2});renderInventory()`))
    cy.get('#invOverlay button[title="Identify (requires a Scroll of Identification)"]').should('have.length',1).click()
    cy.window().should(win=>{
      expect(win.eval('player.inventory[1].identified')).to.equal(true)
      expect(win.eval('player.inventory.find(i=>i.kind==="idscroll").count')).to.equal(1)
    })
  })
})
