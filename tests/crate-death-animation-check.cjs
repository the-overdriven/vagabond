// Run with: node tests/crate-death-animation-check.cjs
// Presentation-only rule check; the browser spec covers the rendered animation.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {run, context} = require('./helpers/node-game-runtime.cjs')
context.fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'saves/Tester_start.json'), 'utf8'))

async function setup(animated, imageMode) {
  run(`loadGameFromObject(structuredClone(fixture),{isReplayInit:true});
    log=()=>{};replayRecording=false;replayPlaying=false;replaySimulationMode=false;
    replayAnimationsDisabled=${!animated};USE_TILE_IMAGES=${imageMode};
    raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;deathTransition=null;
    currentZ=chainZForDepth(4);currentCave=-1;
    var animationTestLevel=deepLevels[2];map=animationTestLevel.map;undergroundDiscovered=animationTestLevel.discovered;
    player.x=100;player.y=100;player.baseAtk=100;player.hp=1000;player.maxHp=1000;
    player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3};
    enemies=[];npcs=[];occupied=new Set();groundItems=[];fxAnims=[];
    for(let y=96;y<105;y++)for(let x=97;x<107;x++)map[y][x]='marble';
    map[100][101]='dwarvencrate';animationTestLevel.crates=[{x:101,y:100,hp:1,lootKind:'potion'}];
    invalidateUndergroundFov();updatePlayerStatuses=()=>{};updateAlarmedEnemies=()=>{};renderMinimap=()=>{};
    animateAttackLunge=(fromX,fromY,targetX,targetY)=>{
      attackAnim={fromX,fromY,targetX,targetY,start:1000,duration:220};
      return Promise.resolve();
    }`)
  await run('tryMove(1,0)')
  assert.equal(run("map[100][101]"), 'dwarvencratepieces', 'crate collision resolves immediately')
  assert.equal(run("isWalkable(101,100) && playerPathCanTraverse(101,100) && !TILE.dwarvencratepieces.projectileBlock && !TILE.dwarvencratepieces.blocksSight"), true,
    'debris leaves movement, auto-travel, shots and sight open')
  assert.equal(run("CODE_TILE[TILE_CODE.dwarvencratepieces]"), 'dwarvencratepieces', 'debris has its own save terrain code')
  assert.equal(run("groundItems.filter(g=>g.kind==='potion'&&g.x===101).length"), 1, 'loot is rolled only once')
}

async function main() {
  await run('loadContent()')
  for (const imageMode of [true, false]) {
    for (const animated of [true, false]) {
      await setup(animated, imageMode)
      assert.equal(run('fxAnims.length'), 0, 'breaking crates never queues a death effect')
      if (animated) assert.equal(run('attackAnim.duration'), 220, 'player lunge retained')
      run(`var potionDraws=0,debrisDraws=0;var oldGroundDraw=drawImageVisualWithShadow;
        var oldTileDraw=drawImageVisual;var oldGlyphDraw=drawTile;
        drawImageVisualWithShadow=(x,y,visual,alpha)=>{
          if(visual===RENDER_STYLE.groundItems.potion)potionDraws++;
          return oldGroundDraw(x,y,visual,alpha)
        };
        drawImageVisual=(x,y,visual,alpha)=>{
          if(visual?.image===RENDER_STYLE.terrainTiles.dwarvencratepieces.image)debrisDraws++;
          return oldTileDraw(x,y,visual,alpha)
        };
        drawTile=(x,y,ch,...rest)=>{if(ch===';')debrisDraws++;return oldGlyphDraw(x,y,ch,...rest)}`)
      const rngBefore=run('rngState')
      run('renderScene(1001)')
      assert.ok(run('debrisDraws')>0, 'debris drawn on first frame, including during lunge')
      assert.ok(run('potionDraws')>0, 'loot drawn immediately without waiting for animation')
      assert.equal(run('rngState'),rngBefore,'rendering consumes no gameplay RNG')
      run('drawImageVisualWithShadow=oldGroundDraw;drawImageVisual=oldTileDraw;drawTile=oldGlyphDraw')
      run(`var monsterEffect={x:102,y:100,name:'Goblin',baseName:'Goblin',tier:1};spawnDeathAnim(monsterEffect)`)
      assert.equal(run('fxAnims.length'),1,'ordinary monster death effects unchanged')
      console.log('PASS immediate debris and loot, no crate death effect, monster effects retained:',imageMode?'tiles':'ASCII',animated?'animated':'replay')
    }
  }
}
main().catch(error => {console.error(error.stack);process.exitCode = 1})
