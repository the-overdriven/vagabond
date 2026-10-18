describe('Dwarven Ruins crossfire prison galleries', () => {
  it('builds optional deep firing corridors with real shooters, reward doors, and persistent geometry', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Crossfire Gallery Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, reason) => { if (!ok) throw new Error(reason) }
      let seen = 0
      for (const seed of [610061, 610063, 554433]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([], 'XS')
        WORLD_SEED = seed
        rngState = seed
        await generateNewWorld()
        check(validateDwarvenRuinsStratum().ok, 'seed ' + seed + ' initial floor validation')
        for (const {level, z} of dungeonPackageLevels('dwarvenRuins')) {
          const galleries = level.rooms.filter(r => r.gallery)
          check(galleries.length <= 1, 'at most one gallery per level')
          for (const room of galleries) {
            seen++
            const gallery = room.gallery
            check(z <= -5 && room.optional && !room.onMainRoute && room.connectionCount === 1,
              'gallery is an optional deep dead-end')
            check(room.archetype === 'Prison' && gallery.width >= 9 && gallery.length >= 13,
              'gallery counts as a prison with full firing-lane footprint')
            check([...gallery.bars,...gallery.farBars].every(p=>level.map[p.y][p.x]==='dwarvenprisonbars'),
              'continuous side and rear bars; no side prison doors')
            check(level.map[gallery.farDoor.y][gallery.farDoor.x]==='dwarvenprisondoorclosed' &&
              room.internalDoors.filter(d=>d.kind==='galleryPrison').length===1,
              'exactly one central prison door guards both connected bays and chest')
            const monsters = enemies.filter(e => e.alive && e.level === z &&
              e.dungeonRoomId === room.id && ['gallery0','gallery1'].includes(e.dungeonRole))
            check(monsters.length === gallery.shooterSpots.flat().length &&
              gallery.bays.every((bay,i)=>monsters.filter(e=>e.dungeonRole==='gallery'+i).length===Math.ceil(bay.length/6)),
              'one real shooter per six bay cells on both sides')
            check(monsters.every(e => enemyIsShooter(e) && e.shotsRemaining > 0),
              'all gallery shooters can attack with ammunition')
            check(gallery.shooterSpots.flat().every(p => gallery.fireTargets.some(t =>
              dungeonClearProjectileLine(level.map,p,t))), 'clear lanes through bars')
            const reward = groundItems.filter(g => g.level === z && g.galleryReward && g.dungeonRoomId === room.id)
            check(reward.length === 1 && reward[0].kind === 'chest' && !reward[0].opened,
              'exactly one unopened gallery reward chest')
            check(reward[0].x === gallery.chest.x && reward[0].y === gallery.chest.y,
              'gallery chest is inside its terminal alcove')
            const entrance = level.caves[0].entrances[0]
            const withoutDoor = dungeonWalkDistancesWithDoorTraversal(level.map,entrance,
              new Set([keyXY(gallery.farDoor.x,gallery.farDoor.y)]),true)
            check(!withoutDoor.has(keyXY(gallery.chest.x,gallery.chest.y)),
              'the terminal door cannot be bypassed diagonally')
          }
        }
        const before = JSON.stringify(dungeonPackageLevels('dwarvenRuins').map(({level,z}) => ({
          z, rooms:level.rooms.filter(r=>r.gallery).map(r=>r.gallery),
          shooters:enemies.filter(e=>e.alive&&e.level===z&&['gallery0','gallery1'].includes(e.dungeonRole))
            .map(e=>({id:e.id,role:e.dungeonRole,shots:e.shotsRemaining,x:e.x,y:e.y})),
          rewards:groundItems.filter(g=>g.level===z&&g.galleryReward)
        })))
        const rngBefore = rngState
        loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())), {isReplayInit:true})
        const after = JSON.stringify(dungeonPackageLevels('dwarvenRuins').map(({level,z}) => ({
          z, rooms:level.rooms.filter(r=>r.gallery).map(r=>r.gallery),
          shooters:enemies.filter(e=>e.alive&&e.level===z&&['gallery0','gallery1'].includes(e.dungeonRole))
            .map(e=>({id:e.id,role:e.dungeonRole,shots:e.shotsRemaining,x:e.x,y:e.y})),
          rewards:groundItems.filter(g=>g.level===z&&g.galleryReward)
        })))
        check(before === after && rngState === rngBefore, 'save/restore preserves gallery without reroll')
        rotateGeneratedWorld(1)
        check(validateDwarvenRuinsStratum().ok, 'rotation preserves gallery geometry and reachability')
      }
      check(seen >= 3, 'fixed seeds exercised multiple galleries')
    })()`))
  })
})
