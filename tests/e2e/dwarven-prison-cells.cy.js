describe('Dwarven Ruins populated prison cells', () => {
  it('seals whole partitions and keeps prison contents in addition to scattered remains', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Prison Cell Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, reason) => { if (!ok) throw new Error(reason) }
      let testedCells = 0
      for (const seed of [12345, 24680, 424242]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        WORLD_SEED = seed
        rngState = seed
        await generateNewWorld()
        const validation = validateDwarvenRuinsStratum()
        check(validation.ok, 'seed ' + seed + ' Ruins validator: ' + validation.issues.join('; '))
        for (let i = 0; i < deepLevels.length - 2; i++) {
          const level = deepLevels[i + 2]
          const z = chainZForDepth(i + 4)
          const items = groundItems.filter(g => (g.level ?? 0) === z)
          const mobs = enemies.filter(e => e.alive && e.level === z)
          const cells = (level.rooms || []).filter(room => room.archetype === 'Prison')
          const inAnyCell = p => cells.some(room => {
            const r = room.prisonCellRegion
            return r && p.x >= r.x1 && p.x <= r.x2 && p.y >= r.y1 && p.y <= r.y2
          })
          check(items.filter(g => g.kind === 'skeleton' && !inAnyCell(g)).length >= 1,
            'scattered searchable remains remain on floor ' + z)
          for (const room of cells) {
            testedCells++
            const cell = room.prisonCellRegion, door = room.prisonCellDoorCandidate
            check(!!cell && !!door, 'room has bounded cell and one door')
            const inCell = p => p.x >= cell.x1 && p.x <= cell.x2 && p.y >= cell.y1 && p.y <= cell.y2
            const contents = items.filter(inCell)
            const prisoners = mobs.filter(inCell)
            check(contents.length + prisoners.length > 0, 'prison cell is not empty')
            check(contents.some(g => g.kind === 'skeleton' || g.kind === 'chest'),
              'prison cell contains a searchable corpse or loot')
            for (const p of dwarvenRoomInterior(room)) {
              if (room.prisonCellAxis === 'vertical' ? p.x !== door.x : p.y !== door.y) continue
              const tile = level.map[p.y]?.[p.x]
              if (p.x === door.x && p.y === door.y)
                check(tile === 'dwarvenprisondoorlocked' || tile === 'dwarvenprisondoorclosed',
                  'cell doorway has its own prison-door terrain')
              else check(tile === 'dwarvenprisonbars', 'the bar divider spans the room')
            }
            const noDoor = dungeonWalkDistancesWithDoorTraversal(level.map, level.caves[0].entrances[0],
              new Set([keyXY(door.x, door.y)]), true)
            check(!dwarvenPrisonCellPoints(room).some(p => noDoor.has(keyXY(p.x, p.y))),
              'even an eight-way path cannot bypass the cell door')
            check(prisoners.filter(e => enemyIsShooter(e)).every(e => e.shotsRemaining > 0),
              'prison shooters have ammunition')
          }
        }
        const before = deepLevels.slice(2).map(level => (level.rooms || [])
          .filter(room => room.archetype === 'Prison')
          .map(room => room.prisonCellRegion))
        loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())), {isReplayInit:true})
        const after = deepLevels.slice(2).map(level => (level.rooms || [])
          .filter(room => room.archetype === 'Prison')
          .map(room => room.prisonCellRegion))
        check(JSON.stringify(before) === JSON.stringify(after), 'cell geometry survives save/restore')
      }
      check(testedCells > 0, 'fixed seeds exercise real prison cells')
    })()`))
  })
})
