'use strict'
const assert=require('node:assert/strict')
const fs=require('node:fs')
const path=require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const plain=value=>JSON.parse(JSON.stringify(value))

;(async()=>{
  await run('loadContent()')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  run(`loadGameFromObject(fixture,{isReplayInit:true});
    turnCount=40;enemies=[];log=()=>{};replayAnimationsDisabled=true;
    spawnDamageNumber=()=>{};beginEnemyAttackAnim=()=>({delay:0});
    player.godMode=false;player.invisibleTurns=0;player.godInvisible=false;
    player.hp=1000;player.x=40;player.y=40;
    enemyInsideSanctuary=()=>false;playerInsideSanctuary=()=>false;
    enemyHasSight=()=>true;enemyIsVisibleOnMainView=()=>true;
    enemyAttackPlayer=()=>false;enemyStepTowardPlayer=()=>false;
    for(let y=36;y<=44;y++)for(let x=36;x<=44;x++)map[y][x]='grass';
    let tmpl=ENEMY_TEMPLATE_BY_NAME.Duiwel;
    duiwel=addEnemy({...tmpl,baseName:'Duiwel',maxHp:tmpl.hp,hp:tmpl.hp,
      x:42,y:40,level:0,levelKind:null,alive:true,aware:true,
      homeX:42,homeY:40,homeTileType:'grass',equipment:null});
    actualChance=chance;chance=()=>true;
  `)
  assert(run("ENEMY_TEMPLATE_BY_NAME.Duiwel.abilities.includes('rupture')"))
  assert(!run("ENEMY_TEMPLATE_BY_NAME.Glaber.abilities.includes('rupture')"),
    'generic behavior is only opt-in')
  assert.equal(run('duiwel.pendingAbility'),null,'pending ability starts clear')
  assert.equal(run('enemyAbilityCooldown(duiwel,"rupture")'),0)
  assert(run('ENEMY_TELEGRAPH_CONFIG.rupture.cooldownTurns===5'))
  assert.equal(run('ENEMY_TELEGRAPH_CONFIG.rupture.damageMultiplier'),3.75,
    'Duiwel eruption uses triple its former 1.25 ATK multiplier')

  run('enemyTurn()')
  const warning=plain(run('duiwel.pendingAbility'))
  assert.equal(warning.type,'rupture')
  assert.equal(warning.preparedTurn,41)
  assert.equal(warning.tiles.length,3,'player tile plus two random legal tiles')
  assert.deepEqual(warning.tiles[0],{x:40,y:40},'warning targets preparation-time position')
  assert.equal(new Set(warning.tiles.map(p=>`${p.x},${p.y}`)).size,3,'no duplicate tiles')
  assert.equal(run('ruptureHasHypotheticalEscape(duiwel.pendingAbility.tiles)'),true)
  assert.equal(run('enemyAbilityCooldown(duiwel,"rupture")'),0,'preparation does not start cooldown')
  run('USE_TILE_IMAGES=true;drawEnemyTelegraphWarnings(null);drawEnemyTelegraphWarnings(null,true);USE_TILE_IMAGES=false;drawEnemyTelegraphWarnings(null);drawEnemyTelegraphWarnings(null,true)')
  const emptySpot=plain(run(`DIRS8.map(([dx,dy])=>({x:40+dx,y:40+dy})).find(p=>
    !ruptureMarkedTiles().has(keyXY(p.x,p.y)) && (p.x!==duiwel.x||p.y!==duiwel.y))`))
  assert(emptySpot,'the warning always has an available escape')
  run(`player.x=${emptySpot.x};player.y=${emptySpot.y};chance=()=>false;enemyTurn()`)
  assert.equal(run('duiwel.pendingAbility'),null,'warning resolves after one player action')
  assert.equal(run('player.hp'),1000,'leaving all warned tiles avoids all damage')
  assert.equal(run('enemyAbilityCooldown(duiwel,"rupture")'),5,'resolution starts cooldown')
  for(let t=4;t>=0;t--){
    run('enemyTurn()')
    assert.equal(run('enemyAbilityCooldown(duiwel,"rupture")'),t,
      'cooldown decrements only on complete subsequent active-floor turns')
  }

  // A fixed warning never follows the player; it deals one ordinary damage
  // roll, even if several marked tiles overlap a single player position.
  run('chance=()=>true;player.x=40;player.y=40;turnCount=80;enemyTurn()')
  assert(run('duiwel.pendingAbility !== null'))
  run('damageRoll=()=>17;chance=()=>true;enemyTurn()')
  assert.equal(run('player.hp'),983,'one hit with no additional evasion roll or double damage')
  assert.equal(run('enemyAbilityCooldown(duiwel,"rupture")'),5)

  // Only this Rupture harms other monsters. Ground targets take independent
  // DEF rolls even when the player escaped; airborne/ethereal targets and the
  // caster are immune. Environmental deaths still use ordinary loot handling.
  run(`player.x=35;player.y=35;
    makeRuptureTarget=(name,abilities,x,y)=>{
      const t=ENEMY_TEMPLATE_BY_NAME[name];
      return addEnemy({...t,baseName:t.name,abilities,x,y,level:0,levelKind:null,
        hp:t.hp,maxHp:t.hp,homeX:x,homeY:y,homeTileType:'grass',
        alive:true,sleeping:false,equipment:null,aware:true});
    };
    ruptureGround=makeRuptureTarget('Giant Rat',[],39,40);
    ruptureFlying=makeRuptureTarget('Giant Bat',['fly'],40,39);
    ruptureEthereal=makeRuptureTarget('Ghost',['ethereal'],41,40);
    ruptureOther=makeRuptureTarget('Goblin',[],39,41);
    ruptureLootCalls=[];lootFromEnemy=target=>ruptureLootCalls.push(target.id);
    ruptureDamageRolls=[];damageRoll=(attack,defense)=>{
      ruptureDamageRolls.push({attack,defense});return 10000
    };
    ruptureKillsBefore=player.kills;
    ruptureXpBefore=player.totalXpEarned;
    ruptureDuiwelHp=duiwel.hp;
    ruptureFlyHp=ruptureFlying.hp;
    ruptureEtherealHp=ruptureEthereal.hp;
    resolveEnemyRupture(duiwel,{tiles:[{x:39,y:40},{x:40,y:39},{x:41,y:40},{x:39,y:41},{x:42,y:40}]});`)
  assert.equal(run('ruptureGround.alive'),false,'grounded Rat dies to Duiwel Rupture')
  assert.equal(run('ruptureOther.alive'),false,'all marked grounded monsters are independently hit')
  assert.equal(run('ruptureFlying.hp'),run('ruptureFlyHp'),'flying monsters are immune')
  assert.equal(run('ruptureEthereal.hp'),run('ruptureEtherealHp'),'ethereal monsters are immune')
  assert.equal(run('duiwel.hp'),run('ruptureDuiwelHp'),'caster is immune to its own eruption')
  assert.equal(run('player.kills'),run('ruptureKillsBefore'),'eruption gives no player kill credit')
  assert.equal(run('player.totalXpEarned'),run('ruptureXpBefore'),'eruption gives no XP')
  assert.equal(run('ruptureLootCalls.length'),2,'environmental kills still invoke normal loot')
  assert.equal(run('ruptureDamageRolls.length'),2,'only eligible targets consume damage rolls')

  // Countdown freezes off-floor and survives replay snapshots exactly.
  run('duiwel.abilityCooldowns.rupture=3;duiwel.abilityCooldownStartedTurn= {rupture:turnCount-1}')
  run('currentZ=-2;tickEnemyAbilityCooldowns()')
  assert.equal(run('duiwel.abilityCooldowns.rupture'),3)
  run('currentZ=0;tickEnemyAbilityCooldowns()')
  assert.equal(run('duiwel.abilityCooldowns.rupture'),2)
  run('duiwel.abilityCooldowns.rupture=0;markEnemyAbility(duiwel,"rupture",[{x:40,y:40}])')
  context.saved=plain(run('buildSaveObject()'))
  const expected=context.saved.enemies.find(e=>e.id===run('duiwel.id'))
  const rng=run('rngState')
  run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.equal(run('rngState'),rng,'replay restore consumes no RNG')
  const restored=plain(run('enemies.find(e=>e.id===saved.enemies.find(x=>x.baseName==="Duiwel").id)'))
  for(const key of ['pendingAbility','abilityCooldowns','abilityCooldownStartedTurn'])
    assert.deepEqual(restored[key],expected[key],`${key} round-trips exactly`)

  // A departure cancels old attacks and applies cooldown so returning cannot
  // make a stale warning explode. Caster death clears its warning too.
  run('currentZ=-1;map=undergroundMap;cancelPreparedEnemyAbilitiesOutsideFloor()')
  assert.equal(run('enemies.find(e=>e.baseName==="Duiwel").pendingAbility'),null)
  assert.equal(run('enemies.find(e=>e.baseName==="Duiwel").abilityCooldowns.rupture'),5)
  run(`currentZ=0;map=surfaceMap;
    restoredDuiwel=enemies.find(e=>e.baseName==='Duiwel');
    markEnemyAbility(restoredDuiwel,'rupture',[{x:40,y:40}]);
    cancelPreparedEnemyAbility(restoredDuiwel);restoredDuiwel.alive=false`)
  assert.equal(run('restoredDuiwel.pendingAbility'),null)

  // A completely blocked player position never becomes a guaranteed hit.
  run(`restoredDuiwel.alive=true;restoredDuiwel.abilityCooldowns.rupture=0;
    player.x=40;player.y=40;restoredDuiwel.x=42;restoredDuiwel.y=40;
    for(const [dx,dy] of DIRS8)map[40+dy][40+dx]='cavewall';
    chance=()=>true`)
  assert.equal(run('tryPrepareEnemyRupture(restoredDuiwel)'),false)
  assert.equal(run('restoredDuiwel.pendingAbility'),null)
  assert.equal(run('restoredDuiwel.abilityCooldowns.rupture'),0,'failed preparation is free')
  console.log('PASS generic Rupture: warning/readability, response turn, avoid/hit, cooldown, floor pause, save/replay, cancellation, escape')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
