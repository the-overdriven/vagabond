describe('God Mode Highscores confirmation', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('God Mode Confirmation Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay', {timeout: 90000}).should('not.have.class', 'show')
  })

  it('rejecting G preserves the current character, eligibility, turns and replay actions', () => {
    cy.window().then(win => {
      const prompt = cy.stub(win, 'confirm').returns(false)
      const hintsBefore = win.document.body.classList.contains('hint-collapsed')
      const storedHintsBefore = win.localStorage.getItem('vagabond_keyboard_hints_collapsed')
      const before = win.eval(`JSON.stringify({godMode:player.godMode,
        trackingLearned:player.trackingLearned,
        excluded:player.highscoresDisqualified, hp:player.hp, maxHp:player.maxHp,
        gold:player.gold, turnCount, rngState,
        replayActions:replayData?.actions?.length || 0})`)
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'G',shiftKey:true,bubbles:true,cancelable:true}))
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',repeat:true,bubbles:true,cancelable:true}))
      expect(prompt).not.to.have.been.called
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',bubbles:true,cancelable:true}))
      expect(prompt).to.have.been.calledOnce
      expect(prompt.firstCall.args[0]).to.include('PERMANENTLY disqualify')
      expect(prompt.firstCall.args[0]).to.include('reload an earlier save')
      const after = win.eval(`JSON.stringify({godMode:player.godMode,
        trackingLearned:player.trackingLearned,
        excluded:player.highscoresDisqualified, hp:player.hp, maxHp:player.maxHp,
        gold:player.gold, turnCount, rngState,
        replayActions:replayData?.actions?.length || 0})`)
      expect(after).to.equal(before)
      expect(win.document.body.classList.contains('hint-collapsed')).to.equal(hintsBefore)
      expect(win.localStorage.getItem('vagabond_keyboard_hints_collapsed')).to.equal(storedHintsBefore)
      const characterId = win.eval('player.characterId')
      expect(win.localStorage.getItem('vagabond_highscores_disqualified_' + characterId)).to.equal(null)
    })
  })

  it('accepting G persists exclusion through an earlier live save and allows disabling without a prompt', () => {
    cy.window().then(win => {
      const prompt = cy.stub(win, 'confirm').returns(true)
      const save = win.eval('JSON.parse(JSON.stringify(buildSaveObject()))')
      const characterId = win.eval('player.characterId')
      const originalFog=win.eval('JSON.stringify([discovered,undergroundDiscoveredL1])')
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',bubbles:true,cancelable:true}))
      expect(prompt).to.have.been.calledOnce
      expect(win.eval('player.godMode && player.highscoresDisqualified')).to.equal(true)
      expect(win.eval('JSON.stringify([discovered,undergroundDiscoveredL1])')).to.equal(originalFog)
      expect(win.eval('exploredMapLevels().some(level=>level.key==="chain:1")')).to.equal(true)
      expect(win.eval('player.trackingLearned')).to.equal(false)
      expect(win.eval('canReadTracks()')).to.equal(true)
      expect(win.document.body.classList.contains('hint-collapsed')).to.equal(true)
      expect(win.localStorage.getItem('vagabond_keyboard_hints_collapsed')).to.equal('1')
      expect(win.localStorage.getItem('vagabond_highscores_disqualified_' + characterId)).to.equal('1')
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',bubbles:true,cancelable:true}))
      expect(prompt).to.have.been.calledOnce
      expect(win.eval('!player.godMode && player.highscoresDisqualified')).to.equal(true)
      expect(win.eval('discovered.some(row=>row.includes(false))')).to.equal(true)
      expect(win.eval('discovered[player.y][player.x]')).to.equal(true)
      expect(win.eval('JSON.stringify([discovered,undergroundDiscoveredL1])')).to.equal(originalFog)
      expect(win.eval('player.trackingLearned')).to.equal(false)
      expect(win.eval('canReadTracks()')).to.equal(false)
      expect(win.eval('(()=>{player.trackingLearned=true; const known=canReadTracks(); player.trackingLearned=false; return known})()')).to.equal(true)
      expect(win.document.body.classList.contains('hint-collapsed')).to.equal(true)
      win.__godModeEarlierSave = save
      win.eval('loadGameFromObject(window.__godModeEarlierSave)')
      delete win.__godModeEarlierSave
      expect(win.eval('!player.godMode && player.highscoresDisqualified')).to.equal(true)
    })
  })

  it('preserves genuinely discovered terrain on all floors through God Mode and save/replay', () => {
    cy.window().then(win => {
      cy.stub(win, 'confirm').returns(true)
      win.eval(`(() => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg)}
        const surfaceBefore=JSON.stringify(discovered)
        const caveBefore=JSON.stringify(undergroundDiscoveredL1)
        useGodModeKey()
        check(JSON.stringify(undergroundDiscoveredL1)===caveBefore,'overlay does not mark cave explored')
        const entrance=caves.find(c=>c.entrances?.length)?.entrances[0]
        currentZ=-1;currentCave=-1;map=undergroundMap
        undergroundDiscovered=undergroundDiscoveredL1
        player.x=entrance.x;player.y=entrance.y
        invalidateUndergroundFov();discoverPlayerSight()
        const actualFog=JSON.stringify(undergroundDiscoveredL1)
        check(undergroundDiscoveredL1[player.y][player.x],'genuine sight discovers cave terrain even in God Mode')
        useGodModeKey(true)
        check(!player.godMode&&JSON.stringify(undergroundDiscoveredL1)===actualFog,'disabling preserves exploration')
        check(JSON.stringify(discovered)===surfaceBefore,'surface discovery remains unchanged')
        const snapshot=structuredClone(buildSaveObject())
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(JSON.stringify(undergroundDiscoveredL1)===actualFog&&JSON.stringify(discovered)===surfaceBefore,'fog survives save and replay initialization')
      })()`)
    })
  })
})
