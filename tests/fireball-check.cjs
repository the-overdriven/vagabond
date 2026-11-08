const assert = require('node:assert/strict')
const {run,context} = require('./helpers/node-game-runtime.cjs')
;(async()=>{
 await run('loadContent()')
 context.fixture=require('./saves/Tester_start.json')
 context.normalEnemyTurn=run('enemyTurn')
 run(`loadGameFromObject(fixture,{isReplayInit:true});log=()=>{};raceOpen=false;
 replayAnimationsDisabled=true;replayRecording=false;currentZ=0;map=surfaceMap;
 enemies=[];npcs=[];groundItems=[];occupied=new Set();player.x=40;player.y=40;player.hp=500;
 player.berserkTurns=0;player.deathShieldReady=false;player.inventory=[];
 for(let y=30;y<=52;y++)for(let x=30;x<=52;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
 enemyTurn=()=>{turnCount++};npcTurn=()=>{};
 window.spawnFireballEnemy=(id,x,y,hp=100)=>addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,
 id,baseName:'Goblin',name:'Goblin',x,y,level:0,alive:true,hp,maxHp:hp,equipment:null,shooterAbility:null,shotsRemaining:0});`)
 assert.equal(run('fireballBlastTiles(44,40).length'),21)
 assert(run('!fireballBlastTiles(44,40).some(p=>p.x===42&&p.y===38)'))
 assert(run('validFireballTarget(46,40)&&!validFireballTarget(47,40)'))
 run(`map[40][42]='mountain'`)
 assert(!run('validFireballTarget(44,40)'))
 run(`map[40][42]='grass';map[40][45]='dwarvenwall'`)
 assert(!run('fireballBlastTiles(44,40).some(p=>p.x===46&&p.y===40)'))
 run(`map[40][45]='grass';map[41][44]='dwarvenwall';map[40][45]='dwarvenwall'`)
 assert(!run('fireballClearLine(44,40,45,41)'),'sealed diagonal blocks fire')
 run(`map[41][44]='grass';map[40][45]='grass';addInventoryItem('scrollOfFireball',{count:3});
 window.target=spawnFireballEnemy('fireball-target',44,40);target.def=10000;
 window.corner=spawnFireballEnemy('fireball-corner',42,38);
 window.hidden=spawnFireballEnemy('fireball-wall',46,40);map[40][45]='dwarvenwall';
 startReplayRecording();window.beforeTurn=turnCount;`)
 assert.equal(await run('castFireball(0,47,40)'),false)
 assert.equal(run('player.inventory[0].count'),3)
 assert.equal(await run('castFireball(0,44,40)'),true)
 assert(run('target.hp>=50&&target.hp<=90&&corner.hp===100&&hidden.hp===100'))
 assert(run('turnCount===beforeTurn+1&&player.inventory[0].count===2'))
 context.record=run('structuredClone(replayData)')
 context.expected=run('({hp:target.hp,rng:rngState,turn:turnCount})')
 run(`replayRecording=false;loadGameFromObject(record.initialState,{isReplayInit:true});activeReplay=record;replayRngIndex=record.actions[0]._rngStart;replayPlaying=true;replaySimulationMode=true`)
 await run('runReplayAction(record.actions[0])')
 assert(run(`enemies.find(e=>e.id==='fireball-target').hp===expected.hp&&replayRngIndex===record.actions[0]._rngEnd&&turnCount===expected.turn`),'replay matches seeded damage, RNG and turn')
 run(`replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true;
 player.hp=1;player.deathShieldReady=true;enemies=[];player.inventory=[createItem('scrollOfFireball')];`)
 assert(await run('castFireball(0,40,40)'))
 assert(run('player.hp===1&&!player.deathShieldReady'),'self damage uses Death Shield')
 run(`player.hp=500;player.inventory=[createItem('scrollOfFireball')];
 window.victim=spawnFireballEnemy('fireball-kill',44,40,1);window.killsBefore=player.kills;`)
 assert(await run('castFireball(0,44,40)'))
 assert(run('!victim.alive&&player.kills===killsBefore+1'),'kill credit')
 run(`merchantStock=[];ensureMerchantStock();window.stock=merchantStock.find(i=>i.kind==='scrollOfFireball');player.gold=1000;`)
 assert(run('stock.count===3&&stock.merchantPrice===250'))
 run('buyItem(stock);buyItem(stock);buyItem(stock);ensureMerchantStock()')
 assert(run('stock.count===0'),'finite stock cannot refill')
 run(`window.saved=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(saved,{isReplayInit:true});ensureMerchantStock()`)
 assert(run(`merchantStock.find(i=>i.kind==='scrollOfFireball').count===0&&player.inventory.some(i=>i.kind==='scrollOfFireball')`))
 // Same complete enemy turn with animation on versus replay animation off.
 run(`replayRecording=false;replayPlaying=false;replaySimulationMode=false;
   player.inventory=[createItem('scrollOfFireball',{count:3})];player.hp=500;
   player.berserkTurns=0;player.deathShieldReady=false;enemies=[];occupied=new Set();
   map[40][45]='grass';spawnFireballEnemy('group-a',41,40,200);spawnFireballEnemy('group-b',42,41,200);
   enemyTurn=normalEnemyTurn;clearEnemyAnims();replayAnimationsDisabled=false;
   window.stateFireball=()=>JSON.stringify({hp:player.hp,turn:turnCount,
     enemies:enemies.map(e=>({id:e.id,hp:e.hp,x:e.x,y:e.y})),
     count:player.inventory.find(i=>i.kind==='scrollOfFireball')?.count});
   startReplayRecording();`)
 assert(await run('castFireball(0,41,40)'))
 assert(run('fireballAnims.length===1&&enemyAttackPresentationPending()'),'projectile/burst blocks input')
 context.expectedState=run('stateFireball()')
 context.record=run('structuredClone(replayData)')
 run(`replayRecording=false;loadGameFromObject(record.initialState,{isReplayInit:true});
   activeReplay=record;replayRngIndex=record.actions[0]._rngStart;
   replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true;`)
 await run('runReplayAction(record.actions[0])')
 assert(run('stateFireball()===expectedState&&replayRngIndex===record.actions[0]._rngEnd'),
   'multiple victims, self damage and actual enemy reactions match with animation disabled')
 run('replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true')
 // Existing crate boundary suite now includes Fireball with unchanged total weight.
 const helper=require('./helpers/crate-consumables-checks.js')
 run('('+helper.crateLootDistributionChecks.toString()+')()')
 console.log('PASS multi-target actual enemy-turn replay, animation input lock and every crate loot boundary')
 console.log('PASS fireball geometry, walls, range, armor bypass, per-target damage, self harm, shield, kill credit, replay and finite saved stock')
})().catch(e=>{console.error(e);process.exitCode=1})
