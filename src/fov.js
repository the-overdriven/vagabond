/* Underground field of view. Pure, seeded-world-independent geometry.
 * Trace sight lines from the player's tile to tiles within an eight-tile
 * circle. Opaque target walls are visible; tiles behind them are not.
 */
'use strict'

const UndergroundFov = (() => {
  const RADIUS = 8
  const BLOCKS_SIGHT = new Set(['cavewall', 'dwarvenwall', 'mountain',
    'snowmountain', 'crypt2niche', 'boulder', 'blackpillar'])
  const key = (x, y) => x + ',' + y

  function compute(terrain, px, py, radius = RADIUS) {
    const visible = new Set()
    if (!terrain?.[py]?.[px]) return visible
    const opaque = (x, y) => !terrain[y]?.[x] || BLOCKS_SIGHT.has(terrain[y][x])
    visible.add(key(px, py))
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy || dx * dx + dy * dy > radius * radius) continue
      const tx = px + dx, ty = py + dy
      if (!terrain[ty]?.[tx]) continue
      let x = px, y = py, blocked = false
      const nx = Math.abs(dx), ny = Math.abs(dy)
      const sx = Math.sign(dx), sy = Math.sign(dy)
      let ix = 0, iy = 0
      // Follow tile centers. Diagonal sight can enter an adjacent open tile
      // even when both cardinal neighbors are walls; a wall on the traced
      // line still blocks everything beyond its visible face.
      while (ix < nx || iy < ny) {
        const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx
        if (decision === 0) {
          x += sx; y += sy; ix++; iy++
        } else if (decision < 0) { x += sx; ix++ }
        else { y += sy; iy++ }
        if (x === tx && y === ty) break // wall face is visible
        if (opaque(x, y)) { blocked = true; break }
      }
      if (!blocked) visible.add(key(tx, ty))
    }
    return visible
  }

  return {RADIUS, compute}
})()
