'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run,context}=require('./helpers/node-game-runtime.cjs')
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
const state=code=>JSON.parse(JSON.stringify(run(code)))
;(async()=>{
  await run('loadContent()')
  context.fixture=fixture
  run(`loadGameFromObject(fixture,{isReplayInit:true});replayRecording=false;
    replayAnimationsDisabled=true;raceOpen=false;log=()=>{};renderInventory=()=>{}`)
  run(fs.readFileSync(path.join(__dirname,'helpers/mimic-loot-checks.js'),'utf8'))
  run('checkMimicRareLoot(fixture)')
  console.log('PASS forced mimic flint/potato bonuses, save/replay restore and maze flint reward')
  // The saved world's real fort and ruins support additional ordinary chests.
  run(`groundItems.push({x:10,y:10,kind:'chest',tier:3,level:-1,levelKind:'chain',
    caveIndex:-1,towerMazeMimic:true,opened:false});Mimics.initialize()`)
  const complex=state(`({all:groundItems.filter(g=>g.kind==='chest' && g.level<=-3&&g.levelKind==='chain'),
    marked:groundItems.filter(g=>g.isMimic&&g.level<=-3),
    labyrinth:groundItems.filter(g=>g.isMimic&&g.towerMazeMimic),
    fort:groundItems.filter(g=>g.level===-3&&g.kind==='chest')})`)
  assert.equal(complex.fort.length,5)
  assert(complex.marked.length<=3 && complex.marked.length<=Math.floor(complex.all.length/2))
  assert(complex.all.some(g=>!g.isMimic),'at least one true chest remains')
  assert.equal(complex.labyrinth.length,1)
  assert(complex.marked.every(g=>g.loot && Number.isInteger(g.episode)&&!g.rolled))
  assert(complex.fort.every(g=>g.levelKind==='chain'))
  assert.equal(run(`RENDER_STYLE.enemies.portraits.Mimic`),'img/enemies/mimic.jpg')
  assert.equal(run(`RENDER_STYLE.enemies.tiles.Mimic.image`),'img/enemies-tiles/mimic.png')
  assert.equal(run(`(()=>{
    const real=groundItems.find(g=>g.kind==='chest'&&!g.isMimic&&!g.opened)
    const hidden=groundItems.find(g=>g.isMimic)
    return groundItemLabel(real)===groundItemLabel(hidden)&&
      JSON.stringify(groundGlyph(real))===JSON.stringify(groundGlyph(hidden))
  })()`),true,'hidden mimic has exactly the ordinary chest label and glyph')
  console.log('PASS fort chest generation, complex cap and guaranteed separate maze mimic')

  // Controlled 20x20 patch of the existing GLOBAL fort level, never a virtual map.
  run(`(()=>{
    currentZ=-3;currentCave=-1;map=deepLevels[1].map;
    for(let y=70;y<90;y++)for(let x=70;x<90;x++)map[y][x]='marble';
    enemies=[];groundItems=[];occupied=new Set();
    player.x=80;player.y=88;player.hp=500;player.godMode=true
    globalThis.testChest={id:'mimic_test',kind:'chest',tier:3,opened:false,
      x:80,y:80,level:-3,levelKind:'chain',caveIndex:-1,isMimic:true,
      episode:0,rolled:false,unseenTurns:0,
      loot:{gold:42,items:[createItem('arrows',{count:10})]}}
    groundItems.push(testChest)
    globalThis.fakeVisible=new Set()
    globalThis.originalMimicFov=currentUndergroundFov
    currentUndergroundFov=()=>fakeVisible
  })()`)
  run('Mimics.update()')
  assert.equal(run('testChest.unseenTurns'),1)
  run('Mimics.update()')
  assert.equal(run('testChest.unseenTurns'),2)
  run(`fakeVisible.add('80,80');Mimics.update()`)
  assert.deepEqual(state('({u:testChest.unseenTurns,r:testChest.rolled,e:testChest.episode})'),{u:0,r:false,e:0})
  run(`fakeVisible.clear();Mimics.update();Mimics.update()`)
  assert.equal(run('testChest.episode'),0)
  run('Mimics.update()')
  assert.deepEqual(state('({u:testChest.unseenTurns,r:testChest.rolled,e:testChest.episode})'),{u:3,r:true,e:1})
  run('for(let t=0;t<6;t++)Mimics.update()')
  assert.equal(run('testChest.episode'),1,'one roll per out-of-view episode')
  const rate=state(`(()=>{
    let moves=0;const old={x:testChest.x,y:testChest.y}
    for(let i=0;i<400;i++){
      testChest.x=80;testChest.y=80
      fakeVisible=new Set(['80,80']);Mimics.update()
      fakeVisible=new Set();Mimics.update();Mimics.update();Mimics.update()
      if(testChest.x!==80||testChest.y!==80)moves++
    }
    return {moves,episodes:testChest.episode}
  })()`)
  assert(rate.moves>=210 && rate.moves<=310,`deterministic 65% rate: ${rate.moves}/400`)
  console.log(`PASS short peek, threshold, one roll/episode and 65% distribution (${rate.moves}/400)`)

  // A single legal adjacent target cannot bypass forbidden terrain or choke points.
  run(`(()=>{
    testChest.x=80;testChest.y=80;fakeVisible=new Set(['80,80']);Mimics.update()
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      if(dx===0&&dy===0)continue
      map[80+dy][80+dx]='dwarvenwall'
    }
    map[80][80]='marble';map[80][81]='marble'
    testChest.episode=100;fakeVisible.clear()
    for(let t=0;t<100;t++){
      testChest.x=80;testChest.y=80;testChest.unseenTurns=0;testChest.rolled=false
      testChest.episode=t;Mimics.update();Mimics.update();Mimics.update()
      if(testChest.x!==80||testChest.y!==80)
        if(testChest.x!==81||testChest.y!==80)throw Error('Moved onto forbidden tile')
    }
  })()`)
  console.log('PASS single permitted destination and forbidden surrounding tiles')

  // Real one-wide dead-end geometry used by the Tower labyrinth: the disguised
  // chest does not obstruct the corridor, so an eligible shift must be able to
  // occupy its only adjacent dry floor without changing the shared map.
  const deadEnd=state(`(()=>{
    for(let y=75;y<=85;y++)for(let x=75;x<=85;x++)map[y][x]='dwarvenwall'
    for(let x=80;x<=84;x++)map[80][x]='marble'
    const before=map.map(row=>row.slice())
    let moved=0
    for(let e=0;e<400;e++){
      testChest.x=80;testChest.y=80;testChest.episode=e
      fakeVisible=new Set(['80,80']);Mimics.update()
      fakeVisible=new Set();Mimics.update();Mimics.update();Mimics.update()
      if(testChest.x!==80||testChest.y!==80){
        if(testChest.x!==81||testChest.y!==80)throw Error('Shift escaped the one-tile corridor')
        moved++
      }
    }
    return {moved,terrainUnchanged:JSON.stringify(map)===JSON.stringify(before)}
  })()`)
  assert(deadEnd.moved>=210&&deadEnd.moved<=310,
    `narrow dead-end shift rate: ${deadEnd.moved}/400`)
  assert.equal(deadEnd.terrainUnchanged,true,'shifts never change corridor terrain')
  assert.equal(run('isWalkableForPlayer(81,80)'),true,
    'an unrevealed chest does not make a one-wide corridor impassable')
  console.log(`PASS narrow dead-end shifts without wall carving (${deadEnd.moved}/400)`)

  // Exercise the actual underground FOV, not a simulated visibility Set.
  // A one-wide passage bends behind an opaque wall; five consumed turns after
  // leaving line of sight must count as a single unseen episode.
  run(`(()=>{
    for(let y=74;y<=88;y++)for(let x=74;x<=90;x++)map[y][x]='dwarvenwall'
    for(let y=80;y<=84;y++)map[y][80]='marble'
    for(let x=80;x<=88;x++)map[84][x]='marble'
    testChest.x=80;testChest.y=80;testChest.unseenTurns=0
    testChest.rolled=false;testChest.episode=0
    currentUndergroundFov=originalMimicFov
    player.x=80;player.y=82
    invalidateUndergroundFov()
    if(!currentUndergroundFov().has('80,80'))throw Error('Visible end of corridor')
    Mimics.update()
    player.x=85;player.y=84
    invalidateUndergroundFov()
    if(currentUndergroundFov().has('80,80'))throw Error('Corner did not hide chest')
    for(let t=0;t<5;t++)Mimics.update()
  })()`)
  assert.equal(run('testChest.episode'),1,'five turns around a real FOV corner is one episode')
  assert.equal(run('testChest.rolled'),true)
  run('currentUndergroundFov=()=>fakeVisible;fakeVisible=new Set()')
  console.log('PASS real underground FOV corner starts one shift episode')



  // Save the pending episode, restore, and ensure the exact same episode result.
  run(`(()=>{
    for(let y=70;y<90;y++)for(let x=70;x<90;x++)map[y][x]='marble'
    testChest.x=80;testChest.y=80;testChest.episode=14;testChest.rolled=false;
    testChest.unseenTurns=2;fakeVisible=new Set();
  })()`)
  context.midSave=state('buildSaveObject()')
  run('Mimics.update()')
  const first=state('({x:testChest.x,y:testChest.y,episode:testChest.episode,rolled:testChest.rolled,loot:testChest.loot})')
  run(`loadGameFromObject(midSave,{isReplayInit:true});
    currentUndergroundFov=()=>fakeVisible;fakeVisible=new Set();
    globalThis.testChest=groundItems.find(g=>g.id==='mimic_test')`)
  assert.equal(run('testChest.unseenTurns'),2)
  run('Mimics.update()')
  assert.deepEqual(state('({x:testChest.x,y:testChest.y,episode:testChest.episode,rolled:testChest.rolled,loot:testChest.loot})'),first)
  console.log('PASS save/load preserves pending rolls, loot and coordinates')

  // Reveal from diagonal adjacency; same pre-rolled items are recovered on death.
  run(`(()=>{
    for(let y=70;y<90;y++)for(let x=70;x<90;x++)map[y][x]='marble';
    globalThis.mimicMessages=[];log=msg=>mimicMessages.push(msg)
    spawnAmbushAnim=()=>{globalThis.popupRaised=true}
    enemyAttackPlayer=()=>{globalThis.revealAttacks=(globalThis.revealAttacks||0)+1;return false}
    player.x=testChest.x+1;player.y=testChest.y+1;
    globalThis.oldGold=player.gold;globalThis.oldArrows=player.inventory.filter(i=>i.kind==='arrows').reduce((n,i)=>n+(i.count||1),0)
  })()`)
  run(`player.godMode=false;player.invisibleTurns=4`)
  assert.equal(run('Mimics.revealAdjacent()'),false,
    'ordinary invisibility prevents proximity revealing a Mimic')
  assert.equal(run('groundItems.some(g=>g.id==="mimic_test")'),true)
  run('player.godMode=true;player.godInvisible=true')
  assert.equal(run('Mimics.revealAdjacent()'),false,
    'god-mode invisibility also prevents proximity revealing')
  run('player.godMode=false;player.invisibleTurns=0')
  assert.equal(run('Mimics.revealAdjacent()'),true)
  assert.equal(run('groundItems.some(g=>g.id==="mimic_test")'),false)
  assert.equal(run('popupRaised'),true)
  assert.equal(run('revealAttacks'),1)
  assert.equal(run('mimicMessages.some(m=>m.startsWith("Ambush!"))'),true)
  const enemy=state('enemies.find(e=>e.baseName==="Mimic")')
  assert(enemy && !enemy.mimicStationary && enemy.aggro===4 && enemy.aware && enemy.family==='construct' && enemy.humanoid===false)
  assert.equal(enemy.equipment,null)
  assert.equal(enemy.mimicSkipTurn,run('turnCount+1'))
  const revealPosition=state('({x:enemies.find(e=>e.baseName==="Mimic").x,y:enemies.find(e=>e.baseName==="Mimic").y})')
  run('enemyTurn()')
  assert.equal(run('revealAttacks'),1,'reveal attack replaces the following ordinary enemy action')
  assert.deepEqual(state('({x:enemies.find(e=>e.baseName==="Mimic").x,y:enemies.find(e=>e.baseName==="Mimic").y})'),revealPosition)
  run('player.x=80;player.y=84')
  const playerPosition={x:80,y:84}
  const chaseStart=state('({x:enemies.find(e=>e.baseName==="Mimic").x,y:enemies.find(e=>e.baseName==="Mimic").y})')
  run('enemyTurn()')
  const chaseEnd=state('({x:enemies.find(e=>e.baseName==="Mimic").x,y:enemies.find(e=>e.baseName==="Mimic").y})')
  assert(Math.max(Math.abs(chaseEnd.x-playerPosition.x),Math.abs(chaseEnd.y-playerPosition.y)) <
    Math.max(Math.abs(chaseStart.x-playerPosition.x),Math.abs(chaseStart.y-playerPosition.y)),
    'revealed Mimic chases the player as a normal hostile monster')
  console.log('PASS ambush action skips one enemy turn, then normal pursuit begins')
  context.revealedSave=state('buildSaveObject()')
  run('loadGameFromObject(revealedSave,{isReplayInit:true})')
  const restored=state('enemies.find(e=>e.baseName==="Mimic")')
  assert(restored && !restored.mimicStationary && restored.aware && restored.aggro===4)
  assert(restored.mimicLoot && restored.mimicSkipTurn===enemy.mimicSkipTurn)
  assert.deepEqual({x:restored.x,y:restored.y},chaseEnd)
  console.log('PASS revealed Mimic pursuit state, position and reward survive save/load')
  run(`(()=>{
    const e=enemies.find(e=>e.baseName==='Mimic')
    Mimics.deathLoot(e)
  })()`)
  assert.equal(run('player.gold-oldGold'),42+MimicsBonus())
  assert.equal(run('player.inventory.filter(i=>i.kind==="arrows").reduce((n,i)=>n+(i.count||1),0)-oldArrows'),10)
  console.log('PASS diagonal reveal, ambush, immediate action, non-humanoid enemy and original loot')

  // Bumping from a cardinal neighbor also reveals; use the actual prefix
  // factory and verify that no humanoid traits/equipment appear.
  run(`(()=>{
    const existing=enemies.find(e=>e.baseName==='Mimic');existing.alive=false
    currentZ=-1;map=undergroundMap;player.x=50;player.y=51
    map[50][50]='cavefloor';map[51][50]='cavefloor'
    groundItems.push({id:'mimic_bump',kind:'chest',tier:3,opened:false,
      x:50,y:50,level:-1,levelKind:'chain',caveIndex:-1,isMimic:true,
      towerMazeMimic:true,episode:0,rolled:false,unseenTurns:0,
      loot:{gold:5,items:[]}})
    WORLD_GEN_CONFIG.cavePopulation.deepPrefixChance=1
  })()`)
  run('player.invisibleTurns=5')
  assert.equal(run('Mimics.revealBump(50,50)'),true,
    'an invisible player opening/entering a chest still triggers the ambush')
  run('player.invisibleTurns=0')
  assert.equal(run('groundItems.some(g=>g.id==="mimic_bump")'),false)
  assert.equal(run('enemies.some(e=>e.baseName==="Mimic"&&e.alive&&e.prefix)'),true)
  assert.equal(run('enemies.find(e=>e.baseName==="Mimic"&&e.alive).equipment'),null)
  console.log('PASS bump reveal and prefixed Mimic without humanoid equipment')

  // A spell-triggered reveal bypasses the free ambush but keeps the original
  // saved chest loot and normal construct targeting for Fear.
  run(`(()=>{
    currentZ=-1;map=undergroundMap;player.x=50;player.y=51;player.invisibleTurns=0
    for(let y=46;y<55;y++)for(let x=46;x<55;x++)map[y][x]='cavefloor'
    groundItems.push({id:'spell_mimic',kind:'chest',tier:3,opened:false,
      x:51,y:51,level:-1,levelKind:'chain',caveIndex:-1,isMimic:true,
      towerMazeMimic:true,episode:0,rolled:false,unseenTurns:0,
      loot:{gold:9,items:[]}})
    globalThis.spellAttacks=revealAttacks
    Mimics.revealBySpell((x,y)=>x===51 && y===51)
  })()`)
  assert.equal(run('revealAttacks'),run('spellAttacks'),'spell reveal never triggers a free ambush')
  assert.equal(run('groundItems.some(g=>g.id==="spell_mimic")'),false)
  assert.equal(run('enemies.find(e=>e.baseName==="Mimic"&&e.alive&&e.x===51)?.mimicSkipTurn'),0)
  run('applyFearScroll(itemDefinition("scrollOfFear").effect)')
  assert(run('enemies.some(e=>e.baseName==="Mimic"&&e.alive&&e.x===51&&e.fearTurns>0)'),
    'Fear can affect a spell-revealed Mimic through existing construct rules')
  console.log('PASS spell reveals dormant Mimic with no free ambush, ordinary fear still applies')

  function MimicsBonus(){return run('Math.max(1,Math.round(Mimics.BONUS_GOLD*WORLD_GEN_CONFIG.lootRules.worldGoldMultiplier))')}
})().catch(e=>{console.error(e.stack);process.exitCode=1})
