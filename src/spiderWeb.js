'use strict'

// The stranded web is a visual consequence, not a movement/attack debuff.
// Its source ID is saved: the overlay persists after loading, and the spider's
// death or any actual player relocation clears it. Presentation delay is not saved.
const SPIDER_WEB_THROW_MS = 260
const SPIDER_WEB_PULL_MS = 360
const SPIDER_WEB_OVERLAY_SCALE = 1.35
let spiderWebOverlayStart = 0

function clearSpiderWeb() {
  player.spiderWebSourceId = null
  spiderWebOverlayStart = 0
}

function markSpiderWeb(e, animated, delay = 0) {
  player.spiderWebSourceId = e.id
  spiderWebOverlayStart = animated ? performance.now() + delay + SPIDER_WEB_THROW_MS : 0
}

function spiderWebSource() {
  return player.spiderWebSourceId
    ? enemies.find(e => e.id === player.spiderWebSourceId && e.alive && onCurrentLevel(e))
    : null
}

function drawSpiderWebOverlay(now, px, py) {
  if (now < spiderWebOverlayStart || !spiderWebSource()) return
  const visual = RENDER_STYLE.projectiles?.web
  const vx = (px - camX + 0.5) * TILE_PX
  const vy = (py - camY + 0.5) * TILE_PX
  ctx.save()
  ctx.translate(vx, vy)
  const webImage = USE_TILE_IMAGES && visual && resolveVisualImage(visual)
  if (webImage) {
    // Do not use projectile scale (0.65): this is a large restraining web.
    const size = TILE_PX * SPIDER_WEB_OVERLAY_SCALE
    ctx.drawImage(webImage, -size / 2, -size / 2, size, size)
  } else {
    ctx.font = `bold ${Math.round(TILE_PX * 1.25)}px Consolas, monospace`
    ctx.fillStyle = visual?.color || '#dedbd1'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('%', 0, 0)
  }
  ctx.restore()
}
