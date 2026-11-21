describe('Vampire lifesteal and underground guarantee', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    cy.get('#loadingOverlay').should('not.be.visible')
    // The first two tests only exercise combat formulas. Load a stable game
    // snapshot and let the underground guarantee case generate its own seed.
    cy.window().should(win => expect(win.eval('!!BASE_MAP_CONFIG.world?.defaultSize')).to.equal(true))
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__vampireBootstrap=save
      win.eval('loadGameFromObject(window.__vampireBootstrap,{isReplayInit:true})')
      delete win.__vampireBootstrap
    }))
  })

  it('heals from damaging melee hits, respects rounding and missing HP', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => {if (!ok) throw new Error(message)}
      const previousChance = chance
      let rolls = 0
      const vampire = {name:'Vampire',abilities:['lifesteal'],hp:40,maxHp:100,x:player.x,y:player.y}
      try {
        chance = p => {check(p === 0.30, 'proc chance'); rolls++; return true}
        applyEnemyLifesteal(vampire, 30)
        check(vampire.hp === 50, 'one third healing')
        applyEnemyLifesteal(vampire, 5)
        check(vampire.hp === 51, 'round down')
        applyEnemyLifesteal(vampire, 2)
        check(vampire.hp === 51, 'small hit heals zero')
        const before = rolls
        applyEnemyLifesteal(vampire, 0)
        applyEnemyLifesteal({abilities:[]}, 30)
        check(rolls === before, 'no RNG for zero damage or non-lifesteal enemies')
        vampire.hp = 99
        applyEnemyLifesteal(vampire, 30)
        check(vampire.hp === 100, 'maximum HP cap')
        chance = () => false
        vampire.hp = 40
        applyEnemyLifesteal(vampire, 30)
        check(vampire.hp === 40, 'failed proc')
      } finally {chance = previousChance}
    })()`))
  })

  it('uses effective damage for an overkill hit before resolving death', () => {
    cy.window().then(win => win.eval(`(() => {
      const previous = {chance, damageRoll, missChance, die, hp:player.hp, poisonTurns:player.poisonTurns,
        spawnPoint:{x:spawnPoint.x,y:spawnPoint.y}}
      const vampire = {name:'Vampire',abilities:['lifesteal'],hp:40,maxHp:100,atk:30,def:0,spd:3,
        aggro:4,alive:true,x:player.x+1,y:player.y,level:0,humanoid:false}
      let deathHealing = null
      try {
        spawnPoint = {x:0,y:0}
        player.hp = 6
        chance = p => p === 0.30
        missChance = () => 0
        damageRoll = () => 30
        die = () => {deathHealing = vampire.hp}
        enemyAttackPlayer(vampire, true)
        if (vampire.hp !== 42 || deathHealing !== 42) throw new Error('overkill must heal 2 before death')
      } finally {
        chance = previous.chance; damageRoll = previous.damageRoll; missChance = previous.missChance
        die = previous.die; player.hp = previous.hp; player.poisonTurns = previous.poisonTurns
        spawnPoint = previous.spawnPoint
      }
    })()`))
  })

  it('places a reachable distant underground Vampire and restores it without respawning', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, message) => {if (!ok) throw new Error(message)}
      replayRecording=false;replayPlaying=false;replayData=null
      currentZ=0;currentCave=-1;map=surfaceMap
      applyWorldTraits([]);WORLD_SEED=1706598071;rngState=WORLD_SEED
      await generateNewWorld()
      startReplayRecording()
      const areas = undergroundVampireAreas()
      const vampires = enemies.filter(e => e.alive && (e.baseName || e.name) === 'Vampire' &&
        areas.some(area => vampireEnemyInArea(e, area)))
      check(vampires.length >= 1, 'underground guarantee')
      const vampire = vampires[0], area = areas.find(a => vampireEnemyInArea(vampire,a))
      check(vampire.abilities.includes('lifesteal'), 'Vampire ability')
      const previousEnemies = enemies
      try {
        enemies = enemies.filter(e => e !== vampire)
        check(undergroundVampireSites(area).some(p => p.x===vampire.x && p.y===vampire.y), 'safe reachable corner')
      } finally {enemies = previousEnemies}
      const count = enemies.length, beforeRng = rngState
      ensureUndergroundVampire()
      check(enemies.length === count && rngState === beforeRng, 'idempotent guarantee')
      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.replay.initialState.enemies.some(e => e.id===vampire.id), 'Vampire in replay initial state')
      loadGameFromObject(save)
      const restored = enemies.find(e => e.id===vampire.id)
      check(enemies.length === save.enemies.length && restored.hp === vampire.hp &&
        restored.abilities.includes('lifesteal'), 'save restores without respawn')
    })()`))
  })
})
