function checkDwarvenWallVisuals() {
  const original = {map,currentZ,rngState}
  const check = (ok,msg) => { if (!ok) throw new Error(msg) }
  try {
    currentZ = -3
    map = Array.from({length:5}, () => Array(5).fill('dwarvenwall'))
    const variants = RENDER_STYLE.terrainTiles.dwarvenwall.variants
    const image = () => terrainVisual('dwarvenwall',2,2).image
    check(image() === 'img/tiles/cave-wall.png','buried walls keep cave rock')
    for (const [dx,dy] of DIRS8) {
      for (const key of ['marble','dwarvenrubble','dwarvendoorclosed','dwarvendooropen','dwarvendoorlocked']) {
        map[2+dy][2+dx] = key
        check(variants.includes(image()),'exposed walls use masonry: '+key)
      }
      map[2+dy][2+dx] = 'dwarvenwall'
    }
    map[2][3] = 'marble'
    check(terrainVisual('cavewall',2,2).image === 'img/tiles/cave-wall.png','natural rock is unchanged')
    const expected = {'img/tiles/dwarven-stone-wall.png':6,
      'img/tiles/dwarven-stone-wall-cracked.png':10,
      'img/tiles/dwarven-stone-wall-moss.png':2,
      'img/tiles/dwarven-stone-wall-ivy.png':2}
    check(variants.length === 20,'twenty weighted slots')
    for (const [path,count] of Object.entries(expected))
      check(variants.filter(v => v === path).length === count,'variant weight: '+path)
    map = Array.from({length:102}, () => Array(102).fill('marble'))
    const counts = {}
    for (let y=1;y<=100;y++) for (let x=1;x<=100;x++) {
      const visual = terrainVisual('dwarvenwall',x,y)
      const chosen = visual.image
      const vegetated = /-(moss|ivy)\.png$/.test(chosen)
      check(vegetated ? visual.borderImage === 'img/tiles/dwarven-stone-wall.png' : !visual.borderImage,
        'only vegetation gets the exact plain stone border')
      check(!chosen.includes('torch'),'no torch variants')
      check(chosen === terrainVisual('dwarvenwall',x,y).image,'stable repeated renders')
      counts[chosen] = (counts[chosen] || 0) + 1
    }
    for (const [path,weight] of Object.entries(expected))
      check(Math.abs(counts[path]/10000-weight/20) < 0.02,'variant distribution: '+path)
    check(!TILE.dwarvenwall.walk,'masonry remains blocking')
    check(rngState === original.rngState,'rendering consumes no RNG')
    return true
  } finally {
    map = original.map
    currentZ = original.currentZ
    rngState = original.rngState
  }
}
if (typeof module !== 'undefined') module.exports = {checkDwarvenWallVisuals}
