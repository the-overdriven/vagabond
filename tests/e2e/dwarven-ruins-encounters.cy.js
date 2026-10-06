describe('Dwarven Ruins encounter progression', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Ruins Encounter Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('builds seeded depth-gated floor populations with exactly one Champion', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      for (const fixture of [
        {seed: 12345, count: 3, traits: []},
        {seed: 24680, count: 4, traits: ['hollow_world']},
        {seed: 67890, count: 5, traits: ['grand_delving']}
      ]) {
        replayRecording = false
        replayPlaying = false
        currentZ = 0
        currentCave = -1
        map = surfaceMap
        const traits = WORLD_TRAITS.filter(trait => fixture.traits.includes(trait.name))
        check(traits.length === fixture.traits.length, 'requested traits exist')
        applyWorldTraits(traits.map(trait => {
          const resolved = structuredClone(trait)
          for (const effect of resolved.effects) if (Array.isArray(effect.value))
            effect.value = (effect.value[0] + effect.value[1]) / 2
          return resolved
        }))
        WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange = [fixture.count, fixture.count]
        WORLD_SEED = fixture.seed
        rngState = WORLD_SEED
        await generateNewWorld()

        const cfg = WORLD_GEN_CONFIG.dungeons.dwarvenRuins.encounters
        const ruins = deepLevels.slice(2)
        check(ruins.length === fixture.count, 'configured floor count generated')
        for (let i = 0; i < ruins.length; i++) {
          const level = ruins[i]
          const z = chainZForDepth(i + 4)
          const mobs = enemies.filter(e => e.alive && (e.level ?? 0) === z)
          const champions = mobs.filter(e => e.prefix === 'Champion')
          const species = new Set(mobs.map(e => e.baseName || e.name))

          check(champions.length === cfg.championsPerFloor, 'configured Champion count per Ruins floor')
          check(mobs.some(e => e !== champions[0] && e.baseName === champions[0].baseName),
            'Champion leads at least one same-species guard')
          for (const vault of level.vaults || []) {
            const vaultMobs = mobs.filter(e => e.dungeonVaultId === vault.id)
            if ((vault.roles?.backline || 0) > 0 && (vault.slots?.backline || []).length) {
              const backline = vaultMobs.filter(e => e.dungeonRole === 'backline')
              check(backline.length >= 1, 'vault backline role produces at least one tactical enemy')
              check(backline.every(e => enemyIsShooter(e)), 'vault backline enemies are actual shooter variants')
            }
            check(vaultMobs.filter(e => e.dungeonRole === 'frontline' || e.dungeonRole === 'group').every(e => !enemyIsShooter(e)),
              'frontline/group vault roles stay melee even for shooter-capable species')
          }
          check(mobs.length >= 3, 'Ruins floor has a meaningful encounter population')
          check(species.size >= 2, 'Ruins floor exposes at least two base-species families')
          check(!mobs.some(e => e !== champions[0] && e.prefix === 'Champion'), 'ordinary prefix rolls never create a second Champion')

          for (const enemy of mobs) {
            check(DungeonTraps.safeSpawn(enemy.x, enemy.y, z), 'enemy spawn stays clear of trap danger')
            const minDepth = Number(cfg.minDepthByTier[String(enemy.tier)])
            check(Number.isFinite(minDepth) && Math.abs(z) >= minDepth, 'enemy satisfies tier depth gate')
            check(level.caves[0].entrances.every(p =>
              Math.max(Math.abs(p.x - enemy.x), Math.abs(p.y - enemy.y)) > cfg.entranceClearance),
              'enemy spawn stays outside transition safety clearance')
          }
        }

        const before = JSON.stringify(enemies.filter(e => e.alive && e.level <= -4).map(e => ({
          name: e.name, baseName: e.baseName, prefix: e.prefix, level: e.level,
          x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, wander: enemyWanderMode(e)
        })))
        const save = JSON.parse(JSON.stringify(buildSaveObject()))
        check(save.version === self.VAGABOND_SAVE_VERSION, 'encounters use the current save schema')
        loadGameFromObject(save, {isReplayInit: true})
        const after = JSON.stringify(enemies.filter(e => e.alive && e.level <= -4).map(e => ({
          name: e.name, baseName: e.baseName, prefix: e.prefix, level: e.level,
          x: e.x, y: e.y, hp: e.hp, maxHp: e.maxHp, wander: enemyWanderMode(e)
        })))
        check(after === before, 'save/load preserves exact generated Ruins encounter state')
      }

      check(/^v\\d+$/.test(self.VAGABOND_GAME_VERSION), 'game version is exposed')
      check(Number.isInteger(self.VAGABOND_SAVE_VERSION), 'save schema is exposed')
    })()`))
  })

  it('alerts nearby Ruins enemies only after actual fleeing movement', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, msg) => { if (!ok) throw new Error(msg) }
      currentZ = -4
      currentCave = -1
      map = deepLevels[2].map
      undergroundDiscovered = deepLevels[2].discovered
      for (let y = 20; y <= 30; y++) for (let x = 20; x <= 30; x++) {
        map[y][x] = 'marble'
        undergroundDiscovered[y][x] = true
      }
      player.x = 20
      player.y = 25

      const makeEnemy = (id, name, x, y, hp = 20) => ({
        id, name, baseName: name, tier: 2, level: -4, levelKind: 'chain', caveIndex: -1,
        hp, maxHp: 20, atk: 1, def: 0, spd: 2, grace: 2, abilities: ['flee'], humanoid: true,
        aggro: 4, x, y, homeX: x, homeY: y, homeTileType: 'marble', alive: true,
        prefix: null, equipment: null, wander: false
      })

      const fleeing = makeEnemy('flee', 'Goblin', 24, 25, 1)
      const same = makeEnemy('same', 'Goblin', 26, 25)
      const other = makeEnemy('other', 'Kobold', 27, 26)
      enemies = []
      occupied = new Set()
      addEnemy(fleeing)
      addEnemy(same)
      addEnemy(other)
      occupied = new Set(enemies.map(e => keyXY(e.x, e.y)))

      const originalChance = chance
      chance = p => p >= 0.5
      check(tryWoundedEnemyFlee(fleeing, true) === true, 'wounded enemy actually flees one tile')
      chance = originalChance
      check(same.alarmed === true, 'same species follows the 50% alert branch')
      check(other.alarmed !== true, 'different species follows the 10% alert branch')

      same.alarmed = false
      other.alarmed = false
      fleeing.x = 24
      fleeing.y = 25
      occupied = new Set(enemies.map(e => keyXY(e.x, e.y)))
      const originalEscape = enemyEscapeDestination
      enemyEscapeDestination = () => null
      const rngBefore = rngState
      check(tryWoundedEnemyFlee(fleeing, true) === false, 'boxed-in enemy cannot flee')
      enemyEscapeDestination = originalEscape
      check(!same.alarmed && !other.alarmed && rngState === rngBefore,
        'no alert roll occurs when no fleeing movement happened')
    })()`))
  })
})
