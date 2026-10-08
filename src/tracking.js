'use strict'

// Surface evidence is independent of actors/items and never participates in collision.
let beastTracks = new Map()
let TRACK_CONFIG
const TRACK_DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
const TRACK_ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖']

function trackSpecies(enemy) {
  return enemyTemplateForSavedEnemy(enemy)?.name || enemy.baseName || enemy.name
}

function trackDirection(dx, dy) {
  if (!dx && !dy) return null
  // Canvas Y grows downward: north=0, east=2, south=4, west=6.
  return (Math.round(Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8
}

function leaveBeastTrack(enemy, fromX, fromY) {
  if (currentZ !== 0 || enemyWanderMode(enemy) !== 'far' || enemyHasAbility(enemy, 'fly') || enemy.humanoid) return
  if (Math.max(Math.abs(enemy.x - fromX), Math.abs(enemy.y - fromY)) !== 1) return
  // Water washes tracks away; frozen rivers keep their normal evidence.
  if (map[fromY]?.[fromX] === 'river' || map[fromY]?.[fromX] === 'water') return
  if (!Number.isInteger(enemy.farTargetX) || !Number.isInteger(enemy.farTargetY) ||
      !enemyCanTraverse(enemy, enemy.farTargetX, enemy.farTargetY)) return
  const direction = trackDirection(enemy.farTargetX - fromX, enemy.farTargetY - fromY)
  if (direction === null || rng() >= TRACK_CONFIG.chance) return
  // Use the vacated square, so the arrival step also has a nonzero bearing.
  beastTracks.set(keyXY(fromX, fromY), {
    x: fromX, y: fromY, direction, species: trackSpecies(enemy), age: 0
  })
}

function ageBeastTracks() {
  for (const [key, track] of beastTracks) {
    if (++track.age >= TRACK_CONFIG.lifetimeTurns) beastTracks.delete(key)
  }
}

function beastTrackAt(x, y) {
  return currentZ === 0 ? beastTracks.get(keyXY(x, y)) : undefined
}

function inspectBeastTrack(track) {
  if (!player.trackingLearned) return 'You notice something that looks like foot tracks, but cannot make sense of them.'
  const known = (player.killsBySpecies[track.species] || 0) > 0
  const freshness = track.age < TRACK_CONFIG.freshTurns ? 'Fresh' :
    track.age >= TRACK_CONFIG.fadingFromTurns ? 'Fading' : 'The'
  return `${freshness} ${known ? track.species.toLowerCase() + ' ' : ''}tracks lead ${TRACK_DIRECTIONS[track.direction]}.` +
    (known ? '' : " You've never seen paw prints like these before.")
}

function drawBeastTracks() {
  if (currentZ !== 0) return
  for (const track of beastTracks.values()) {
    if (!discovered[track.y]?.[track.x]) continue
    const px = Math.round((track.x - camX) * TILE_PX)
    const py = Math.round((track.y - camY) * TILE_PX)
    if (px < -TILE_PX || py < -TILE_PX || px >= canvas.width || py >= canvas.height) continue
    ctx.save()
    ctx.translate(px + TILE_PX / 2, py + TILE_PX / 2)
    ctx.rotate(track.direction * Math.PI / 4)
    // Leave enough margin for diagonal rotation within the original tile.
    ctx.scale(.84, .84)
    const drawn = drawImageVisual(-TILE_PX / 2, -TILE_PX / 2, RENDER_STYLE.specialTiles.beastTracks)
    ctx.restore()
    if (!drawn) {
      ctx.save()
      ctx.font = `${Math.round(TILE_PX * .48)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.lineWidth = 2
      ctx.strokeStyle = '#26251b'
      ctx.fillStyle = '#ae9869'
      ctx.strokeText(TRACK_ARROWS[track.direction], px + TILE_PX / 2, py + TILE_PX / 2)
      ctx.fillText(TRACK_ARROWS[track.direction], px + TILE_PX / 2, py + TILE_PX / 2)
      ctx.restore()
    }
  }
}
