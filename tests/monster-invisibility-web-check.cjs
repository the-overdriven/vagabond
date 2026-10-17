// Focused deterministic rules, live AI, persistence and replay checks.
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
async function main() {
  await run('loadContent()')
  context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))
  context.fixture.version = run('SAVE_VERSION')
  run('baseChanceForInvis = chance')
  function reset() {
    run(`(() => {loadGameFromObject(fixture,{isReplayInit:true});
      logHistory=[];log=m=>logHistory.push(m);chance=()=>false;
      currentZ=0;currentCave=-1;map=surfaceMap;spawnPoint={x:5,y:5};
      player.x=40;player.y=40;player.hp=5000;player.maxHp=5000;
      player.invisibleTurns=0;player.godMode=false;player.godInvisible=false;
      player.spiderWebSourceId=null;player.race='human';
      player.equip={weapon:null,armor:null,shield:null,blackkey:null};
      replayRecording=false;replayPlaying=false;replayData=null;
      replayAnimationsDisabled=true;replaySimulationMode=false;
      enemies=[];npcs=[];occupied=new Set();turnCount=0;deathTransition=null;
      for(let y=30;y<=50;y++)for(let x=30;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));}
      addInvisEnemy=(name,x,y)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name];
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',equipment:null,aware:true});
        occupied.add(keyXY(x,y));return e;
      }
    })()`)
  }
  for (const name of ['Myrka', 'Skerva', 'Kveld', 'Tulla']) {
    context.name = name
    assert(run('ENEMY_TEMPLATE_BY_NAME[name].abilities.includes("invisibility")'), `${name} has invisibility`)
  }
  reset();run('skerva=addInvisEnemy("Skerva",37,40);turnCount=1;chance=p=>p===0.25')
  assert(run('tryEnemyVanish(skerva)'), '25% eligible activation')
  assert.equal(run('skerva.invisibleUntilTurn'),5)
  assert.equal(run('skerva.invisibilityReadyTurn'),10)
  assert(run('enemyInvisibleActive(skerva)'))
  assert(!run('enemyCanBeSeen(skerva)'), 'invisible outside shimmer radius')
  assert.equal(run('tileInspectInfo(skerva.x,skerva.y)?.enemy || null'),null,'tooltip must not reveal hidden creature')
  const snapshot=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  assert.equal(snapshot.enemies[0].invisibleUntilTurn,5)
  assert.equal(snapshot.enemies[0].invisibilityReadyTurn,10)
  context.saved=snapshot
  run('loadGameFromObject(saved,{isReplayInit:true});skerva=enemies[0];turnCount=2')
  assert(!run('tryEnemyVanish(skerva)'), 'no rolling while invisible / cooling down')
  assert(run('enemyInvisibleActive(skerva)'))
  run('skerva.x=38;skerva.y=40;occupied=new Set([keyXY(38,40)])')
  assert(run('enemyInvisibleShimmer(skerva)'), 'shimmer within 2 tiles')
  assert(run('enemyCanBeSeen(skerva)'), 'shimmer allows inspection and attacks')
  assert(run('tileInspectInfo(skerva.x,skerva.y)?.enemy === skerva'))
  run('revealEnemyInvisibility(skerva)')
  assert(!run('enemyInvisibleActive(skerva)'),'revealing is immediate')
  assert.equal(run('skerva.invisibilityReadyTurn'),10,'reveal does not reset cooldown')
  run('turnCount=9;rolls=0;chance=()=>{rolls++;return true}')
  assert(!run('tryEnemyVanish(skerva)'),'8 full turns of cooldown')
  assert.equal(run('rolls'),0)
  run('turnCount=10')
  assert(run('tryEnemyVanish(skerva)'),'ready on first eligible turn')
  run('turnCount=14;expireEnemyInvisibility(skerva)')
  assert(!run('enemyInvisibleActive(skerva)'),'duration expires')
  console.log('PASS invisibility: species, activation, duration, shimmer, inspection, cooldown, save/load')
  reset();run('thief=addInvisEnemy("Kveld",39,40);thief.invisibleUntilTurn=6;player.inventory=[{kind:"herb",count:2}];turnCount=2')
  run('chance=()=>false;tryEnemyTheft(thief)')
  assert(!run('enemyInvisibleActive(thief)'),'theft attempts reveal before random theft roll')
  reset();run('attacker=addInvisEnemy("Myrka",39,40);attacker.invisibleUntilTurn=8;turnCount=2')
  run('chance=()=>true;enemyAttackPlayer(attacker)')
  assert(!run('enemyInvisibleActive(attacker)'),'enemy attack reveals even on miss')
  reset();run('skerva=addInvisEnemy("Skerva",37,40);chance=p=>p===0.25;enemyTurn()')
  assert(run('enemyInvisibleActive(skerva)'),'real pursuit AI can choose invisibility')
  assert.equal(run('skerva.x'),37,'activation replaces chasing movement')
  reset();run('skerva=addInvisEnemy("Skerva",37,40);player.invisibleTurns=3;chance=()=>true;enemyTurn()')
  assert(!run('enemyInvisibleActive(skerva)'),'cannot activate against invisible player')
  reset();run('skerva=addInvisEnemy("Skerva",37,40);spawnPoint={x:40,y:40};chance=()=>true;enemyTurn()')
  assert(!run('enemyInvisibleActive(skerva)'),'sanctuary protects and suppresses activation')
  console.log('PASS invisibility: AI, theft/attack reveal, sanctuary, player invisibility')
  reset();run('spider=addInvisEnemy("Giant Spider",36,40);chance=p=>p===0.70;turnCount=1')
  assert(run('tryEnemyRush(spider)'), 'pull connects')
  assert.equal(run('player.x'),37,'drag occurs in resolved rules')
  assert.equal(run('player.spiderWebSourceId'),run('spider.id'),'web bound to spider')
  assert(run('spiderWebSource()===spider'))
  const webSave=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  assert.equal(webSave.player.spiderWebSourceId,webSave.enemies[0].id)
  context.saved=webSave
  run('loadGameFromObject(saved,{isReplayInit:true});spider=enemies[0];replayAnimationsDisabled=true')
  assert(run('spiderWebSource()===spider'),'overlay survives save restoration')
  await run('tryMove(-1,0)') // toward spider: bump attacks rather than moving, web must stay
  assert.equal(run('player.spiderWebSourceId'),run('spider.id'),'attacks do not clear web')
  await run('tryMove(0,1)')
  assert.equal(run('player.spiderWebSourceId'),null,'actual movement clears overlay')
  reset();run('spider=addInvisEnemy("Giant Spider",36,40);markSpiderWeb(spider,false)')
  assert.equal(run('player.spiderWebSourceId'),run('spider.id'))
  run('spider.hp=0;killEnemy(spider,false)')
  assert.equal(run('player.spiderWebSourceId'),null,'killing source clears the overlay')
  reset();run('spider=addInvisEnemy("Giant Spider",37,39);wrestler=addInvisEnemy("Owlbear",39,40);markSpiderWeb(spider,false);chance=p=>p===0.25')
  assert(run('tryEnemyWrestle(wrestler)'))
  assert.equal(run('player.spiderWebSourceId'),null,'forced Wrestler swap tears off existing web')
  console.log('PASS spider: drag, persistence, attacks, movement, wrestler swap, death clearing')
  // Seeded recorded actions must recreate the *same* visibility deadlines and web state.
  reset();run(`rngState=15551;chance=baseChanceForInvis;
    skerva=addInvisEnemy('Skerva',37,40);
    spider=addInvisEnemy('Giant Spider',35,40);
    startReplayRecording()`)
  await run('tryMove(0,1)');await run('tryMove(0,1)')
  const original=run('JSON.stringify({turn:turnCount,player:[player.x,player.y,player.hp,player.spiderWebSourceId],enemy:enemies.map(e=>[e.id,e.x,e.y,e.hp,e.invisibleUntilTurn,e.invisibilityReadyTurn])})')
  context.record=JSON.parse(JSON.stringify(run('replayData')))
  assert(context.record.actions.length >= 2)
  run(`loadGameFromObject(record.initialState,{isReplayInit:true});replayPlaying=true;
    replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true;
    activeReplay=record;replayRngIndex=0;`)
  for(const action of context.record.actions){context.action=action;await run('runReplayAction(action)')}
  assert.equal(run('JSON.stringify({turn:turnCount,player:[player.x,player.y,player.hp,player.spiderWebSourceId],enemy:enemies.map(e=>[e.id,e.x,e.y,e.hp,e.invisibleUntilTurn,e.invisibilityReadyTurn])})'),original)
  assert.equal(run('replayRngIndex'),context.record.rng.length,'no replay RNG desync')
  console.log('PASS replay: invisibility and spider web deterministic over recorded actions')
}
main().catch(e=>{console.error(e.stack);process.exitCode=1})
