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
  assert.equal(run("map[100][101]"), 'marble', 'crate collision resolves immediately')
  assert.equal(run("groundItems.filter(g=>g.kind==='potion'&&g.x===101).length"), 1, 'loot is rolled only once')
}

async function main() {
  await run('loadContent()')
  for (const imageMode of [true, false]) {
    await setup(true, imageMode)
    assert.equal(run('fxAnims.length'), 1, 'one death effect per broken crate')
    assert.equal(run('fxAnims[0].start'), 1220, 'crate stays until lunge ends')
    assert.equal(run('fxAnims[0].duration'), run('FX_ANIM_MS'), 'uses the monster death duration')
    assert.equal(run('fxAnims[0].dir'), 1, 'sinks like a dying monster')
    assert.equal(run("fxAnims[0].tileKey==='dwarvencrate'"), true, 'renders the actual crate')
    assert.equal(run('fxAnims[0].level'), run('currentZ'), 'effect scoped to floor')
    assert.equal(run('fxAnims[0].start - 1 < fxAnims[0].start'), true)
    assert.equal(run('fxAnims[0].start + FX_ANIM_MS'), 1640)
    assert.equal(JSON.stringify(run('buildSaveObject()')).includes('fxAnims'), false,
      'presentation is not serialized')

    // The pre-rolled drop must not appear underneath the dying crate.
    run(`var potionDraws=0;var originalGroundVisualDraw=drawImageVisualWithShadow;
      drawImageVisualWithShadow=(x,y,visual,alpha)=>{
        if(visual===RENDER_STYLE.groundItems.potion) potionDraws++;
        return originalGroundVisualDraw(x,y,visual,alpha)
      }`)
    // Spy on the actual canvas drawing branch, not only the animation queue.
    if (imageMode) {
      run(`var crateImageDraws=0;var originalVisualDraw=drawImageVisual;
        drawImageVisual=(x,y,visual,alpha)=>{
          if(x===-TILE_PX/2 && y===-TILE_PX/2 &&
            visual?.image===RENDER_STYLE.terrainTiles.dwarvencrate.image) crateImageDraws++;
          return originalVisualDraw(x,y,visual,alpha)
        }`)
    } else {
      const ctx = context.document.getElementById('canvas').getContext('2d')
      let crateGlyphDraws = 0
      const oldFill = ctx.fillText
      ctx.fillText = function(char,x,y) {
        if (char === '□' && x === 0) crateGlyphDraws++
        return oldFill.call(this,char,x,y)
      }
      context.crateGlyphCounter = () => crateGlyphDraws
    }
    run('renderScene(1219)')
    assert.equal(run('potionDraws'), 0, 'loot stays hidden during the lunge')
    if (imageMode) assert.ok(run('crateImageDraws') > 0, 'crate sprite drawn through the lunge')
    else assert.ok(context.crateGlyphCounter() > 0, 'ASCII crate glyph drawn through the lunge')
    run('renderScene(1320)')
    assert.equal(run('potionDraws'), 0, 'loot stays hidden while the crate fades')
    assert.equal(run('fxAnims.length'), 1, 'crate remains throughout the sink/fade')
    run('renderScene(1641)')
    assert.ok(run('potionDraws') > 0, 'loot appears when the effect finishes')
    assert.equal(run('fxAnims.length'), 0, 'effect expires after its fade')
    assert.equal(run("groundItems.filter(g=>g.kind==='potion'&&g.x===101).length"), 1,
      'rendered frames never change drops')
    run('drawImageVisualWithShadow=originalGroundVisualDraw')
    if (imageMode) run('drawImageVisual=originalVisualDraw')
    console.log('PASS crate lunge, death timing and drawing in', imageMode ? 'tile mode' : 'ASCII mode')
  }
  await setup(false, true)
  assert.equal(run('fxAnims.length'), 0, 'simulation/replay-disabled mode produces no cosmetic delay')
  console.log('PASS immediate deterministic destruction and loot in replay mode')
}
main().catch(error => {console.error(error.stack);process.exitCode = 1})
