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
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',bubbles:true,cancelable:true}))
      expect(prompt).to.have.been.calledOnce
      expect(win.eval('player.godMode && player.highscoresDisqualified')).to.equal(true)
      expect(win.eval('discovered.every(row=>row.every(Boolean))')).to.equal(true)
      expect(win.eval('undergroundDiscoveredL1.every(row=>row.every(Boolean))')).to.equal(true)
      expect(win.eval('player.trackingLearned')).to.equal(true)
      expect(win.document.body.classList.contains('hint-collapsed')).to.equal(true)
      expect(win.localStorage.getItem('vagabond_keyboard_hints_collapsed')).to.equal('1')
      expect(win.localStorage.getItem('vagabond_highscores_disqualified_' + characterId)).to.equal('1')
      win.dispatchEvent(new win.KeyboardEvent('keydown', {key:'g',bubbles:true,cancelable:true}))
      expect(prompt).to.have.been.calledOnce
      expect(win.eval('!player.godMode && player.highscoresDisqualified')).to.equal(true)
      expect(win.eval('discovered.some(row=>row.includes(false))')).to.equal(true)
      expect(win.eval('discovered[player.y][player.x]')).to.equal(true)
      expect(win.eval('undergroundDiscoveredL1.every(row=>row.every(Boolean))')).to.equal(true)
      expect(win.eval('player.trackingLearned')).to.equal(true)
      expect(win.document.body.classList.contains('hint-collapsed')).to.equal(true)
      win.__godModeEarlierSave = save
      win.eval('loadGameFromObject(window.__godModeEarlierSave)')
      delete win.__godModeEarlierSave
      expect(win.eval('!player.godMode && player.highscoresDisqualified')).to.equal(true)
    })
  })

  it('forgets only the active underground floor and persists its fog through save/replay', () => {
    cy.window().then(win => {
      cy.stub(win, 'confirm').returns(true)
      win.eval(`(() => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg)}
        useGodModeKey()
        const entrance=caves.find(c=>c.entrances?.length)?.entrances[0]
        check(!!entrance,'generated cave has an entrance')
        currentZ=-1;currentCave=-1;map=undergroundMap
        undergroundDiscovered=undergroundDiscoveredL1
        player.x=entrance.x;player.y=entrance.y
        invalidateUndergroundFov()
        useGodModeKey(true)
        check(!player.godMode&&undergroundDiscoveredL1.some(row=>row.includes(false)),
          'the current cave returns to unexplored fog')
        check(undergroundDiscoveredL1[player.y][player.x],
          'ordinary nearby cave visibility returns immediately')
        check(discovered.every(row=>row.every(Boolean)),
          'surface discovery remains unchanged when another floor is reset')
        const snapshot=structuredClone(buildSaveObject())
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(undergroundDiscoveredL1.some(row=>row.includes(false))&&
          discovered.every(row=>row.every(Boolean)),
          'floor-specific forgotten discovery survives save and replay initialization')
      })()`)
    })
  })
})
