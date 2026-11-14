// Node-only geometry checks: the z:-2 shaft must sit directly above existing
// z:-3 Fort floor. No cave or Fort terrain may be excavated to make it fit.
const assert = require('node:assert/strict')
const {run} = require('./helpers/node-game-runtime.cjs')
const plain = value => JSON.parse(JSON.stringify(value))

;(async () => {
  await run('loadContent()')
  run(`MAP_W=30;MAP_H=30
    WORLD_GEN_CONFIG.caves.deep.fortHoleChance=1
    WORLD_GEN_CONFIG.caves.deep.fortHoleMinStairDistance=8
    enemies=[];groundItems=[];npcs=[]
    function setUpFortHoleGeometry() {
      const blank=()=>Array.from({length:MAP_H},()=>Array(MAP_W).fill('cavewall'))
      const upper=blank(),lower=blank(),lowerCave=blank()
      upper[15][5]='caveup'
      for(let x=6;x<=23;x++)upper[15][x]='cavefloor2'
      lower[15][20]='dwarvenfortexit'
      lowerCave[15][20]='dwarvenfortexit'
      for(let x=21;x<=23;x++){lower[15][x]='marble';lowerCave[15][x]='marble'}
      deepLevels=[{map:upper,caveMaps:[upper.map(row=>row.slice())],caves:[{entrances:[{x:5,y:15}]}]},
        {map:lower,caveMaps:[lowerCave],caves:[]}]
      dwarvenRuin={x:20,y:15,caveIndex:0,level:-3}
    }
    setUpFortHoleGeometry()`)
  for (const seed of [12345, 17632, 42618]) {
    run(`setUpFortHoleGeometry();rngState=${seed};WORLD_SEED=${seed}`)
    const before = plain(run('({fort:deepLevels[1].map,fortCave:deepLevels[1].caveMaps[0]})'))
    run('placeDwarvenFortHole()')
    const observed = plain(run(`(() => {
      const a=[]
      for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++)if(deepLevels[0].map[y][x]==='dwarvenhole')a.push({x,y})
      return {holes:a,fort:deepLevels[1].map,fortCave:deepLevels[1].caveMaps[0],
        strata:deepLevels[0].caveMaps[0],rng:rngState}
    })()`))
    assert.equal(observed.holes.length,1,`seed ${seed}: a real overlap must produce one hole`)
    const {x,y}=observed.holes[0]
    assert(x>=21&&x<=23&&y===15,`seed ${seed}: shaft lies above the actual Fort`)
    assert.equal(observed.fort[y][x],'marble')
    assert.equal(observed.strata[y][x],'dwarvenhole')
    assert.deepEqual({fort:observed.fort,fortCave:observed.fortCave},before,
      `seed ${seed}: no connecting corridor is carved on -3`)
    assert.equal(run(`ensureDwarvenFortHoleLanding(${x},${y})`),true)
    assert.equal(run(`deepLevels[1].map[15][24]`),'cavewall')
    assert.equal(run(`JSON.stringify(deepLevels[0].map)`),JSON.stringify(observed.strata))
  }

  run(`setUpFortHoleGeometry()
    deepLevels[1].map[15][21]='dwarvenwall'
    deepLevels[1].caveMaps[0][15][21]='dwarvenwall'
    deepLevels[0].map[15][22]='cavewall';deepLevels[0].caveMaps[0][15][22]='cavewall'
    deepLevels[0].map[15][23]='cavefloor2';deepLevels[0].caveMaps[0][15][23]='cavefloor2'
    rngState=12345`)
  const blockedBefore = plain(run('deepLevels[1].map'))
  assert.equal(run('ensureDwarvenFortHoleLanding(23,15)'),false,
    'a marble pocket behind a blocked wall is not an accessible Fort landing')
  assert.deepEqual(plain(run('deepLevels[1].map')),blockedBefore,
    'a failed landing validation must never excavate a wall')

  run(`setUpFortHoleGeometry()
    for(let x=21;x<=23;x++){deepLevels[1].map[15][x]='cavewall';deepLevels[1].caveMaps[0][15][x]='cavewall'}
    rngState=17632`)
  const noOverlapBefore = plain(run('deepLevels[1].map'))
  run('placeDwarvenFortHole()')
  assert.equal(run(`deepLevels[0].map.flat().filter(t=>t==='dwarvenhole').length`),0,
    'no hole when the grotto does not overlie existing Fort floor')
  assert.deepEqual(plain(run('deepLevels[1].map')),noOverlapBefore,
    'no long corridor may be created to rescue an incompatible world')

  run(`setUpFortHoleGeometry();groundItems=[{level:-3,x:21,y:15},{level:-3,x:22,y:15}]
    enemies=[{level:-3,alive:true,x:23,y:15}];rngState=42618`)
  run('placeDwarvenFortHole()')
  assert.equal(run(`deepLevels[0].map.flat().filter(t=>t==='dwarvenhole').length`),0,
    'occupied landing sites are rejected rather than displacing occupants')
  console.log('PASS fixed seeds 12345, 17632, 42618: aligned shafts; no corridors; blocked/occupied locations')
})().catch(error => {console.error(error.stack);process.exitCode=1})
