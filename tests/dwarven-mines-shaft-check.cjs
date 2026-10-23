'use strict'
const assert=require('node:assert/strict')
const {run}=require('./helpers/node-game-runtime.cjs')

;(async()=>{
  await run('loadContent()')
  for(const [seed,count] of [[610061,4],[610063,5],[554433,4],[224466,5]]){
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits([],'XS')`)
    const generated=run(`(()=>{
      const mine=[]
      for(let index=0;index<${count};index++){
        let level=null
        for(let attempt=0;attempt<80&&!level;attempt++)
          level=mineFloorCandidate(index,${count})
        if(!level)return {error:'cannot build floor '+index}
        mine.push(level)
      }
      const rngBefore=rngState
      if(!mineAlignCageShaft(mine))return {error:'cannot align shaft'}
      return {rngBefore,rngAfter:rngState,levels:mine.map(l=>({
        upstairs:l.mineUpstairs,downstairs:l.mineDownstairs,
        cage:l.mineCagePad,tiles:l.mineFloorTiles,
        restoredCentre:(()=>{
          const restored=decodeTileGrid(encodeTileGrid(l.map,'#'),'cavewall')
          return restored?.[l.mineCagePad.y]?.[l.mineCagePad.x]
        })(),
        map:l.map
      }))}
    })()`)
    assert(!generated.error,`seed ${seed}: ${generated.error}`)
    assert.equal(generated.rngAfter,generated.rngBefore,
      'alignment is deterministic without consuming gameplay RNG')
    const anchor=generated.levels[0].cage
    for(let index=0;index<generated.levels.length;index++){
      const level=generated.levels[index],m=level.map,p=level.cage
      assert.deepEqual(JSON.parse(JSON.stringify(p)),JSON.parse(JSON.stringify(anchor)),
        `seed ${seed}: all floor coordinates match`)
      assert.equal(m[p.y][p.x],index===0?'minecageupperoff':
        index===count-1?'minecageloweroff':'mineshaftrope')
      assert.equal(level.restoredCentre,m[p.y][p.x],
        `seed ${seed}: shaft tile survives the real save-grid encoding`)
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        if(!dx&&!dy)continue
        assert.equal(m[p.y+dy][p.x+dx],'cavefloor2',
          `seed ${seed}: 3x3 landing floor is clear`)
      }
      const safe=run(`(()=>{
        const cm=${JSON.stringify(m)},up=${JSON.stringify(level.upstairs)},
          down=${JSON.stringify(level.downstairs)},pad=${JSON.stringify(p)}
        const distance=dungeonWalkDistances(cm,up)
        return {
          total:cm.flat().filter(tile=>TILE[tile]?.walk).length,
          reached:distance.size,
          ring:distance.has(keyXY(pad.x-1,pad.y)),
          stair:down?distance.get(keyXY(down.x,down.y)):null
        }
      })()`)
      assert.equal(safe.reached,safe.total,`seed ${seed}: no isolated walkable tiles`)
      assert(safe.ring,`seed ${seed}: the shaft rim is connected to the entrance`)
      if(level.downstairs)assert(safe.stair>=30,`seed ${seed}: no short-circuit route`)
      assert.equal(level.tiles,m.flat().filter(t=>t==='cavefloor2').length)
    }
  }
  assert.equal(run('TILE.mineshaftrope.walk'),false)
  assert.equal(run('RENDER_STYLE.terrainTiles.mineshaftrope.image'),'img/tiles/mine-shaft-rope.svg')
  assert.equal(run('new Set(Object.values(TILE_CODE)).size===Object.keys(TILE_CODE).length'),true,
    'new rope tile has a unique save-grid encoding')
  console.log('PASS aligned four-/five-floor cage shafts: fixed seeds, stair clearance, reachability, tile rendering and deterministic RNG')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
