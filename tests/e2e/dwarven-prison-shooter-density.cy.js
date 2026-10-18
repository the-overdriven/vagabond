describe('Dwarven prison shooter density', () => {
  it('guarantees a D2 gallery and one armed guard for every six ordinary cell tiles', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Prison Shooter Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, reason) => { if (!ok) throw new Error(reason) }
      for (const seed of [1336355344, 1334870591]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([], 'XS')
        WORLD_SEED = seed
        rngState = seed
        await generateNewWorld()
        check(validateDwarvenRuinsStratum().ok, 'seed ' + seed + ' Ruins validation')
        let galleryCount = 0
        for (const {level, z} of dungeonPackageLevels('dwarvenRuins')) {
          for (const room of level.rooms.filter(r => r.archetype === 'Prison')) {
            const expected = room.gallery
              ? room.gallery.shooterSpots.flat().length
              : Math.ceil(dwarvenPrisonCellPoints(room).filter(p => level.map[p.y]?.[p.x] === 'marble').length / 6)
            const shooters = enemies.filter(e => e.alive && e.level === z &&
              e.dungeonRoomId === room.id && enemyIsShooter(e) && e.shotsRemaining > 0 &&
              (room.gallery ? ['gallery0','gallery1'].includes(e.dungeonRole)
                : e.dungeonRole === 'prisonShooter'))
            check(shooters.length === expected, 'seed ' + seed + ', z ' + z + ', room ' + room.id +
              ': expected ' + expected + ' shooters but found ' + shooters.length)
            check(shooters.every(e => level.caves[0].entrances.every(stair =>
              Math.max(Math.abs(e.x-stair.x),Math.abs(e.y-stair.y)) > 1)),
              'stair 3x3 landing is clear of prison shooters')
            if (room.gallery) {
              check(z <= -5, 'gallery depth')
              if (z === -5) galleryCount++
            }
          }
        }
        check(galleryCount === 1, 'one mandatory shooting gallery on D2')
        const before = JSON.stringify(enemies.filter(e => e.alive &&
          (e.dungeonRole === 'prisonShooter' || ['gallery0','gallery1'].includes(e.dungeonRole)))
          .map(e=>[e.id,e.level,e.dungeonRole,e.x,e.y,e.shotsRemaining]))
        const rngBefore = rngState
        loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())), {isReplayInit:true})
        const after = JSON.stringify(enemies.filter(e => e.alive &&
          (e.dungeonRole === 'prisonShooter' || ['gallery0','gallery1'].includes(e.dungeonRole)))
          .map(e=>[e.id,e.level,e.dungeonRole,e.x,e.y,e.shotsRemaining]))
        check(before === after && rngBefore === rngState, 'replay/save preserves guards and RNG')
        rotateGeneratedWorld(1)
        check(validateDwarvenRuinsStratum().ok, 'all guards survive rotation')
      }
    })()`))
  })
})
