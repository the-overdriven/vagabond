describe('Dwarven Ruins populated prison cells', () => {
  it('guarantees functional prison quotas, bars, and budgeted prisoner rewards', () => {
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
          const roomSlots = (level.rooms || []).filter(r => r.index > 0 && !r.landmark)
          const fraction = i / (deepLevels.length - 3)
          const quota = Math.max(1, Math.ceil(roomSlots.length * (0.20 + fraction * (0.30 - 0.20))))
          check(cells.length >= quota, 'z ' + z + ': required prison share ' + quota + ' of ' + roomSlots.length)
          for (const room of cells) {
            testedCells++
            if (room.gallery) {
              check(room.gallery.shooterSpots.length === 2 && room.gallery.bars.length >= 26,
                'crossfire gallery has two barred shooter bays')
              continue
            }
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
        const cellsBeforeRotation = deepLevels.slice(2).flatMap(level => (level.rooms || [])
          .filter(room => room.archetype === 'Prison' && !room.gallery).map(room => ({room, axis:room.prisonCellAxis})))
        // Force an additional quarter turn even when the seeded world was
        // initially generated unrotated or upside down.
        rotateGeneratedWorld(1)
        for (const {room, axis} of cellsBeforeRotation) {
          const expectedAxis = axis === 'vertical' ? 'horizontal' : 'vertical'
          check(room.prisonCellAxis === expectedAxis, 'quarter-turn rotates the prison divider axis')
        }
        const checkRotatedCells = phase => {
          for (const level of deepLevels.slice(2)) for (const room of level.rooms || []) {
            if (room.archetype !== 'Prison' || room.gallery) continue
            const door = room.prisonCellDoorCandidate
            for (const p of dwarvenRoomInterior(room)) {
              if (room.prisonCellAxis === 'vertical' ? p.x !== door.x : p.y !== door.y) continue
              const tile = level.map[p.y]?.[p.x]
              const isDoor = p.x === door.x && p.y === door.y
              check(isDoor ? tile === 'dwarvenprisondoorlocked' || tile === 'dwarvenprisondoorclosed'
                : tile === 'dwarvenprisonbars',
                phase + ': entire rotated prison partition and doorway remain intact')
            }
            const noDoor = dungeonWalkDistancesWithDoorTraversal(level.map, level.caves[0].entrances[0],
              new Set([keyXY(door.x, door.y)]), true)
            check(!dwarvenPrisonCellPoints(room).some(p => noDoor.has(keyXY(p.x, p.y))),
              phase + ': no eight-direction bypass around the rotated cell door')
          }
        }
        checkRotatedCells('after quarter-turn')
        const snapshot = () => deepLevels.slice(2).map(level => (level.rooms || [])
          .filter(room => room.archetype === 'Prison')
          .map(room => ({axis:room.prisonCellAxis, region:room.prisonCellRegion, door:room.prisonCellDoorCandidate, gallery:room.gallery})))
        const before = snapshot()
        loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())), {isReplayInit:true})
        check(JSON.stringify(before) === JSON.stringify(snapshot()), 'cell geometry and axis survive save/restore')
        checkRotatedCells('after restore')
      }
      check(testedCells > 0, 'fixed seeds exercise real prison cells')
    })()`))
  })
})
