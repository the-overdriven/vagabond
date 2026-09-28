// Reference implementation deliberately preserves the pre-optimization search.
function referencePath(e, targetX, targetY, avoidVillage = false) {
  const start = e.y * MAP_W + e.x, target = targetY * MAP_W + targetX
  const prev = new Int32Array(MAP_W * MAP_H)
  prev.fill(-1)
  prev[start] = start
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (cur === target) break
    const cx = cur % MAP_W, cy = Math.floor(cur / MAP_W)
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy, ni = ny * MAP_W + nx
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H || prev[ni] !== -1) continue
      if (!enemyCanTraverse(e, nx, ny)) continue
      if (avoidVillage) {
        const a = enemyFarVillageDistance(cx, cy), b = enemyFarVillageDistance(nx, ny)
        if (b <= ENEMY_FAR_VILLAGE_AVOID_RADIUS && (a > ENEMY_FAR_VILLAGE_AVOID_RADIUS || b < a)) continue
      }
      if ((nx !== targetX || ny !== targetY) && occupied.has(keyXY(nx, ny))) continue
      if (nx === player.x && ny === player.y) continue
      prev[ni] = cur
      queue.push(ni)
    }
  }
  if (prev[target] === -1) return null
  const path = []
  for (let cur = target; cur !== start; cur = prev[cur])
    path.push({x: cur % MAP_W, y: Math.floor(cur / MAP_W)})
  return path.reverse()
}

