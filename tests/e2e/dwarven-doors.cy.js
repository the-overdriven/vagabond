describe('Dwarven Ruins ordinary doors', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Dwarven Door Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('generates paired doors and preserves open state through save/replay restoration', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      replayRecording = false
      replayPlaying = false
      currentZ = 0
      currentCave = -1
      map = surfaceMap
      applyWorldTraits([])
      WORLD_SEED = 12345
      rngState = WORLD_SEED
      await generateNewWorld()

      const ruins = deepLevels.slice(2)
      const doors = []
      for (let floorIndex = 0; floorIndex < ruins.length; floorIndex++) {
        const grid = ruins[floorIndex].map
        for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
          if (grid[y]?.[x] === 'dwarvendoorclosed') doors.push({floorIndex, x, y})
        }
      }
      check(doors.length >= 2, 'fixed seed generates ordinary doors')
      check(doors.length % 2 === 0, 'ordinary doors are generated as two-leaf entrances')
      check(TILE.dwarvendoorclosed.walk === false, 'closed door blocks movement')
      check(TILE.dwarvendoorclosed.blocksSight === true, 'closed door blocks sight')
      check(TILE.dwarvendoorclosed.projectileBlock === true, 'closed door blocks projectiles')
      check(TILE.dwarvendooropen.walk === true, 'open door is walkable')
      check(TILE.dwarvendooropen.blocksSight !== true, 'open door does not block sight')
      check(TILE.dwarvendooropen.projectileBlock !== true, 'open door does not block projectiles')
      check(TILE.dwarvendoorclosed.ch === '+' && TILE.dwarvendooropen.ch === '/', 'door ASCII glyphs')
      check(RENDER_STYLE.terrainTiles.dwarvendoorclosed?.image === 'img/tiles/dwarven-door-closed.png', 'closed-door art')
      check(RENDER_STYLE.terrainTiles.dwarvendooropen?.image === 'img/tiles/dwarven-door-open.png', 'open-door art')

      const chosen = doors.find(d => {
        const grid = ruins[d.floorIndex].map
        return DIRS8.some(([dx, dy]) => Math.abs(dx) + Math.abs(dy) === 1 && TILE[grid[d.y + dy]?.[d.x + dx]]?.walk)
      })
      check(chosen, 'a generated door has a walkable approach')
      const level = ruins[chosen.floorIndex]
      map = level.map
      currentZ = chainZForDepth(chosen.floorIndex + 4)
      currentCave = -1
      undergroundDiscovered = level.discovered
      for (let y = 0; y < MAP_H; y++) undergroundDiscovered[y].fill(true)

      const approach = DIRS8.map(([dx, dy]) => ({x: chosen.x + dx, y: chosen.y + dy, dx: -dx, dy: -dy}))
        .find(p => Math.abs(p.dx) + Math.abs(p.dy) === 1 && TILE[map[p.y]?.[p.x]]?.walk)
      check(approach, 'door approach tile exists')
      player.x = approach.x
      player.y = approach.y
      enemies = []
      occupied = new Set()
      const beforeTurn = turnCount
      await tryMove(approach.dx, approach.dy)
      check(map[chosen.y][chosen.x] === 'dwarvendooropen', 'bumping opens the door')
      check(player.x === approach.x && player.y === approach.y, 'opening does not move the player')
      check(turnCount === beforeTurn + 1, 'opening consumes exactly one turn')

      await tryMove(approach.dx, approach.dy)
      check(player.x === chosen.x && player.y === chosen.y, 'next movement enters the open doorway')
      check(turnCount === beforeTurn + 2, 'entering the doorway consumes the next turn')

      const sightLane = [['marble', 'dwarvendoorclosed', 'marble']]
      check(UndergroundFov.canSee(sightLane, 0, 0, 2, 0, 8) === false, 'closed door blocks line of sight')
      sightLane[0][1] = 'dwarvendooropen'
      check(UndergroundFov.canSee(sightLane, 0, 0, 2, 0, 8) === true, 'open door restores line of sight')

      map[chosen.y][chosen.x] = 'dwarvendoorclosed'
      const humanoid = {name: 'test dwarf', humanoid: true, abilities: [], alive: true, x: approach.x, y: approach.y}
      const beast = {name: 'test beast', humanoid: false, abilities: [], alive: true, x: approach.x, y: approach.y}
      check(enemyCanPathThrough(humanoid, chosen.x, chosen.y) === true, 'humanoid pathfinding may route through a closed door')
      check(enemyCanPathThrough(beast, chosen.x, chosen.y) === false, 'non-humanoids do not path through a closed door')
      check(enemyOpenDoorInsteadOfMove(humanoid, chosen.x, chosen.y) === true, 'humanoid spends an action opening the door')
      check(humanoid.x === approach.x && humanoid.y === approach.y, 'opening does not also move the humanoid')
      check(map[chosen.y][chosen.x] === 'dwarvendooropen', 'humanoid opening changes terrain state')

      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.version === self.VAGABOND_SAVE_VERSION, 'save uses the current schema')
      loadGameFromObject(save, {isReplayInit: true})
      const restored = deepLevels[chosen.floorIndex + 2]
      check(restored.map[chosen.y][chosen.x] === 'dwarvendooropen', 'save/replay restoration preserves the opened door')
    })()`))
  })
})
