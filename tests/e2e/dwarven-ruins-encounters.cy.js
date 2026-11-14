describe('Dwarven Ruins encounter progression', () => {
  it('spawns one 150 HP Venom Eater on the last two ruin floors and absorbs venom repeatedly', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const ruins=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins')
        check(ruins.length>=3,'ruins generated for trial')
        for(let i=0;i<15;i++) AdaptivePlayerTrolling.onVenomAttempt({
          id:'venom-prey-'+i,alive:true,hp:30,family:'living'})
        const enter=(floor)=>{
          currentZ=chainZForDepth(deepLevels.indexOf(floor)+2);currentCave=-1
          map=floor.map;undergroundDiscovered=floor.discovered
          const entrance=floor.caves[0].entrances[0]
          player.x=entrance.x;player.y=entrance.y
          rebuildActiveLevelOccupancy()
        }
        player.equip.weapon=null;player.equip.armor=null;player.equip.shield=null
        enter(ruins[0])
        chance=()=>true
        AdaptivePlayerTrolling.onFloorChanged()
        check(!enemies.some(e=>e.adaptiveEventId==='venom_eater'),'the early ruins cannot spawn Venom Eater')
        enter(ruins[ruins.length-2])
        check(AdaptivePlayerTrolling.onFloorChanged(),'the penultimate ruin floor accepts Venom Eater')
        let eater=enemies.find(e=>e.adaptiveEventId==='venom_eater')
        check(!!eater && eater.baseName==='Venom Eater' && eater.maxHp===150 &&
          eater.hp===150 && eater.atk===18 && eater.def===6 && eater.spd===5 &&
          eater.tier===4, 'Venom Eater uses approved tier-4 stats')
        check(!undergroundTileVisible(eater.x,eater.y) &&
          !CAVE_TRANSITION_TILES.has(map[eater.y][eater.x]),
          'spawn is unseen and does not occupy a stair')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===1,
          'Venom Eater occupies one persistent special threat slot')
        eater.hp=80
        applyPlayerVenomToEnemy(eater)
        check(eater.hp===110 && eater.poisonTurns===0,
          'venom hit heals 20% maximum HP without poisoning')
        eater.hp=90
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        eater=enemies.find(e=>e.adaptiveEventId==='venom_eater')
        check(eater.hp===90, 'wounded state survives save restoration')
        applyPlayerVenomToEnemy(eater)
        check(eater.hp===120 && eater.poisonTurns===0,
          'subsequent venom restores HP even after save and load')
        applyPlayerVenomToEnemy(eater)
        check(eater.hp===150 && eater.poisonTurns===0,
          'every qualifying venom hit heals up to the maximum')
        applyPlayerVenomToEnemy(eater)
        check(eater.hp===150, 'venom cannot heal beyond maximum HP')
        check(!AdaptivePlayerTrolling.onFloorChanged() &&
          enemies.filter(e=>e.adaptiveEventId==='venom_eater').length===1,
          'reentry never duplicates Venom Eater')
        check(saved.adaptivePlayerTrolling.poisonedEnemyIds.length===15 &&
          saved.adaptivePlayerTrolling.completed.includes('venom_eater'),
          'trigger counters and completion are present in saves and replay snapshots')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('counts three separated scroll-invisibility engagements and spawns one True Sight Champion Oculus', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const prey=id=>({id,alive:true,hp:50,family:'living'})
        const a=prey('oculus-prey-a'),b=prey('oculus-prey-b'),c=prey('oculus-prey-c')
        const tryHit=(target,turn,hidden=true)=>{
          AdaptivePlayerTrolling.onCombatAttack(turn)
          if(hidden) AdaptivePlayerTrolling.onPlayerInvisibleHit(target,turn)
        }
        tryHit(a,100)
        tryHit(b,102) // Same battle, cannot count another target.
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===1,
          'different targets within one engagement cannot count twice')
        tryHit(b,106)
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===1,
          'only four attack-free turns do not start a new fight')
        tryHit(b,111)
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===2,
          'five attack-free turns qualify a second engagement')
        const mid=JSON.parse(JSON.stringify(buildSaveObject()))
        AdaptivePlayerTrolling.reset()
        AdaptivePlayerTrolling.restore(mid.adaptivePlayerTrolling)
        tryHit(c,112,false) // Visible/god-mode hit does not qualify.
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===2,
          'attacks without scroll invisibility never qualify')
        tryHit(a,117)
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===2,
          'previously counted enemy cannot qualify twice')
        tryHit(c,122)
        check(AdaptivePlayerTrolling.serialize().oculusTargetIds.length===3,
          'third separate engagement with a new enemy qualifies')
        const ruins=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins')
        check(ruins.length>=2,'test world has late ruins floors')
        const enter=(floor)=>{
          currentZ=chainZForDepth(deepLevels.indexOf(floor)+2);currentCave=-1
          map=floor.map;undergroundDiscovered=floor.discovered
          const entrance=floor.caves[0].entrances[0]
          player.x=entrance.x;player.y=entrance.y
          rebuildActiveLevelOccupancy()
        }
        player.equip.weapon=null;player.equip.shield=null;player.equip.armor=null
        chance=()=>true
        enter(ruins[0]);AdaptivePlayerTrolling.onFloorChanged()
        check(!enemies.some(e=>e.adaptiveEventId==='oculus'),
          'early ruin floor does not spawn Oculus regardless of independent rewards')
        enter(ruins[ruins.length-2]);check(AdaptivePlayerTrolling.onFloorChanged(),
          'Champion Oculus appears on qualifying late floor')
        let eye=enemies.find(e=>e.adaptiveEventId==='oculus')
        check(!!eye && eye.prefix==='Champion' && eye.baseName==='Oculus' &&
          eye.maxHp===154 && eye.atk===23 && eye.def===6 && eye.spd===6 &&
          eye.abilities.includes('trueSight'), 'Champion Oculus inherits Champion stats and true sight')
        check(!undergroundTileVisible(eye.x,eye.y), 'Oculus spawns out of sight')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        eye=enemies.find(e=>e.adaptiveEventId==='oculus')
        check(!!eye && eye.prefix==='Champion' && eye.abilities.includes('trueSight'),
          'Champion Oculus survives save/load')
        check(!AdaptivePlayerTrolling.onFloorChanged() &&
          enemies.filter(e=>e.adaptiveEventId==='oculus').length===1,
          'stair re-entry does not duplicate the encounter')
        check(saved.adaptivePlayerTrolling.completed.includes('oculus') &&
          saved.adaptivePlayerTrolling.oculusTargetIds.length===3,
          'completion and distinct fight targets are serialized')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

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
        const ruins = deepLevels.filter(level => level.dungeonPackage === 'dwarvenRuins')
        check(ruins.length === fixture.count, 'configured floor count generated')
        for (let i = 0; i < ruins.length; i++) {
          const level = ruins[i]
          const z = chainZForDepth(i + 4)
          const mobs = enemies.filter(e => e.alive && (e.level ?? 0) === z)
          const champions = mobs.filter(e => e.prefix === 'Champion')
          const species = new Set(mobs.map(e => e.baseName || e.name))

          check(champions.length === cfg.championsPerFloor, 'configured Champion count per Ruins floor')
          if (i === ruins.length-1) {
            const hall = level.rooms.find(room => room.landmark === 'throneHall')
            const defenders = mobs.filter(enemy => enemy.dungeonRoomId === hall?.id)
            check(!!hall && defenders.some(e => e.dungeonRole === 'frontline') &&
              defenders.some(e => e.dungeonRole === 'group'),
              'final-floor throne hall has a frontline and supporting guard without extra Champions')
            check(defenders.every(e => !e.dungeonVaultId), 'landmark guards do not belong to fitted vaults')
            // A Champion and its same-species escort may be assigned to the
            // hall from the independently rolled Champion family.
            const hallChampion = defenders.find(e => e.dungeonRole === 'champion')
            const themed = defenders.filter(e => e.dungeonRole !== 'royalGuard' &&
              e.dungeonRole !== 'champion' &&
              !(hallChampion && e.dungeonRole === 'group' &&
                e.encounterFamily === hallChampion.encounterFamily &&
                e.baseName === hallChampion.baseName))
            check(themed.every(e => e.encounterFamily === hall.encounterFamily) &&
              defenders.filter(e => e.dungeonRole === 'royalGuard')
                .every(e => e.encounterFamily === null && e.tier === 4) &&
              (!hallChampion || defenders.some(e => e !== hallChampion &&
                e.baseName === hallChampion.baseName &&
                e.encounterFamily === hallChampion.encounterFamily)),
              'hall defenders retain their families, Champion has an escort and royal guards use independent tier-4 picks')
          }
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
          check(mobs.length >= 12, 'expanded Ruins floor has a substantial enemy population')
          const corridorMobs = mobs.filter(enemy => enemy.dungeonRole === 'corridor')
          check(corridorMobs.length >= 2, 'ordinary passage corridors hold deliberate roaming threats')
          check(corridorMobs.every(enemy => !level.rooms.some(room =>
            enemy.x >= room.x && enemy.x < room.x + room.w &&
            enemy.y >= room.y && enemy.y < room.y + room.h)),
            'corridor roamers do not accidentally spawn inside rooms')
          check(corridorMobs.every(enemy => level.rooms.every(room =>
            (room.doorways || []).flat().every(leaf =>
              Math.max(Math.abs(enemy.x - leaf.x), Math.abs(enemy.y - leaf.y)) > cfg.corridorDoorClearance))),
            'dedicated corridor roamers do not block room doorways')
          check(species.size >= 2, 'Ruins floor exposes at least two base-species families')
          check(!mobs.some(e => e !== champions[0] && e.prefix === 'Champion'), 'ordinary prefix rolls never create a second Champion')

          for (const enemy of mobs) {
            const tmpl = ENEMY_TEMPLATE_BY_NAME[enemy.baseName]
            check(!!tmpl, 'every Ruins encounter has a species template')
            if ((tmpl.rarity ?? 1) <= cfg.dominantRarityCutoff && enemy.dungeonRole)
              check(['corridor','roamer'].includes(enemy.dungeonRole),
                'rare monsters only enter through globally weighted wandering encounters')
            const templateMode = Object.prototype.hasOwnProperty.call(tmpl, 'wander')
              ? tmpl.wander : defaultEnemyWanderMode()
            check(enemyWanderMode(enemy) === enemyWanderForLevel(templateMode, z),
              'every Ruins role, including Champions and shooters, inherits species wandering')
            if (Number.isFinite(tmpl.homeRadius)) check(enemy.homeRadius === tmpl.homeRadius,
              'Ruins encounters preserve the species home radius')
            check(DungeonTraps.safeSpawn(enemy.x, enemy.y, z), 'enemy spawn stays clear of trap danger')
            const minDepth = Number(cfg.minDepthByTier[String(enemy.tier)])
            check(Number.isFinite(minDepth) && Math.abs(z) >= minDepth, 'enemy satisfies tier depth gate')
            check(level.caves[0].entrances.every(p =>
              Math.max(Math.abs(p.x - enemy.x), Math.abs(p.y - enemy.y)) >
                (['prisonShooter','gallery0','gallery1'].includes(enemy.dungeonRole) ? 1 : cfg.entranceClearance)),
              'open-floor enemies stay clear of stairs; barred prison guards avoid the immediate landing')
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

  it('allows Champions, escorts and shooters to take their normal idle wander steps', () => {
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
      player.y = 30
      const originalChance = chance
      chance = () => true
      try {
        for (const [role, name] of [
          ['champion', 'Goblin'], ['group', 'Skeleton'],
          ['backline', 'Kobold'], ['frontline', 'Ghoul'], ['roamer', 'Orc']
        ]) {
          const tmpl = ENEMY_TEMPLATE_BY_NAME[name]
          enemies = []
          occupied = new Set()
          const actor = addEnemy({
            name: tmpl.name, baseName: tmpl.name, level: -4, levelKind: 'chain', caveIndex: -1,
            x: 25, y: 25, homeX: 25, homeY: 25, homeTileType: 'marble',
            hp: tmpl.hp, maxHp: tmpl.hp, atk: tmpl.atk, def: tmpl.def,
            spd: tmpl.spd, grace: tmpl.grace, aggro: tmpl.aggro, tier: tmpl.tier,
            abilities: [...tmpl.abilities], humanoid: !!tmpl.humanoid,
            alive: true, prefix: role === 'champion' ? 'Champion' : null,
            equipment: null, dungeonRole: role
          })
          check(enemyWanderMode(actor) === enemyWanderForLevel(tmpl.wander, -4),
            role + ' inherits the template mode')
          check(enemyWander(actor), role + ' takes an idle wander step')
          check(actor.x !== 25 || actor.y !== 25, role + ' leaves its starting tile')
        }
      } finally {
        chance = originalChance
      }
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


  it('spawns exactly one off-screen kobold, goblin and skink with real prefixed equipment, not monster prefix buffs', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const ruin=deepLevels.find(level=>level.dungeonPackage==='dwarvenRuins')
        check(!!ruin,'ruin floor generated')
        currentZ=chainZForDepth(deepLevels.indexOf(ruin)+2);currentCave=-1
        map=ruin.map;undergroundDiscovered=ruin.discovered
        const entrance=ruin.caves[0].entrances[0];player.x=entrance.x;player.y=entrance.y
        rebuildActiveLevelOccupancy()
        const mod=MODIFIERS.find(m=>m.name==='Mighty')
        const gearFor=(kind)=>{
          const item=kind==='weapon'?makeWeaponItem(2,0,2,false):
            kind==='shield'?makeShieldItem(2,0,2):makeArmorItem(2,0,2)
          delete item.mod;delete item.modAmt;delete item.xpBonus
          return applyGearModifier(item.base,item,mod,0,2)
        }
        player.equip.weapon=gearFor('weapon');player.equip.shield=gearFor('shield')
        player.equip.armor=gearFor('armor')
        const count=enemies.length
        player.steps=500 // first optional-event checkpoint, even on the first ruin floor
        let encounterChecks=0
        chance=prob=>{encounterChecks++;return true}
        check(AdaptivePlayerTrolling.onFloorChanged(),'qualified trio enters an early ruin at a successful gate')
        const fan=enemies.filter(e=>e.adaptiveEventId==='fan_club' && e.level===currentZ)
        check(fan.length===3 && enemies.length>=count+3,'exactly three fan-club members, allowing independent ordinary-thief encounters')
        check(JSON.stringify(fan.map(e=>e.baseName))===JSON.stringify(['Kobold','Goblin','Skink']),
          'fan club consists of one member of each required species')
        check(JSON.stringify(fan.map(e=>e.equipment.kind))===JSON.stringify(['weapon','shield','armor']),
          'three different equipment categories assigned')
        for (const e of fan) {
          check(e.name==='Mighty '+e.baseName && e.prefix===null,'monster prefix only appears in display name')
          check(e.equipment.name.startsWith('Mighty ') && e.equipment.mod==='atk','real prefixed item equipped')
          check(e.gearBonuses.atk>0 && !e.prefixBase,'ATK came from gear, not enemy prefix')
          check(!undergroundTileVisible(e.x,e.y),'every member starts outside field of view')
          check(CAVE_TRANSITION_TILES.has(map[e.y][e.x])===false,'no member blocks a stair')
        }
        check(AdaptivePlayerTrolling.completed('fan_club'),'encounter committed once')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===1,
          'three members occupy only one floor-threat slot')
        check(!AdaptivePlayerTrolling.onFloorChanged(),'reentry cannot duplicate the club')
        check(enemies.filter(e=>e.adaptiveEventId==='fan_club').length===3,'no extra members')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        check(AdaptivePlayerTrolling.completed('fan_club') &&
          enemies.filter(e=>e.adaptiveEventId==='fan_club').length===3,
          'save restores member identity and event completion')
        const member=enemies.find(e=>e.adaptiveEventId==='fan_club')
        const preInventory=player.inventory.length,preGround=groundItems.length
        lootFromEnemy(member,false)
        check(groundItems.length>preGround &&
          !player.inventory.some(it=>it.name===member.equipment.name) &&
          groundItems.some(g=>g.kind==='droppeditem' && g.item?.name===member.equipment.name),
          'special enemy equipment is dropped on the ground, never added directly')
      } finally {
        chance=originalChance
        loadGameFromObject(before)
      }
    })()`))
  })

  it('does not reroll unchanged failed Fan Club encounters by revisiting or changing prefix', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const ruin=deepLevels.find(l=>l.dungeonPackage==='dwarvenRuins')
        currentZ=chainZForDepth(deepLevels.indexOf(ruin)+2);currentCave=-1
        map=ruin.map;undergroundDiscovered=ruin.discovered
        const entrance=ruin.caves[0].entrances[0];player.x=entrance.x;player.y=entrance.y
        rebuildActiveLevelOccupancy()
        const withPrefix=name=>{
          const mod=MODIFIERS.find(m=>m.name===name)
          const items=[makeWeaponItem(2,0,2,false),makeShieldItem(2,0,2),makeArmorItem(2,0,2)]
          for (const item of items) {delete item.mod;delete item.modAmt;delete item.xpBonus;applyGearModifier(item.base,item,mod)}
          ;[player.equip.weapon,player.equip.shield,player.equip.armor]=items
        }
        withPrefix('Mighty')
        // An ordinary thief can also roll on floor entry. Check that independent
        // mechanic once before counting the optional 500-step probability gate.
        chance=()=>false
        AdaptivePlayerTrolling.onFloorChanged()
        player.steps=500 // an eligible check on an early ruin floor
        let calls=0
        chance=p=>{if(p===0.10)calls++;return false}
        check(!AdaptivePlayerTrolling.onFloorChanged(),'initial eligible attempt fails')
        check(calls===1,'exactly one probability gate')
        check(!AdaptivePlayerTrolling.onFloorChanged() && calls===1,'same floor cannot reroll')
        // Returning with other equipment does not create a distinct event.
        chance=oldChance;withPrefix('Swift');chance=p=>{if(p===0.10)calls++;return false}
        check(!AdaptivePlayerTrolling.onFloorChanged() && calls===1,
          'changing only prefix cannot farm another roll')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        check(!AdaptivePlayerTrolling.onFloorChanged() && calls===1,'save/load does not reroll')
      } finally {chance=oldChance;loadGameFromObject(before)}
    })()`))
  })

  it('deposits a one-time Fireball lure in a connected narrow passage, without consuming threat slots', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=-4;currentCave=-1
        player.x=2;player.y=20
        player.equip={weapon:null,shield:null,armor:null,blackkey:null}
        map=Array.from({length:35},()=>Array(35).fill('dwarvenwall'))
        undergroundDiscovered=Array.from({length:35},()=>Array(35).fill(false))
        groundItems=[];enemies=[];occupied=new Set()
        // Two self-hits can qualify but nothing is placed on a floor without a passage.
        check(!AdaptivePlayerTrolling.onSelfFireballHit(),'one cast does not qualify')
        check(AdaptivePlayerTrolling.onSelfFireballHit(),'two casts qualify')
        check(!AdaptivePlayerTrolling.onFloorChanged(),'wall-only floor defers placement')
        check(!AdaptivePlayerTrolling.completed('self_fireball'),'deferred event stays available')
        for(let x=1;x<33;x++)map[20][x]='marble'
        check(AdaptivePlayerTrolling.onFloorChanged(),'one-tile passage can receive the reward')
        const drops=groundItems.filter(g=>g.adaptiveEventId==='self_fireball')
        check(drops.length===1 && drops[0].kind==='droppeditem' &&
          drops[0].item.kind==='scrollOfFireball','scroll is ordinary ground loot')
        check(drops[0].y===20 && drops[0].x>=12,'off-screen and away from stairs')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:-4:-1']===undefined,
          'loot does not occupy a threat slot')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        check(saved.adaptivePlayerTrolling.completed.includes('self_fireball') &&
          saved.groundItems.some(g=>g.adaptiveEventId==='self_fireball'),
          'save contains the completed reaction and its item')
        check(!AdaptivePlayerTrolling.onFloorChanged() &&
          groundItems.filter(g=>g.adaptiveEventId==='self_fireball').length===1,
          're-entering cannot duplicate loot')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('places two independent optional ruins reactions and allows Nemesis as a third threat', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        for(let i=0;i<15;i++) AdaptivePlayerTrolling.onVenomAttempt({
          id:'dual-event-prey-'+i,alive:true,hp:50,maxHp:50,family:'living'})
        for(let i=0;i<3;i++) {
          const turn=100+6*i
          AdaptivePlayerTrolling.onCombatAttack(turn)
          AdaptivePlayerTrolling.onPlayerInvisibleHit({id:'invisible-prey-'+i},turn)
        }
        player.equip.weapon=null;player.equip.shield=null;player.equip.armor=null
        const last=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins').at(-1)
        currentZ=chainZForDepth(deepLevels.indexOf(last)+2);currentCave=-1
        map=last.map;undergroundDiscovered=last.discovered
        const stair=last.caves[0].entrances[0]
        player.x=stair.x;player.y=stair.y
        rebuildActiveLevelOccupancy()
        let gates=0
        chance=p=>{if(p===0.85)gates++;return true}
        check(AdaptivePlayerTrolling.onFloorChanged(),'two eligible optional reactions spawn')
        const specials=enemies.filter(e=>e.level===currentZ &&
          ['venom_eater','oculus'].includes(e.adaptiveEventId))
        check(specials.length===2 && new Set(specials.map(e=>e.adaptiveEventId)).size===2,
          'two distinct optional reactions share one entry')
        check(gates===2,'each successful optional encounter has its own probability gate')
        const separation=Math.max(Math.abs(specials[0].x-specials[1].x),
          Math.abs(specials[0].y-specials[1].y))
        check(separation>=6,'separate threat placement')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===2,
          'two ordinary floor threats consume the complete optional budget')
        check(!AdaptivePlayerTrolling.onFloorChanged() && gates===2,
          'reentering with a full budget cannot reroll')
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Giant Rat'})
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Giant Rat'})
        check(AdaptivePlayerTrolling.onFloorChanged(),'guaranteed Nemesis uses a bonus slot')
        const all=enemies.filter(e=>e.level===currentZ && (e.adaptiveEventId && e.adaptiveEventId!=='unsold_equipment' || e.name==='Champion Giant Rat'))
        check(all.length===3 && all.some(e=>e.name==='Champion Giant Rat'),
          'two optional reactions plus the independent Nemesis remain on the floor')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===2,
          'Nemesis never consumes an optional slot')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot)
        check(!AdaptivePlayerTrolling.onFloorChanged(),'save/load cannot duplicate committed reactions')
        check(enemies.filter(e=>e.level===currentZ && (e.adaptiveEventId && e.adaptiveEventId!=='unsold_equipment' || e.name==='Champion Giant Rat')).length===3,
          'three special monsters survive save/load')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('remembers a failed second ruins roll instead of rerolling on stair-hops', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        for(let i=0;i<15;i++)AdaptivePlayerTrolling.onVenomAttempt({
          id:'single-event-prey-'+i,alive:true,hp:30,family:'living'})
        for(let i=0;i<3;i++) {
          const turn=100+6*i
          AdaptivePlayerTrolling.onCombatAttack(turn)
          AdaptivePlayerTrolling.onPlayerInvisibleHit({id:'other-prey-'+i},turn)
        }
        player.equip.weapon=null;player.equip.shield=null;player.equip.armor=null
        const last=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins').at(-1)
        currentZ=chainZForDepth(deepLevels.indexOf(last)+2);currentCave=-1
        map=last.map;undergroundDiscovered=last.discovered
        const stair=last.caves[0].entrances[0]
        player.x=stair.x;player.y=stair.y
        rebuildActiveLevelOccupancy()
        let gates=0
        chance=p=>p===0.85 ? ++gates===1 : false
        check(AdaptivePlayerTrolling.onFloorChanged(),'first successful roll creates one encounter')
        check(gates===2,'second eligible candidate receives one independent roll')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===1,
          'failed second roll does not consume a slot')
        check(!AdaptivePlayerTrolling.onFloorChanged() && gates===2,
          'reentry cannot reroll unchanged failed second candidate')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        check(!AdaptivePlayerTrolling.onFloorChanged() && gates===2,
          'failed second roll remains blocked across save/load')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('spawns one guaranteed cursed-world Nemesis on the final ruins floor and persists it', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const savedBefore=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const last=deepLevels.filter(level=>level.dungeonPackage==='dwarvenRuins').at(-1)
        check(last && last.dungeonFloor===last.floorCount,'last ruin floor exists')
        const depth=deepLevels.indexOf(last)+2
        currentZ=chainZForDepth(depth)
        currentCave=-1
        map=last.map
        undergroundDiscovered=last.discovered
        const stair=last.caves[0].entrances[0]
        player.x=stair.x;player.y=stair.y
        rebuildActiveLevelOccupancy()
        const beforeCount=enemies.length
        check(!AdaptivePlayerTrolling.onFloorChanged(),'no event without qualifying deaths')
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Giant Rat'})
        check(!AdaptivePlayerTrolling.onFloorChanged(),'one death does not qualify')
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Goblin'})
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Goblin'})
        AdaptivePlayerTrolling.onPlayerKilledBy({baseName:'Giant Rat'})
        check(AdaptivePlayerTrolling.onFloorChanged(),'Nemesis is guaranteed when eligible')
        check(enemies.length===beforeCount+1,'exactly one Nemesis spawned')
        const nemesis=enemies.find(e=>e.name==='Champion Giant Rat' && e.level===currentZ)
        check(nemesis?.prefix==='Champion' && nemesis.baseName==='Giant Rat','latest repeated death breaks equal-count tie')
        check(!undergroundTileVisible(nemesis.x,nemesis.y),'Nemesis starts outside player FOV')
        check(!AdaptivePlayerTrolling.onFloorChanged(),'reentry never duplicates committed Nemesis')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        check(saved.adaptivePlayerTrolling.completed.includes('nemesis'),'Nemesis completion saved')
        loadGameFromObject(saved)
        check(enemies.some(e=>e.name==='Champion Giant Rat' && e.level===currentZ),'Nemesis restored with monster list')
        check(!AdaptivePlayerTrolling.onFloorChanged(),'restored event never respawns')
      } finally {
        loadGameFromObject(savedBefore)
      }
    })()`))
  })



  it('counts only first searches of skeletons in the Dwarven Fort and Ruins for Debt Collector', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, msg) => {if (!ok) throw Error(msg)}
      const before = JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits = [{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const fort = deepLevels[1]
        const ruins = deepLevels.find(level => level.dungeonPackage === 'dwarvenRuins')
        const cave = deepLevels[0]
        const mines = deepLevels.find(level => level.kind === 'dwarvenMines')
        check(!!fort && !!ruins && !!cave && !!mines, 'all test habitats exist')
        const counter = () => AdaptivePlayerTrolling.serialize().dwarvenRemainsSearched
        function searchSkeleton(level, kind, key = false) {
          currentZ = chainZForDepth(deepLevels.indexOf(level) + 2)
          currentCave = -1
          map = level.map
          undergroundDiscovered = level.discovered
          player.x = 20; player.y = 20
          groundItems = [{kind:'skeleton', x:20, y:20, level:currentZ, levelKind:'chain',
            caveIndex:-1, looted:false, hasLoot:false,
            ...(key ? {dungeonKey:{keyId:'collector-test-key',progressionKey:false}} : {})}]
          const start = counter()
          lootSkeletonOrForage()
          const found = groundItems[0]
          check(found.looted === true, 'skeleton was actually searched')
          check(counter() === start + (kind === 'dwarven' ? 1 : 0),
            'only Fort/Ruins skeletons count toward the debt trigger')
          lootSkeletonOrForage()
          check(counter() === start + (kind === 'dwarven' ? 1 : 0),
            'repeat search never increments the count')
        }
        searchSkeleton(fort, 'dwarven') // empty Fort skeleton
        searchSkeleton(ruins, 'dwarven') // empty Ruins skeleton
        searchSkeleton(ruins, 'dwarven', true) // a key-bearing corpse counts too
        searchSkeleton(cave, 'other') // natural cave skeletons do not count
        searchSkeleton(mines, 'other') // mine skeletons do not count
        check(counter() === 3, 'only the three dwarven searches were counted')
        for (let i = 0; i < 6; i++) searchSkeleton(ruins, 'dwarven')
        check(counter() === 9, 'nine qualifying searches remain below the threshold')
        const saved = JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        check(counter() === 9, 'counter survives save and restore')
        // Loading reconstructs deepLevels; reacquire the floor from the loaded world.
        searchSkeleton(deepLevels.find(level => level.dungeonPackage === 'dwarvenRuins'), 'dwarven')
        check(counter() === 10, 'the tenth qualifying search reaches the threshold')
        check(!AdaptivePlayerTrolling.serialize().dwarvenGoldLoot.length,
          'searching empty skeletons never fabricates loot provenance')
      } finally {
        loadGameFromObject(before)
      }
    })()`))
  })

  it('randomly demands recovered dwarven items or gold purses and remembers payment decisions', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      const originalVisible=undergroundTileVisible
      const originalCanSee=enemyCanBeSeen
      const originalHidden=playerHiddenFromEnemy
      try {
        activeWorldTraits=[{name:'test cursed world',effects:[]}]
        AdaptivePlayerTrolling.reset()
        player.inventory=[]
        player.equip.weapon=null;player.equip.shield=null;player.equip.armor=null
        player.gold=150
        const held={kind:'weapon',name:'Dwarven Sword',base:'Sword',tier:2,atk:7}
        const worn={kind:'shield',name:'Dwarven Buckler',base:'Buckler',tier:2,def:3}
        const arrows=createItem('arrows',{count:8})
        for(const item of [held,worn,arrows])AdaptivePlayerTrolling.tagDwarvenRemainsLoot(item)
        player.inventory.push(held,arrows)
        player.equip.shield=worn
        check(new Set([held,worn,arrows].map(i=>i.dwarvenRemainsLootId)).size===3,
          'all remains loot instances get distinct identifiers')
        const ruins=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins')
        const last=ruins.at(-1)
        check(last && ruins.length>=2,'Dwarven Ruins have a final floor')
        currentZ=chainZForDepth(deepLevels.indexOf(last)+2);currentCave=-1
        map=last.map;undergroundDiscovered=last.discovered
        const stair=last.caves[0].entrances[0]
        player.x=stair.x;player.y=stair.y
        rebuildActiveLevelOccupancy()
        chance=()=>true
        for(let i=0;i<9;i++)AdaptivePlayerTrolling.onDwarvenRemainsSearched()
        AdaptivePlayerTrolling.onFloorChanged()
        check(!enemies.some(e=>e.adaptiveEventId==='debt_collector'),'nine searches cannot summon the collector')
        AdaptivePlayerTrolling.onDwarvenRemainsSearched()
        player.steps=1500 // next scheduled check after the initial late-floor visit
        check(AdaptivePlayerTrolling.onFloorChanged(),'tenth search qualifies the collector')
        let ghost=enemies.find(e=>e.adaptiveEventId==='debt_collector')
        check(!!ghost && ghost.baseName==='Ghost' && ghost.name==='Debt Collector' &&
          ghost.maxHp===36 && ghost.debtDemandState==='watching',
          'a neutral dwarven ghost using Ghost stats spawns on the last ruin floor')
        check(!originalVisible(ghost.x,ghost.y),'collector starts outside sight')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:'+currentZ+':-1']===1,
          'collector occupies one optional threat slot')
        undergroundTileVisible=()=>true
        enemyCanBeSeen=()=>true
        playerHiddenFromEnemy=()=>false
        check(AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount),'collector cannot attack while making demand')
        check(!!AdaptivePlayerTrolling.pendingDebtCollector(), 'demand becomes pending on discovery')
        const demandedId=ghost.debtDemandLootId
        check([held,worn,arrows].some(i=>i.dwarvenRemainsLootId===demandedId),
          'demand draws only from provenance-marked held or equipped items')
        const pendingSnapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        check(pendingSnapshot.adaptivePlayerTrolling.dwarvenRemainsSearched===10 &&
          pendingSnapshot.adaptivePlayerTrolling.nextDwarvenLootId===4,
          'loot counters and unique item identity save with the current schema')
        loadGameFromObject(pendingSnapshot)
        ghost=AdaptivePlayerTrolling.pendingDebtCollector()
        check(!!ghost && ghost.debtDemandLootId===demandedId &&
          AdaptivePlayerTrolling.debtCollectorDemand(ghost).canPay,
          'saved pending demand retains the selected item without another RNG roll')
        const hadIt=()=>[...player.inventory,...Object.values(player.equip)].some(it=>
          it?.dwarvenRemainsLootId===demandedId)
        check(hadIt(),'requested loot still belongs to the player')
        check(AdaptivePlayerTrolling.resolveDebtCollector('pay',ghost.id,false),'player can surrender')
        check(!hadIt() && !enemies.some(e=>e.adaptiveEventId==='debt_collector' && e.alive),
          'surrender removes that exact item and peacefully dismisses the ghost')
        check(AdaptivePlayerTrolling.completed('debt_collector'),'the collector cannot respawn')
        loadGameFromObject(pendingSnapshot)
        ghost=AdaptivePlayerTrolling.pendingDebtCollector()
        check(AdaptivePlayerTrolling.resolveDebtCollector('refuse',ghost.id,false), 'player may refuse')
        check(ghost.debtDemandState==='hostile' && ghost.aggro>0 &&
          [held,worn,arrows].some(i=>[...player.inventory,...Object.values(player.equip)].some(j=>
            j?.dwarvenRemainsLootId===i.dwarvenRemainsLootId)),
          'refusal preserves gear and makes the ghost hostile')
        const refusedSnapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(refusedSnapshot)
        check(enemies.some(e=>e.adaptiveEventId==='debt_collector' &&
          e.debtDemandState==='hostile' && e.aggro>0),'hostility survives save/replay restoration')
        // Two separately found gold purses compete as individual loot
        // candidates. Only the one affordable with current money qualifies.
        ghost=enemies.find(e=>e.adaptiveEventId==='debt_collector')
        player.inventory=player.inventory.filter(it=>!it.dwarvenRemainsLootId)
        player.equip.shield=null
        player.gold=13
        AdaptivePlayerTrolling.onDwarvenRemainsGoldFound(18)
        AdaptivePlayerTrolling.onDwarvenRemainsGoldFound(9)
        const purses=AdaptivePlayerTrolling.serialize().dwarvenGoldLoot
        check(purses.length===2 && purses[0].amount===18 && purses[1].amount===9 &&
          new Set(purses.map(p=>p.id)).size===2,
          'dwarven gold finds have distinct, persisted provenance identities')
        ghost.debtDemandState='watching';ghost.debtDemandLootId=null
        AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount)
        check(ghost.debtDemandLootId===purses[1].id,
          'unaffordable recovered gold is not an eligible choice')
        let goldDemand=AdaptivePlayerTrolling.debtCollectorDemand(ghost)
        check(goldDemand.isGold && goldDemand.recoveredGold &&
          goldDemand.gold===9 && goldDemand.canPay,
          'collector demands the exact amount recovered, not the 100g fallback')
        const goldDemandSnapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(goldDemandSnapshot)
        ghost=AdaptivePlayerTrolling.pendingDebtCollector()
        check(ghost && ghost.debtDemandLootId===purses[1].id &&
          AdaptivePlayerTrolling.debtCollectorDemand(ghost).gold===9,
          'the gold-purse demand stays locked through save and restore')
        check(AdaptivePlayerTrolling.resolveDebtCollector('pay',ghost.id,false) &&
          player.gold===4 && AdaptivePlayerTrolling.serialize().dwarvenGoldLoot.length===1,
          'payment consumes exactly the demanded recovered gold amount')
        // Restore pre-negotiation state to check the original 100g fallback
        // when no traceable recovered item or affordable purse is held.
        loadGameFromObject(refusedSnapshot)
        ghost=enemies.find(e=>e.adaptiveEventId==='debt_collector')
        player.inventory=player.inventory.filter(it=>!it.dwarvenRemainsLootId)
        player.equip.shield=null
        ghost.debtDemandState='watching';ghost.debtDemandLootId=null
        player.gold=99
        AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount)
        let demand=AdaptivePlayerTrolling.debtCollectorDemand(ghost)
        check(demand.isGold && demand.gold===100 && !demand.canPay,
          'lack of carried remains loot demands 100 gold and disables unaffordable payment')
        check(!AdaptivePlayerTrolling.resolveDebtCollector('pay',ghost.id,false),
          'cannot create gold by accepting an unaffordable demand')
        player.gold=100
        check(AdaptivePlayerTrolling.resolveDebtCollector('pay',ghost.id,false) && player.gold===0,
          'exactly 100 gold is consumed when money replaces missing gear')
      } finally {
        chance=originalChance
        undergroundTileVisible=originalVisible
        enemyCanBeSeen=originalCanSee
        playerHiddenFromEnemy=originalHidden
        loadGameFromObject(original)
      }
    })()`))
  })


  it('only places the unread-scroll note after uninterrupted possession through ruins arrival', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.inventory=[createItem('idscroll',{count:1,identified:false})]
        player.equip={weapon:null,shield:null,armor:null,blackkey:null}
        turnCount=2000
        for(let n=0;n<499;n++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===499,'499 turns is too early')
        turnCount++
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===500 &&
          !AdaptivePlayerTrolling.completed('unread_scrolls'),
          '500 turns qualifies but never creates the note by itself')
        player.inventory=[]
        AdaptivePlayerTrolling.onScrollInventoryChanged()
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===0,
          'losing the last scroll resets the streak immediately')
        player.inventory=[createItem('homecomingscroll',{count:1})]
        const ruins=deepLevels.find(level=>level.dungeonPackage==='dwarvenRuins')
        check(!!ruins,'a generated dwarven ruins floor exists')
        const depth=deepLevels.indexOf(ruins)+2
        currentZ=chainZForDepth(depth);currentCave=-1
        map=ruins.map;undergroundDiscovered=ruins.discovered
        player.x=11;player.y=11
        for(let y=8;y<48;y++)for(let x=8;x<48;x++)map[y][x]='marble'
        enemies=[];groundItems=[];occupied=new Set()
        rebuildActiveLevelOccupancy()
        chance=()=>false // Ordinary thieves and optional monsters cannot obscure this test.
        AdaptivePlayerTrolling.onFloorChanged()
        check(!groundItems.some(g=>g.adaptiveEventId==='unread_scrolls'),
          'having a scroll again on arrival is not sufficient after a broken streak')
        // A later, uninterrupted 500+ turn holding period must still be valid.
        AdaptivePlayerTrolling.reset()
        turnCount=3000
        for(let n=0;n<720;n++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===720,
          'streak keeps counting beyond 500 until floor arrival')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===720,
          'continuous holding period restored from save/replay')
        check(AdaptivePlayerTrolling.onFloorChanged(),'qualifying ruins arrival creates the note')
        const notes=groundItems.filter(g=>g.adaptiveEventId==='unread_scrolls')
        check(notes.length===1 && notes[0].kind==='droppeditem' &&
          notes[0].item.kind==='tauntingNote' && notes[0].item.inscription==='I wish I could read.',
          'one readable taunting note lies on the ground, not in a chest')
        check(AdaptivePlayerTrolling.completed('unread_scrolls') &&
          !AdaptivePlayerTrolling.onFloorChanged(),
          'event persists and cannot duplicate')
        // Even a single scroll read in the run permanently disables the
        // reaction. Holding another for 500+ turns never requalifies.
        AdaptivePlayerTrolling.reset()
        groundItems=[]
        AdaptivePlayerTrolling.onScrollUsed()
        check(AdaptivePlayerTrolling.serialize().scrollEverRead &&
          AdaptivePlayerTrolling.serialize().unreadScrollTurns===0,
          'reading any scroll records a permanent disqualification')
        turnCount=4000
        for(let n=0;n<800;n++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().unreadScrollTurns===0,
          'holding a later scroll for 800 turns is not enough after ever reading')
        const disqualified=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(disqualified,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().scrollEverRead === true,
          'permanent disqualification survives save/replay restore')
        check(!AdaptivePlayerTrolling.onFloorChanged() &&
          !groundItems.some(g=>g.adaptiveEventId==='unread_scrolls'),
          'a later qualifying floor cannot override the disqualification')
      } finally {chance=oldChance;loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('rolls exclusive Early Descent rewards: 30% ground scroll or 70% improvised corpse weapon', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        for (const scrollOutcome of [true,false]) {
          loadGameFromObject(before,{isReplayInit:true})
          activeWorldTraits=[{name:'test curse',effects:[]}]
          AdaptivePlayerTrolling.reset()
          // Force each branch independently; other optional event rolls stay off.
          let outcomeRolls=0
          chance=p=>{
            if(p===0.3){outcomeRolls++;return scrollOutcome}
            return false
          }
          currentZ=-2;currentCave=0
          map=depthUndergroundMap(2);undergroundDiscovered=depthUndergroundDiscovered(2)
          check(!!map && TILE.cavefloor.walk,'test has an ordinary, walkable depth-two cave')
          for(let y=25;y<55;y++)for(let x=25;x<55;x++)map[y][x]='cavefloor'
          player.x=39;player.y=39;player.lvl=3
          enemies=[];groundItems=[];occupied=new Set()
          rebuildActiveLevelOccupancy()
          check(AdaptivePlayerTrolling.onFloorChanged(),'early arrival produces an encounter')
          const bodies=groundItems.filter(g=>g.adaptiveEventId==='early_descent' && g.kind==='deadbody')
          const drops=groundItems.filter(g=>g.adaptiveEventId==='early_descent' && g.kind==='droppeditem')
          check(bodies.length===1 && drops.length===(scrollOutcome?2:1),
            'one corpse and the expected number of independent ground drops')
          const body=bodies[0],scroll=drops.find(g=>g.item.kind==='homecomingscroll')
          const gear=drops.find(g=>['weapon','shield','armor'].includes(g.item.kind))
          check(outcomeRolls===1,'the 30/70 reward is rolled exactly once when placed')
          check(!!gear && gear.item.tier===1 && !gear.item.mod,
            'ordinary adventurer gear remains unenchanted tier one in both outcomes')
          check(body.gold>=5 && body.gold<=25 && !body.looted,
            'the corpse is searchable and holds the configured gold range')
          check(Math.abs(gear.x-body.x)+Math.abs(gear.y-body.y)===1,
            'ordinary tier-one equipment remains on the tile next to the corpse')
          if (scrollOutcome) {
            check(body.gear===null && !!scroll &&
              Math.abs(scroll.x-body.x)+Math.abs(scroll.y-body.y)===1 &&
              (gear.x!==scroll.x || gear.y!==scroll.y),
              '30% outcome gives a separate adjacent Homecoming scroll and no corpse weapon')
          } else {
            const weapon=body.gear
            check(!scroll && !!weapon && weapon.kind==='weapon' &&
              STARTING_WEAPONS.includes(weapon.name) && weapon.base===weapon.name &&
              weapon.atk===1 && weapon.grace===1 && weapon.twoHanded===false &&
              weapon.startingWeapon===true && weapon.baseValue===ITEM_BASE_VALUES.startingWeapon &&
              !weapon.mod,
              '70% outcome contains an ordinary randomly named improvised weapon inside the corpse')
          }
          check(AdaptivePlayerTrolling.completed('early_descent'),
            'one lifetime reward is committed regardless of loot outcome')
          const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
          loadGameFromObject(snapshot,{isReplayInit:true})
          check(AdaptivePlayerTrolling.completed('early_descent') &&
            groundItems.filter(g=>g.adaptiveEventId==='early_descent').length===(scrollOutcome?3:2),
            'save and replay restoration preserve the ground/corpse loot composition')
          check(!AdaptivePlayerTrolling.onFloorChanged() &&
            groundItems.filter(g=>g.adaptiveEventId==='early_descent').length===(scrollOutcome?3:2),
            're-entering the qualifying floor never duplicates loot or rerolls')
          const remains=groundItems.find(g=>g.adaptiveEventId==='early_descent' && g.kind==='deadbody')
          const startingGold=player.gold,startingInventory=player.inventory.length
          player.x=remains.x;player.y=remains.y
          lootSkeletonOrForage()
          check(remains.looted && player.gold===startingGold+remains.gold &&
            player.inventory.length===startingInventory+(scrollOutcome?0:1),
            'searching the corpse yields gold plus the improvised weapon only in its outcome')
          if (!scrollOutcome) check(player.inventory.some(item=>item.name===remains.gear.name && item.startingWeapon),
            'the improvised weapon is obtained by searching, not from a ground drop')
          lootSkeletonOrForage()
          check(player.gold===startingGold+remains.gold &&
            player.inventory.length===startingInventory+(scrollOutcome?0:1),
            'searching the corpse again cannot duplicate either reward')
          const searched=JSON.parse(JSON.stringify(buildSaveObject()))
          loadGameFromObject(searched,{isReplayInit:true})
          check(groundItems.some(g=>g.adaptiveEventId==='early_descent' && g.kind==='deadbody' && g.looted),
            'searched corpse status persists through save/replay restoration')
        }
        // Level thresholds and Cursed World exclusion do not depend on loot outcome.
        AdaptivePlayerTrolling.reset();groundItems=[]
        chance=()=>false
        player.lvl=4;currentZ=-2;currentCave=0
        map=depthUndergroundMap(2);undergroundDiscovered=depthUndergroundDiscovered(2)
        player.x=39;player.y=39
        AdaptivePlayerTrolling.onFloorChanged()
        check(!AdaptivePlayerTrolling.serialize().events.early_descent &&
          !AdaptivePlayerTrolling.completed('early_descent'),
          'level four is too late to trigger the second-depth warning')
        player.lvl=5;currentZ=-3;currentCave=-1
        map=depthUndergroundMap(3);undergroundDiscovered=depthUndergroundDiscovered(3)
        for(let y=25;y<55;y++)for(let x=25;x<55;x++)map[y][x]='marble'
        player.x=39;player.y=39;enemies=[];occupied=new Set()
        rebuildActiveLevelOccupancy()
        check(AdaptivePlayerTrolling.onFloorChanged() && AdaptivePlayerTrolling.completed('early_descent'),
          'first entry to the fort at level five qualifies independently')
        AdaptivePlayerTrolling.reset();groundItems=[]
        activeWorldTraits=[];player.lvl=1
        check(!AdaptivePlayerTrolling.onFloorChanged() &&
          !groundItems.some(g=>g.adaptiveEventId==='early_descent'),
          'ordinary worlds never create adaptive remains')
      } finally {chance=originalChance;loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('checks adaptive encounters at 500 or ruin floor 2, then 1000 or ruin floor 3, without stair or replay rerolls', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        chance=()=>false // no unrelated thief spawn or optional event RNG
        AdaptivePlayerTrolling.reset()
        player.steps=499;player.gold=0;player.inventory=[]
        player.equip.weapon=null;player.equip.armor=null;player.equip.shield=null
        currentZ=-1;currentCave=-1;map=undergroundMap
        undergroundDiscovered=undergroundDiscoveredL1
        AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===0,
          '499 walking steps cannot trigger a check')
        player.steps=500;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          '500th successful walking step claims the first check')
        AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          'refresh or repeat call on same step cannot duplicate a check')
        player.steps=999;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          '999 steps do not meet the next checkpoint')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          'check progress survives save and replay init')
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===2,
          '1000th step claims the second check')
        player.steps=1500;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===3,
          'later checks repeat every 500 actual steps')

        // Restart only the adaptive registry; a new character begins at step 0.
        AdaptivePlayerTrolling.reset();player.steps=60
        const ruins=deepLevels.filter(f=>f.dungeonPackage==='dwarvenRuins')
        check(ruins.length>=3,'world has at least three Dwarven Ruins floors')
        const enter=(ruin)=>{
          currentZ=chainZForDepth(deepLevels.indexOf(ruin)+2);currentCave=-1
          map=ruin.map;undergroundDiscovered=ruin.discovered
          const stair=ruin.caves[0].entrances[0]
          player.x=stair.x;player.y=stair.y
          rebuildActiveLevelOccupancy()
          AdaptivePlayerTrolling.onFloorChanged()
        }
        enter(ruins[0]);check(AdaptivePlayerTrolling.serialize().activationChecks===0,
          'first ruin floor alone is not the early milestone')
        enter(ruins[1]);check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          'ruin floor 2 triggers first check before step 500')
        enter(ruins[1]);check(AdaptivePlayerTrolling.serialize().activationChecks===1,
          'returning to the second floor does not retrigger')
        enter(ruins[2]);check(AdaptivePlayerTrolling.serialize().activationChecks===2,
          'ruin floor 3 triggers second check before step 1000')
        player.steps=500;AdaptivePlayerTrolling.onPlayerMoved()
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===2,
          'early ruin checks replace rather than stack with step 500 and 1000')
        player.steps=1500;AdaptivePlayerTrolling.onPlayerMoved()
        check(AdaptivePlayerTrolling.serialize().activationChecks===3,
          'step 1500 still triggers next ordinary periodic check')
      } finally {chance=originalChance;loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('counts deaths with at least two unused Life Potions regardless of recent potion usage or killer', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        player.inventory=[{kind:'potion',count:1}]
        AdaptivePlayerTrolling.onPlayerDied(null)
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===0,
          'death with only one potion is not counted')
        player.inventory=[{kind:'potion',count:2}]
        AdaptivePlayerTrolling.onPlayerDied(null)
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===1,
          'environmental death with two potions counts')
        AdaptivePlayerTrolling.onPlayerDied({baseName:'Giant Rat'})
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===2 &&
          AdaptivePlayerTrolling.serialize().deathsBySpecies['Giant Rat']===1,
          'second death counts and preserves Nemesis killer bookkeeping')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===2,
          'two qualifying deaths survive save and replay restoration')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.onPlayerDied(null)
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===2,
          'ordinary worlds never increase adaptive death counters')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('places trap bait only beyond visible spikes with an existing safe detour', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const ruins=deepLevels.find(f=>f.dungeonPackage==='dwarvenRuins')
        check(!!ruins,'ruins exist')
        currentZ=chainZForDepth(deepLevels.indexOf(ruins)+2);currentCave=-1;map=ruins.map
        for(let y=46;y<=61;y++)for(let x=48;x<=72;x++)map[y][x]='dwarvenwall'
        for(let x=50;x<=68;x++)map[52][x]='marble'
        for(let x=52;x<=63;x++)map[54][x]='marble'
        for(let y=52;y<=54;y++){map[y][52]='marble';map[y][63]='marble'}
        map[52][59]='dwarvenspikes'
        ruins.traps=[{id:'test-spike',type:'spikes',trigger:{x:59,y:52}}]
        player.x=50;player.y=52;player.steps=0
        enemies=enemies.filter(e=>e.level!==currentZ)
        groundItems=groundItems.filter(g=>g.level!==currentZ)
        occupied=new Set();rebuildActiveLevelOccupancy()
        for(let i=0;i<4;i++)AdaptivePlayerTrolling.onPlayerTriggeredTrap({id:'test-'+i})
        AdaptivePlayerTrolling.onPlayerTriggeredTrap({id:'test-1'})
        check(AdaptivePlayerTrolling.serialize().triggeredTrapIds.length===4,
          'repeated trap visits are not double-counted')
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!AdaptivePlayerTrolling.completed('trap_lure'),'four triggers are insufficient')
        AdaptivePlayerTrolling.onPlayerTriggeredTrap({id:'test-4'})
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        const drops=groundItems.filter(g=>g.adaptiveEventId==='trap_lure')
        check(drops.length===1 && drops[0].item?.kind==='potion' && drops[0].kind==='droppeditem',
          'one Life Potion lies on ground, not in a chest')
        check(drops[0].x>59 && drops[0].y===52 && map[drops[0].y][drops[0].x]!=='dwarvenspikes',
          'bait is beyond the existing spike plate')
        const save=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(save,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('trap_lure') &&
          AdaptivePlayerTrolling.serialize().triggeredTrapIds.length===5,
          'trap history and reward completion persist')
        check(groundItems.filter(g=>g.adaptiveEventId==='trap_lure').length===1,
          'reward persists without duplication')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

})
