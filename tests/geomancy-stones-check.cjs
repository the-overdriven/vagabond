'use strict'
const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
const copy = code => JSON.parse(JSON.stringify(run(code)))

;(async () => {
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false;
    enemies=[];groundItems=[];npcs=[];occupied=new Set();
    turnCount=100;currentZ=0;currentCave=-1;map=surfaceMap;
    player.x=40;player.y=40;player.hp=playerMaxHp();
    player.wayfaring=ArtifactWayfaring.freshState();player.inventory=[];
    player.equip={weapon:null,armor:null,shield:null};
    for(let y=35;y<=45;y++)for(let x=35;x<=45;x++)surfaceMap[y][x]='grass';
    globalThis.messages=[];log=(msg)=>messages.push(msg);
    globalThis.gem=(id)=>({...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id),identified:true});
    player.inventory=[gem('stonemaker'),gem('stone_circle'),gem('resonance')];
    ArtifactGeomancy.resetWorld();`)
  assert.equal(run('ArtifactWayfaring.activeItem(player.inventory[0])'),false,
    'Geomancy active items must never dispatch through Wayfaring teleportation')
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),true)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('turnCount'),101,'Stonemaker spends one world turn')
  assert.equal(run('ArtifactGeomancy.serialize().stones.length'),1)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("stonemaker")'),499)
  assert.equal(run('messages.some(m=>m.includes("Stonemaker raises"))'),true)
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),false)
  assert.equal(copy('ArtifactGeomancy.availableCircleDirections()').length>0,true)
  const direction=copy('ArtifactGeomancy.availableCircleDirections()[0]')
  context.direction=direction
  assert.equal(run('ArtifactGeomancy.activate(1,direction)'),true)
  assert.equal(run('turnCount'),102,'Stone Circle spends precisely one world turn')
  assert.equal(run(`DIRS8.filter(([dx,dy])=>map[player.y+dy]?.[player.x+dx]==='boulder').length`),7,
    'Stone Circle leaves exactly one adjacent opening')
  assert.equal(run('ArtifactGeomancy.serialize().stones.length'),7)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("stone_circle")'),499)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("stonemaker")<499'),true,
    'Resonance shortens the other cooldown once')
  assert.equal(run('messages.some(m=>m.includes("Resonance hastens"))'),true,
    'a meaningful Resonance pulse gets one message')
  const saved=copy('buildSaveObject()')
  context.saved=saved
  assert.equal(saved.version,run('SAVE_VERSION'))
  assert.equal(saved.geomancyWorld.stones.length,7)
  const end=copy('ArtifactGeomancy.serialize()')
  run('loadGameFromObject(structuredClone(saved),{isReplayInit:true})')
  assert.deepEqual(copy('ArtifactGeomancy.serialize()'),end,'stone instances survive save/load')
  assert.equal(run('ArtifactGeomancy.serialize().stones.every(s=>map[s.y][s.x]==="boulder")'),true)
  run('for(let i=0;i<7;i++)enemyTurn()')
  assert.equal(run('ArtifactGeomancy.serialize().stones.length'),0,'expired rocks vanish on world turns')
  assert.equal(run('ArtifactGeomancy.serialize().stones.length===0 && saved.geomancyWorld.stones.every(s=>map[s.y][s.x]===s.underlay)'),true,
    'underlay is restored precisely on expiry')

  // A summoned obstacle is mineable but grants neither Mining XP nor Flint.
  run(`player.wayfaring.cooldowns={};player.miningTutorialSeen=true;
    player.inventory=[gem('stonemaker')];player.inventory.push(createItem('pickaxe'));
    player.x=40;player.y=40;turnCount=200;`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  const temporary=copy('ArtifactGeomancy.serialize().stones[0]')
  context.temporary=temporary
  run('globalThis.beforeMining=player.miningXpUnits;globalThis.beforeCount=player.minedSurfaceStones')
  assert.equal(run('Mining.canTarget(temporary.x,temporary.y)'),true)
  for(let i=0;i<6 && run('ArtifactGeomancy.serialize().stones.length');i++) {
    assert.equal(run('Mining.strike(temporary.x,temporary.y)'), 'strike')
  }
  assert.equal(run('ArtifactGeomancy.serialize().stones.length'),0)
  assert.equal(run('map[temporary.y][temporary.x]'),'grass')
  assert.equal(run('player.miningXpUnits===beforeMining && player.minedSurfaceStones===beforeCount'),true)

  // A natural underground boulder shares the existing cave-mask tile and
  // restores its local floor instead of a fabricated surface grass tile.
  run(`map=undergroundMap;currentZ=-1;currentCave=0;
    player.x=40;player.y=40;
    undergroundMap[40][40]='cavefloor';undergroundMap[40][41]='boulder';
    caveMaps[0][40][40]='cavefloor';caveMaps[0][40][41]='boulder';
    tileUnderlays['-1:41,40']='cavefloor';
    player.miningTutorialSeen=true;player.miningArmedTarget=null;
    player.inventory=[createItem('pickaxe')];
    player.hp=playerMaxHp();`)
  // Transparent underground PNG corners must show the *actual* floor
  // texture, not the boulder's solid tile background.
  assert.equal(run("overlayBaseTileKey('boulder',41,40,undergroundMap)"),'cavefloor')
  assert.equal(run("terrainVisual('boulder',41,40,undergroundMap).image.startsWith('img/tiles/boulder-underground-')"),true)
  run(`undergroundMap[40][42]='cavefloor2';undergroundMap[40][43]='boulder';
    tileUnderlays['-1:43,40']='cavefloor2';`)
  assert.equal(run("overlayBaseTileKey('boulder',43,40,undergroundMap)"),'cavefloor2')
  const {readFileSync}=require('node:fs')
  for(let i=1;i<=4;i++) {
    const png=readFileSync(require('node:path').join(__dirname,`../img/tiles/boulder-underground-${i}.png`))
    assert.equal(png.toString('ascii',1,4),'PNG')
    assert.equal(png.toString('ascii',25,26).charCodeAt(0),6,
      'all four boulder sprites must remain RGBA PNGs')
  }
  assert.equal(run('Mining.canTarget(41,40)'),true)
  for(let i=0;i<6&&run('map[40][41]')==='boulder';i++)
    assert.equal(run('Mining.strike(41,40)'),'strike')
  assert.equal(run('undergroundMap[40][41]'),'cavefloor')
  assert.equal(run('caveMaps[0][40][41]'),'cavefloor')
  assert.equal(run('tileUnderlays["-1:41,40"]'),undefined)
  // An identical item action from the same saved state must reproduce RNG,
  // turn count, stone identity, placement and the shared cooldown.
  run(`map=surfaceMap;currentZ=0;currentCave=-1;
    player.x=40;player.y=40;player.inventory=[gem('stonemaker')];
    player.wayfaring=ArtifactWayfaring.freshState();turnCount=300;
    for(let y=35;y<=45;y++)for(let x=35;x<=45;x++)map[y][x]='grass';
    ArtifactGeomancy.resetWorld();ensureReplayItemIds()`)
  const stateBefore=copy('buildSaveObject()')
  const id=run('player.inventory[0].replayId')
  const results=()=>copy(`({turnCount,rngState,stones:ArtifactGeomancy.serialize(),
    cooldown:ArtifactGeomancy.cooldownRemaining('stonemaker')})`)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  const expectedReplay=results()
  context.replaySave=stateBefore
  context.replayAction={type:'useItem',action:'geomancyPower',replayId:id}
  run('loadGameFromObject(structuredClone(replaySave),{isReplayInit:true})')
  await run('runReplayAction(replayAction)')
  assert.deepEqual(results(),expectedReplay,'replay reproduces placement, state and RNG')
  // Sounding Stone identifies motion, not the actor, through solid rock.
  // Its position markers survive save and vanish after the next turn.
  run(`map=surfaceMap;currentZ=0;player.x=40;player.y=40;turnCount=400;
    player.inventory=[gem('sounding_stone')];player.wayfaring=ArtifactWayfaring.freshState();
    enemies=[];ArtifactGeomancy.resetWorld();messages.length=0;
    globalThis.mover={id:'enemy_999',name:'Goblin',alive:true,hp:30,level:0,
      levelKind:'surface',x:43,y:40,abilities:[],tier:1};`)
  assert.equal(run('ArtifactGeomancy.canActivate(0)'),true)
  assert.equal(run('ArtifactGeomancy.activate(0)'),true)
  assert.equal(run('turnCount'),401)
  assert.deepEqual(copy('ArtifactGeomancy.soundingTraces()'),[],'idle enemies never make echoes')
  run('ArtifactGeomancy.recordEnemyMove(mover,42,40)')
  assert.deepEqual(copy('ArtifactGeomancy.soundingTraces().map(({x,y})=>({x,y}))'),[{x:43,y:40}])
  run('mover.x=44;ArtifactGeomancy.recordEnemyMove(mover,43,40)')
  assert.deepEqual(copy('ArtifactGeomancy.soundingTraces().map(({x,y})=>({x,y}))'),[{x:44,y:40}],
    'moving multiple times keeps one final echo rather than spamming')
  const logCount=run('messages.length')
  run('mover.x=45;ArtifactGeomancy.recordEnemyMove(mover,44,40)')
  assert.equal(run('messages.length'),logCount,'no per-step sound messages')
  const soundingSaved=copy('buildSaveObject()')
  assert.equal(soundingSaved.geomancyWorld.sounding.traces.length,1)
  context.soundingSaved=soundingSaved
  run('loadGameFromObject(structuredClone(soundingSaved),{isReplayInit:true})')
  assert.equal(run('ArtifactGeomancy.soundingTraces().length'),1,'sounding traces persist in the save')
  run('turnCount=402;ArtifactGeomancy.tick()')
  assert.deepEqual(copy('ArtifactGeomancy.soundingTraces()'),[],'only one world turn of detection')
  assert.equal(run('ArtifactGeomancy.serialize().sounding'),null)
  console.log('PASS Geomancy stones: activation, direction, expiry, resonance, save/load, mining and shared cave masks')
})().catch(err=>{console.error(err);process.exitCode=1})
