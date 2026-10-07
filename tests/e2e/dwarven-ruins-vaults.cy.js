describe('Dwarven Ruins rooms, vaults, and tactical encounters', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Ruins Vault Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('builds themed rooms, randomized vaults, tactical shooters, final defenses, and depth loot', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      const expectedRooms = new Set(['Barracks','Armory','Dining Hall','Library','Forge','Workshop','Dormitory','Burial Chamber','Temple','Prison','Storage'])
      const expectedVaults = new Set(['fortifiedBarracks','trappedArmory','treasury','libraryArchive','prisonBlock','floodedCistern','collapsedHall','sealedTomb','forgeKillzone','barricadedDormitory'])
      const defensiveVaults = new Set(['fortifiedBarracks','barricadedDormitory','forgeKillzone','collapsedHall'])
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      check(Object.keys(cfg.rooms.archetypes).length === 11 && Object.keys(cfg.rooms.archetypes).every(name => expectedRooms.has(name)),
        'all eleven regular room archetypes are configured')
      const normalVaultDefs = Object.entries(cfg.vaults.definitions).filter(([,def]) => !def.fallbackOnly)
      check(normalVaultDefs.length === 10 && normalVaultDefs.every(([name]) => expectedVaults.has(name)),
        'all ten planned reusable vault concepts are configured')
      check(cfg.vaults.definitions.guardedArtifactChamber?.fallbackOnly === true,
        'artifact fallback chamber is configured separately from the ten normal vaults')
      for (const [,def] of normalVaultDefs) {
        check(Array.isArray(def.minSize) && Array.isArray(def.maxSize), 'vault definition has minimum and maximum dimensions')
        check(Array.isArray(def.requiredEntrances) && def.requiredEntrances.length === 2, 'vault definition constrains entrance count')
        check(Array.isArray(def.internalZones), 'vault definition declares internal zones')
        check(['any','closed','locked'].includes(def.doorRequirement), 'vault definition declares door/lock behavior')
        check(Array.isArray(def.trapTypes), 'vault definition declares allowed trap types')
      }
      for (const range of [cfg.story.rubbleProgressMultiplierRange,cfg.story.remainsProgressMultiplierRange,
          cfg.story.searchableSkeletonsProgressMultiplierRange,cfg.story.breachedDoorProgressMultiplierRange,
          cfg.story.barricadeChanceRange,cfg.story.optionalDefenseDebrisChanceRange]) {
        check(dungeonProgressMultiplier(range,0) <= dungeonProgressMultiplier(range,0.5) &&
          dungeonProgressMultiplier(range,0.5) <= dungeonProgressMultiplier(range,1),
          'environmental-defense pressure increases continuously with normalized depth')
      }
      check(cfg.rooms.archetypes.Prison.internalLockedCellChance === 1, 'ordinary Prison rooms always generate a locked side cell')

      for (const fixture of [{seed:12345,count:3},{seed:24680,count:4},{seed:67890,count:5}]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange = [fixture.count, fixture.count]
        WORLD_SEED = fixture.seed
        rngState = WORLD_SEED
        await generateNewWorld()

        const ruins = deepLevels.slice(2)
        check(ruins.length === fixture.count, 'forced fixture floor count generated')
        for (let i = 0; i < ruins.length; i++) {
          const level = ruins[i]
          const z = chainZForDepth(i + 4)
          const rooms = level.rooms || []
          const vaults = level.vaults || []
          const mobs = enemies.filter(e => e.alive && (e.level ?? 0) === z)
          const decorativeRemains = groundItems.filter(g => g.level === z && g.kind === 'dwarvenremains')
          const ambientSkeletons = groundItems.filter(g => g.level === z && g.kind === 'skeleton' && !g.dungeonKey)
          const remainsBaseMin = cfg.story.remainsPerFloorRange[0]
          const remainsProgress = dungeonProgressMultiplier(cfg.story.remainsProgressMultiplierRange, level.progress, 1)
          const remainsMultiplier = level.progress >= 1
            ? Math.max(remainsProgress, cfg.story.finalFloorRemainsMultiplier)
            : remainsProgress
          const minimumDecorativeRemains = Math.max(1, Math.round(remainsBaseMin * remainsMultiplier))
          check(decorativeRemains.length >= minimumDecorativeRemains,
            'depth-scaled decorative dwarven remains are preserved on every Ruins floor')

          const skeletonBaseMin = cfg.story.searchableSkeletonsPerFloorRange[0]
          const skeletonProgress = dungeonProgressMultiplier(cfg.story.searchableSkeletonsProgressMultiplierRange, level.progress, 1)
          const skeletonMultiplier = level.progress >= 1
            ? Math.max(skeletonProgress, cfg.story.finalFloorSearchableSkeletonsMultiplier)
            : skeletonProgress
          const minimumSkeletons = Math.max(1, Math.round(skeletonBaseMin * skeletonMultiplier))
          check(ambientSkeletons.length >= minimumSkeletons,
            'searchable skeletal remains are added independently on every Ruins floor')
          check(ambientSkeletons.every(g => g.looted === false && typeof g.hasLoot === 'boolean'),
            'ambient Ruins skeletons use the searchable skeletal-remains rules')
          const occupiedRemains = new Set(decorativeRemains.map(g => g.x + ',' + g.y))
          check(ambientSkeletons.every(g => !occupiedRemains.has(g.x + ',' + g.y)),
            'decorative and searchable remains never overlap')
          if (i === ruins.length - 1) {
            check(minimumDecorativeRemains >= 5 && decorativeRemains.length >= 5,
              'the final floor keeps a dense field of decorative dwarven remains')
            check(minimumSkeletons >= 8 && ambientSkeletons.length >= 8,
              'the final floor also has a dense last-stand field of searchable skeletal remains')
          }
          check(rooms.length >= 2, 'floor persists room descriptors')
          check(vaults.length >= 1, 'every floor has at least one major vault')
          check(rooms.filter(room => room.index !== 0).every(room => expectedRooms.has(room.archetype)),
            'every non-entrance room has a known gameplay archetype')
          check(new Set(rooms.map(room => room.id)).size === rooms.length, 'room IDs are stable and unique within floor')
          check(new Set(vaults.map(vault => vault.id)).size === vaults.length, 'vault IDs are stable and unique within floor')
          check((level.encounterFamilies || []).length >= 2 && (level.encounterFamilies || []).length <= 4,
            'floor selects two to four configured encounter families')

          for (const vault of vaults) {
            check(expectedVaults.has(vault.type) || vault.type === 'guardedArtifactChamber', 'vault uses a configured scenario type')
            const room = rooms.find(r => r.id === vault.roomId)
            check(!!room && room.vaultType === vault.type, 'vault points to its persisted room descriptor')
            check(Array.isArray(vault.zones) && vault.zones.length === (cfg.vaults.definitions[vault.type].internalZones || []).length,
              'vault persists its authored internal zones')
            check(vault.doorRequirement === cfg.vaults.definitions[vault.type].doorRequirement,
              'vault persists its authored door/lock requirement')
            if (['closed','locked'].includes(vault.doorRequirement)) {
              check(Array.isArray(vault.entranceDoorLeaves) && vault.entranceDoorLeaves.length === 2,
                'door-requiring vault persists its exact structural entrance doorway')
              const entranceTiles = vault.entranceDoorLeaves.map(p => level.map[p.y]?.[p.x])
              if (vault.doorRequirement === 'locked') check(entranceTiles.every(tile => tile === 'dwarvendoorlocked'),
                'locked vault entrance is structurally locked')
              else check(entranceTiles.every(tile => tile === 'dwarvendoorclosed' || tile === 'dwarvendoorlocked'),
                'closed vault entrance is structurally closed')
            }
            const entranceRange = cfg.vaults.definitions[vault.type].requiredEntrances
            check(room.connectionCount >= entranceRange[0] && room.connectionCount <= entranceRange[1],
              'vault entrance constraint counts actual room-graph connections, including loops')
            for (const zone of vault.zones || []) {
              check(zone.x1 > room.x && zone.x2 < room.x + room.w - 1 && zone.y1 > room.y && zone.y2 < room.y + room.h - 1,
                'authored vault zone is a real oriented sub-area inside its room')
            }
            check(JSON.stringify(vault.trapTypes) === JSON.stringify(cfg.vaults.definitions[vault.type].trapTypes || []),
              'vault persists its allowed trap mechanisms')
            for (const [role, slots] of Object.entries(vault.slots || {})) for (const slot of slots) {
              check(slot.x > room.x && slot.x < room.x + room.w - 1 && slot.y > room.y && slot.y < room.y + room.h - 1,
                'tactical slot stays inside its room')
              check(level.map[slot.y]?.[slot.x] === 'marble', 'tactical slot remains usable floor terrain')
            }
            const vaultMobs = mobs.filter(e => e.dungeonVaultId === vault.id)
            if ((vault.roles?.backline || 0) > 0 && (vault.slots?.backline || []).length) {
              const shooter = vaultMobs.find(e => e.dungeonRole === 'backline')
              check(!!shooter && enemyIsShooter(shooter), 'authored backline role produces a shooter-capable enemy')
            }
            check(!vaultMobs.some(e => ['frontline','group'].includes(e.dungeonRole) && enemyIsShooter(e)),
              'frontline and gang roles do not accidentally become shooters')
            if (vault.type === 'prisonBlock') {
              check((room.internalLocks || []).some(lock => lock.kind === 'prisonCell'),
                'prison block contains a real locked internal cell partition')
              check((vault.internalLocks || []).length === room.internalLocks.length,
                'prison cell lock identity persists with the vault metadata')
            }
          }

          const tileInZone = (tile, zone) => {
            if (!zone) return false
            for (let y = zone.y1; y <= zone.y2; y++) for (let x = zone.x1; x <= zone.x2; x++) {
              if (level.map[y]?.[x] === tile) return true
            }
            return false
          }
          for (const vault of vaults) {
            const zones = Object.fromEntries((vault.zones || []).map(zone => [zone.id,zone]))
            if (vault.type === 'libraryArchive') check(tileInZone('dwarvenshelf', zones.archive), 'archive zone drives bookshelf placement')
            if (vault.type === 'floodedCistern') check(tileInZone('water', zones.cistern), 'cistern zone drives water placement')
            if (vault.type === 'collapsedHall') check(tileInZone('dwarvenrubble', zones.rubble), 'rubble zone drives collapse dressing')
            if (vault.type === 'prisonBlock') check(tileInZone('dwarvenprisonbars', zones.cells), 'cell zone drives prison subdivision')
            if (vault.type === 'fortifiedBarracks') {
              const inZone = (p,zone) => !!zone && p.x >= zone.x1 && p.x <= zone.x2 && p.y >= zone.y1 && p.y <= zone.y2
              check((vault.slots?.backline || []).some(p => inZone(p,zones.backline)), 'backline zone influences shooter slots')
              check((vault.slots?.frontline || []).some(p => inZone(p,zones.frontline)), 'frontline zone influences melee slots')
            }
          }
          for (const room of rooms.filter(room => room.archetype === 'Prison')) {
            check(dwarvenRoomInterior(room).some(p => level.map[p.y]?.[p.x] === 'dwarvenprisonbars'),
              'ordinary Prison room contains a barred side-cell subdivision')
            const lock = (room.internalLocks || []).find(lock => lock.kind === 'prisonCell')
            check(!!lock, 'ordinary Prison side cell is actually locked')
            check(groundItems.some(item => item.level === z && item.kind === 'dwarvenkey' && item.keyId === lock.keyId),
              'ordinary Prison cell lock has a reachable matching local key')
          }

          const regularChests = groundItems.filter(g => g.kind === 'chest' && g.level === z && !g.dwarvenRuinsArtifact)
          const minimumLoot = Math.max(1, Math.round(cfg.loot.baseBudget * (1 + i * cfg.loot.growthPerFloor)))
          check(regularChests.length >= minimumLoot, 'floor receives its depth-scaled minimum loot budget')
          if (i === ruins.length - 1) {
            check(vaults.length >= 2, 'final floor reserves both artifact and defensive vaults')
            check(vaults.some(vault => defensiveVaults.has(vault.type) && !vault.artifactReserved),
              'final floor has a dedicated failed-defense vault')
            const artifactVault = vaults.find(vault => vault.artifactReserved)
            check(!!artifactVault, 'final floor reserves an optional artifact vault')
            const artifactRoom = rooms.find(room => room.id === artifactVault.roomId)
            check(artifactRoom?.optional === true, 'guaranteed artifact is off the mandatory route')
            const artifacts = groundItems.filter(g => g.kind === 'chest' && g.level === z && g.dwarvenRuinsArtifact)
            check(artifacts.length === 1 && artifacts[0].artifactGuaranteed === true,
              'exactly one guaranteed Ruins artifact chest exists')
            check(artifacts[0].vaultId === artifactVault.id, 'guaranteed artifact is placed in its reserved vault')
            check(artifacts[0].x > artifactRoom.x && artifacts[0].x < artifactRoom.x + artifactRoom.w - 1 &&
              artifacts[0].y > artifactRoom.y && artifacts[0].y < artifactRoom.y + artifactRoom.h - 1,
              'guaranteed artifact chest is physically inside its reserved vault room')
            check(!mobs.some(e => e.x === artifacts[0].x && e.y === artifacts[0].y),
              'reserved artifact tile cannot be consumed by an enemy spawn')
            check(level.map.flat().includes('dwarvenbedbarricade') ||
              level.map.flat().includes('dwarvenrubble') || level.map.flat().includes('dwarvendoorbreached'),
              'final floor visibly communicates a failed defensive position')
          } else {
            check(!groundItems.some(g => g.level === z && g.dwarvenRuinsArtifact), 'non-final floors never receive the guaranteed artifact')
          }
        }

        const before = JSON.stringify(ruins.map(level => ({
          rooms: level.rooms,
          vaults: level.vaults,
          encounterFamilies: level.encounterFamilies,
          artifactRoomId: level.artifactRoomId
        })))
        const save = JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(save, {isReplayInit:true})
        const after = JSON.stringify(deepLevels.slice(2).map(level => ({
          rooms: level.rooms,
          vaults: level.vaults,
          encounterFamilies: level.encounterFamilies,
          artifactRoomId: level.artifactRoomId
        })))
        check(after === before, 'room, vault, tactical, family, and artifact metadata survives save/replay restoration')
      }
    })()`))
  })

  it('renders barricaded dormitories as real blocking cover when that vault is selected', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      const defs = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.vaults.definitions
      const savedRanges = Object.fromEntries(['fortifiedBarracks','forgeKillzone','collapsedHall'].map(type => [type, defs[type].progressRange.slice()]))
      const savedMin = defs.barricadedDormitory.minSize.slice()
      for (const type of ['fortifiedBarracks','forgeKillzone','collapsedHall']) defs[type].progressRange = [0,0]
      defs.barricadedDormitory.minSize = [1,1]
      WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange = [3,3]
      WORLD_SEED = 112358
      rngState = WORLD_SEED
      await generateNewWorld()
      for (const [type, range] of Object.entries(savedRanges)) defs[type].progressRange = range
      defs.barricadedDormitory.minSize = savedMin

      const final = deepLevels.at(-1)
      const vault = (final.vaults || []).find(v => v.type === 'barricadedDormitory')
      check(!!vault, 'forced final defensive scenario selects barricaded dormitory')
      const room = final.rooms.find(r => r.id === vault.roomId)
      let barricades = 0
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) {
        if (final.map[y]?.[x] === 'dwarvenbedbarricade') barricades++
      }
      check(barricades >= 1, 'barricaded dormitory visibly contains dragged-bed cover')
      check(TILE.dwarvenbedbarricade.walk === false && TILE.dwarvenbedbarricade.projectileBlock === true,
        'bed barricade blocks movement and projectile lanes')
      check(typeof TILE.dwarvenbedbarricade.ch === 'string' && TILE.dwarvenbedbarricade.ch.length > 0,
        'bed barricade has an ASCII/tile fallback glyph')
    })()`))
  })

  it('creates a guarded side chamber when no normal artifact vault fits', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const defs = cfg.vaults.definitions
      const blocked = ['treasury','sealedTomb','trappedArmory']
      const saved = Object.fromEntries(blocked.map(type => [type, {minSize:defs[type].minSize.slice(),maxSize:defs[type].maxSize.slice()}]))
      for (const type of blocked) { defs[type].minSize = [99,99]; defs[type].maxSize = [99,99] }
      const oldRange = cfg.levelCountRange.slice()
      cfg.levelCountRange = [3,3]
      WORLD_SEED = 991177
      rngState = WORLD_SEED
      await generateNewWorld()
      cfg.levelCountRange = oldRange
      for (const [type,value] of Object.entries(saved)) { defs[type].minSize = value.minSize; defs[type].maxSize = value.maxSize }

      const final = deepLevels.at(-1)
      const fallback = (final.vaults || []).find(vault => vault.type === 'guardedArtifactChamber' && vault.artifactReserved)
      check(!!fallback, 'final floor promotes an optional branch into the guarded artifact fallback chamber')
      const room = final.rooms.find(candidate => candidate.id === fallback.roomId)
      check(room?.optional === true, 'fallback artifact chamber stays off the mandatory main route')
      const z = chainZForDepth(final.dungeonFloor + 3)
      const artifact = groundItems.find(item => item.level === z && item.dwarvenRuinsArtifact && item.artifactGuaranteed)
      check(!!artifact && artifact.vaultId === fallback.id, 'fallback chamber still receives exactly one guaranteed artifact')
    })()`))
  })

})
