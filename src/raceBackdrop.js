/* Decorative terrain-only panorama for desktop character creation.
   This renderer never reads or advances gameplay/world-generation RNG. */
const RaceBackdrop = (() => {
  const desktopMedia = window.matchMedia('(min-width: 721px) and (pointer: fine)')
  const assetRoot = 'img/tiles/'
  const terrainFiles = [
    'grassland-1.png', 'grassland-2.png', 'grassland-3.png', 'grassland-4.png',
    'grassland-5.png', 'grassland-6.png', 'grassland-7.png', 'grassland-8.png',
    'dark-forest-ground.png', 'forest-tree.png', 'grassland-tree.png',
    'hill-left.png', 'hill-middle.png', 'hill-right.png'
  ]
  let started = false
  let sceneUrl = null

  function hash(x, y, salt = 0) {
    let n = Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(salt + 43, 2246822519)
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296
  }

  function loadTile(name) {
    return new Promise(resolve => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => resolve(null)
      image.src = assetRoot + name
    })
  }

  function drawScene(tiles) {
    const tileSize = 32
    const columns = 80
    const rows = 48
    const canvas = document.createElement('canvas')
    canvas.width = columns * tileSize
    canvas.height = rows * tileSize
    const ctx = canvas.getContext('2d', {alpha: false})
    if (!ctx) return null
    ctx.imageSmoothingEnabled = true

    const grass = terrainFiles.slice(0, 8).map(file => tiles.get(file)).filter(Boolean)
    if (!grass.length) return null
    const earth = tiles.get('dark-forest-ground.png')
    const forest = tiles.get('forest-tree.png')
    const tree = tiles.get('grassland-tree.png')
    const hills = ['hill-left.png', 'hill-middle.png', 'hill-right.png'].map(file => tiles.get(file))

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < columns; x++) {
        const px = x * tileSize
        const py = y * tileSize
        // A winding, empty trail cuts between wooded slopes and a clearing.
        const trailX = 36 + 11 * Math.sin(y * 0.115 + 1.3) + 5 * Math.sin(y * 0.31)
        const trail = Math.abs(x - trailX) < 1.7 + hash(0, y, 2) * 0.6
        const wooded = Math.sin(x * 0.14 + y * 0.075) + Math.cos(y * 0.2 - x * 0.055)
        const forestEdge = wooded > 0.14 || x < 13 || x > 67
        const clearing = Math.hypot((x - 41) / 23, (y - 22) / 15) < 0.68
        const r = hash(x, y, 1)

        const base = trail && earth ? earth : grass[Math.floor(r * grass.length)]
        ctx.drawImage(base, px, py, tileSize, tileSize)
        if (trail || clearing) continue

        if (forestEdge && forest && hash(x, y, 4) < 0.40) {
          ctx.drawImage(forest, px, py, tileSize, tileSize)
        } else if (forestEdge && tree && hash(x, y, 5) < 0.17) {
          ctx.drawImage(tree, px, py, tileSize, tileSize)
        } else if (hash(x, y, 6) < 0.022) {
          const hill = hills[Math.floor(hash(x, y, 7) * hills.length)]
          if (hill) ctx.drawImage(hill, px, py, tileSize, tileSize)
        }
      }
    }
    return canvas
  }

  async function prepare() {
    if (!desktopMedia.matches || started) return
    started = true
    try {
      const loaded = await Promise.all(terrainFiles.map(loadTile))
      const tiles = new Map(terrainFiles.map((file, index) => [file, loaded[index]]))
      const scene = drawScene(tiles)
      if (!scene) return
      const blob = await new Promise(resolve => scene.toBlob(resolve, 'image/jpeg', 0.82))
      if (!blob) return
      sceneUrl = URL.createObjectURL(blob)
      const overlay = document.getElementById('raceOverlay')
      if (overlay) overlay.style.setProperty('--race-scene-image', `url("${sceneUrl}")`)
    } catch (error) {
      console.warn('Character creation scenery unavailable:', error)
    }
  }

  desktopMedia.addEventListener('change', () => {
    if (desktopMedia.matches && document.getElementById('raceOverlay')?.classList.contains('show')) prepare()
  })

  return {prepare}
})()
