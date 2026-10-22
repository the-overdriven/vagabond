'use strict'

const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    enemies=[];occupied=new Set();turnCount=60;currentZ=0;currentCave=-1;map=surfaceMap;
    player.x=40;player.y=40;player.invisibleTurns=0;player.godInvisible=false;
    log=()=>{};spawnDamageNumber=()=>{};chance=()=>true;
    playerHiddenFromEnemy=()=>false;playerInsideSanctuary=()=>false;
    enemyInsideSanctuary=()=>false;enemyHasSight=()=>true;
    undergroundTileVisible=()=>true;
    enemyAttackPlayer=(e,oneOnly)=>{globalThis.attacks.push({name:e.name,oneOnly})};
    globalThis.attacks=[];
    for(let y=35;y<=45;y++)for(let x=35;x<=45;x++)map[y][x]='grass';
    const t=ENEMY_TEMPLATE_BY_NAME.Marsutal;
    globalThis.burrower=addEnemy({...t,name:'Marsutal',baseName:'Marsutal',
      x:42,y:40,homeX:42,homeY:40,homeTileType:'grass',alive:true,
      level:0,levelKind:null,hp:t.hp,maxHp:t.hp,equipment:null});
    occupied.add(keyXY(42,40));`)
  assert.equal(run('ENEMY_TELEGRAPH_CONFIG.burrow.undergroundTurns'),2)
  assert.equal(run('tryPrepareEnemyBurrow(burrower)'),true)
  const prepared=plain(run('burrower.pendingAbility'))
  assert.equal(prepared.type,'burrow')
  assert.deepEqual(prepared.tiles,[],'destination is never published as a warning tile')
  assert.deepEqual(prepared.origin,{x:42,y:40})
  assert.equal(run('occupied.has(keyXY(42,40))'),false,'origin is vacated immediately')
  assert.equal(run('burrower.x===-1 && burrower.y===-1'),true,'monster is off-map underground')
  assert.equal(run('enemyCanBeSeen(burrower)'),false)
  const originClue=plain(run(`(()=>{
    const drawn=[],previous=ctx.ellipse,previousMode=USE_TILE_IMAGES
    const previousCamX=camX,previousCamY=camY
    try {
      camX=35;camY=35
      ctx.ellipse=(x,y)=>drawn.push({x,y})
      USE_TILE_IMAGES=true;drawEnemyTelegraphWarnings(null)
      USE_TILE_IMAGES=false;drawEnemyTelegraphWarnings(null)
    } finally {ctx.ellipse=previous;USE_TILE_IMAGES=previousMode;
      camX=previousCamX;camY=previousCamY}
    return drawn
  })()`))
  assert.equal(originClue.length,2,'origin ground disturbance renders in tile and ASCII modes')
  assert.deepEqual(originClue[0],originClue[1],'both modes reveal only the same origin clue')
  const frozenRng=run('rngState')
  assert.equal(run('turnCount=61;resolveEnemyTelegraphIfPending(burrower)'),true)
  assert.equal(run('turnCount=62;resolveEnemyTelegraphIfPending(burrower)'),true)
  assert.equal(run('burrower.x'),-1,'no emergence during either full player response')
  assert.deepEqual(plain(run('globalThis.attacks')),[])
  assert.equal(run('rngState'),frozenRng,'underground waiting never consumes RNG')

  context.saved=plain(run('buildSaveObject()'))
  assert.equal(context.saved.enemies.find(e=>e.id===run('burrower.id')).x,-1)
  run('loadGameFromObject(saved,{isReplayInit:true});globalThis.burrower=enemies.find(e=>e.baseName===\'Marsutal\')')
  assert.deepEqual(plain(run('burrower.pendingAbility')),prepared,'pending origin and destination survive save')
  assert.equal(run('occupied.has(keyXY(42,40))'),false,'load does not reoccupy burrow origin')
  assert.equal(run('occupied.has(keyXY(-1,-1))'),false,'load never occupies off-map sentinel')
  assert.equal(run('rngState'),frozenRng,'restoration preserves RNG')
  assert.equal(run('turnCount=63;resolveEnemyTelegraphIfPending(burrower)'),true)
  assert.equal(run('burrower.pendingAbility'),null)
  assert.equal(run('enemyAbilityCooldown(burrower,\'burrow\')'),6)
  assert.equal(run('occupied.has(keyXY(burrower.x,burrower.y))'),true)
  assert.equal(plain(run('globalThis.attacks')).length,1,'successful emergence strikes once')
  assert.equal(plain(run('globalThis.attacks'))[0].oneOnly,true)

  // Player can use the vacated origin. If both origin and target are occupied,
  // the hidden monster returns to a stable nearby tile without attacking.
  run(`occupied.delete(keyXY(burrower.x,burrower.y));
    burrower.x=42;burrower.y=40;occupied.add(keyXY(42,40));
    burrower.abilityCooldowns.burrow=0;turnCount=80;
    player.x=40;player.y=40;globalThis.attacks=[];`)
  assert.equal(run('tryPrepareEnemyBurrow(burrower)'),true)
  run(`player.x=42;player.y=40;
    const target=burrower.pendingAbility.destination;
    globalThis.blocker=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Glaber,
      name:'Glaber',baseName:'Glaber',x:target.x,y:target.y,level:0,
      alive:true,homeX:target.x,homeY:target.y});
    occupied.add(keyXY(target.x,target.y));
    turnCount=83;resolveEnemyTelegraphIfPending(burrower)`)
  assert.equal(run('burrower.pendingAbility'),null)
  assert.equal(run('Math.max(Math.abs(burrower.x-42),Math.abs(burrower.y-40))<=1'),true)
  assert.equal(run('burrower.x===player.x && burrower.y===player.y'),false)
  assert.deepEqual(plain(run('globalThis.attacks')),[],'blocked landing never grants a hit')

  // There must be no forced overlap if both the destination and every
  // fallback tile close at once. Retrying later must not reroll a destination.
  run(`occupied.delete(keyXY(burrower.x,burrower.y));
    burrower.x=42;burrower.y=40;occupied.add(keyXY(42,40));
    burrower.abilityCooldowns.burrow=0;turnCount=90;player.x=40;player.y=40;`)
  assert.equal(run('tryPrepareEnemyBurrow(burrower)'),true)
  const postponed=plain(run('burrower.pendingAbility.destination'))
  run(`for(let y=39;y<=41;y++)for(let x=41;x<=43;x++)map[y][x]='cavewall';
    turnCount=93;resolveEnemyTelegraphIfPending(burrower)`)
  assert.equal(run('burrower.x'),-1,'no valid return tile leaves the monster safely buried')
  assert.equal(run('enemyAbilityCooldown(burrower,\'burrow\')'),0)
  assert.deepEqual(plain(run('burrower.pendingAbility.destination')),postponed,
    'the private landing target is never rerolled')
  run(`map[40][42]='grass';turnCount=94;resolveEnemyTelegraphIfPending(burrower)`)
  assert.equal(run('burrower.x===42 && burrower.y===40'),true,'returns when a valid tile reopens')
  assert.equal(run('enemyAbilityCooldown(burrower,\'burrow\')'),6)

  run(`burrower.abilityCooldowns.burrow=0;turnCount=95;
    player.x=40;player.y=40;
    for(let y=39;y<=41;y++)for(let x=41;x<=43;x++)map[y][x]='grass'`)
  assert.equal(run('tryPrepareEnemyBurrow(burrower)'),true)
  run('currentZ=-1;cancelPreparedEnemyAbilitiesOutsideFloor()')
  assert.equal(run('burrower.pendingAbility'),null,'leaving the floor cancels underground travel')
  assert.equal(run('burrower.x===42 && burrower.y===40'),true,'off-floor cancellation restores the origin')
  assert.equal(run('enemyAbilityCooldown(burrower,\'burrow\')'),6)
  run('currentZ=0')

  run(`enemies=[];occupied=new Set();turnCount=100;player.x=40;player.y=40;
    const tro=ENEMY_TEMPLATE_BY_NAME.Trogloraptor;
    globalThis.ambusher=addEnemy({...tro,name:'Trogloraptor',baseName:'Trogloraptor',
      x:41,y:40,level:0,levelKind:null,alive:true,hp:tro.hp,maxHp:tro.hp,
      wallAmbushHidden:true,wallAmbushSpent:false,equipment:null});
    occupied.add(keyXY(41,40));globalThis.attacks=[];`)
  assert.equal(run('enemyCanBeSeen(ambusher)'),false)
  assert.equal(run('tryPrepareEnemyWallAmbush(ambusher)'),true)
  assert.equal(run('enemyCanBeSeen(ambusher)'),false,'warning does not reveal the hidden creature')
  assert.equal(run('turnCount=101;resolveEnemyTelegraphIfPending(ambusher)'),true)
  assert.equal(run('enemyCanBeSeen(ambusher)'),true)
  assert.equal(plain(run('globalThis.attacks')).length,1,'warned ambush attacks immediately')
  assert.equal(plain(run('globalThis.attacks'))[0].oneOnly,true)
  assert.equal(run('ambusher.wallAmbushSpent'),true)

  run(`ambusher.wallAmbushHidden=true;ambusher.wallAmbushSpent=false;
    ambusher.pendingAbility=null;globalThis.attacks=[];turnCount=110;
    revealEnemyWallAmbush(ambusher,true)`)
  assert.equal(run('ambusher.wallAmbushNoActionTurn'),111,'bumping grants no counterattack')
  assert.deepEqual(plain(run('globalThis.attacks')),[])
  run('enemyTurn()')
  assert.equal(run('turnCount'),111)
  assert.deepEqual(plain(run('globalThis.attacks')),[],
    'the real enemy loop respects the no-counterattack bump turn')

  run(`enemies=[];occupied=new Set();turnCount=200;player.x=40;player.y=40;
    player.hp=1000;globalThis.attacks=[];
    const marsutal=ENEMY_TEMPLATE_BY_NAME.Marsutal;
    globalThis.turnBurrower=addEnemy({...marsutal,name:'Marsutal',baseName:'Marsutal',
      x:42,y:40,level:0,alive:true,hp:marsutal.hp,maxHp:marsutal.hp});
    markEnemyAbility(turnBurrower,'burrow',[],{origin:{x:42,y:40},
      destination:{x:41,y:40}});
    turnBurrower.x=-1;turnBurrower.y=-1;`)
  run('enemyTurn()')
  assert.equal(run('turnBurrower.x'),-1,'first real enemy phase remains underground')
  run('enemyTurn()')
  assert.equal(run('turnBurrower.x'),-1,'second real enemy phase remains underground')
  run('enemyTurn()')
  assert.equal(run('turnBurrower.x'),41,'third real enemy phase emerges')
  assert.equal(plain(run('globalThis.attacks')).length,1,'actual turn loop grants one emergence attack')
  console.log('PASS Burrow hide/timing/fallback/save/replay and Wall Ambush warning/reveal/bump')
})().catch(error=>{console.error(error.stack);process.exitCode=1})
