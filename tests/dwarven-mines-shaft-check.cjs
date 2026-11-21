'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const fs=require('node:fs'),path=require('node:path')
const plain=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  for(const [seed,count] of [[610061,4],[610063,5],[554433,4],[224466,5]]){
    run(`WORLD_SEED=${seed};rngState=WORLD_SEED;applyWorldTraits([],'XS')`)
    const generated=run(`(()=>{
      const mine=[]
      for(let index=0;index<${count};index++){
        let level=null
        for(let attempt=0;attempt<80&&!level;attempt++)
          level=mineFloorCandidate(index,${count},index ? mine[index-1].mineDownstairs : {x:Math.floor(MAP_W/2),y:Math.floor(MAP_H/2)})
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
      if(index)assert.deepEqual(JSON.parse(JSON.stringify(level.upstairs)),JSON.parse(JSON.stringify(generated.levels[index-1].downstairs)),`seed ${seed}: paired stairs have identical coordinates`)
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
  // Use the actual saved Ruins geometry, independently of missing portrait assets.
  context.mineFixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  for(const [seed,count] of [[610061,4],[610063,5]]){
    run(`loadGameFromObject(structuredClone(mineFixture),{isReplayInit:true});
      log=()=>{};replayAnimationsDisabled=true;replayRecording=false;
      enemies=[];groundItems=[];occupied=new Set();rngState=${seed};
      minePackageConfig().floorCountWeights=${count===4?'[1,0]':'[0,1]'}`)
    assert(run('buildDwarvenMinesStratum()'))
    assert.equal(run('dungeonPackageLevels("dwarvenMines").length'),count)
    run(`rotateGeneratedWorld(1);
      var placeMineTest=(z,point)=>{currentZ=z;currentCave=-1;
        map=depthUndergroundMap(chainDepthForZ(z));undergroundDiscovered=depthUndergroundDiscovered(chainDepthForZ(z));
        player.x=point.x;player.y=point.y;rebuildActiveLevelOccupancy()};
      var testTransitions=()=>{const mine=dungeonPackageLevels('dwarvenMines'),ruins=dungeonPackageLevels('dwarvenRuins').at(-1);
        return [{from:ruins.z,to:-9,point:mine[0].level.mineUpstairs},
          ...mine.slice(0,-1).map(({z,level})=>({from:z,to:z-1,point:level.mineDownstairs}))]}`)
    for(const t of plain(run('testTransitions()'))){
      context.mineTestTransition=t
      run(`var t=mineTestTransition;placeMineTest(t.from,t.point);
        if(map[player.y][player.x]==='dwarvenminessealed')map[player.y][player.x]='dwarvenminesopen';
        var templateRat=ENEMY_TEMPLATE_BY_NAME['Giant Rat'];
        var testRat=addEnemy({...templateRat,baseName:templateRat.name,x:t.point.x,y:t.point.y,
          level:t.to,levelKind:'chain',alive:true,hp:templateRat.hp,maxHp:templateRat.hp})`)
      const rng=run('rngState')
      assert(await run('enterCave()'))
      assert.deepEqual(plain(run('({x:player.x,y:player.y,z:currentZ})')),{...t.point,z:t.to})
      assert(run('testRat.x!==player.x || testRat.y!==player.y'),'occupant gives way')
      assert(run('occupied.has(keyXY(testRat.x,testRat.y))'),'displaced monster is indexed on the destination floor')
      assert.equal(run('rngState'),rng)
      assert(await run('enterCave()'))
      assert.deepEqual(plain(run('({x:player.x,y:player.y,z:currentZ})')),{...t.point,z:t.from})
    }
    context.mineSnapshot=plain(run('buildSaveObject()'))
    run('loadGameFromObject(mineSnapshot,{isReplayInit:true})')
    assert(run('testTransitions().every(t=>depthUndergroundMap(chainDepthForZ(t.to))[t.point.y][t.point.x]==="minestairsup")'))
  }
  assert.equal(run('TILE.mineshaftrope.walk'),false)
  assert.equal(run('RENDER_STYLE.terrainTiles.mineshaftrope.image'),'img/tiles/mine-shaft-rope.svg')
  assert.equal(run('new Set(Object.values(TILE_CODE)).size===Object.keys(TILE_CODE).length'),true,
    'new rope tile has a unique save-grid encoding')
  console.log('PASS aligned four-/five-floor cage shafts: fixed seeds, stair clearance, reachability, tile rendering and deterministic RNG')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
