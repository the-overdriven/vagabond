// Run with: node tests/sanctuary-idle-check.cjs
// Rule-level deterministic checks for sanctuary awareness and idle movement.
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))

async function main() {
  await run('loadContent()')
  const reset = (mode, x, homeX, abilities = []) => {
    context.enemySetup = {mode, x, homeX, abilities}
    run(`loadGameFromObject(structuredClone(fixture), {isReplayInit:true});
      globalThis.sanctuaryLog=[];log=msg=>sanctuaryLog.push(msg);
      enemyIsVisibleOnMainView=()=>true;
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;
      replaySimulationMode=false;deathTransition=null;
      currentZ=0;map=surfaceMap;spawnPoint={x:50,y:50};player.x=60;player.y=50;
      player.hp=1000;player.maxHp=1000;player.invisibleTurns=0;player.godInvisible=false;player.godMode=false;
      player.poisonTurns=0;player.berryRegenTurns=0;player.curseDebuffs=[];
      for(let y=35;y<=75;y++)for(let x=38;x<=87;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));
      }
      npcs=[];groundItems=[];
      enemies=[{id:'sanctuary-wanderer',name:'Goblin',baseName:'Goblin',tier:1,level:0,
        x:enemySetup.x,y:50,homeX:enemySetup.homeX,homeY:50,homeRadius:1,wander:enemySetup.mode,
        alive:true,hp:100,maxHp:100,atk:5,def:0,spd:2,aggro:20,
        abilities:enemySetup.abilities,humanoid:false,aware:true,alarmed:false,sleeping:false}];
      occupied=new Set([keyXY(enemySetup.x,50)]);ENEMY_WANDER_CHANCE=1;`)
  }
  const pos = () => run('keyXY(enemies[0].x,enemies[0].y)')
  const safe = () => assert(run(`sanctuaryDistance(enemies[0].x,enemies[0].y)>FLEE_DISTANCE &&
    Math.max(Math.abs(enemies[0].x-player.x),Math.abs(enemies[0].y-player.y))>=2`),
    'idle movement must not enter sanctuary or step adjacent to its protected player')
  const play = n => {
    const positions = [pos()]
    for (let i=0;i<n;i++) {run('enemyTurn()');safe();positions.push(pos())}
    return positions
  }

  reset('roam', 65, 65)
  assert(run('playerHiddenFromEnemy(enemies[0])'), 'protected players are hidden from enemy targeting')
  const roam = play(18)
  assert(new Set(roam).size > 4, 'roam enemy must continue wandering while the player is protected')
  assert(!run('enemies[0].aware'), 'protected player no longer maintains pursuit')
  console.log('PASS nearby roam enemy continues moving without entering sanctuary')

  reset('roam', 65, 65, ['trueSight'])
  assert(run('playerHiddenFromEnemy(enemies[0])'), 'trueSight cannot override sanctuary')
  const seer = play(12)
  assert(new Set(seer).size > 2 && !run('enemies[0].aware'), 'trueSight roam behaves as for unseen player')
  console.log('PASS true sight still respects sanctuary and permits idle movement')

  reset('homeReturn', 68, 64)
  const towardHome = play(6)
  assert(towardHome[0] !== towardHome[1], 'homeReturn is not frozen')
  assert(run('Math.max(Math.abs(enemies[0].x-enemies[0].homeX),Math.abs(enemies[0].y-enemies[0].homeY))<=1'),
    'homeReturn returns to its original home leash')
  assert(run('enemies[0].homeX===64'), 'homeReturn never reanchors its home')
  console.log('PASS homeReturn monster returns home despite protected player')

  reset('roam', 61, 61)
  run('sanctuaryLog=[]')
  play(1)
  assert.equal(pos(), '62,50', 'adjacent monster withdraws rather than attacking')
  assert.equal(run("sanctuaryLog.filter(m=>m.includes('retreats from the sacred ground')).length"),1,
    'an outside monster visibly retreating from the protected player announces it')
  const afterRetreat = play(15)
  assert(new Set(afterRetreat).size > 2, 'retreating monster resumes wandering on later turns')
  assert.equal(run("sanctuaryLog.filter(m=>m.includes('retreats from the sacred ground')).length"),1,
    'normal idle wandering must not repeat the retreat message')
  console.log('PASS adjacent retreat message occurs once before ordinary wandering resumes')

  reset(false, 50, 50)
  run('sanctuaryLog=[]')
  for (let i=0;i<3;i++) run('enemyTurn()')
  assert.equal(run("sanctuaryLog.filter(m=>m.includes('retreats from the sacred ground')).length"),1,
    'a sanctuary resident still announces its initial retreat only once')
  console.log('PASS original sacred-ground retreat message remains available')

  reset(false, 65, 65)
  const fixed = play(15)
  assert.equal(new Set(fixed).size, 1, 'explicitly stationary monsters remain stationary')
  run('player.x=61')
  assert(!run('playerHiddenFromEnemy(enemies[0])'), 'leaving sanctuary restores detection')
  run('enemyTurn()')
  assert(run('enemies[0].aware'), 'normal pursuit resumes outside sanctuary')
  console.log('PASS stationary property and sanctuary exit reenable pursuit')

  reset('roam', 63, 63)
  const start = JSON.parse(JSON.stringify(run('buildSaveObject()')))
  context.start = start
  const first = play(20)
  const end = run('JSON.stringify({x:enemies[0].x,y:enemies[0].y,aware:enemies[0].aware,homeX:enemies[0].homeX,rngState,turnCount})')
  run('loadGameFromObject(start,{isReplayInit:true});replayAnimationsDisabled=true;ENEMY_WANDER_CHANCE=1')
  const again = play(20)
  assert.deepEqual(again,first,'restoring a turn sequence produces identical positions')
  assert.equal(run('JSON.stringify({x:enemies[0].x,y:enemies[0].y,aware:enemies[0].aware,homeX:enemies[0].homeX,rngState,turnCount})'),end,
    'same saved RNG and enemy state reproduce exactly after restore')
  console.log('PASS seed-driven wandering and awareness are deterministic after save restore')
}
main().catch(error => {console.error(error.stack);process.exitCode=1})
