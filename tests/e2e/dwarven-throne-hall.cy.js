describe('Guaranteed Dwarven Throne Hall geometry', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Throne Hall Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay', {timeout: 90000}).should('not.have.class', 'show')
  })

  for (const seed of [610061, 610062, 610063]) {
    it(`reserves an intact optional throne hall, separate artifact, and legal mine route with seed ${seed}`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check = (ok, message) => { if (!ok) throw new Error(message) }
        applyWorldTraits([])
        WORLD_SEED = ${seed}
        rngState = WORLD_SEED
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        replayRecording = false
        replayPlaying = false
        await generateNewWorld()

        const ruins = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins')
        check(ruins.length >= 3 && ruins.length <= 5, 'supported ruins floor count')
        ruins.slice(0, -1).forEach(level => {
          check(!(level.landmarks || []).length, 'no landmark outside the final Ruins floor')
        })
        const final = ruins.at(-1)
        const halls = final.landmarks || []
        check(halls.length === 1, 'one guaranteed landmark on the last floor')
        const hall = halls[0]
        check(hall.id.endsWith(':throneHall') && hall.recipeRevision === 3, 'stable landmark identity')
        check(hall.type === 'throneHall', 'correct landmark recipe')
        const room = final.rooms.find(candidate => candidate.id === hall.roomId)
        check(!!room && room.landmark === 'throneHall' && room.archetype === 'Throne Hall', 'dedicated hall room')
        check(!room.onMainRoute && room.optional, 'throne hall is optional')
        check(!final.roomGraph.mainRoute.includes(room.id) && final.roomGraph.exitRoomId !== room.id,
          'throne hall is outside the mandatory route to the mines')
        const validSize = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.landmarks.throneHall.interiorSizes
          .some(([w,l]) => Math.min(room.w-2,room.h-2) === w && Math.max(room.w-2,room.h-2) === l)
        check(validSize && hall.facing === room.facing, 'layout dimensions and facing')
        const columns = dwarvenRoomInterior(room).filter(p => final.map[p.y]?.[p.x] === 'dwarvenstatue')
        check(columns.length === 6, 'three symmetrical pairs of indoor columns')
        check(final.map[hall.thronePosition.y]?.[hall.thronePosition.x] === 'dwarventhrone',
          'stone throne occupies landmark anchor')
        check(final.map.flat().filter(tile => tile === 'dwarventhrone').length === 1,
          'there is exactly one throne')
        check(final.map.flat().filter(tile => tile === 'dwarvendais').length === 8,
          'eight walkable dais cells surround the throne')
        check(!TILE.dwarventhrone.walk && !TILE.dwarventhrone.projectileBlock &&
          !TILE.dwarventhrone.blocksSight && TILE.dwarvendais.walk,
          'throne collision does not create unexpected sight or projectile cover')
        check(tileUnderlays[chainZForDepth(deepLevels.length+1) + ':' + keyXY(hall.thronePosition.x,hall.thronePosition.y)] === 'dwarvendais',
          'throne sits transparently on actual dais floor')
        const ports = hall.entrance
        check(hall.entrance.length === 2 && !('onward' in hall) && room.doorways.length === 1,
          'exactly one double-leaf throne-room entrance')
        check(room.optional && !room.onMainRoute && room.connectionCount === 1,
          'throne hall is a one-connection optional room')
        check(final.roomGraph.branches.some(branch => branch.roomId === room.id),
          'throne hall is registered as a side branch')
        const portKeys = new Set(ports.map(p => keyXY(p.x,p.y)))
        for (let y=room.y;y<room.y+room.h;y++) for (let x=room.x;x<room.x+room.w;x++) {
          const edge = x===room.x || x===room.x+room.w-1 || y===room.y || y===room.y+room.h-1
          if (edge && !portKeys.has(keyXY(x,y)))
            check(final.map[y]?.[x] === 'dwarvenwall', 'no accidental hall wall breach')
        }
        const [entrance, exit] = final.caves[0].entrances
        const reaches = dungeonWalkDistancesWithDoorTraversal(final.map, entrance)
        check(reaches.has(keyXY(exit.x,exit.y)) && reaches.has(keyXY(room.cx,room.cy)),
          'mine exit and optional throne hall are both reachable')
        const blocked = dungeonWalkDistancesWithDoorTraversal(final.map, entrance, portKeys)
        check(blocked.has(keyXY(exit.x,exit.y)) && !blocked.has(keyXY(room.cx,room.cy)),
          'blocking throne entrance isolates only the throne, not the mine exit')
        check(final.vaults.filter(v => v.artifactReserved).length === 1, 'preserves optional artifact vault')
        check(final.vaults.length >= 1 && final.vaults.length <= 2,
          'throne hall replaces the extra compulsory defensive vault')
        const z = chainZForDepth(deepLevels.length+1)
        const guards = enemies.filter(enemy => enemy.alive && enemy.level === z && enemy.dungeonRoomId === room.id)
        check(guards.filter(enemy => ['frontline','group','backline'].includes(enemy.dungeonRole)).length >= 2,
          'throne hall contains at least two defensive creatures from the existing budget')
        check(guards.some(enemy => enemy.dungeonRole === 'frontline') &&
          guards.some(enemy => enemy.dungeonRole === 'group'), 'frontline and supporting guards defend the hall')
        check(guards.every(enemy => !enemy.dungeonVaultId), 'no hall guard is tagged as belonging to artifact vault')
        const royalGuards = guards.filter(enemy => enemy.dungeonRole === 'royalGuard')
        check(royalGuards.length >= 2 && royalGuards.length <= 3 &&
          royalGuards.every(enemy => enemy.tier === 4), 'additional tier-4 royal defenders')
        const royalChests = groundItems.filter(item => item.level === z && item.royalThroneChest)
        const forward = [[0,-1],[1,0],[0,1],[-1,0]][hall.facing]
        check(royalChests.length === 1 && royalChests[0].tier === 5 &&
          !royalChests[0].artifactGuaranteed &&
          royalChests[0].x === hall.thronePosition.x + 2*forward[0] &&
          royalChests[0].y === hall.thronePosition.y + 2*forward[1],
          'royal chest behind throne is independent of separate artifact')
        check(enemies.filter(enemy => enemy.alive && enemy.level === z && enemy.prefix === 'Champion').length === 1,
          'the hall does not duplicate the floor Champion')

        const before = JSON.stringify({landmarks:final.landmarks,rooms:final.rooms,route:final.roomGraph})
        const saved = JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        const restored = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins').at(-1)
        check(JSON.stringify({landmarks:restored.landmarks,rooms:restored.rooms,route:restored.roomGraph}) === before,
          'save/replay restores landmark and graph exactly')
        check(JSON.stringify(groundItems.filter(item => item.royalThroneChest)) === JSON.stringify(royalChests),
          'royal chest remains intact after save/restore')
        check(JSON.stringify(restored.caves[0].landmarks) === JSON.stringify(restored.landmarks),
          'descriptor and authoritative level landmark copies agree')
      })()`))
    })
  }

  it('rotates the hall footprint, ports, throne anchor and facing together', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => { if (!ok) throw new Error(message) }
      const final = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins').at(-1)
      const old = structuredClone(final.landmarks[0])
      const oldRoom = structuredClone(final.rooms.find(r => r.id === old.roomId))
      const z = chainZForDepth(deepLevels.length+1)
      const oldChest = groundItems.find(g => g.royalThroneChest && g.level === z)
      check(!!oldChest, 'royal chest exists before rotation')
      const height = MAP_H
      const rotated = p => ({x:height - 1 - p.y, y:p.x})
      rotateGeneratedWorld(1)
      const now = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins').at(-1)
      const hall = now.landmarks[0]
      const room = now.rooms.find(r => r.id === hall.roomId)
      check(hall.facing === (old.facing+1)%4 && room.facing === hall.facing, 'facing rotates')
      check(room.w === oldRoom.h && room.h === oldRoom.w, 'hall footprint rotates')
      check(JSON.stringify(hall.entrance) === JSON.stringify(old.entrance.map(rotated)), 'entry port rotates')
      check(!('onward' in hall), 'back wall stays sealed after rotation')
      check(JSON.stringify(hall.thronePosition) === JSON.stringify(rotated(old.thronePosition)), 'throne anchor rotates')
      check(now.map[hall.thronePosition.y]?.[hall.thronePosition.x] === 'dwarventhrone', 'throne follows rotation')
      const chest = groundItems.find(g => g.royalThroneChest && g.level === z)
      check(chest.x === rotated(oldChest).x && chest.y === rotated(oldChest).y,
        'royal chest rotates with its throne hall')
      currentZ=chainZForDepth(deepLevels.length+1)
      map=now.map
      check(terrainVisual('dwarventhrone',hall.thronePosition.x,hall.thronePosition.y).image ===
        'img/tiles/dwarven-throne-' + ['south','west','north','east'][hall.facing] + '.png',
        'sprite matches rotated direction')
    })()`))
  })
})
