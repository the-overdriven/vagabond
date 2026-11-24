describe('God Mode artifact identification',()=>{
  it('grants a missing Pickaxe and all eligible test artifacts once and preserves them in saves',()=>{
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
        const testStock=()=>merchantStock.filter(i=>i.godTestArtifact)
        const expected=new Set()
        for(const [slot,catalog] of [['weapon',WEAPONS],['shield',SHIELDS],['armor',ARMORS]])
          for(const base of catalog)
            for(const id of artifactAbilityPool({...base,kind:'artifact',artifactSlot:slot,base:base.name}))
              expected.add((slot==='weapon'?(base.rangedAtk?'bow':'melee'):slot)+':'+id)
        const effect=ARTIFACT_EFFECTS.reduce((first,next)=>next.tier<first.tier?next:first)
        for(const noun of eligibleArtifactTrinketNouns(effect.tier))
          for(const id of artifactAbilityPool({kind:'artifact',artifactSlot:'trinket',noun,tier:effect.tier})) expected.add('trinket:'+id)
        const keys=testStock().map(i=>(i.artifactSlot==='weapon'?(i.rangedAtk?'bow':'melee'):i.artifactSlot)+':'+i.abilityId)
        check(keys.length===expected.size&&new Set(keys).size===keys.length&&keys.every(k=>expected.has(k)),
          'one representative per category and power')
        check(new Set(testStock().map(i=>i.name)).size===keys.length,'test specimen names are distinguishable')
        check(testStock().every(i=>i.identified&&!i.curse&&Object.keys(i.bonuses).length===0),
          'test powers visible and isolated from random bonuses and ordinary curses')
        const purchased=testStock()[0].replayId
        buyItem(testStock()[0])
        check(player.inventory.some(i=>i.replayId===purchased),'test artifact can be purchased')
        useGodModeKey()
        check(!player.godMode&&player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          'disabling God Mode keeps the granted Pickaxe')
        useGodModeKey()
        check(player.inventory.filter(i=>i.kind==='pickaxe').length===1,
          're-enabling God Mode does not duplicate the Pickaxe')
        check(turnCount===turn&&rngState===random,'toggling God Mode costs no turn or RNG')
        check(testStock().length===expected.size-1,'a purchased specimen is not restocked')
        const saved=structuredClone(buildSaveObject())
        loadGameFromObject(saved,{isReplayInit:true})
        check(player.godArtifactStockGranted&&testStock().length===expected.size-1&&
          player.inventory.some(i=>i.replayId===purchased),'stock and grant flag survive save/load')
        useGodModeKey(true);useGodModeKey()
        check(testStock().length===expected.size-1,'reload does not permit a second grant')
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
