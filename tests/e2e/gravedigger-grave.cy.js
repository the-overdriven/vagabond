describe('Gravedigger unfinished grave', () => {
  it('preserves the village grave and offers a map-free directional tower rumor', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Grave Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const key = gravediggerGraveKey
        const [x, y] = key.split(',').map(Number)
        const digger = npcs.find(n => n.name === 'Gravedigger')
        const before = Object.keys(cemeteryTombstones).length
        const rngBefore = rngState
        ensureGravediggerGrave()
        const saved = buildSaveObject()
        loadGameFromObject(saved)
        const restored = gravediggerGraveKey === key && surfaceMap[y][x] === 'grave' && map[y][x] === 'grave'
        return {restored, active: map[y][x], stored: surfaceMap[y][x],
          separate: !cemeteryTombstones[key], keyStable: key === gravediggerGraveKey,
          distance: Math.max(Math.abs(x - digger.homeX), Math.abs(y - digger.homeY)),
          underlay: !!tileUnderlays[key], savedKey: saved.gravediggerGraveKey,
          key, rngStable: rngBefore === rngState,
          cemeteryStable: before === Object.keys(cemeteryTombstones).length}
      })()`)
      expect(result.restored).to.equal(true)
      expect(result.active).to.equal('grave')
      expect(result.stored).to.equal('grave')
      expect(result.separate).to.equal(true)
      expect(result.keyStable).to.equal(true)
      expect(result.distance).to.be.within(1, 20)
      expect(result.underlay).to.equal(true)
      expect(result.savedKey).to.equal(result.key)
      expect(result.rngStable).to.equal(true)
      expect(result.cemeteryStable).to.equal(true)
    })
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const digger = npcs.find(n => n.name === 'Gravedigger')
        const originalTower = tower
        const originalPlayer = {x:player.x,y:player.y}
        const originalZ = currentZ, originalMap = map, originalRaceOpen = raceOpen
        const rngBefore = rngState, turnBefore = turnCount
        const gossipOption = npcMenuOptions(digger).some(o => o.id === 'gossip' && o.label === 'Gossip')
        let compassCorrect = false, thresholdCorrect = false, rumorCorrect = false
        let menuCorrect = false, mapUnmarked = false
        try {
          const originalText = gravediggerTowerRumor(digger)
          const actualDirection = TRACK_DIRECTIONS[trackDirection(
            originalTower.entrance.x - digger.x, originalTower.entrance.y - digger.y)]
          const actualFar = towerDistance(digger.x, digger.y) > 80
          rumorCorrect = originalText.includes('to the ' + actualDirection + '.') &&
            originalText.includes('I stopped saving graves for those who went looking. Waste of good earth.') &&
            originalText.includes('tower far to') === actualFar && !originalText.includes('  ')

          // Reuse the eight-direction Tracking compass rather than a second bearing system.
          const bearings = [[0,-1,'north'],[1,-1,'north-east'],[1,0,'east'],
            [1,1,'south-east'],[0,1,'south'],[-1,1,'south-west'],
            [-1,0,'west'],[-1,-1,'north-west']]
          compassCorrect = bearings.every(([dx,dy,name]) => {
            const x=digger.x+dx*60, y=digger.y+dy*60
            tower = {...originalTower,x:x-5,y:y-5,entrance:{x,y}}
            return gravediggerTowerRumor(digger).includes('to the ' + name + '.')
          })

          // Distance uses the closest tower footprint tile, not its center.
          thresholdCorrect = [79,80,81].every(distance => {
            tower = {...originalTower,x:digger.x+distance,y:digger.y-4,
              entrance:{x:digger.x+distance+5,y:digger.y}}
            const text = gravediggerTowerRumor(digger)
            return text.includes('tower far to') === (distance > 80) && !text.includes('  ')
          })
          tower = originalTower
          currentZ = 0; map = surfaceMap
          raceOpen = false; player.x = digger.x+1; player.y = digger.y
          const opened = openNpcMenu(digger)
          const discoveredBefore = JSON.stringify(discovered)
          if (opened) selectNpcMenuOption('gossip')
          menuCorrect = opened && document.getElementById('npcSpeech').textContent === originalText
          mapUnmarked = JSON.stringify(discovered) === discoveredBefore
        } finally {
          tower = originalTower
          closeNpcMenu()
          player.x = originalPlayer.x; player.y = originalPlayer.y
          currentZ = originalZ; map = originalMap; raceOpen = originalRaceOpen
        }
        return {gossipOption,compassCorrect,thresholdCorrect,rumorCorrect,menuCorrect,mapUnmarked,
          rngUnchanged:rngState === rngBefore,zeroTurns:turnCount === turnBefore}
      })()`)
      expect(result.gossipOption).to.equal(true)
      expect(result.rumorCorrect).to.equal(true)
      expect(result.compassCorrect).to.equal(true)
      expect(result.thresholdCorrect).to.equal(true)
      expect(result.menuCorrect).to.equal(true)
      expect(result.mapUnmarked).to.equal(true)
      expect(result.rngUnchanged).to.equal(true)
      expect(result.zeroTurns).to.equal(true)
    })
  })
})
