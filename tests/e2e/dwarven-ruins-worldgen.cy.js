describe('Persistent Dwarven Ruins stratum', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Ruins Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  for (const fixture of [
    {seed: 12345, traits: []},
    {seed: 24680, traits: []},
    {seed: 424242, traits: ['underkings_legacy']}
  ]) {
    const traitLabel = fixture.traits.length ? ` with ${fixture.traits.join(', ')}` : ''
    it(`generates a reachable persistent 3-5 floor chain for seed ${fixture.seed}${traitLabel}`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check = (ok, msg) => { if (!ok) throw new Error(msg) }
        const seed = ${fixture.seed}
        const traitNames = ${JSON.stringify(fixture.traits)}
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        const traits = WORLD_TRAITS.filter(trait => traitNames.includes(trait.name))
        check(traits.length === traitNames.length, 'requested test traits exist')
        applyWorldTraits(traits)
        WORLD_SEED = seed
        rngState = WORLD_SEED
        await generateNewWorld()

        const ruins = deepLevels.slice(2)
        check(ruins.length >= 3 && ruins.length <= 5, 'Dwarven Ruins floor count is 3-5')
        check(deepLevels[0]?.kind === 'caves', 'z:-2 remains the cave layer')
        check(deepLevels[1]?.kind === 'dwarvenFort', 'z:-3 remains the Dwarven Fort')

        const positions = (grid, tile) => {
          const found = []
          for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
            if (grid[y]?.[x] === tile) found.push({x, y})
          }
          return found
        }
        const reachable = (grid, start, target, allowLockedGate = false) => {
          const queue = [start]
          const seen = new Set([keyXY(start.x, start.y)])
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
          for (let i = 0; i < queue.length; i++) {
            const p = queue[i]
            if (p.x === target.x && p.y === target.y) return true
            for (const [dx, dy] of dirs) {
              const x = p.x + dx, y = p.y + dy, key = keyXY(x, y)
              const tile = grid[y]?.[x]
              const traversable = TILE[tile]?.walk || tile === 'dwarvendoorclosed' ||
                (allowLockedGate && tile === 'dwarvengatelocked')
              if (seen.has(key) || !traversable) continue
              seen.add(key)
              queue.push({x, y})
            }
          }
          return false
        }

        const fortDown = positions(deepLevels[1].map, 'dwarvenstairsdown')
        check(fortDown.length === 1, 'fort has one Dwarven Ruins descent')
        check(reachable(deepLevels[1].map, {x: dwarvenRuin.x, y: dwarvenRuin.y}, fortDown[0]),
          'fort descent is reachable from the surface-gate landing')
        check(!enemies.some(e => e.alive && e.level === -3 && e.x === fortDown[0].x && e.y === fortDown[0].y),
          'fort descent starts clear of enemies')
        check(!groundItems.some(g => (g.level ?? 0) === -3 && g.caveIndex === dwarvenRuin.caveIndex &&
          g.x === fortDown[0].x && g.y === fortDown[0].y), 'fort descent starts clear of ground objects')

        for (let i = 0; i < ruins.length; i++) {
          const level = ruins[i]
          const up = positions(level.map, 'dwarvenstairsup')
          const down = positions(level.map, 'dwarvenstairsdown')
          const sealed = positions(level.map, 'dwarvenminessealed')
          const expectedProgress = ruins.length === 1 ? 1 : i / (ruins.length - 1)

          check(level.kind === 'dwarvenRuins', 'floor kind is Dwarven Ruins')
          check(level.dungeonFloor === i + 1, 'floor numbering is stable')
          check(level.floorCount === ruins.length, 'floor count metadata is stable')
          check(Math.abs(level.progress - expectedProgress) < 1e-12, 'normalized floor progress')
          check(level.caveMaps.length === 1 && level.map === level.caveMaps[0], 'single persistent terrain object')
          check(Array.isArray(level.rooms) && level.rooms.length >= 3, 'floor keeps generated room descriptors')
          check(level.roomGraph?.mainRoute?.length >= 2, 'floor persists its room graph')
          check(level.roomGraph.graphDistance >= WORLD_GEN_CONFIG.dungeons.dwarvenRuins.layout.minimumEntranceExitRoomGraphDistance,
            'entrance and exit satisfy configured room-graph distance')
          check(level.roomGraph.mainRoute[0] === level.roomGraph.entranceRoomId &&
            level.roomGraph.mainRoute.at(-1) === level.roomGraph.exitRoomId, 'main route joins entrance to exit before carving')
          check((level.roomGraph.branches || []).length >= WORLD_GEN_CONFIG.dungeons.dwarvenRuins.layout.optionalBranchCountRange[0],
            'floor contains configured optional room-graph branches')
          check(Array.isArray(level.vaults) && level.vaults.length >= 1 && level.vaults.length <= 2,
            'floor has the configured one-to-two major vaults')
          const roomIds = new Set(level.rooms.map(room => room.id))
          for (const vault of level.vaults) {
            check(roomIds.has(vault.roomId), 'vault belongs to a generated room')
            check(vault.roles && vault.slots, 'vault persists tactical role requirements and derived slots')
            for (const role of ['backline', 'frontline', 'group', 'champion', 'any']) {
              check(Array.isArray(vault.slots[role]), 'vault role has a deterministic slot list')
            }
          }
          if (i === ruins.length - 1) {
            const reserved = level.vaults.filter(vault => vault.artifactReserved)
            const artifacts = groundItems.filter(g => g.level === chainZForDepth(i + 4) && g.dwarvenRuinsArtifact)
            check(reserved.length === 1, 'final floor reserves exactly one optional artifact vault')
            check(artifacts.length === 1 && artifacts[0].artifactGuaranteed === true,
              'final floor contains exactly one guaranteed Ruins artifact chest')
            check(artifacts[0].vaultId === reserved[0].id, 'guaranteed artifact chest belongs to the reserved vault')
          } else {
            check(!level.vaults.some(vault => vault.artifactReserved), 'only final floor reserves an artifact vault')
          }
          const ordinaryRuinsChests = groundItems.filter(g => g.level === chainZForDepth(i + 4) && g.kind === 'chest' && !g.dwarvenRuinsArtifact)
          const lootCfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.loot
          const expectedMinimum = Math.max(1, Math.round(lootCfg.baseBudget * (1 + i * lootCfg.growthPerFloor)))
          check(ordinaryRuinsChests.length >= expectedMinimum, 'depth loot budget supplies the configured minimum chest count')
          check(up.length === 1, 'exactly one stair up')
          check(!positions(level.map, 'caveup').length && !positions(level.map, 'cavedown').length,
            'natural cave transitions are not reused')

          const previousDown = i === 0 ? fortDown[0] : positions(ruins[i - 1].map, 'dwarvenstairsdown')[0]
          check(up[0].x === previousDown.x && up[0].y === previousDown.y, 'paired stairs share world coordinates')

          const target = i === ruins.length - 1 ? sealed[0] : down[0]
          if (i === ruins.length - 1) {
            check(down.length === 0 && sealed.length === 1, 'final floor ends at the sealed Deep Mines continuation')
          } else {
            check(down.length === 1 && sealed.length === 0, 'non-final floor has one stair down')
          }

          const lockedGate = positions(level.map, 'dwarvengatelocked')
          const breachedGate = positions(level.map, 'dwarvengatebreached')
          check(lockedGate.length + breachedGate.length === 2, 'each floor has one two-leaf progression gate')
          const gateLeaves = lockedGate.length ? lockedGate : breachedGate
          check(Math.abs(gateLeaves[0].x - gateLeaves[1].x) + Math.abs(gateLeaves[0].y - gateLeaves[1].y) === 1,
            'progression gate leaves are adjacent')
          const floorZ = chainZForDepth(i + 4)
          const progressionSources = [
            ...groundItems.filter(g => g.level === floorZ && g.kind === 'dwarvenkey' && g.keyId)
              .map(g => ({keyId:g.keyId,kind:'ground'})),
            ...groundItems.filter(g => g.level === floorZ && g.dungeonKey?.kind === 'dwarvenkey')
              .map(g => ({keyId:g.dungeonKey.keyId,kind:'remains'})),
            ...enemies.filter(e => e.alive && e.level === floorZ && e.carriedDungeonKey?.kind === 'dwarvenkey')
              .map(e => ({keyId:e.carriedDungeonKey.keyId,kind:'carrier'}))
          ]

          if (lockedGate.length) {
            check(lockedGate.length === 2 && breachedGate.length === 0, 'intact progression gate has two locked leaves')
            check(['championCarrier','remains','trapGuardedSideRoom','lockedSideRoom'].includes(level.progressionKey?.mode),
              'intact gate selects one controlled progression-key scenario')
            check(level.progressionKey.keyId === dwarvenDungeonLockId(floorZ, 'gate', lockedGate), 'gate key matches its lock ID')
            check(progressionSources.filter(source => source.keyId === level.progressionKey.keyId).length === 1,
              'intact gate has exactly one live progression-key source')
            check(validateDwarvenRuinsKeyDependencies(level, floorZ, up[0], target).ok,
              'generated key dependencies can be solved from the entrance side')
            check(!reachable(level.map, up[0], target), 'intact gate blocks the exit before unlocking')
            check(reachable(level.map, up[0], target, true), 'exit becomes reachable when the gate is treated as unlocked')
          } else {
            check(breachedGate.length === 2 && lockedGate.length === 0, 'pre-breached progression gate has two open leaves')
            check(level.progressionKey == null, 'pre-breached progression gate does not create a progression-key scenario')
            check(reachable(level.map, up[0], target), 'pre-breached gate leaves the exit reachable')
          }
        }

        const finalValidation = validateDwarvenRuinsStratum()
        check(finalValidation.ok, 'post-population Dwarven Ruins validator accepts the generated stratum: ' + finalValidation.issues.join('; '))

        const mapsBefore = ruins.map(level => JSON.stringify(level.map))
        const stairsBefore = ruins.map(level => ({
          up: positions(level.map, 'dwarvenstairsup'),
          down: positions(level.map, 'dwarvenstairsdown'),
          sealed: positions(level.map, 'dwarvenminessealed')
        }))
        const save = JSON.parse(JSON.stringify(buildSaveObject()))
        check(save.version === self.VAGABOND_SAVE_VERSION, 'uses current save schema')
        check(save.deepLevels.length === deepLevels.length, 'all deep levels are serialized')

        loadGameFromObject(save, {isReplayInit: true})
        const restored = deepLevels.slice(2)
        check(restored.length === mapsBefore.length, 'save/replay restore keeps floor count')
        for (let i = 0; i < restored.length; i++) {
          check(JSON.stringify(restored[i].map) === mapsBefore[i], 'save/replay restore keeps exact terrain')
          check(restored[i].map === restored[i].caveMaps[0], 'restored floor keeps shared/local map identity')
          check(JSON.stringify({
            up: positions(restored[i].map, 'dwarvenstairsup'),
            down: positions(restored[i].map, 'dwarvenstairsdown'),
            sealed: positions(restored[i].map, 'dwarvenminessealed')
          }) === JSON.stringify(stairsBefore[i]), 'save/replay restore keeps transition positions')
        }

        currentZ = chainZForDepth(3)
        currentCave = -1
        map = deepLevels[1].map
        undergroundDiscovered = deepLevels[1].discovered
        player.x = fortDown[0].x
        player.y = fortDown[0].y
        check(enterCave() === true && currentZ === chainZForDepth(4) && map === deepLevels[2].map,
          'fort descent enters the first Ruins floor without lateral movement')
        check(map[player.y][player.x] === 'dwarvenstairsup', 'paired first-floor stair is under the player')
        check(enterCave() === true && currentZ === chainZForDepth(3) && map === deepLevels[1].map,
          'first-floor stair returns to the fort')

        const finalLevel = deepLevels.at(-1)
        const finalSealed = positions(finalLevel.map, 'dwarvenminessealed')[0]
        const finalDepth = deepLevels.length + 1
        currentZ = chainZForDepth(finalDepth)
        map = finalLevel.map
        undergroundDiscovered = finalLevel.discovered
        player.x = finalSealed.x
        player.y = finalSealed.y
        const sealedZ = currentZ
        check(enterCave() === true && currentZ === sealedZ && map === finalLevel.map,
          'sealed Deep Mines continuation is inspectable but does not change depth')

        check(TILE.dwarvenstairsup.ch === '<' && TILE.dwarvenstairsdown.ch === '>', 'ASCII stair glyphs')
        check(TILE.dwarvenminessealed.ch === 'X', 'ASCII sealed-continuation glyph')
        check(TILE.dwarvengatelocked.ch === 'H' && TILE.dwarvengateopen.ch === '/' && TILE.dwarvengatebreached.ch === 'h',
          'ASCII progression-gate glyphs distinguish locked, intact-open and breached states')
        check(RENDER_STYLE.terrainTiles.dwarvengatelocked?.image === 'img/tiles/dwarven-gate-locked.png', 'locked-gate art')
        check(RENDER_STYLE.terrainTiles.dwarvengateopen?.image === 'img/tiles/dwarven-gate-open.png', 'dedicated open-gate art')
        check(RENDER_STYLE.terrainTiles.dwarvengateopen?.image !== RENDER_STYLE.terrainTiles.dwarvengatebreached?.image,
          'intact-open and breached gates never share a sprite')
        check(RENDER_STYLE.terrainTiles.dwarvengatebreached?.image === 'img/tiles/dwarven-gate-breached.png', 'breached-gate art')
        check(RENDER_STYLE.terrainTiles.dwarvenleverpulled?.image === 'img/tiles/dwarven-lever-pulled.png', 'pulled lever has dedicated art')
        check(RENDER_STYLE.terrainTiles.dwarvenbed?.image === 'img/tiles/dwarven-bed.png', 'bed art')
        check(RENDER_STYLE.terrainTiles.dwarvenbedbarricade?.image === 'img/tiles/dwarven-bed-barricade.png', 'bed barricade art')
        check(RENDER_STYLE.terrainTiles.dwarvenshelf?.image === 'img/tiles/dwarven-bookshelf.png', 'bookshelf art')
        check(RENDER_STYLE.terrainTiles.dwarventable?.image === 'img/tiles/dwarven-table.png', 'table art')
        check(RENDER_STYLE.terrainTiles.dwarvencrate?.image === 'img/tiles/dwarven-crate.png', 'crate art')
        check(RENDER_STYLE.terrainTiles.dwarvenprisonbars?.image === 'img/tiles/dwarven-prison-bars.png', 'prison-bars art')
        check(RENDER_STYLE.groundItems.dwarvenkey?.image === 'img/tiles/dwarven-key.png', 'dwarven-key art')
        check(RENDER_STYLE.terrainTiles.dwarvenstairsup?.image === 'img/tiles/dwarven-stairs-up.png', 'dedicated stair-up art')
        check(RENDER_STYLE.terrainTiles.dwarvenstairsdown?.image === 'img/tiles/dwarven-stairs-down.png', 'dedicated stair-down art')
        check(RENDER_STYLE.terrainTiles.dwarvenminessealed?.image === 'img/tiles/dwarven-mineshaft-sealed.png', 'dedicated sealed-mines art')
      })()`))
    })
  }

  it('covers fixed 3-, 4-, and 5-floor strata with graph, lift, and final-transition invariants', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldRange = cfg.levelCountRange.slice()
      for (const fixture of [{seed:31003,count:3},{seed:41004,count:4},{seed:51005,count:5}]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        cfg.levelCountRange = [fixture.count,fixture.count]
        WORLD_SEED = fixture.seed
        rngState = WORLD_SEED
        await generateNewWorld()
        const ruins = dungeonPackageLevels('dwarvenRuins')
        check(ruins.length === fixture.count, 'fixed seed produces requested ' + fixture.count + '-floor stratum')
        check(ruins.every(({level}) => level.roomGraph.graphDistance >= cfg.layout.minimumEntranceExitRoomGraphDistance),
          'every forced-count floor satisfies room-graph separation')
        check(ruins.at(-1).level.map.some(row => row.includes('dwarvenminessealed')),
          'every forced-count stratum ends at the sealed Mines continuation')
        const lift = dungeonShortcutById(cfg.shortcut.id)
        check(!!lift && lift.packageId === 'dwarvenRuins', 'forced-count stratum owns one package-tagged lift shortcut')
        check(lift.lower.floor >= 2 && lift.lower.floor <= fixture.count, 'lift target remains inside the generated stratum')
      }
      cfg.levelCountRange = oldRange
    })()`))
  })

  it('rejects a failed populated Ruins attempt and validates the replacement world', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins
      const oldRange = cfg.levelCountRange.slice()
      const oldRetries = cfg.validation.postPopulationWorldRetries
      const originalValidator = validateDwarvenRuinsStratum
      let calls = 0
      cfg.levelCountRange = [3,3]
      cfg.validation.postPopulationWorldRetries = 3
      validateDwarvenRuinsStratum = () => {
        calls++
        if (calls === 1) return {ok:false,issues:['forced post-population retry']}
        return originalValidator()
      }
      try {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        WORLD_SEED = 771239
        rngState = WORLD_SEED
        await generateNewWorld()
        check(calls >= 2, 'production world generation invokes the validator again after a rejected populated attempt')
        const final = originalValidator()
        check(final.ok, 'replacement world passes the real final validator: ' + final.issues.join('; '))
        const ids = enemies.map(enemy => enemy.id).filter(Boolean)
        check(new Set(ids).size === ids.length, 'accepted retry has unique stable enemy IDs')
      } finally {
        validateDwarvenRuinsStratum = originalValidator
        cfg.levelCountRange = oldRange
        cfg.validation.postPopulationWorldRetries = oldRetries
      }
    })()`))
  })

  it('regenerates identical Ruins maps and metadata from the same seed', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      const seed = 1357911
      const generateSnapshot = async () => {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        applyWorldTraits([])
        WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange = [4,4]
        WORLD_SEED = seed
        rngState = WORLD_SEED
        await generateNewWorld()
        return JSON.stringify({
          maps: deepLevels.slice(2).map(level => level.map),
          rooms: deepLevels.slice(2).map(level => level.rooms),
          roomGraphs: deepLevels.slice(2).map(level => level.roomGraph),
          progressionKeys: deepLevels.slice(2).map(level => level.progressionKey),
          vaults: deepLevels.slice(2).map(level => level.vaults),
          families: deepLevels.slice(2).map(level => level.encounterFamilies),
          ruinsEnemies: enemies.filter(e => e.alive && e.level <= -4).map(e => ({
            name:e.name,baseName:e.baseName,level:e.level,x:e.x,y:e.y,prefix:e.prefix,
            dungeonRole:e.dungeonRole,encounterFamily:e.encounterFamily,dungeonRoomId:e.dungeonRoomId,dungeonVaultId:e.dungeonVaultId,
            carriedDungeonKey:e.carriedDungeonKey || null
          })),
          ruinsItems: groundItems.filter(g => (g.level ?? 0) <= -4).map(g => ({
            kind:g.kind,level:g.level,x:g.x,y:g.y,keyId:g.keyId || null,tier:g.tier || null,
            artifactGuaranteed:g.artifactGuaranteed === true,vaultId:g.vaultId || null
          }))
        })
      }
      const first = await generateSnapshot()
      const second = await generateSnapshot()
      check(second === first, 'same seed regenerates identical Ruins geography, encounters, and loot')
    })()`))
  })

})
