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
          const floorKeys = groundItems.filter(g => g.kind === 'dwarvenkey' && g.progressionKey &&
            g.level === floorZ && g.levelKind === 'chain')

          if (lockedGate.length) {
            check(lockedGate.length === 2 && breachedGate.length === 0, 'intact progression gate has two locked leaves')
            check(floorKeys.length === 1, 'intact progression gate has exactly one key')
            check(floorKeys[0].keyId === dwarvenDungeonLockId(floorZ, 'gate', lockedGate), 'gate key matches its lock ID')
            check(reachable(level.map, up[0], floorKeys[0]), 'progression key is reachable from the entrance side')
            check(!reachable(level.map, up[0], target), 'intact gate blocks the exit before unlocking')
            check(reachable(level.map, up[0], target, true), 'exit becomes reachable when the gate is treated as unlocked')
          } else {
            check(breachedGate.length === 2 && lockedGate.length === 0, 'pre-breached progression gate has two open leaves')
            check(floorKeys.length === 0, 'pre-breached progression gate does not spawn an unnecessary key')
            check(reachable(level.map, up[0], target), 'pre-breached gate leaves the exit reachable')
          }
        }

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
        check(TILE.dwarvengatelocked.ch === 'H' && TILE.dwarvengatebreached.ch === 'h', 'ASCII progression-gate glyphs')
        check(RENDER_STYLE.terrainTiles.dwarvengatelocked?.image === 'img/tiles/dwarven-gate-locked.png', 'locked-gate art')
        check(RENDER_STYLE.terrainTiles.dwarvengatebreached?.image === 'img/tiles/dwarven-gate-breached.png', 'breached-gate art')
        check(RENDER_STYLE.groundItems.dwarvenkey?.image === 'img/icons/dwarven-key.svg', 'dwarven-key art')
        check(RENDER_STYLE.terrainTiles.dwarvenstairsup?.image === 'img/tiles/dwarven-stairs-up.png', 'dedicated stair-up art')
        check(RENDER_STYLE.terrainTiles.dwarvenstairsdown?.image === 'img/tiles/dwarven-stairs-down.png', 'dedicated stair-down art')
        check(RENDER_STYLE.terrainTiles.dwarvenminessealed?.image === 'img/tiles/dwarven-mineshaft-sealed.png', 'dedicated sealed-mines art')
      })()`))
    })
  }
})
