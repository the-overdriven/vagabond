/* Underground field of view. Pure, seeded-world-independent geometry.
 * Trace sight lines from the player's tile to tiles within an eight-tile
 * circle. Opaque target walls are visible; tiles behind them are not.
 * The exported line tracer is also reused by projectile geometry so both
 * systems agree on which grid cells a straight line crosses.
 */
'use strict'

const UndergroundFov = (() => {
  const DEFAULT_RADIUS = 8
  const configuredRadius = () => typeof WORLD_GEN_CONFIG !== 'undefined'
    ? (WORLD_GEN_CONFIG.environment?.undergroundFovRadius ?? DEFAULT_RADIUS)
    : DEFAULT_RADIUS
  const EXPLORED_OVERLAY = 'rgba(0, 0, 0, 0.5)'
  const BLOCKS_SIGHT = new Set(['cavewall', 'dwarvenwall', 'mountain',
    'snowmountain', 'crypt2niche', 'boulder', 'blackpillar'])
  const key = (x, y) => x + ',' + y

  function traceLine(fromX, fromY, toX, toY) {
    const points = [{x: fromX, y: fromY}]
    let x = fromX, y = fromY
    const dx = toX - fromX, dy = toY - fromY
    const nx = Math.abs(dx), ny = Math.abs(dy)
    const sx = Math.sign(dx), sy = Math.sign(dy)
    let ix = 0, iy = 0
    while (ix < nx || iy < ny) {
      const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx
      if (decision === 0) {
        x += sx; y += sy; ix++; iy++
      } else if (decision < 0) {
        x += sx; ix++
      } else {
        y += sy; iy++
      }
      points.push({x, y})
    }
    return points
  }

  function canSee(terrain, fromX, fromY, toX, toY, radius = null) {
    if (!terrain?.[fromY]?.[fromX] || !terrain?.[toY]?.[toX]) return false
    if (Number.isFinite(radius)) {
      const dx = toX - fromX, dy = toY - fromY
      if (dx * dx + dy * dy > radius * radius) return false
    }
    const line = traceLine(fromX, fromY, toX, toY)
    for (let i = 1; i < line.length - 1; i++) {
      const {x, y} = line[i]
      if (!terrain[y]?.[x] || BLOCKS_SIGHT.has(terrain[y][x])) return false
    }
    return true
  }

  function compute(terrain, px, py, radius = configuredRadius()) {
    const visible = new Set()
    if (!terrain?.[py]?.[px]) return visible
    visible.add(key(px, py))
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if ((!dx && !dy) || dx * dx + dy * dy > radius * radius) continue
      const tx = px + dx, ty = py + dy
      if (!terrain[ty]?.[tx]) continue
      // Opaque target walls remain visible; canSee only checks intermediate tiles.
      if (canSee(terrain, px, py, tx, ty, radius)) visible.add(key(tx, ty))
    }
    return visible
  }

  return {
    get RADIUS() { return configuredRadius() },
    EXPLORED_OVERLAY,
    compute,
    canSee,
    traceLine
  }
})()