describe('Turn and idle rendering performance regressions', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Performance Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  it('preserves BFS tie breaks, flying, village avoidance and live occupancy/terrain', () => {
    cy.window().then(win => {
      win.eval(`window.referencePath = ${referencePath.toString()}`)
      const result = win.eval(`(() => {
        const saved = {map, occupied, spawnPoint}
        try {
          map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('mountain'))
          for (let y = 10; y <= 30; y++)
            for (let x = 10; x <= 30; x++) map[y][x] = (x === 18 && y !== 25) ? 'water' : 'grass'
          occupied = new Set(['16,16', '17,17', '24,24'])
          spawnPoint = {x: 12, y: 12}
          const results = []
          for (const fly of [false, true]) for (const avoid of [false, true]) {
            const e = {x: 14, y: 14, fly}
            for (const target of [[24,24], [15,15], [14,14], [35,35]])
              results.push(JSON.stringify(enemyBuildFarPath(e, ...target, avoid)) ===
                JSON.stringify(referencePath(e, ...target, avoid)))
          }
          const e = {x: 14, y: 14}
          const before = enemyBuildFarPath(e, 24, 24)
          const step = before[0]
          occupied.add(keyXY(step.x, step.y))
          const after = enemyBuildFarPath(e, 24, 24)
          results.push(JSON.stringify(before) !== JSON.stringify(after))
          results.push(JSON.stringify(after) === JSON.stringify(referencePath(e, 24, 24)))
          occupied.clear()
          map[step.y][step.x] = 'mountain'
          results.push(JSON.stringify(enemyBuildFarPath(e, 24, 24)) === JSON.stringify(referencePath(e, 24, 24)))
          const buffer = enemyFarBuffers.prev
          enemyBuildFarPath(e, 15, 15)
          results.push(buffer === enemyFarBuffers.prev)
          return results
        } finally { ({map, occupied, spawnPoint} = saved); render() }
      })()`)
      expect(result.every(Boolean)).to.equal(true)
    })
  })

  it('retains candidate/RNG order while reusing exhausted searches', () => {
    cy.window().then(win => {
      win.eval(`window.referencePath = ${referencePath.toString()}`)
      const result = win.eval(`(() => {
        const saved = {map, occupied, randInt, enemyBuildFarPath, enemyCanTraverse, spawnPoint}
        try {
          map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('grass'))
          const x = MAP_W >> 1, y = MAP_H >> 1
          for (const [dx, dy] of DIRS8) map[y + dy][x + dx] = 'mountain'
          occupied = new Set()
          spawnPoint = {x: 1, y: 1}
          let rolls = 0, calls = 0
          randInt = (min, max) => min + ((++rolls * 17) % (max - min + 1))
          enemyCanTraverse = (...args) => { calls++; return saved.enemyCanTraverse(...args) }
          const optimized = {x, y}
          const ok = enemyChooseFarTarget(optimized)
          const fastRolls = rolls, fastCalls = calls
          rolls = 0; calls = 0
          enemyBuildFarPath = referencePath
          const legacy = {x, y}
          const oldOk = enemyChooseFarTarget(legacy)
          const same = ok === oldOk && rolls === fastRolls && JSON.stringify(optimized) === JSON.stringify(legacy)
          const fewer = fastCalls < calls
          // A reachable candidate after an exhausted search must reconstruct the
          // same predecessor chain, not merely be labelled reachable.
          enemyBuildFarPath = saved.enemyBuildFarPath
          map[y][x + 1] = 'grass'
          const search = enemyFarSearch()
          enemyBuildFarPath({x,y}, x - 1, y, false, search)
          const route = enemyBuildFarPath({x,y}, x + 1, y, false, search)
          return {same, fewer, route: JSON.stringify(route) === JSON.stringify(referencePath({x,y}, x + 1, y))}
        } finally {
          ({map, occupied, randInt, enemyBuildFarPath, enemyCanTraverse, spawnPoint} = saved)
          render()
        }
      })()`)
      expect(result).to.deep.equal({same: true, fewer: true, route: true})
    })
  })

  it('yields after the final movement frame and keeps the input lock until queued work', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const saved = {render, flushPendingMove, animationsPending, cameraAnimating, moveAnim,
          animLoopFrame, pendingMoveTask, requestAnimationFrame, setTimeout}
        let frame, task, flushes = 0
        try {
          requestAnimationFrame = callback => { frame = callback; return 123 }
          setTimeout = callback => { task = callback; return 456 }
          render = () => { moveAnim = null }
          animationsPending = () => false
          flushPendingMove = () => { flushes++ }
          cameraAnimating = true
          moveAnim = {}
          animLoopFrame = null
          pendingMoveTask = null
          runAnimationLoop()
          frame(100)
          const before = flushes === 0 && cameraAnimating && animLoopFrame === null
          task()
          const after = flushes === 1 && !cameraAnimating && pendingMoveTask === null
          cameraAnimating = true
          runAnimationLoop()
          frame(200)
          stopCameraAnimation()
          task()
          return {before, after, cancelled: flushes === 1 && !cameraAnimating}
        } finally {
          ({render, flushPendingMove, animationsPending, cameraAnimating, moveAnim,
            animLoopFrame, pendingMoveTask, requestAnimationFrame, setTimeout} = saved)
        }
      })()`)
      expect(result).to.deep.equal({before: true, after: true, cancelled: true})
    })
  })

  it('executes buffered input and automatic paths once in order', () => {
    cy.window().then(win => win.eval(`(async () => {
      enemies = []
      npcs = []
      groundItems = []
      occupied = new Set()
      for (let y = player.y - 2; y <= player.y + 2; y++)
        for (let x = player.x - 2; x <= player.x + 5; x++) map[y][x] = 'grass'
      const startX = player.x, startY = player.y
      const settle = async () => {
        while (cameraAnimating || pendingMoveTask !== null)
          await new Promise(resolve => setTimeout(resolve, 10))
      }
      await tryMove(1, 0)
      await tryMove(1, 0)
      await settle()
      if (player.x !== startX + 2 || player.y !== startY || pendingMove)
        throw new Error('Buffered movement was lost or duplicated')
      autoPath = [{x: startX + 3, y: startY}, {x: startX + 4, y: startY}]
      flushPendingMove()
      await settle()
      if (player.x !== startX + 4 || player.y !== startY || autoPath?.length)
        throw new Error('Automatic path was lost or duplicated')
    })()`))
  })

  it('does not draw the hidden side minimap and refreshes it when shown', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const saved = {renderMinimapCanvas, mapOpen, minimapDirty}
        const display = sideMini.style.display
        const calls = []
        try {
          renderMinimapCanvas = context => calls.push(context === sideCtx ? 'side' : 'world')
          mapOpen = false
          minimapDirty = true
          sideMini.style.display = 'none'
          renderMinimap()
          const hidden = calls.length === 0 && minimapDirty
          mapOpen = true
          renderMinimap()
          const world = calls.join() === 'world' && minimapDirty
          mapOpen = false
          sideMini.style.display = display
          renderMinimap()
          return {hidden, world, shown: calls.join() === 'world,side' && !minimapDirty}
        } finally {
          sideMini.style.display = display;
          ({renderMinimapCanvas, mapOpen, minimapDirty} = saved)
          render()
        }
      })()`)
      expect(result).to.deep.equal({hidden: true, world: true, shown: true})
    })
  })

  for (const width of [1280, 390]) it(`repaints idle water identically to a full frame at ${width}px, including overlapping layers`, () => {
    cy.viewport(width, width === 390 ? 844 : 720)
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const saved = {map, currentZ, enemies, npcs, groundItems, grasslandTrees,
          moveAnim, cameraAnimating, attackAnim, deathTransition, fxAnims, damageAnims, terrainVisual}
        try {
          currentZ = 0
          moveAnim = null; cameraAnimating = false; attackAnim = null; deathTransition = null
          fxAnims = []; damageAnims = []; enemies = []; npcs = []
          grasslandTrees = new Set()
          map = Array.from({length: MAP_H}, () => Array(MAP_W).fill('grass'))
          map[player.y][player.x] = 'water'
          map[player.y][player.x + 1] = 'water'
          map[player.y - 1][player.x] = 'forest'
          groundItems = [{kind:'skeleton', x:player.x+1, y:player.y, level:0}]
          let calls = 0
          terrainVisual = (...args) => { calls++; return saved.terrainVisual(...args) }
          render(0)
          const original = ctx.getImageData(0,0,canvas.width,canvas.height).data
          calls = 0
          renderAmbientTerrain(240)
          const partialCalls = calls
          const partial = ctx.getImageData(0,0,canvas.width,canvas.height).data
          calls = 0
          render(240)
          const fullCalls = calls
          const full = ctx.getImageData(0,0,canvas.width,canvas.height).data
          return {equal: partial.every((v,i) => v === full[i]),
            changed: original.some((v,i) => v !== full[i]), fewer: partialCalls < fullCalls}
        } finally {
          ({map, currentZ, enemies, npcs, groundItems, grasslandTrees,
            moveAnim, cameraAnimating, attackAnim, deathTransition, fxAnims, damageAnims, terrainVisual} = saved)
          render()
        }
      })()`)
      expect(result).to.deep.equal({equal: true, changed: true, fewer: true})
    })
  })
})
