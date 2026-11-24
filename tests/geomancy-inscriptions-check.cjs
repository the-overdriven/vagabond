'use strict'
const assert=require('node:assert/strict')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const copy=s=>JSON.parse(JSON.stringify(run(s)))
;(async()=>{
  await run('loadContent()')
  context.fixture=require('./saves/Tester_start.json')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
    player.inventory=[];player.equip={weapon:null,armor:null,shield:null};
    player.wayfaring=ArtifactWayfaring.freshState();
    currentZ=0;map=surfaceMap;turnCount=100;
    groundItems=[];npcs=[];enemies=[];occupied=new Set();
    globalThis.messages=[];log=t=>messages.push(t);
    globalThis.gem=id=>({...makeArtifactTrinket('Stone',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id),identified:true});
    globalThis.place=()=>{for(let y=5;y<MAP_H-5;y++)for(let x=5;x<MAP_W-5;x++){
      if(TILE[map[y]?.[x]]?.walk && DIRS8.every(([dx,dy])=>TILE[map[y+dy]?.[x+dx]]?.walk)){
        player.x=x;player.y=y;return true
      }
    }return false};`)
  assert.equal(run('place()'),true)
  run(`player.inventory=[gem('runic_fuse'),{kind:'scrollOfFear',name:'Scroll of Fear',count:2},
    {kind:'scrollOfChaos',name:'Scroll of Chaos',count:1}];ensureReplayItemIds();
    globalThis.runeId=player.inventory[0].replayId;
    globalThis.fearId=player.inventory[1].replayId;
    globalThis.chaosId=player.inventory[2].replayId;
    globalThis.choice={op:'inscribe',scrollReplayId:fearId};`)
  assert.equal(run('ArtifactGeomancy.activate(0,{op:"inscribe",scrollReplayId:"missing"})'),false,'invalid scroll is a no-op')
  assert.equal(run('turnCount'),100)
  assert.equal(run('ArtifactGeomancy.serialize().rune'),null)
  assert.equal(run('ArtifactGeomancy.activate(0,choice)'),true)
  assert.equal(run('turnCount'),101,'one inscription turn')
  assert.equal(run('player.inventory.find(i=>i.replayId===fearId).count'),1)
  assert.equal(run('ArtifactGeomancy.cooldownRemaining("runic_fuse")'),499)
  const armed=copy('ArtifactGeomancy.serialize().rune')
  assert.equal(armed.kind,'scrollOfFear')
  assert.equal(run('ArtifactGeomancy.onEnemyEntered({alive:true,hp:1},0,0)'),false,'invalid actor cannot trigger')
  // Replacing a rune can only happen after recharge; an invalid attempt cannot overwrite it.
  assert.equal(run('ArtifactGeomancy.activate(0,{op:"inscribe",scrollReplayId:chaosId})'),false)
  assert.deepEqual(copy('ArtifactGeomancy.serialize().rune'),armed)
  context.saved=copy('buildSaveObject()')
  run('loadGameFromObject(structuredClone(saved),{isReplayInit:true})')
  assert.deepEqual(copy('ArtifactGeomancy.serialize().rune'),armed,'save restores rune at exact Z')
  // Enemy already nearby at inscription does not trigger until a real entry.
  run(`globalThis.foe=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,name:'Goblin',baseName:'Goblin',
    level:0,levelKind:'surface',x:player.x+1,y:player.y+1,hp:60,maxHp:60,alive:true,tier:1});
    player.wayfaring.cooldowns.runic_fuse=0;`)
  assert.equal(run('ArtifactGeomancy.serialize().rune !== null'),true)
  assert.equal(run('ArtifactGeomancy.onEnemyEntered(foe,foe.x,foe.y)'),false,'existing neighbor not trigger')
  run('foe.x=player.x+1;foe.y=player.y;')
  assert.equal(run('ArtifactGeomancy.onEnemyEntered(foe,player.x+1,player.y+1)'),true)
  assert.equal(run('ArtifactGeomancy.serialize().rune'),null,'disarmed before effect')
  assert.equal(run('foe.fearTurns>0'),true,'Fear resolved using shared spell core')
  assert.equal(run('ArtifactGeomancy.onEnemyEntered(foe,player.x+1,player.y+1)'),false,'no double fire')
  // Chaos excludes player and reuses its deterministic displacement core.
  run(`enemies=[];occupied=new Set();player.wayfaring.cooldowns.runic_fuse=0;
    player.inventory[0].identified=true;
    globalThis.second={op:'inscribe',scrollReplayId:chaosId}`)
  assert.equal(run('ArtifactGeomancy.activate(0,second)'),true)
  context.origin=copy('({x:player.x,y:player.y})')
  run(`globalThis.foe2=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,name:'Goblin',baseName:'Goblin',
    level:0,levelKind:'surface',x:player.x+1,y:player.y,hp:60,maxHp:60,alive:true,tier:1});`)
  assert.equal(run('ArtifactGeomancy.onEnemyEntered(foe2,foe2.x,foe2.y-1)'),true)
  assert.deepEqual(copy('({x:player.x,y:player.y})'),context.origin,'rune Chaos never transports player')
  // Aegis is attached to one exact shield, independent of copies or cooldown.
  run(`player.wayfaring.cooldowns.runebound_aegis=0;
    player.equip.shield={kind:'shield',name:'Buckler',base:'Buckler',def:2};
    player.inventory=[gem('runebound_aegis'),{kind:'scrollOfFear',name:'Scroll of Fear',count:1}];
    ensureReplayItemIds();globalThis.shieldId=player.inventory[1].replayId;`)
  assert.equal(run('ArtifactGeomancy.activate(0,{op:"inscribe",scrollReplayId:shieldId})'),true)
  assert.equal(run('player.equip.shield.geomancyAegis.kind'),'scrollOfFear')
  assert.equal(run('player.inventory.some(i=>i.kind==="scrollOfFear")'),false)
  context.aegisSaved=copy('buildSaveObject()')
  run('loadGameFromObject(structuredClone(aegisSaved),{isReplayInit:true})')
  assert.equal(run('player.equip.shield.geomancyAegis.kind'),'scrollOfFear')
  assert.equal(run('ArtifactGeomancy.releaseAegis()'),true)
  assert.equal(run('player.equip.shield.geomancyAegis'),undefined)
  assert.equal(run('ArtifactGeomancy.releaseAegis()'),false,'spent shield never repeats')
  // A prepared Fireball freezes its cross shape and Aftershock condition.
  // Removing the two passive trinkets must not change an already cut rune.
  run(`player.wayfaring.cooldowns={};player.hp=500;player.maxHp=500;
    currentZ=0;map=surfaceMap;player.x=40;player.y=40;
    enemies=[];occupied=new Set();npcs=[];groundItems=[];
    for(let y=34;y<=46;y++)for(let x=34;x<=46;x++)surfaceMap[y][x]='grass';
    player.inventory=[gem('runic_fuse'),gem('burst_bending'),gem('aftershock'),createItem('scrollOfFireball')];
    ensureReplayItemIds();globalThis.fireId=player.inventory[3].replayId;`)
  assert.equal(run('ArtifactGeomancy.activate(0,{op:"inscribe",scrollReplayId:fireId})'),true)
  const fireRune=copy('ArtifactGeomancy.serialize().rune')
  assert.equal(fireRune.tiles.length,17)
  assert.equal(fireRune.cross,true)
  assert.equal(fireRune.aftershock,true)
  run(`player.inventory.splice(1,2);
    globalThis.fireFoe=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,name:'Goblin',baseName:'Goblin',
      level:0,levelKind:'surface',x:player.x+1,y:player.y,hp:300,maxHp:300,alive:true,tier:1});`)
  const playerBeforeFire=run('player.hp')
  assert.equal(run('ArtifactGeomancy.onEnemyEntered(fireFoe,fireFoe.x,fireFoe.y-1)'),true)
  assert.equal(run('player.hp<'+playerBeforeFire),true,'rune fireball damages its creator')
  assert.equal(run('ArtifactGeomancy.serialize().aftershocks.length>0'),true,'prepared Aftershock survives trinket removal')
  assert.equal(run('ArtifactGeomancy.serialize().rune'),null)
  console.log('PASS Runic Fuse and Runebound Aegis: validation, consumables, rune trigger, Chaos, saves')
})().catch(e=>{console.error(e);process.exitCode=1})
