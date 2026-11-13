'use strict'
const assert = require('node:assert/strict')
const fs = require('node:fs')
const {run, context} = require('./helpers/node-game-runtime.cjs')

;(async () => {
  await run('loadContent()')
  context.fixture = JSON.parse(fs.readFileSync('tests/saves/Tester_start.json', 'utf8'))
  for (const active of [false, true]) {
    run(`loadGameFromObject(fixture, {isReplayInit: true});
      currentZ = 0;
      enemies = enemies.filter(e => e.alive && onCurrentLevel(e)).slice(0, 1);
      AdaptivePlayerTrolling.active = () => ${active};
      AdaptivePlayerTrolling.onWorldTurn = () => {};
      AdaptivePlayerTrolling.beastMayInitiateCombat = () => true`)
    assert.equal(run('enemies.length'), 1, 'exercise the enemy loop')
    const before = run('turnCount')
    assert.doesNotThrow(() => run('enemyTurn()'), `enemy turn with trolling active=${active}`)
    assert.equal(run('turnCount'), before + 1)
  }
  for (const species of ['Guardian of the Deep', 'Forest Spirit', 'Debt Collector', 'Wolf']) {
    const path = run(`enemyPortraitPath(${JSON.stringify(species)})`)
    assert.ok(fs.existsSync(path), `portrait exists for ${species}: ${path}`)
  }
  assert.equal(run("enemyPortraitPath('Guardian of the Deep')"), 'img/enemies/guardian_of_the_deep.jpg')
  assert.equal(run("enemyPortraitPath('Forest Spirit')"), 'img/enemies/ghost.jpg')
  console.log('PASS enemy-turn scope and shared enemy portrait paths')
})().catch(error => {
  console.error(error.stack)
  process.exitCode = 1
})
