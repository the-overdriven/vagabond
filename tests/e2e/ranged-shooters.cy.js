function beginShooterGame() {
  cy.viewport(1440, 900)
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.window().then(win => win.eval('WORLD_SEED = 42424242; rngState = WORLD_SEED'))
  cy.get('#raceName').clear().type('Shooter Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
  cy.window().then(win => win.eval(`(() => {
    window.rangedAssert = (condition, message) => { if (!condition) throw new Error(message) }
    window.resetRangedArena = () => {
      replayAnimationsDisabled = true
      replayRecording = false; replayPlaying = false; replaySimulationMode = false; activeReplay = null
      currentZ = 0; map = surfaceMap; raceOpen = false
      deathTransition = null; cameraAnimating = false; attackAnim = null
      mapOpen = false; invOpen = false; tradeOpen = false
      projectileAnims = []; damageAnims = []; fxAnims = []
      for (let y = 25; y <= 60; y++) for (let x = 25; x <= 60; x++) {
        map[y][x] = 'grass'; discovered[y][x] = true; grasslandTrees.delete(keyXY(x, y))
      }
      player.x = 40; player.y = 40; player.hp = 1000; player.maxHp = 1000
      player.baseDef = 0; player.baseSpd = 3; player.godMode = false; player.invisibleTurns = 0
      player.freezing = {active:false, turns:0}; player.curseDebuffs = []
      player.equip.weapon = null; player.equip.shield = null; player.equip.armor = null
      enemies = []; npcs = []; groundItems = []; occupied = new Set()
      turnCount = 0; consecutiveWaitTurns = 0; spawnPoint = {x:120,y:120}
    }
    window.makeShooter = (name='Skeleton', dx=3, extra={}) => {
      const tmpl = ENEMY_TEMPLATE_BY_NAME[name]
      const ability = shooterAbilityForTemplate(tmpl)
      const e = {
        id: extra.id || 'ranged-test', name, baseName:name, tier:tmpl.tier, level:0,
        hp:200, maxHp:200, atk:tmpl.atk, def:tmpl.def, spd:tmpl.spd,
        aggro:extra.aggro ?? 4, fly:!!tmpl.fly, humanoid:!!tmpl.humanoid, evades:false,
        x:player.x + dx, y:player.y, homeX:player.x + dx, homeY:player.y,
        homeTileType:'grass', alive:true, wander:false, aware:extra.aware ?? true,
        alarmed:!!extra.alarmed, alarmedZ:extra.alarmed ? 0 : null,
        alarmedLevelKind:extra.alarmed ? currentLevelKind() : null,
        shooterAbility:extra.shooterAbility ?? ability, shotsRemaining:extra.shotsRemaining ?? 10,
        equipment:extra.equipment ?? null, prefix:extra.prefix ?? null, crit:!!extra.crit,
        ...extra
      }
      enemies.push(e); occupied.add(keyXY(e.x,e.y)); return e
    }
    resetRangedArena()
  })()`))
}

describe('Ranged shooter monster variants', () => {
  beforeEach(beginShooterGame)

  it('uses configured eligibility, rolls once, and preserves exact ammo in save/replay state', () => {
    cy.window().then(win => win.eval(`(() => {
      resetRangedArena()
      const expected = {
        Monkey:'shooterStones', Goblin:'shooterStones', Kobold:'shooterArrows',
        'Lizard Man':'shooterArrows', Nymph:'shooterArrows', Centaur:'shooterArrows', Skeleton:'shooterArrows'
      }
      for (const [name, ability] of Object.entries(expected)) {
        rangedAssert(shooterAbilityForTemplate(ENEMY_TEMPLATE_BY_NAME[name]) === ability, name+' ability')
      }
      rangedAssert(shooterAbilityForTemplate(ENEMY_TEMPLATE_BY_NAME.Wolf) === null, 'Wolf must not be eligible')
      rangedAssert(RANGED_CONFIG.shooterChance === 0.5 && RANGED_CONFIG.startingShots === 10, 'configured chance/ammo')
      rangedAssert(RANGED_CONFIG.abilities.shooterStones.atk === 3 && RANGED_CONFIG.abilities.shooterArrows.atk === 5, 'projectile ATK config')

      const original = rng; let calls = 0
      try {
        rng = () => { calls++; return 0.499999 }
        const e = {name:'Skeleton',baseName:'Skeleton'}
        initializeEnemyShooter(e, ENEMY_TEMPLATE_BY_NAME.Skeleton)
        rangedAssert(e.shooterAbility === 'shooterArrows' && e.shotsRemaining === 10, 'eligible spawn becomes shooter')
        initializeEnemyShooter(e, ENEMY_TEMPLATE_BY_NAME.Skeleton)
        rangedAssert(calls === 1 && e.shotsRemaining === 10, 'shooter roll happens only once')
        const wolf = {name:'Wolf',baseName:'Wolf'}
        initializeEnemyShooter(wolf, ENEMY_TEMPLATE_BY_NAME.Wolf)
        rangedAssert(calls === 1 && !wolf.shooterAbility && wolf.shotsRemaining === 0, 'noneligible consumes no shooter roll')
        rng = () => { calls++; return 0.5 }
        const melee = {name:'Skeleton',baseName:'Skeleton'}
        initializeEnemyShooter(melee, ENEMY_TEMPLATE_BY_NAME.Skeleton)
        rangedAssert(calls === 2 && !melee.shooterAbility && melee.shotsRemaining === 0, 'roll at 50% boundary stays melee')
        rng = () => { calls++; return 0 }
        initializeEnemyShooter(melee, ENEMY_TEMPLATE_BY_NAME.Skeleton)
        rangedAssert(calls === 2 && !melee.shooterAbility && melee.shotsRemaining === 0, 'failed shooter roll is never retried')
      } finally { rng = original }

      resetRangedArena()
      const shooter = makeShooter('Skeleton', 3, {id:'persist-shooter',shotsRemaining:7})
      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      rangedAssert(save.version === 21, 'save version')
      rangedAssert(save.enemies.find(e=>e.id==='persist-shooter').shotsRemaining === 7, 'save exact ammo')
      shooter.shotsRemaining = 1
      loadGameFromObject(save)
      const loaded = enemies.find(e=>e.id==='persist-shooter')
      rangedAssert(loaded.shooterAbility === 'shooterArrows' && loaded.shotsRemaining === 7, 'load exact ammo')
      startReplayRecording()
      const snap = replayData.initialState.enemies.find(e=>e.id==='persist-shooter')
      rangedAssert(snap.shooterAbility === 'shooterArrows' && snap.shotsRemaining === 7, 'replay starting state exact ammo')
      replayRecording = false; replayData = null
      return true
    })()`)).should('equal', true)
  })

  it('uses one deterministic line for FOV/projectiles and blocks terrain/ground creatures correctly', () => {
    cy.window().then(win => win.eval(`(() => {
      resetRangedArena()
      const e = makeShooter('Skeleton', 4)
      const clear = () => !!clearProjectilePath(e)
      rangedAssert(clear(), 'empty line must be clear')
      rangedAssert(UndergroundFov.canSee(map,e.x,e.y,player.x,player.y), 'FOV line must see across open ground')
      occupied.delete(keyXY(e.x,e.y)); e.y=player.y+4; occupied.add(keyXY(e.x,e.y))
      rangedAssert(clear() && shooterCanSeePlayer(e), 'diagonal shots are allowed on a clear line')
      occupied.delete(keyXY(e.x,e.y)); e.y=player.y; occupied.add(keyXY(e.x,e.y))

      for (const tile of ['forest','ancientForest','dwarvenstatue','cavewall']) {
        map[player.y][player.x+2] = tile; rangedAssert(!clear(), tile+' blocks projectile')
        map[player.y][player.x+2] = 'grass'
      }
      grasslandTrees.add(keyXY(player.x+2,player.y)); rangedAssert(!clear(), 'grassland tree blocks projectile')
      grasslandTrees.delete(keyXY(player.x+2,player.y))

      map[player.y][player.x+2] = 'hill'; rangedAssert(!clear(), 'hill blocks from low ground')
      map[e.y][e.x] = 'hill'; rangedAssert(clear(), 'shooter standing on hill shoots over intermediate hill')
      map[e.y][e.x] = 'grass'; map[player.y][player.x+2] = 'grass'

      const blocker = {id:'blocker',name:'Wolf',baseName:'Wolf',x:player.x+2,y:player.y,level:0,alive:true,fly:false}
      enemies.push(blocker); occupied.add(keyXY(blocker.x,blocker.y)); rangedAssert(!clear(), 'ground monster blocks')
      blocker.fly = true; rangedAssert(clear(), 'flying monster does not block')
      enemies.splice(enemies.indexOf(blocker),1); occupied.delete(keyXY(blocker.x,blocker.y))
      npcs.push({name:'Old Hunter',x:player.x+2,y:player.y}); rangedAssert(!clear(), 'NPC blocks')
      npcs = []

      map[player.y][player.x] = 'forest'; rangedAssert(clear(), 'target forest tile itself does not block')
      map[player.y][player.x] = 'hill'; rangedAssert(clear(), 'target hill tile itself does not block')
      map[player.y][player.x] = 'grass'; map[e.y][e.x] = 'forest'; rangedAssert(clear(), 'shooter blocking tile itself does not block')
      return true
    })()`)).should('equal', true)
  })

  it('resolves fixed projectile damage, doubled dodge, crit/glancing, ammo and non-lunge visuals', () => {
    cy.window().then(win => win.eval(`(() => {
      resetRangedArena()
      const original = rng
      const useRolls = values => { let rolls=values.slice(); rng=()=>rolls.length?rolls.shift():0.99 }
      try {
        let e = makeShooter('Skeleton',3,{atk:99,prefix:'Brutal',equipment:{kind:'weapon',base:'Test Bowless Weapon',atk:100,grace:99}})
        player.equip.weapon={kind:'weapon',name:'Slow Test Weapon',base:'Club',atk:1,grace:0}
        let before = player.hp; useRolls([0.99,0.5,0.99])
        enemyRangedAttackPlayer(e, clearProjectilePath(e))
        rangedAssert(before-player.hp === 6, 'arrow uses fixed 5 ATK, not monster/prefix/weapon ATK')
        rangedAssert(e.shotsRemaining === 9, 'ordinary hit consumes one ammo and GRACE grants no extra shot')

        resetRangedArena(); e=makeShooter('Goblin',3,{atk:99})
        before=player.hp; useRolls([0.99,0.5,0.99]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(before-player.hp === 4, 'stone uses fixed 3 ATK')

        resetRangedArena(); e=makeShooter('Skeleton',3)
        rangedAssert(Math.abs(rangedDodgeChance(e) - 0.30) < 1e-9, 'equal-speed ranged dodge is 2x melee 15%')
        player.baseSpd = 100; rangedAssert(rangedDodgeChance(e) === 1, 'ranged dodge respects cap')

        resetRangedArena(); e=makeShooter('Skeleton',3); player.baseDef=1000
        before=player.hp; useRolls([0.99,0,0.99]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(before-player.hp === 1, 'genuine normal hit minimum is 1')

        resetRangedArena(); e=makeShooter('Skeleton',3); player.baseDef=1000
        player.equip.armor={kind:'armor',name:'Test Armor',base:'Robe',def:0}
        before=player.hp; useRolls([0.99,0,0,0.99]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(before-player.hp === 0 && e.shotsRemaining===9, 'zero-damage glancing hit stays zero and consumes ammo')

        resetRangedArena(); e=makeShooter('Skeleton',3)
        player.equip.armor={kind:'armor',name:'Test Armor',base:'Robe',def:0}
        before=player.hp; useRolls([0.99,0,0.5,0]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(before-player.hp === 2, 'glancing and critical rolls are mutually exclusive')

        resetRangedArena(); e=makeShooter('Skeleton',3)
        before=player.hp; useRolls([0.99,0.5,0]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(before-player.hp === 12, 'critical doubles fixed arrow damage')

        resetRangedArena(); e=makeShooter('Skeleton',3,{shotsRemaining:2})
        before=player.hp; useRolls([0]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(player.hp===before && e.shotsRemaining===1, 'dodged shot consumes ammo without damage')
        before=player.hp; useRolls([0.99,0.5,0.99]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(player.hp<before && e.shotsRemaining===0 && !enemyIsShooter(e), 'tenth/final shot resolves before exhaustion')
        rangedAssert(!tileInspectInfo(e.x,e.y).html.includes('shooter-marker'), 'exhausted tooltip drops bow')

        resetRangedArena(); e=makeShooter('Skeleton',3)
        player.invisibleTurns=10; before=player.hp; const hiddenAmmo=e.shotsRemaining
        useRolls([0]); rangedAssert(!enemyRangedAttackPlayer(e,clearProjectilePath(e)), 'direct ranged resolver rejects invisible target')
        rangedAssert(player.hp===before && e.shotsRemaining===hiddenAmmo, 'invisible rejection spends no ammo or RNG-resolved attack')

        resetRangedArena(); e=makeShooter('Skeleton',3)
        rangedAssert(tileInspectInfo(e.x,e.y).html.includes('shooter-marker'), 'active tooltip shows bow')
        rangedAssert(RENDER_STYLE.projectiles.arrow.image === 'img/projectiles/arrow.png', 'arrow sprite path')
        rangedAssert(RENDER_STYLE.projectiles.stone.image === 'img/projectiles/stone.png', 'stone sprite path')
        replayAnimationsDisabled=false; USE_TILE_IMAGES=false; projectileAnims=[]; e.attackStart=undefined; attackAnim=null
        useRolls([0]); enemyRangedAttackPlayer(e,clearProjectilePath(e))
        rangedAssert(projectileAnims.length===1, 'projectile animation exists in ASCII mode')
        rangedAssert(e.attackStart===undefined && attackAnim===null, 'ranged shot creates no melee lunge')
        const anim = projectileAnims[0]
        render(anim.start - 5)
        rangedAssert(projectileAnims.length===1, 'pre-start animation frame is clamped instead of crashing')

        projectileAnims = [{
          path:[{x:44,y:42},{x:43,y:41},{x:42,y:41},{x:41,y:40},{x:40,y:40}],
          projectile:'arrow', start:1000, duration:1000
        }]
        const originalRotate = ctx.rotate, angles = []
        ctx.rotate = angle => { angles.push(angle); return originalRotate.call(ctx, angle) }
        try {
          render(1100)
          render(1500)
          render(1900)
        } finally {
          ctx.rotate = originalRotate
        }
        rangedAssert(angles.length >= 3 && angles.every(angle => Math.abs(angle - angles[0]) < 1e-9), 'arrow keeps one orientation for the whole shot')
      } finally { rng=original; replayAnimationsDisabled=true }
      return true
    })()`)).should('equal', true)
  })

  it('keeps shooter behavior inside normal AI priorities and uses current effective AGGRO', () => {
    cy.window().then(win => win.eval(`(() => {
      const original=rng
      try {
        rng=()=>0.99
        resetRangedArena(); let e=makeShooter('Skeleton',3,{aggro:4,aware:true}); let x=e.x
        enemyTurn(); rangedAssert(e.shotsRemaining===9 && e.x===x, 'inside range shoots without moving/kiting')

        resetRangedArena(); e=makeShooter('Skeleton',1,{aggro:4,aware:true}); enemyTurn()
        rangedAssert(e.shotsRemaining===10, 'adjacent shooter melees without ammo use')

        resetRangedArena(); e=makeShooter('Skeleton',4,{aggro:4,aware:true}); x=e.x; enemyTurn()
        rangedAssert(e.shotsRemaining===10 && e.x!==x, 'exact outer AGGRO line chases')

        resetRangedArena(); e=makeShooter('Skeleton',3,{aggro:4,aware:true}); map[player.y][player.x+2]='forest'; x=e.x; enemyTurn()
        rangedAssert(e.shotsRemaining===10 && e.x!==x, 'blocked shot uses normal chase and spends no ammo')

        resetRangedArena(); e=makeShooter('Skeleton',3,{aggro:4,aware:true}); map[player.y][player.x+2]='boulder'; x=e.x; enemyTurn()
        rangedAssert(e.shotsRemaining===10 && e.x!==x, 'no FOV does not shoot')

        resetRangedArena(); e=makeShooter('Skeleton',3,{aggro:4,aware:true}); player.invisibleTurns=10; x=e.x; enemyTurn()
        rangedAssert(e.shotsRemaining===10 && e.x===x && !e.aware, 'invisible player is never shot or chased')

        resetRangedArena(); e=makeShooter('Skeleton',3,{aggro:3,aware:false}); x=e.x; enemyTurn()
        rangedAssert(e.alarmed && effectiveAggroRange(e)===5, 'first spotting alarms and expands effective AGGRO')
        rangedAssert(e.shotsRemaining===9 && e.x===x, 'same turn uses current enlarged AGGRO and shoots')

        resetRangedArena(); e=makeShooter('Skeleton',3,{aggro:4,aware:true,shotsRemaining:0}); x=e.x; enemyTurn()
        rangedAssert(e.x!==x, 'zero-ammo variant immediately uses normal monster chase')
      } finally { rng=original }
      return true
    })()`)).should('equal', true)
  })

  it('replays the same firing decision, RNG result and ammunition consumption', () => {
    cy.window().then(win => win.eval(`(async () => {
      resetRangedArena(); replayAnimationsDisabled=true
      const e=makeShooter('Skeleton',3,{id:'replay-shooter',aggro:4,aware:true,shotsRemaining:7})
      rngState=1357911; startReplayRecording(); skipTurn()
      const recorded=JSON.parse(JSON.stringify(replayData))
      const expected={hp:player.hp,shots:enemies.find(x=>x.id==='replay-shooter').shotsRemaining,x:e.x,y:e.y}
      rangedAssert(expected.shots===6, 'recording fired exactly once')
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true; activeReplay=recorded
      replayPlaying=true; replayRecording=false; replayRngIndex=0; replayActionIndex=0
      try {
        await runReplayAction(recorded.actions[0])
        const replayed=enemies.find(x=>x.id==='replay-shooter')
        rangedAssert(player.hp===expected.hp && replayed.shotsRemaining===expected.shots && replayed.x===expected.x && replayed.y===expected.y, 'replayed shooter state matches')
        rangedAssert(replayRngIndex===recorded.rng.length, 'replay consumes identical RNG')
      } finally {
        replayPlaying=false; replaySimulationMode=false; activeReplay=null; replayRecording=false; replayData=null
      }
      return true
    })()`)).should('equal', true)
  })
})
