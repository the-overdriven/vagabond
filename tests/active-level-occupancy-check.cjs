'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')

  assert(run("ENEMY_TEMPLATE_BY_NAME.Glaber.abilities.includes('blind')"),
    'Glaber is a blind mole and must sense invisible players')

  run(`loadGameFromObject(fixture,{isReplayInit:true});
    currentZ=-3;currentCave=-1;map=depthUndergroundMap(3);
    undergroundDiscovered=depthUndergroundDiscovered(3);
    player.x=40;player.y=40;player.hp=1000;player.godMode=false;
    player.invisibleTurns=8;turnCount=100;enemies=[];occupied=new Set();
    log=()=>{};spawnDamageNumber=()=>{};replayAnimationsDisabled=true;
    for(let y=39;y<=41;y++)for(let x=35;x<=45;x++)map[y][x]='dwarvenwall';
    for(let x=35;x<=45;x++)map[40][x]='marble';
    const batTemplate=ENEMY_TEMPLATE_BY_NAME['Giant Bat'];
    offFloorBat=addEnemy({...batTemplate,baseName:batTemplate.name,
      x:38,y:40,level:0,levelKind:null,alive:true,
      hp:batTemplate.hp,maxHp:batTemplate.hp,homeX:38,homeY:40,homeTileType:'grass'});
    addEnemy({...batTemplate,baseName:batTemplate.name,
      x:39,y:40,level:0,levelKind:null,alive:true,
      hp:batTemplate.hp,maxHp:batTemplate.hp,homeX:39,homeY:40,homeTileType:'grass'});
    const duiwelTemplate=ENEMY_TEMPLATE_BY_NAME.Duiwel;
    duiwel=addEnemy({...duiwelTemplate,baseName:duiwelTemplate.name,
      x:37,y:40,level:-3,levelKind:'chain',alive:true,
      hp:duiwelTemplate.hp,maxHp:duiwelTemplate.hp,homeX:37,homeY:40,
      homeTileType:'marble',aware:true,alarmed:true,alarmedZ:-3,
      alarmedLevelKind:'chain'});
    rebuildActiveLevelOccupancy()`)
  assert(!run('occupied.has(keyXY(38,40))'),
    'a surface monster does not block the matching underground coordinate')
  assert.equal(run('enemyFindStep(duiwel).x'),38,
    'Duiwel can advance along the mine corridor even with a surface bat there')
  assert.equal(run('playerHiddenFromEnemy(duiwel)'),false,
    'blind Duiwel detects an invisible player')
  assert.equal(run("playerHiddenFromEnemy({abilities:ENEMY_TEMPLATE_BY_NAME.Glaber.abilities})"),false,
    'Glaber also detects an invisible player')

  run('chance=()=>false;enemyTurn()')
  assert.equal(run('duiwel.x'),38,'Duiwel actually pursues when hesitation and Rupture do not proc')
  const rngBefore=run('rngState')
  run('rebuildActiveLevelOccupancy()')
  assert.equal(run('rngState'),rngBefore,'rebuilding occupancy uses no RNG')

  context.saved=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  run(`loadGameFromObject(saved,{isReplayInit:true});
    duiwel=enemies.find(e=>e.baseName==='Duiwel');
    offFloorBat=enemies.find(e=>e.baseName==='Giant Bat');
    // This synthetic corridor is test geometry, not a fort cave descriptor.
    for(let y=39;y<=41;y++)for(let x=35;x<=45;x++)map[y][x]='dwarvenwall';
    for(let x=35;x<=45;x++)map[40][x]='marble'`)
  assert.equal(run('rngState'),rngBefore,'save/replay restore does not consume RNG')
  assert(!run('occupied.has(keyXY(39,40))'),
    'restoring an underground save excludes the second bat on the surface')
  assert.equal(run('enemyFindStep(duiwel).x'),39,
    'restored Duiwel can still pursue along the same corridor')

  run('currentZ=0;currentCave=-1;map=surfaceMap;rebuildActiveLevelOccupancy()')
  assert(run('occupied.has(keyXY(38,40))'),
    'surface occupancy is restored when returning above ground')
  assert(run('occupied.has(keyXY(39,40))'),
    'multiple surface monsters retain their own positions')
  assert(run('occupied.has(keyXY(npcs[0].x,npcs[0].y))'),
    'surface NPCs block their tiles as usual')

  run('currentZ=-3;currentCave=-1;map=depthUndergroundMap(3);rebuildActiveLevelOccupancy()')
  assert(!run('occupied.has(keyXY(39,40))'),
    'floor transition removes unrelated surface occupancy again')
  run(`sameFloorBlocker=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Glaber,
    baseName:'Glaber',x:39,y:40,level:-3,levelKind:'chain',alive:true,
    hp:100,maxHp:100,homeX:39,homeY:40,homeTileType:'marble'});
    rebuildActiveLevelOccupancy()`)
  assert(run('occupied.has(keyXY(39,40))'),'same-floor monster still occupies its tile')
  assert.equal(run('enemyFindStep(duiwel)'),null,
    'same-floor monster still physically blocks the one-tile corridor')
  run('sameFloorBlocker.alive=false')
  assert.equal(run('enemyFindStep(duiwel)'),null,
    'a dead monster can leave an obsolete occupied tile before reconciliation')
  run('chance=()=>false;enemyTurn()')
  assert.equal(run('duiwel.x'),39,
    'the next enemy turn clears ghost occupancy and resumes Duiwel pursuit')
  assert(run('occupied.has(keyXY(39,40))'),
    'the resumed pursuer owns its new tile in the reconciled occupancy set')
  console.log('PASS active-floor occupancy: cross-floor pursuit, invisible sensing, save/replay, surface NPCs, ghost-blocker recovery')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
