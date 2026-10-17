// node tests/monster-statuses-check.cjs
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const {run,context} = require('./helpers/node-game-runtime.cjs')
async function main() {
  await run('loadContent()')
  run('originalChance=chance;originalPick=pick')
  context.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'saves/Tester_start.json'),'utf8'))
  context.fixture.version=run('SAVE_VERSION')
  function reset(name='Dreadling',x=39,y=40) {
    context.testName=name;context.testX=x;context.testY=y
    run(`(() => {loadGameFromObject(fixture,{isReplayInit:true});
      logHistory=[];log=m=>logHistory.push(m);chance=originalChance;pick=originalPick;
      currentZ=0;currentCave=-1;map=surfaceMap;spawnPoint={x:5,y:5};
      player.x=40;player.y=40;player.hp=5000;player.maxHp=5000;player.godMode=false;
      player.invisibleTurns=0;player.rootTurns=0;player.gazeTurns=0;player.mummyCurseTurns=0;
      player.confusionTurns=0;player.confusionSourceId=null;player.berserkTurns=0;
      player.race='human';player.equip={weapon:null,armor:null,shield:null,blackkey:null};
      replayRecording=false;replayPlaying=false;replayData=null;replayAnimationsDisabled=true;replaySimulationMode=false;
      enemies=[];occupied=new Set();npcs=[];turnCount=0;deathTransition=null;pendingMove=null;
      for(let y=30;y<=50;y++)for(let x=30;x<=50;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
      const t=ENEMY_TEMPLATE_BY_NAME[testName];
      testEnemy=addEnemy({...t,baseName:testName,x:testX,y:testY,hp:t.hp,maxHp:t.hp,
        alive:true,level:0,homeX:testX,homeY:testY,homeTileType:'grass',prefix:null,equipment:null});
      occupied.add(keyXY(testX,testY));})()`)
  }
  for(const [name,ability] of [['Dreadling','root'],['Mummy','mummyCurse'],['Gorgon','petrifyingGaze'],['Banshee','wail']]) {
    reset(name)
    assert(run(`enemyHasAbility(testEnemy,'${ability}')`),`${name} has ${ability}`)
  }
  reset('Dreadling');run('turnCount=1;chance=p=>p===0.25;applyEnemyContactStatuses(testEnemy)')
  assert.equal(run('player.rootTurns'),3)
  assert.equal(run('testEnemy.rootReadyTurn'),7)
  run('turnCount=2;applyEnemyContactStatuses(testEnemy)')
  assert.equal(run('player.rootTurns'),3,'cooldown prevents root refresh')
  await run('tryMove(0,1)')
  assert.equal(run('player.y'),40,'root blocks walking')
  assert.equal(run('player.rootTurns'),2,'root ticks on unsuccessful rooted movement')
  assert(run("logHistory.some(m=>m.includes('struggle against'))"),'root logs')
  const rootSnapshot=JSON.parse(JSON.stringify(run('buildSaveObject()')))
  assert.equal(rootSnapshot.player.rootTurns,2)
  assert.equal(rootSnapshot.enemies[0].rootReadyTurn,7)
  context.saved=rootSnapshot;run('loadGameFromObject(saved,{isReplayInit:true})')
  assert.equal(run('player.rootTurns'),2,'root restore')
  assert.equal(run('enemies[0].rootReadyTurn'),7,'root cooldown restore')
  reset('Dreadling');run('player.rootTurns=2;chance=()=>false')
  const enemyHp=run('testEnemy.hp')
  await run('tryMove(-1,0)')
  assert(run('testEnemy.hp')<enemyHp,'rooted player can attack adjacent monster')
  assert.equal(run('player.rootTurns'),1,'root timer ticks on attacking turn')
  console.log('PASS root hit, movement loss, allowed attacks, 5-turn cooldown, save/load')

  reset('Mummy');run('turnCount=1;chance=p=>p===0.25;applyEnemyContactStatuses(testEnemy)')
  assert.equal(run('player.mummyCurseTurns'),4)
  assert.equal(run('playerAtk()'),run('playerAtk(true)')-2)
  run('turnCount=2;chance=()=>false;applyEnemyContactStatuses(testEnemy)')
  assert.equal(run('player.mummyCurseTurns'),4,'failed proc leaves timer')
  run('tickMonsterStatuses()');assert.equal(run('player.mummyCurseTurns'),3)
  run('chance=()=>true;applyEnemyContactStatuses(testEnemy)')
  assert.equal(run('player.mummyCurseTurns'),4,'refreshes not stacks')
  assert.equal(run('playerAtk()'),run('playerAtk(true)')-2)
  console.log('PASS mummy curse penalty, refresh and expiry')

  reset('Gorgon',38,40);const speedBeforeGaze=run('playerSpd()');run('turnCount=1;chance=p=>p===0.25')
  assert(run('tryEnemyGazeOrWail(testEnemy)'),'gaze activates from range 2')
  assert.equal(run('player.gazeTurns'),3)
  assert.equal(run('playerSpd()'),Math.max(1,speedBeforeGaze-3))
  assert.equal(run('playerGrace()'),Math.max(0,run('playerGrace(true)')-3))
  assert.equal(run('testEnemy.gazeReadyTurn'),7)
  run('turnCount=2');assert(!run('tryEnemyGazeOrWail(testEnemy)'),'gaze cooldown')
  run('tickMonsterStatuses();tickMonsterStatuses();tickMonsterStatuses()')
  assert.equal(run('player.gazeTurns'),0)
  console.log('PASS gaze range, stat penalties, 3-turn duration and cooldown')

  reset('Banshee',38,40);run('turnCount=1;chance=p=>p===0.25')
  assert(run('tryEnemyGazeOrWail(testEnemy)'),'wail activates')
  assert.equal(run('player.confusionTurns'),5)
  assert.equal(run('player.confusionSourceId'),run('testEnemy.id'))
  run('chance=()=>true;pick=xs=>xs[0]')
  assert.notEqual(run('JSON.stringify(confusionDirection(1,0))'),'{"dx":1,"dy":0}', 'redirects to a different walkable tile')
  run('player.confusionTurns=5;testEnemy.hp=0;killEnemy(testEnemy)')
  assert.equal(run('player.confusionTurns'),0,'caster death ends confusion')
  assert.equal(run('player.confusionSourceId'),null)
  console.log('PASS banshee confusion movement and death-based clearing')

  reset('Gorgon',37,40);run('chance=()=>true;enemyTurn()')
  assert.equal(run('player.gazeTurns'),3,'actual enemy AI casts gaze from range 3')
  assert.equal(run('testEnemy.gazeReadyTurn'),7,'AI cast starts cooldown')
  reset('Banshee',36,40);run('chance=()=>true;enemyTurn()')
  assert.equal(run('player.confusionTurns'),5,'Banshee casts Wail from range 4 beyond normal aggro')
  assert.equal(run('testEnemy.wailReadyTurn'),9,'seven intervening turns on successful Wail')
  console.log('PASS enemy AI actual gaze and Wail, including fourth-tile Wail range')

  reset('Dreadling');run('player.berserkTurns=10;player.berserkBonus=5;player.inventory=[createItem("herb")];chance=()=>true;pick=xs=>xs[0]')
  const originalCount=run('player.inventory.length')
  await run("ITEM_ACTION_HANDLERS.herb(0)")
  assert.equal(run('player.inventory.length'),originalCount,'interrupted item remains intact')
  assert.equal(run('turnCount'),1,'frenzy costs exactly one turn')
  assert(run("logHistory.some(m=>m.includes('Berserk rage overwhelms'))"),'frenzy is logged')
  console.log('PASS berserk interrupts item use and performs only an attack')

  reset('Dreadling');run('rngState=37001;player.berserkTurns=12;player.berserkBonus=5;player.inventory=[createItem("herb")];startReplayRecording()')
  await run('ITEM_ACTION_HANDLERS.herb(0)')
  await run('tryMove(-1,0)')
  const end=run('JSON.stringify({state:buildSaveObject().player.hp,enemy:enemies.map(e=>[e.id,e.hp,e.alive]),turnCount,inventory:player.inventory})')
  const record=JSON.parse(JSON.stringify(run('replayData')))
  assert(record.actions.length>=1,'recorded actions')
  context.record=record
  run(`loadGameFromObject(record.initialState,{isReplayInit:true});replayPlaying=true;replayRecording=false;
    replaySimulationMode=true;replayAnimationsDisabled=true;activeReplay=record;replayRngIndex=0;`)
  for(const action of record.actions) {
    context.action=action
    await run('runReplayAction(action)')
  }
  assert.equal(run('JSON.stringify({state:buildSaveObject().player.hp,enemy:enemies.map(e=>[e.id,e.hp,e.alive]),turnCount,inventory:player.inventory})'),end,'recorded item/movement actions replay deterministically')
  assert.equal(run('replayRngIndex'),record.rng.length,'recorded RNG consumed')
  console.log('PASS seeded berserk actions and replay')
}
main().catch(err=>{console.error(err.stack);process.exitCode=1})
