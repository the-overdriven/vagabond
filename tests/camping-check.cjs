const assert = require('node:assert/strict')
const fs = require('fs')
const {run,context} = require('./helpers/node-game-runtime.cjs')
context.fixture = JSON.parse(fs.readFileSync('tests/saves/Tester_start.json','utf8'))
const check = (expression,message) => assert(run(expression),message)
async function main() {
  await run('loadContent()')
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    log=()=>{};replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
    replaySimulationMode=false;raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;
    deathTransition=null;cameraAnimating=false;attackAnim=null;
    currentZ=0;map=surfaceMap;player.x=60;player.y=50;spawnPoint={x:20,y:20};
    for(let y=40;y<=60;y++)for(let x=50;x<=70;x++)map[y][x]='grass';
    player.race='human';player.maxHp=200;player.hp=20;player.equip={};player.curseDebuffs=[];
    player.berryRegenTurns=0;player.poisonTurns=0;player.godMode=false;player.campRestProgress=0;
    player.inventory=[];enemies=[];npcs=[];groundItems=[];occupied=new Set();turnCount=0;
    groundItems.push({kind:'campfire',x:61,y:50,level:0,burnUntil:0,searched:false});
    addInventoryItem('flint');addInventoryItem('brushwood',{count:5});
    addInventoryItem('meat',{count:3});addInventoryItem('potato');addInventoryItem('fish');
    window.fire=groundItems[0];`)
  check('Campfires.foodRecovery("roastedMeat")===16 && Campfires.foodRecovery("bakedPotato")===20 && Campfires.foodRecovery("cookedFish")===32 && Campfires.rate()===6','food and rest scale with max HP')
  check('!Campfires.perform(fire,"cook","meat") && Campfires.count("meat")===3 && turnCount===0','cold cooking spends nothing')
  check('Campfires.perform(fire,"light") && Campfires.remaining(fire)===12 && Campfires.count("brushwood")===4 && Campfires.count("flint")===1','ignition costs one turn and fuel, never flint')
  for (const kind of ['meat','potato','fish']) check(`Campfires.perform(fire,'cook','${kind}')`,'cook '+kind)
  run(`Campfires.eat(player.inventory.findIndex(it=>it.kind==='roastedMeat'));window.hpBefore=player.hp;window.foodBefore=Campfires.foodRemaining();`)
  check('Campfires.perform(fire,"rest") && player.hp-hpBefore===6 && foodBefore-Campfires.foodRemaining()===6','rest accelerates but does not multiply recovery')
  run('player.berryRegenTurns=0;player.campRestProgress=0;window.hpBefore=player.hp')
  for(let i=0;i<4;i++) check('Campfires.perform(fire,"rest")','weak rest tick')
  check('player.hp-hpBefore===1','food-free recovery is one HP per four consecutive rest turns')
  run(`player.hp=20;player.berryRegenTurns=0;player.campRestProgress=0;
    fire.burnUntil=turnCount+3;window.shortRestLog=[];window.oldCampLog=log;
    log=message=>shortRestLog.push(message);`)
  for(let i=0;i<3;i++) check('Campfires.perform(fire,"rest")','short fire weak rest turn')
  check('player.hp===20 && !Campfires.burning(fire) && player.campRestProgress===0',
    'three fire turns are insufficient for food-free recovery and partial progress expires')
  check('shortRestLog.some(m=>m.includes("fire goes out before you recover")) && !shortRestLog.some(m=>m.includes("recover 0 HP"))',
    'short-fire rest explains why no HP recovered without claiming zero healing')
  run('log=oldCampLog')
  run('player.campRestProgress=1;fire.burnUntil=turnCount+3;window.hpBefore=player.hp')
  for(let i=0;i<3;i++) check('Campfires.perform(fire,"rest")','partial-progress short fire rest')
  check('player.hp===hpBefore+1','three fire turns do heal when one earlier rest turn already counted')
  run('fire.burnUntil=turnCount+1;window.raw=Campfires.count("meat")')
  check('Campfires.perform(fire,"cook","meat") && Campfires.count("meat")===raw-1 && !Campfires.burning(fire)','last burning turn completes cooking')
  check('!Campfires.perform(fire,"cook","meat") && Campfires.count("meat")===raw-1','expired fire preserves remaining food')
  run('Campfires.perform(fire,"light");player.poisonTurns=2;window.before=turnCount')
  check('!Campfires.perform(fire,"rest") && turnCount===before','poison blocks resting without revealing hidden enemies')
  run('player.poisonTurns=0;map[50][60]="snow";tickFreezing()')
  check('!player.freezing.active','adjacent fire prevents environmental freezing')
  run('map[50][60]="forest";foragedTiles=new Set()')
  check('!playerHasForestCover()','firelight removes concealment')
  run('map[50][60]="grass";player.race="troll";player.berryRegenTurns=0;player.hp=20;turnCount=20;fire.burnUntil=100;Campfires.eat(player.inventory.findIndex(it=>it.kind==="bakedPotato"))')
  check('Campfires.foodRemaining()>0','Troll cooked-food recovery is active')
  run('window.hpBefore=player.hp;Campfires.perform(fire,"rest")')
  check('player.hp-hpBefore>=6','Troll gets food-assisted rest in addition to racial regen')
  // Exact accounting at every global tick phase, with early cancellation and continuation.
  for(let phase=0;phase<5;phase++) {
    run(`player.race='human';player.hp=1;player.maxHp=200;player.berryRegenTurns=0;turnCount=${phase};fire.burnUntil=200;
      addInventoryItem('roastedMeat');Campfires.eat(player.inventory.findIndex(it=>it.kind==='roastedMeat'));
      for(let i=0;i<3;i++)Campfires.perform(fire,'rest');`)
    check('player.hp===17 && Campfires.foodRemaining()===0','exact 16 HP total at phase '+phase)
  }
  run(`player.berryRegenTurns=290;addInventoryItem('roastedMeat',{count:2});
    window.firstMeal=Campfires.eat(player.inventory.findIndex(it=>it.kind==='roastedMeat'));
    window.countAfterMeal=Campfires.count('roastedMeat');window.turnsAfterMeal=player.berryRegenTurns;
    window.secondMeal=Campfires.eat(player.inventory.findIndex(it=>it.kind==='roastedMeat'));`)
  check('firstMeal && turnsAfterMeal>300 && !secondMeal && player.berryRegenTurns===turnsAfterMeal && Campfires.count("roastedMeat")===countAfterMeal',
    'a meal may cross 300 regeneration turns once but cannot consume another serving above the cap')
  run(`player.hp=20;player.berryRegenTurns=0;player.campRestProgress=0;
    Campfires.perform(fire,'rest');Campfires.perform(fire,'rest');
    window.saved=JSON.parse(JSON.stringify(buildSaveObject()));
    loadGameFromObject(saved,{isReplayInit:true});window.fire=groundItems.find(f=>f.kind==='campfire');`)
  check('player.campRestProgress===2 && fire.burnUntil===200','current save restores partial rest and fire expiry')
  run('Campfires.perform(fire,"rest");Campfires.perform(fire,"rest")')
  check('player.hp===21','partial rest survives reload without losing or duplicating recovery')
  // Snapshot and replay a complete camp with real world turns.
  run(`player.inventory=[];addInventoryItem('flint');addInventoryItem('brushwood',{count:2});addInventoryItem('fish');
    player.hp=20;player.berryRegenTurns=0;player.campRestProgress=0;fire.burnUntil=0;fire.searched=false;
    startReplayRecording();Campfires.perform(fire,'search');Campfires.perform(fire,'light');
    Campfires.perform(fire,'cook','fish');Campfires.eat(player.inventory.findIndex(it=>it.kind==='cookedFish'));
    Campfires.perform(fire,'rest');Campfires.perform(fire,'rest');
    window.record=structuredClone(replayData);
    window.state=()=>JSON.stringify({hp:player.hp,food:player.berryRegenTurns,progress:player.campRestProgress,
      turn:turnCount,inventory:player.inventory.map(i=>[i.kind,i.count]),fire:groundItems.find(g=>g.kind==='campfire')});
    window.expected=state();replayRecording=false;
    loadGameFromObject(structuredClone(record.initialState),{isReplayInit:true});activeReplay=record;
    replayPlaying=true;replaySimulationMode=true;replayRngIndex=0;`)
  for(const action of context.record.actions){context.action=action;await run('runReplayAction(action)')}
  check('state()===expected && replayRngIndex===record.rng.length','replay matches food, HP, resources, fire, search, turns and RNG')
  run(`replayPlaying=false;replaySimulationMode=false;activeReplay=null;replayRecording=false;
    player.inventory=[];player.hp=30;player.berryRegenTurns=0;player.campRestProgress=0;
    window.fire=groundItems.find(f=>f.kind==='campfire');fire.burnUntil=turnCount+100;
    addInventoryItem('brushwood',{count:4});window.oldRng=rng;rng=()=>0.74;
    foragedTiles=new Set();map[player.y][player.x]='forest';tryForage();window.firstTurn=turnCount;tryForage();`)
  check('Campfires.count("brushwood")===5 && turnCount===firstTurn','one forage per tile and 75% brushwood success without repeat gathering')
  run(`player.inventory.find(it=>it.kind==='brushwood').count=4;
    player.x++;map[player.y][player.x]='forest';rng=()=>0.90;tryForage();window.emptyWoodTurn=turnCount;tryForage();`)
  check('Campfires.count("brushwood")===4 && turnCount===emptyWoodTurn',
    'failed brushwood roll does not replenish fuel and cannot be farmed by revisiting')
  run(`player.inventory.find(it=>it.kind==='brushwood').count=5`)
  run(`player.gold=1000;ensureMerchantStock();window.goldBefore=player.gold;buyItem(merchantStock.find(i=>i.kind==='brushwood'))`)
  check('player.gold===goldBefore && Campfires.count("brushwood")===5','full fuel capacity does not charge gold')
  run(`groundItems.push({kind:'droppeditem',x:player.x,y:player.y,level:0,item:createItem('brushwood',{count:3})});
    player.inventory.find(i=>i.kind==='brushwood').count=4;lootSkeletonOrForage();`)
  check('Campfires.count("brushwood")===5 && groundItems.find(g=>g.kind==="droppeditem").item.count===2','partial fuel pickup leaves excess on the ground')
  run(`groundItems=groundItems.filter(g=>g.kind!=='droppeditem');map[player.y][player.x]='sand';
    addInventoryItem('shovel');dugSandTiles=new Set();rng=()=>0.175;tryDig();window.digTurn=turnCount;tryDig();`)
  check('Campfires.count("flint")===1 && turnCount===digTurn','flint sand find can be claimed only once')
  run(`rng=()=>0;map[player.y][player.x]='grass';addInventoryItem('pickaxe');player.miningTutorialSeen=true;
    map[50][62]='boulder';for(let n=0;n<10&&map[50][62]==='boulder';n++)Mining.strike(62,50);`)
  check('Campfires.count("flint")===2 && !Mining.strike(62,50)','completed boulder grants one flint roll, never repeat strikes')
  run(`groundItems.push({kind:'chest',x:60,y:50,level:0,tier:1});checkGroundAt(60,50);checkGroundAt(60,50)`)
  check('Campfires.count("flint")===3','chest bonus flint is not duplicated by repeat pickup')
  run(`rng=oldRng;player.hp=30;player.berryRegenTurns=0;fire.burnUntil=turnCount+100;
    enemies=[{id:'camp-threat',name:'Goblin',baseName:'Goblin',alive:true,hp:30,level:0,x:63,y:50,abilities:[]}];
    camX=0;camY=0;window.cameraA=Campfires.perform(fire,'rest');camX=500;camY=500;window.cameraB=Campfires.perform(fire,'rest');`)
  check('!cameraA && !cameraB','visible threat blocks rest independently of camera and animation')
  run(`enemies=[];window.oldEnemyTurn=enemyTurn;enemyTurn=function(){const result=oldEnemyTurn();player.hp-=1;return result};
    Campfires.perform(fire,'rest');enemyTurn=oldEnemyTurn;`)
  check('player.campRestProgress===0','damage resets weak-rest progress')
  run(`window.fire=groundItems.find(f=>f.kind==='campfire');fire.burnUntil=turnCount+20;
    map[50][61]='grass';map[50][60]='grass';map[51][60]='cavewall';map[50][61]='cavewall';
    window.diagonal=Mining.lightCanReach(map,60,50,61,51,61,51);
    map[51][60]='grass';map[50][61]='grass';
    currentZ=-1;fire.level=-1;invalidateUndergroundFov();`)
  check('!diagonal && Mining.lightSources().includes(fire) && Mining.lightInfo(fire).radius===3','campfire illumination uses wall-aware light sources without sealed diagonal leaks')
  run(`currentZ=0;fire.level=0;window.expiry=fire.burnUntil;currentZ=-1;turnCount=expiry;
    currentZ=0;invalidateUndergroundFov()`)
  check('!Campfires.burning(fire)','fire expires across time spent on another floor')
  run(`rng=()=>0;player.hp=100;player.godMode=true;player.godInvisible=true;fire.burnUntil=0;
    addInventoryItem('brushwood');addEnemy({...ENEMY_TEMPLATES.find(e=>e.name==='Giant Rat'),id:'fire-listener',x:65,y:50,homeX:65,homeY:50,homeTileType:'grass',level:0,alive:true,hp:30,maxHp:30,aware:false,wander:false});
    Campfires.perform(fire,'light');rng=oldRng;`)
  check('enemies.some(e=>e.miningInvestigation?.source==="fire")','ignition gives hearing monsters a finite fireplace investigation')
  // The Fort/Kitchen stove uses the same action and replay pipeline, but
  // burns longer and cannot be searched for campfire potato loot.
  run(`enemies=[];groundItems=[{kind:'dwarvenstove',x:61,y:50,level:0,burnUntil:0}];
    window.stove=groundItems[0];player.godMode=false;player.godInvisible=false;
    player.hp=20;player.maxHp=200;player.berryRegenTurns=0;player.campRestProgress=0;
    player.inventory=[];addInventoryItem('flint');addInventoryItem('brushwood',{count:2});
    addInventoryItem('fish');startReplayRecording();`)
  check('Campfires.nearby()===stove && !Campfires.perform(stove,"search")','stoves are usable fireplaces with no ash-search loot')
  check('Campfires.perform(stove,"light") && Campfires.remaining(stove)===18','stoves burn for eighteen turns per bundle')
  check('Campfires.perform(stove,"cook","fish") && Campfires.count("cookedFish")===1','stoves cook existing recipes')
  run(`Campfires.eat(player.inventory.findIndex(it=>it.kind==='cookedFish'));
    Campfires.perform(stove,'rest');window.stoveRecord=structuredClone(replayData);
    window.stoveState=()=>JSON.stringify({hp:player.hp,regen:player.berryRegenTurns,
      turn:turnCount,inventory:player.inventory.map(i=>[i.kind,i.count]),stove:groundItems[0]});
    window.stoveExpected=stoveState();replayRecording=false;
    loadGameFromObject(structuredClone(stoveRecord.initialState),{isReplayInit:true});
    activeReplay=stoveRecord;replayPlaying=true;replaySimulationMode=true;replayRngIndex=0;`)
  for(const action of context.stoveRecord.actions){context.action=action;await run('runReplayAction(action)')}
  check('stoveState()===stoveExpected && replayRngIndex===stoveRecord.rng.length','stove cooking and rest replay exactly')
  run(`replayPlaying=false;replaySimulationMode=false;activeReplay=null;
    stove=groundItems[0];stove.burnUntil=0;player.godMode=true;player.godInvisible=true;
    addInventoryItem('brushwood');window.stoveOldRng=rng;rng=()=>0;
    enemies=[{id:'near',name:'Giant Rat',baseName:'Giant Rat',alive:true,level:0,
      x:64,y:50,hp:20,maxHp:20,abilities:[],wander:false},
      {id:'far',name:'Giant Rat',baseName:'Giant Rat',alive:true,level:0,
      x:66,y:50,hp:20,maxHp:20,abilities:[],wander:false}];
    Campfires.perform(stove,'light');rng=stoveOldRng;`)
  check('enemies.find(e=>e.id==="near").miningInvestigation?.source==="fire" && !enemies.find(e=>e.id==="far").miningInvestigation',
    'stove ignition lures monsters within four tiles but not farther ones')
  check('!isWalkableForPlayer(stove.x,stove.y)','even god mode cannot stand on a stove')
  run(`player.x=60;player.y=50;window.inspectionLogs=[];window.oldInspectionLog=log;
    log=message=>inspectionLogs.push(message);describeSurroundings();`)
  check('inspectionLogs.some(s=>s.toLowerCase().includes("dwarven stove"))',
    'Inspect reports an adjacent stove rather than only the surrounding floor')
  run(`groundItems=[{kind:'campfire',x:61,y:50,level:0,burnUntil:0,searched:false}];
    window.potatoesBefore=Campfires.count('potato');window.inspectionChance=chance;
    chance=()=>true;describeSurroundings();describeSurroundings();
    chance=inspectionChance;log=oldInspectionLog;`)
  check('groundItems[0].searched && Campfires.count("potato")===potatoesBefore+1',
    'Inspect searches nearby ashes exactly once and cannot farm potatoes')
  console.log('PASS campfires and stoves: recipes, scaling, fuel, quieter ignition, Trolls, warmth, concealment, save and replay')
}
main().catch(error=>{console.error(error);process.exitCode=1})
