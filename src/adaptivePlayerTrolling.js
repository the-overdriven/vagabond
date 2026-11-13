'use strict'

/* Adaptive Player Trolling — cursed-world-only persistent encounter registry.
   Outcomes are resolved in player actions with the existing seeded RNG.
   This module does not start an animation or consume idle-time randomness. */
const AdaptivePlayerTrolling = (() => {
  let config = null
  let debugTrollingOverride = null
  let monsterNames = []
  // Stable tester-facing keys, including planned but not yet implemented reactions.
  const TRIGGER_IDS = ['venom_eater', 'opposite_weapon', 'neglected_shield', 'unread_scrolls', 'undead_shield_hunter', 'oculus', 'strong_enemy_hunter', 'unfinished_business', 'hidden_leader', 'nemesis', 'last_survivor', 'beast_hunter', 'humanoid_hunter', 'forest_spirit', 'ancient_scarab', 'trogloraptor_ambush', 'depth_guardian', 'explorer_galleries', 'gold_imp', 'hungry_monster', 'relieved_thief', 'unsold_equipment', 'merchant_expansion', 'fan_club', 'ignored_mushroom_cleaning', 'mushroom_prophet', 'debt_collector', 'uninvited_guest', 'previous_owner', 'early_descent', 'fort_quest', 'unused_scroll_ambush', 'unused_healing', 'low_hp_carrion', 'reckless_fighter', 'drowning_lure', 'trap_lure', 'self_fireball', 'strange_green_potion']
  const LURE_DIRS = [[0,-1],[1,0],[0,1],[-1,0]]
  const fresh = () => ({merchantSalesGold: 0, merchantPurchasesGold: 0,
    templeClearanceTargets: null, templeClearanceKills: 0, scrollUses: 0, scrollKindsUsed: [],
    completed: [], floorThreats: {}, events: {},
    deathsBySpecies: {}, lastDeathBySpecies: {}, deathSerial: 0, floorChecks: {}, selfFireballHits: 0,
    poisonedEnemyIds: [], undeadVenomAttempts: 0,
    oculusTargetIds: [], oculusLastAttackTurn: null, oculusEngagementSerial: 0,
    oculusEngagementCredited: false, dugSandCount: 0, extractedMineralDeposits: 0, mineWallsBroken: 0, depthGuardianWarning: null, forestSpiritRestTurns: 0, forestSpiritLastSurfaceTurn: null, explorerGalleryRolls: {}, mushroomsCollected: 0,
    dwarvenRemainsSearched: 0, nextDwarvenLootId: 1, dwarvenGoldLoot: [], campfireLightings: 0,
    herbalistIgnoredVisits: 0, herbalistVisit: null, visitedUndergroundFloors: [], fortQuestVisited: false, fortQuestAccepted: false,
    ordinaryThiefChecks: [], unreadScrollTurns: 0, unreadScrollLastTurn: null, scrollEverRead: false,
    activationChecks: 0, unusedHealingDeaths: 0, potionsDrunk: 0,
    triggeredTrapIds: [], drowningCrossings: 0, waterCrossing: null,
    lowHpTurns: 0, survivalLastTurn: null, combatLastAttackTurn: null,
    strongFightsInitiated: [], hiddenLeaderKills: [],
    unfinishedFightCandidates: [], unfinishedLastAttackTurn: null, unfinishedEscapes: [],
    shieldlessFights: 0, shieldlessFightLastAttackTurn: null, shieldlessFightEligible: false,
    recklessLowHpFights: 0, caveVisit: null,
    triggerFlags: Object.fromEntries(TRIGGER_IDS.map(id => [id, false]))})
  let state = fresh()
  // Derived runtime data only: never serialized, never a second statistics ledger.
  let killSummary = null
  let encounterActors = null
  let spawnSearch = null

  function clearDerivedState() {
    killSummary = null
    encounterActors = null
    spawnSearch = null
  }

  function killTotals() {
    const ledger = player.killsBySpecies
    if (killSummary?.ledger === ledger) return killSummary
    const entries = Object.entries(ledger || {}).filter(([,n]) => Number.isInteger(n) && n > 0)
    let total = 0, humanoids = 0, beasts = 0
    for (const [species, count] of entries) {
      total += count
      const template = ENEMY_TEMPLATE_BY_NAME[species]
      if (template?.humanoid) humanoids += count
      if (template?.family === 'living' && !template.humanoid) beasts += count
    }
    killSummary = {ledger, entries, total, humanoids, beasts}
    return killSummary
  }

  function encounterActor(id) {
    if (!completed(id)) return null
    if (!encounterActors || encounterActors.source !== enemies || encounterActors.length !== enemies.length) {
      const byEvent = new Map()
      for (const enemy of enemies) {
        if (enemy.alive && enemy.adaptiveEventId && !byEvent.has(enemy.adaptiveEventId))
          byEvent.set(enemy.adaptiveEventId, enemy)
      }
      encounterActors = {source: enemies, length: enemies.length, byEvent}
    }
    const enemy = encounterActors.byEvent.get(id)
    return enemy?.alive ? enemy : null
  }

  // One synchronous checkpoint owns this context. Terrain searches keep their
  // original traversal order; only repeated membership scans are shared.
  function spawnEntrances() {
    if (spawnSearch?.entrances) return spawnSearch.entrances
    const entrances = []
    for (let y=0;y<MAP_H;y++) for (let x=0;x<MAP_W;x++)
      if (CAVE_TRANSITION_TILES.has(map[y]?.[x])) entrances.push({x,y})
    if (spawnSearch) spawnSearch.entrances = entrances
    return entrances
  }

  function groundItemAt(x, y) {
    if (!spawnSearch) return groundItems.some(g => onCurrentLevel(g) && g.x === x && g.y === y)
    if (!spawnSearch.ground || spawnSearch.groundLength !== groundItems.length) {
      spawnSearch.ground = new Set(groundItems.filter(g => onCurrentLevel(g)).map(g => keyXY(g.x,g.y)))
      spawnSearch.groundLength = groundItems.length
    }
    return spawnSearch.ground.has(keyXY(x,y))
  }

  function spawnThreats() {
    if (!spawnSearch) return enemies.filter(e => e.alive && onCurrentLevel(e) && e.adaptiveEventId)
    if (!spawnSearch.threats || spawnSearch.enemyLength !== enemies.length) {
      spawnSearch.threats = enemies.filter(e => e.alive && onCurrentLevel(e) && e.adaptiveEventId)
      spawnSearch.enemyLength = enemies.length
    }
    return spawnSearch.threats
  }

  function configure(value, nameData) {
    if (!value || value.schema !== 29 || typeof value.enabled !== 'boolean' ||
        typeof value.debugTrolling !== 'boolean' ||
        !value.events || !value.limits || !value.defaults)
      throw new Error('Invalid adaptive player trolling configuration.')
    const schedule = value.activationChecks
    if (!schedule || !Number.isInteger(schedule.stepsPerCheck) || schedule.stepsPerCheck < 1 ||
        !Array.isArray(schedule.earlyRuinsFloors) || schedule.earlyRuinsFloors.length !== 2 ||
        schedule.earlyRuinsFloors.some((n,i) => !Number.isInteger(n) || n < 1 ||
          i > 0 && n <= schedule.earlyRuinsFloors[i-1]))
      throw new Error('Invalid adaptive activation-check schedule.')
    for (const [id, type] of [['low_hp_carrion', 'persistent_carrion_beast'],
        ['reckless_fighter', 'graceful_duelist']]) {
      const e = value.events[id]
      if (!e || e.type !== type || e.location !== 'native_habitats' ||
          !Number.isInteger(e.minTier) || e.minTier < 2 ||
          !Number.isInteger(e.minHp) || e.minHp < 1 ||
          !Number.isInteger(e.minAtk) || e.minAtk < 1 ||
          !Number.isInteger(e.minSpawnDistance) || e.minSpawnDistance <= UndergroundFov.RADIUS ||
          !Number.isInteger(e.maxSpawnDistance) || e.maxSpawnDistance < e.minSpawnDistance ||
          !Number.isInteger(e.minEntranceDistance) || e.minEntranceDistance < 1 ||
          !Number.isInteger(e.maxCandidateSites) || e.maxCandidateSites < 1 ||
          !Number.isFinite(e.playerHpRatio) || e.playerHpRatio <= 0 || e.playerHpRatio >= 1)
        throw new Error(`Invalid adaptive ${id} settings.`)
    }
    const carrion = value.events.low_hp_carrion
    if (!Number.isInteger(carrion.minBelowHpTurns) || carrion.minBelowHpTurns < 1)
      throw new Error('Invalid adaptive low-HP Carrion turn threshold.')
    const reckless = value.events.reckless_fighter
    if (!Number.isInteger(reckless.minFights) || reckless.minFights < 1 ||
        !Number.isInteger(reckless.quietTurns) || reckless.quietTurns < 1 ||
        !Number.isInteger(reckless.minCarriedPotions) || reckless.minCarriedPotions < 1 ||
        !Number.isInteger(reckless.graceLead) || reckless.graceLead < 1 ||
        !Number.isFinite(reckless.hpMultiplier) || reckless.hpMultiplier <= 1 ||
        !Number.isFinite(reckless.minPlayerHpMultiplier) || reckless.minPlayerHpMultiplier < 1 ||
        !Number.isFinite(reckless.atkMultiplier) || reckless.atkMultiplier < 1 ||
        !Number.isFinite(reckless.defMultiplier) || reckless.defMultiplier < 1)
      throw new Error('Invalid adaptive Reckless Fighter combat settings.')
    const beastHunter = value.events.beast_hunter
    if (!beastHunter || beastHunter.type !== 'beast_retaliation_pursuit' ||
        beastHunter.location !== 'surface' ||
        !Number.isInteger(beastHunter.minBeastKills) || beastHunter.minBeastKills < 1 ||
        !Number.isFinite(beastHunter.minBeastKillShare) ||
        beastHunter.minBeastKillShare <= 0 || beastHunter.minBeastKillShare > 1 ||
        JSON.stringify(beastHunter.monsterPool) !== JSON.stringify(['Spineback','Manticore']) ||
        beastHunter.monsterPool.some(name => !ENEMY_TEMPLATE_BY_NAME[name] ||
          ENEMY_TEMPLATE_BY_NAME[name].rarity < 0.08 || ENEMY_TEMPLATE_BY_NAME[name].rarity > 0.4) ||
        !beastHunter.pursuit ||
        !Number.isFinite(beastHunter.pursuit.idleChance) ||
        !Number.isFinite(beastHunter.pursuit.roamChance) ||
        beastHunter.pursuit.idleChance < 0 || beastHunter.pursuit.roamChance < 0 ||
        beastHunter.pursuit.idleChance + beastHunter.pursuit.roamChance >= 1 ||
        !Number.isInteger(beastHunter.minTier) || beastHunter.minTier < 1 ||
        !Number.isInteger(beastHunter.minHp) || beastHunter.minHp < 1 ||
        !Number.isInteger(beastHunter.minAtk) || beastHunter.minAtk < 1 ||
        !Number.isInteger(beastHunter.minSpawnDistance) ||
        beastHunter.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(beastHunter.maxSpawnDistance) ||
        beastHunter.maxSpawnDistance < beastHunter.minSpawnDistance ||
        !Number.isInteger(beastHunter.minEntranceDistance) || beastHunter.minEntranceDistance < 1 ||
        !Number.isInteger(beastHunter.maxCandidateSites) || beastHunter.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Beast Hunter settings.')
    const explorer = value.events.explorer_galleries
    if (!explorer || explorer.type !== 'explorer_crossfire_reinforcement' ||
        explorer.location !== 'dwarven_ruins_galleries' ||
        explorer.minOppositeEdges !== 2 ||
        !Number.isFinite(explorer.minReachableExploredFraction) ||
        explorer.minReachableExploredFraction <= 0 || explorer.minReachableExploredFraction > 1 ||
        !Number.isFinite(explorer.reinforcementChance) ||
        explorer.reinforcementChance < 0 || explorer.reinforcementChance > 1 ||
        explorer.extraShooters !== 2 || explorer.extraShootersPerBay !== 1 ||
        explorer.leaderPrefix !== 'Champion' || explorer.promoteExistingShooter !== true)
      throw new Error('Invalid adaptive Explorer Galleries settings.')
    const spirit = value.events.forest_spirit
    if (!spirit || spirit.type !== 'forest_overforaging_retribution' ||
        spirit.location !== 'surface' || spirit.initialBiome !== 'forest' ||
        spirit.enemy !== 'Forest Spirit' ||
        !ENEMY_TEMPLATE_BY_NAME[spirit.enemy]?.adaptiveOnly ||
        !Number.isInteger(spirit.minDistinctForagedForestTiles) || spirit.minDistinctForagedForestTiles < 1 ||
        !Number.isInteger(spirit.returnSurfaceTurns) || spirit.returnSurfaceTurns < 1 ||
        !Number.isInteger(spirit.returnRetryInterval) || spirit.returnRetryInterval < 1 ||
        !Number.isInteger(spirit.minSpawnDistance) || spirit.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(spirit.maxSpawnDistance) || spirit.maxSpawnDistance < spirit.minSpawnDistance ||
        !Number.isInteger(spirit.minEntranceDistance) || spirit.minEntranceDistance < 1 ||
        !Number.isInteger(spirit.maxCandidateSites) || spirit.maxCandidateSites < 1 ||
        !spirit.pursuit || !Number.isFinite(spirit.pursuit.idleChance) ||
        !Number.isFinite(spirit.pursuit.roamChance) ||
        spirit.pursuit.idleChance < 0 || spirit.pursuit.roamChance < 0 ||
        spirit.pursuit.idleChance + spirit.pursuit.roamChance >= 1)
      throw new Error('Invalid adaptive Forest Spirit settings.')
    const survivor = value.events.last_survivor
    if (!survivor || survivor.type !== 'bestiary_species_retaliation' ||
        survivor.location !== 'native_habitats' ||
        !Number.isInteger(survivor.minSpeciesKills) || survivor.minSpeciesKills < 1 ||
        !Number.isFinite(survivor.minKillShare) ||
        survivor.minKillShare <= 0 || survivor.minKillShare > 1 ||
        !Number.isInteger(survivor.companions) || survivor.companions < 1 || survivor.companions > 4 ||
        survivor.leaderPrefix !== 'Champion' ||
        !Number.isFinite(survivor.leaderHpMultiplier) || survivor.leaderHpMultiplier < 1 ||
        !Number.isInteger(survivor.minSpawnDistance) ||
        survivor.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(survivor.maxSpawnDistance) ||
        survivor.maxSpawnDistance < survivor.minSpawnDistance ||
        !Number.isInteger(survivor.maxCompanionDistance) ||
        survivor.maxCompanionDistance < 1 || survivor.maxCompanionDistance > 3 ||
        !Number.isInteger(survivor.minEntranceDistance) || survivor.minEntranceDistance < 1 ||
        !Number.isInteger(survivor.maxCandidateSites) || survivor.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Last Survivor settings.')
    const scrollAmbush = value.events.unused_scroll_ambush
    if (!scrollAmbush || scrollAmbush.type !== 'unused_scroll_cave_exit_ambush' ||
        scrollAmbush.location !== 'natural_cave_exit' ||
        !Number.isInteger(scrollAmbush.minTurnsInCave) || scrollAmbush.minTurnsInCave < 1 ||
        !Number.isInteger(scrollAmbush.minSameKindScrolls) || scrollAmbush.minSameKindScrolls < 2 ||
        JSON.stringify(scrollAmbush.scrollKinds) !== JSON.stringify(['scrollOfInvisibility','homecomingscroll']) ||
        scrollAmbush.scrollKinds.some(kind => !ITEM_DEFINITIONS[kind]) ||
        JSON.stringify(scrollAmbush.ambushSpecies) !== JSON.stringify(['Goblin','Kobold','Skink']) ||
        scrollAmbush.ambushSpecies.some(name=>!ENEMY_TEMPLATE_BY_NAME[name]) ||
        !Number.isFinite(scrollAmbush.normalChance) || scrollAmbush.normalChance < 0 || scrollAmbush.normalChance > 1 ||
        !Number.isFinite(scrollAmbush.multiExitChance) || scrollAmbush.multiExitChance < scrollAmbush.normalChance ||
        scrollAmbush.multiExitChance > 1 ||
        !Number.isInteger(scrollAmbush.multiExitThreshold) || scrollAmbush.multiExitThreshold < 1 ||
        !Number.isInteger(scrollAmbush.groupSize) || scrollAmbush.groupSize < 2 || scrollAmbush.groupSize > 5 ||
        !Number.isInteger(scrollAmbush.minSpawnDistance) || scrollAmbush.minSpawnDistance < 2 ||
        !Number.isInteger(scrollAmbush.maxSpawnDistance) || scrollAmbush.maxSpawnDistance < scrollAmbush.minSpawnDistance ||
        !Number.isInteger(scrollAmbush.maxCompanionDistance) || scrollAmbush.maxCompanionDistance < 1 ||
        !Number.isInteger(scrollAmbush.maxCandidateSites) || scrollAmbush.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Unused Scroll Ambush settings.')
    const strong = value.events.strong_enemy_hunter
    if (!strong || strong.type !== 'opportunist_pack_retaliation' ||
        strong.location !== 'native_habitats' ||
        !Number.isInteger(strong.minInitiatedFights) || strong.minInitiatedFights < 1 ||
        !Number.isFinite(strong.minEnemyStrengthRatio) || strong.minEnemyStrengthRatio <= 1 ||
        !Number.isFinite(strong.maxPackStrengthRatio) || strong.maxPackStrengthRatio <= 0 ||
        strong.maxPackStrengthRatio >= 1 ||
        !Number.isInteger(strong.maxPackTier) || strong.maxPackTier < 1 ||
        !Number.isInteger(strong.groupSize) || strong.groupSize < 2 ||
        !Number.isInteger(strong.maxCompanionDistance) || strong.maxCompanionDistance < 1 ||
        !Number.isInteger(strong.minSpawnDistance) || strong.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(strong.maxSpawnDistance) || strong.maxSpawnDistance < strong.minSpawnDistance ||
        !Number.isInteger(strong.minEntranceDistance) || strong.minEntranceDistance < 1 ||
        !Number.isInteger(strong.maxCandidateSites) || strong.maxCandidateSites < 1 ||
        !Array.isArray(strong.monsterPool) || !strong.monsterPool.length ||
        strong.monsterPool.some(name => !ENEMY_TEMPLATE_BY_NAME[name] ||
          !ENEMY_TEMPLATE_BY_NAME[name].abilities?.includes('gangPower')))
      throw new Error('Invalid adaptive Strong Enemy Hunter settings.')
    const hidden = value.events.hidden_leader
    if (!hidden || hidden.type !== 'guarded_champion_retaliation' ||
        hidden.location !== 'native_habitats' || hidden.leaderPrefix !== 'Champion' ||
        !Number.isInteger(hidden.minLeaderFirstKills) || hidden.minLeaderFirstKills < 1 ||
        !Number.isInteger(hidden.minLivingFollowers) || hidden.minLivingFollowers < 2 ||
        !Number.isInteger(hidden.followers) || hidden.followers < 2 ||
        hidden.minLivingFollowers > hidden.followers ||
        !Number.isInteger(hidden.followersWithin) || hidden.followersWithin < 2 ||
        !Number.isInteger(hidden.minSpawnDistance) || hidden.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(hidden.maxSpawnDistance) || hidden.maxSpawnDistance < hidden.minSpawnDistance ||
        !Number.isInteger(hidden.minEntranceDistance) || hidden.minEntranceDistance < 1 ||
        !Number.isInteger(hidden.maxCandidateSites) || hidden.maxCandidateSites < 1 ||
        !Array.isArray(hidden.monsterPool) || !hidden.monsterPool.length ||
        hidden.monsterPool.some(name => !ENEMY_TEMPLATE_BY_NAME[name]?.abilities?.includes('gangPower')))
      throw new Error('Invalid adaptive Hidden Leader settings.')
    const unfinished = value.events.unfinished_business
    if (!unfinished || unfinished.type !== 'escaped_wounded_enemy_returns' ||
        unfinished.location !== 'native_habitats' || unfinished.returnPrefix !== 'Champion' ||
        !Number.isInteger(unfinished.minEscapes) || unfinished.minEscapes < 2 ||
        !Number.isFinite(unfinished.hpThreshold) || unfinished.hpThreshold <= 0 ||
        unfinished.hpThreshold >= 0.5 ||
        !Number.isInteger(unfinished.quietTurns) || unfinished.quietTurns < 1 ||
        !Number.isInteger(unfinished.escapeDistance) || unfinished.escapeDistance < 2 ||
        !Number.isInteger(unfinished.maxRememberedEscapes) ||
        unfinished.maxRememberedEscapes < unfinished.minEscapes ||
        !Number.isInteger(unfinished.minSpawnDistance) ||
        unfinished.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(unfinished.maxSpawnDistance) ||
        unfinished.maxSpawnDistance < unfinished.minSpawnDistance ||
        !Number.isInteger(unfinished.minEntranceDistance) || unfinished.minEntranceDistance < 1 ||
        !Number.isInteger(unfinished.maxCandidateSites) || unfinished.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Unfinished Business settings.')
    const guardian = value.events.depth_guardian
    if (!guardian || guardian.type !== 'mine_wall_guardian' ||
        guardian.location !== 'dwarven_mines' ||
        guardian.baseSpecies !== 'Guardian of the Deep' ||
        !ENEMY_TEMPLATE_BY_NAME[guardian.baseSpecies]?.adaptiveOnly ||
        !Number.isInteger(guardian.minWallsBroken) || guardian.minWallsBroken < 1 ||
        !Number.isInteger(guardian.warningTurns) || guardian.warningTurns < 1 ||
        !Number.isInteger(guardian.investigationSteps) || guardian.investigationSteps < 1 ||
        !Number.isInteger(guardian.minSpawnDistance) ||
        guardian.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(guardian.minEntranceDistance) || guardian.minEntranceDistance < 1 ||
        !Number.isInteger(guardian.maxCandidateSites) || guardian.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Depth Guardian settings.')
    const fortQuest = value.events.fort_quest
    if (!fortQuest || fortQuest.type !== 'merchant_dwarven_recovery' ||
        fortQuest.location !== 'dwarven_ruins' ||
        fortQuest.targetZ !== -5 ||
        !Number.isInteger(fortQuest.minPlayerLevel) || fortQuest.minPlayerLevel < 2 ||
        fortQuest.itemKind !== 'dwarvenTradeLedger' || !ITEM_DEFINITIONS[fortQuest.itemKind] ||
        !Number.isInteger(fortQuest.minPathSteps) || fortQuest.minPathSteps < 1 ||
        !Number.isInteger(fortQuest.maxPathSteps) ||
        fortQuest.maxPathSteps < fortQuest.minPathSteps ||
        !Number.isInteger(fortQuest.rewardGold) || fortQuest.rewardGold < 1 ||
        !Number.isInteger(fortQuest.mapRevealRadius) || fortQuest.mapRevealRadius < 1)
      throw new Error('Invalid adaptive Fort Quest settings.')
    const previousOwner = value.events.previous_owner
    if (!previousOwner || previousOwner.type !== 'cursed_artifact_former_owner' ||
        previousOwner.location !== 'last_two_dwarven_ruins_floors' ||
        previousOwner.baseSpecies !== 'Ghost' ||
        ENEMY_TEMPLATE_BY_NAME.Ghost?.family !== 'undead' ||
        !Number.isInteger(previousOwner.minEquippedTurns) || previousOwner.minEquippedTurns < 1 ||
        !Number.isInteger(previousOwner.recognitionDistance) || previousOwner.recognitionDistance < 1 ||
        !Number.isInteger(previousOwner.minSpawnDistance) || previousOwner.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(previousOwner.minEntranceDistance) || previousOwner.minEntranceDistance < 1 ||
        !Number.isInteger(previousOwner.maxCandidateSites) || previousOwner.maxCandidateSites < 1 ||
        !Array.isArray(ARTIFACT_NAMES_DWARF) || !ARTIFACT_NAMES_DWARF.length)
      throw new Error('Invalid adaptive Previous Owner settings.')
    const shieldHunter = value.events.undead_shield_hunter
    if (!shieldHunter || shieldHunter.type !== 'anti_marksmanship_undead' ||
        shieldHunter.location !== 'last_two_dwarven_ruins_floors' ||
        !Number.isInteger(shieldHunter.minMarksmanship) || shieldHunter.minMarksmanship < 1 ||
        shieldHunter.baseSpecies !== 'Skeleton' ||
        ENEMY_TEMPLATE_BY_NAME[shieldHunter.baseSpecies]?.family !== 'undead' ||
        typeof shieldHunter.name !== 'string' || !shieldHunter.name.trim() ||
        !Number.isInteger(shieldHunter.shieldHits) || shieldHunter.shieldHits < 1 ||
        !Number.isFinite(shieldHunter.shieldDamageMultiplier) ||
        shieldHunter.shieldDamageMultiplier <= 0 || shieldHunter.shieldDamageMultiplier >= 1 ||
        ['hp','atk','def','spd','grace','tier'].some(key =>
          !Number.isInteger(shieldHunter[key]) || shieldHunter[key] < (key === 'def' ? 0 : 1)) ||
        !Number.isInteger(shieldHunter.minSpawnDistance) ||
        shieldHunter.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(shieldHunter.minEntranceDistance) || shieldHunter.minEntranceDistance < 1 ||
        !Number.isInteger(shieldHunter.maxCandidateSites) || shieldHunter.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Undead Warden settings.')
    const unusedHealing = value.events.unused_healing
    if (!unusedHealing || unusedHealing.type !== 'unused_potions_death_count' ||
        !Number.isInteger(unusedHealing.minDeaths) || unusedHealing.minDeaths < 1 ||
        !Number.isInteger(unusedHealing.minCarriedPotions) || unusedHealing.minCarriedPotions < 1 ||
        unusedHealing.itemKind !== 'potion' ||
        unusedHealing.location !== 'underground' ||
        unusedHealing.rewardItemKind !== 'potion' ||
        !Number.isInteger(unusedHealing.rewardCount) || unusedHealing.rewardCount < 1 ||
        !Number.isInteger(unusedHealing.minPlayerDistance) ||
        unusedHealing.minPlayerDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(unusedHealing.minStairDistance) || unusedHealing.minStairDistance < 1 ||
        !Number.isInteger(unusedHealing.maxCandidateSites) || unusedHealing.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Unused Healing tracking settings.')
    const humanoid = value.events.humanoid_hunter
    if (!humanoid || humanoid.type !== 'beast_initiation_moderation' ||
        !Number.isInteger(humanoid.minHumanoidKills) || humanoid.minHumanoidKills < 1 ||
        !Number.isFinite(humanoid.minHumanoidKillShare) ||
        humanoid.minHumanoidKillShare <= 0 || humanoid.minHumanoidKillShare > 1 ||
        !Number.isFinite(humanoid.initiateCombatChanceMultiplier) ||
        humanoid.initiateCombatChanceMultiplier < 0 || humanoid.initiateCombatChanceMultiplier > 1 ||
        humanoid.family !== 'living' || humanoid.ordinaryOnly !== true)
      throw new Error('Invalid adaptive humanoid hunter settings.')
    const strange = value.events.strange_green_potion
    if (!strange || strange.type !== 'unidentifiable_green_potion' ||
        strange.itemKind !== 'strangeGreenPotion' ||
        !Number.isInteger(strange.minPotionsDrunk) || strange.minPotionsDrunk < 1 ||
        !Number.isFinite(strange.confusionChance) ||
        strange.confusionChance < 0 || strange.confusionChance > 1 ||
        !Number.isInteger(strange.confusionTurns) || strange.confusionTurns < 1 ||
        !Number.isInteger(strange.minPlayerDistance) || strange.minPlayerDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(strange.minStairDistance) || strange.minStairDistance < 1 ||
        !Number.isInteger(strange.maxCandidateSites) || strange.maxCandidateSites < 1 ||
        !ITEM_DEFINITIONS[strange.itemKind])
      throw new Error('Invalid adaptive strange green potion settings.')
    // Environmental lures use only existing trap and water geometry. Do not
    // manufacture hazardous tiles or award an item if the detour is blocked.
    const trapLure = value.events.trap_lure
    if (!trapLure || trapLure.type !== 'trap_detour_ground_reward' ||
        trapLure.location !== 'dwarven_ruins' ||
        !Number.isInteger(trapLure.minDistinctTraps) || trapLure.minDistinctTraps < 1 ||
        !Number.isInteger(trapLure.maxSafeRoute) || trapLure.maxSafeRoute < 1 ||
        !Number.isInteger(trapLure.minDetour) || trapLure.minDetour < 2 ||
        !Number.isInteger(trapLure.maxDetour) || trapLure.maxDetour < trapLure.minDetour ||
        !Number.isInteger(trapLure.minPlayerDistance) || trapLure.minPlayerDistance < 1 ||
        !Number.isInteger(trapLure.maxTrapDistance) || trapLure.maxTrapDistance < 1 ||
        !Number.isInteger(trapLure.maxCandidateSites) || trapLure.maxCandidateSites < 1 ||
        !ITEM_DEFINITIONS[trapLure.rewardItemKind])
      throw new Error('Invalid adaptive trap lure settings.')
    const waterLure = value.events.drowning_lure
    if (!waterLure || waterLure.type !== 'drowning_crossing_ground_reward' ||
        waterLure.location !== 'shore_with_safe_detour' ||
        !Number.isInteger(waterLure.minCrossings) || waterLure.minCrossings < 1 ||
        !Number.isInteger(waterLure.minWaterSteps) || waterLure.minWaterSteps < 2 ||
        !Number.isInteger(waterLure.minShoreSeparation) || waterLure.minShoreSeparation < 2 ||
        !Number.isInteger(waterLure.minWaterWidth) || waterLure.minWaterWidth < 2 ||
        !Number.isInteger(waterLure.maxWaterWidth) || waterLure.maxWaterWidth < waterLure.minWaterWidth ||
        !Number.isInteger(waterLure.maxNearShoreDistance) || waterLure.maxNearShoreDistance < 1 ||
        !Number.isInteger(waterLure.maxSafeRoute) || waterLure.maxSafeRoute < 1 ||
        !Number.isInteger(waterLure.minDetour) || waterLure.minDetour < 1 ||
        !Number.isInteger(waterLure.maxCandidateSites) || waterLure.maxCandidateSites < 1 ||
        !ITEM_DEFINITIONS[waterLure.rewardItemKind])
      throw new Error('Invalid adaptive drowning lure settings.')
    const merchant = value.events.merchant_expansion
    if (!merchant || merchant.type !== 'merchant_stock_expansion' ||
        !Number.isInteger(merchant.minTradeGold) || merchant.minTradeGold < 1 ||
        !Number.isInteger(merchant.templeClearanceRadius) || merchant.templeClearanceRadius < 1 ||
        !value.events.scroll_restock ||
        value.events.scroll_restock.type !== 'merchant_scroll_resupply' ||
        !Number.isInteger(value.events.scroll_restock.minSuccessfulUses) ||
        value.events.scroll_restock.minSuccessfulUses < 1 ||
        !merchant.progression ||
        !Array.isArray(merchant.progression.levelTierCaps) || merchant.progression.levelTierCaps.length < 1 ||
        merchant.progression.levelTierCaps[0].maxLevel < 1 ||
        merchant.progression.levelTierCaps[0].tier < 1 ||
        !merchant.minPurchasePriceByTier ||
        Object.entries(merchant.minPurchasePriceByTier).some(([tier, price]) =>
          !Number.isInteger(Number(tier)) || Number(tier) < 1 || String(Number(tier)) !== tier ||
          !Number.isInteger(price) || price < 0) ||
        !Number.isInteger(merchant.minPurchasePriceByTier['4']) ||
        !Number.isInteger(merchant.minPurchasePriceByTier['5']) ||
        merchant.minPurchasePriceByTier['5'] < merchant.minPurchasePriceByTier['4'] ||
        merchant.progression.levelTierCaps.some((entry, i, arr) =>
          !Number.isInteger(entry.tier) || entry.tier < 1 ||
          (i === arr.length - 1 ? !Number.isInteger(entry.minLevel) || entry.minLevel < 1 ||
            i > 0 && entry.minLevel !== arr[i - 1].maxLevel + 1 :
            !Number.isInteger(entry.maxLevel) || entry.maxLevel < 1 ||
            i > 0 && entry.maxLevel <= arr[i - 1].maxLevel) ||
          i > 0 && entry.tier <= arr[i - 1].tier) ||
        !Array.isArray(merchant.utilityPool) || !merchant.utilityPool.length ||
        merchant.utilityPool.some(kind => typeof kind !== 'string' || !kind))
      throw new Error('Invalid adaptive merchant expansion settings.')
    const nemesis = value.events.nemesis
    if (!nemesis || nemesis.type !== 'champion_for_repeated_deaths' ||
        !Number.isInteger(nemesis.minDeathsBySpecies) || nemesis.minDeathsBySpecies < 1 ||
        nemesis.location !== 'last_dwarven_ruins_floor' || nemesis.prefix !== 'Champion' ||
        nemesis.outsideFov !== true)
      throw new Error('Invalid adaptive Nemesis settings.')
    if (!Number.isInteger(value.limits.floorThreats) || value.limits.floorThreats < 1 ||
        !Number.isInteger(value.limits.nemesisBonusThreat) || value.limits.nemesisBonusThreat < 0)
      throw new Error('Invalid adaptive threat limits.')
    const chances = value.fortEncounterChances
    if (!Array.isArray(chances) || chances.length !== 5 ||
        chances.some((p, i) => !Number.isFinite(p) || p < 0 || p > 1 || (i > 0 && p < chances[i-1])))
      throw new Error('Invalid adaptive fort encounter probability curve.')
    const club = value.events.fan_club
    if (!club || club.type !== 'gear_prefix_fan_club' ||
        club.minMatchingEquippedItems !== 3 ||
        JSON.stringify(club.members) !== JSON.stringify(['Kobold', 'Goblin', 'Skink']) ||
        JSON.stringify(club.equipmentKinds) !== JSON.stringify(['weapon', 'shield', 'armor']) ||
        !Number.isInteger(club.minSpawnDistance) || club.minSpawnDistance < 1 ||
        !Number.isInteger(club.maxMemberDistance) || club.maxMemberDistance < 1 ||
        !Number.isInteger(club.maxCandidateSites) || club.maxCandidateSites < 1 ||
        !Number.isInteger(club.minGearTier) || club.minGearTier < 1 ||
        !Number.isInteger(club.maxGearTier) || club.maxGearTier < club.minGearTier ||
        !MODIFIERS.every(mod => typeof mod.name === 'string' && mod.name.length))
      throw new Error('Invalid adaptive Fan Club settings.')
    const fireball = value.events.self_fireball
    if (!fireball || fireball.type !== 'self_blast_corridor_scroll' ||
        !Number.isInteger(fireball.minSelfHits) || fireball.minSelfHits < 1 ||
        fireball.itemKind !== 'scrollOfFireball' || fireball.location !== 'underground' ||
        !Number.isInteger(fireball.minPlayerDistance) || fireball.minPlayerDistance < 1 ||
        !Number.isInteger(fireball.maxCandidateSites) || fireball.maxCandidateSites < 1)
      throw new Error('Invalid adaptive self-fireball settings.')
    const eater = value.events.venom_eater
    if (!eater || eater.type !== 'poison_absorbing_hunter' ||
        eater.location !== 'last_two_dwarven_ruins_floors' ||
        !Number.isInteger(eater.minDistinctPoisonedEnemies) || eater.minDistinctPoisonedEnemies < 1 ||
        !Number.isInteger(eater.minUndeadPoisonAttempts) || eater.minUndeadPoisonAttempts < 1 ||
        !Number.isFinite(eater.venomHealMaxHpRatio) ||
        eater.venomHealMaxHpRatio < 0 || eater.venomHealMaxHpRatio > 1 ||
        !Number.isInteger(eater.minSpawnDistance) || eater.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(eater.minEntranceDistance) || eater.minEntranceDistance < 1 ||
        !Number.isInteger(eater.maxCandidateSites) || eater.maxCandidateSites < 1 ||
        !ENEMY_TEMPLATE_BY_NAME['Venom Eater']?.adaptiveOnly)
      throw new Error('Invalid adaptive Venom Eater settings.')
    const oculus = value.events.oculus
    if (!oculus || oculus.type !== 'champion_invisibility_counter' ||
        oculus.location !== 'last_two_dwarven_ruins_floors' ||
        oculus.prefix !== 'Champion' ||
        !Number.isInteger(oculus.minSeparateEngagements) || oculus.minSeparateEngagements < 1 ||
        !Number.isInteger(oculus.minAttackFreeTurns) || oculus.minAttackFreeTurns < 1 ||
        !Number.isInteger(oculus.minSpawnDistance) || oculus.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(oculus.minEntranceDistance) || oculus.minEntranceDistance < 1 ||
        !Number.isInteger(oculus.maxCandidateSites) || oculus.maxCandidateSites < 1 ||
        !ENEMY_TEMPLATE_BY_NAME.Oculus?.abilities?.includes('trueSight') ||
        !ENEMY_PREFIXES.Champion)
      throw new Error('Invalid adaptive Champion Oculus settings.')
    const scarab = value.events.ancient_scarab
    if (!scarab || scarab.type !== 'double_champion_scarab' ||
        scarab.location !== 'sand_dig_surface' ||
        !Number.isInteger(scarab.minPreviousDigs) || scarab.minPreviousDigs < 1 ||
        !Number.isInteger(scarab.combatMultiplier) || scarab.combatMultiplier < 2 ||
        !Number.isInteger(scarab.minSpawnDistance) || scarab.minSpawnDistance < 2 ||
        !Number.isInteger(scarab.maxSpawnDistance) || scarab.maxSpawnDistance < scarab.minSpawnDistance ||
        !ENEMY_TEMPLATE_BY_NAME.Scarab || !ENEMY_PREFIXES.Champion)
      throw new Error('Invalid adaptive Ancient Scarab settings.')
    if (!Number.isInteger(value.limits.minThreatSeparation) || value.limits.minThreatSeparation < 1)
      throw new Error('Invalid adaptive threat separation.')
    if (!Number.isInteger(value.limits.surfaceRegionTargetTiles) ||
        value.limits.surfaceRegionTargetTiles < 16 ||
        !Number.isInteger(value.limits.surfaceRegionThreats) ||
        value.limits.surfaceRegionThreats < 1)
      throw new Error('Invalid adaptive surface region limits.')
    const trogloraptor = value.events.trogloraptor_ambush
    if (!trogloraptor || trogloraptor.type !== 'mineral_deposit_wall_ambush' ||
        trogloraptor.location !== 'dwarven_mines' ||
        trogloraptor.monster !== 'Trogloraptor' ||
        !ENEMY_TEMPLATE_BY_NAME.Trogloraptor?.abilities?.includes('wallAmbush') ||
        !Number.isInteger(trogloraptor.minPreviousDeposits) || trogloraptor.minPreviousDeposits < 1 ||
        !Number.isInteger(trogloraptor.minSpawnSteps) || trogloraptor.minSpawnSteps < 2 ||
        !Number.isInteger(trogloraptor.maxSpawnSteps) || trogloraptor.maxSpawnSteps < trogloraptor.minSpawnSteps ||
        !Number.isInteger(trogloraptor.maxDepositDistance) || trogloraptor.maxDepositDistance < 1 ||
        !Number.isInteger(trogloraptor.minStairDistance) || trogloraptor.minStairDistance < 1 ||
        !Number.isInteger(trogloraptor.maxCandidateSites) || trogloraptor.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Trogloraptor ambush settings.')
    const prophet = value.events.mushroom_prophet
    if (!prophet || prophet.type !== 'fungus_patch_prophecy' ||
        prophet.location !== 'natural_underground_fungi' ||
        !Number.isInteger(prophet.minMushroomsCollected) || prophet.minMushroomsCollected < 1 ||
        !Number.isInteger(prophet.warningTurns) || prophet.warningTurns < 1 ||
        !Number.isInteger(prophet.minSpawnDistance) || prophet.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(prophet.minEntranceDistance) || prophet.minEntranceDistance < 1 ||
        !Number.isInteger(prophet.maxFungusDistance) || prophet.maxFungusDistance < 1 ||
        !Number.isInteger(prophet.maxCandidateSites) || prophet.maxCandidateSites < 1 ||
        typeof prophet.prophecy !== 'string' || !prophet.prophecy.trim() ||
        !ENEMY_TEMPLATE_BY_NAME['Mushroom Prophet']?.adaptiveOnly)
      throw new Error('Invalid adaptive Mushroom Prophet settings.')
    const debt = value.events.debt_collector
    if (!debt || debt.type !== 'dwarven_remains_debt' ||
        debt.location !== 'last_two_dwarven_ruins_floors' ||
        !Number.isInteger(debt.minRemainsSearched) || debt.minRemainsSearched < 1 ||
        !Number.isInteger(debt.goldDemand) || debt.goldDemand < 1 ||
        !Number.isInteger(debt.minSpawnDistance) || debt.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(debt.minEntranceDistance) || debt.minEntranceDistance < 1 ||
        !Number.isInteger(debt.maxCandidateSites) || debt.maxCandidateSites < 1 ||
        !ENEMY_TEMPLATE_BY_NAME.Ghost?.abilities?.includes('ethereal'))
      throw new Error('Invalid adaptive Debt Collector settings.')
    const guest = value.events.uninvited_guest
    if (!guest || guest.type !== 'campfire_visitor' ||
        guest.location !== 'lit_abandoned_campfire' ||
        !Number.isInteger(guest.minPreviousLightings) || guest.minPreviousLightings < 1 ||
        !Number.isFinite(guest.friendlyChance) || guest.friendlyChance < 0 || guest.friendlyChance > 1 ||
        !Number.isInteger(guest.warningTurns) || guest.warningTurns < 1 ||
        !Number.isInteger(guest.minSpawnSteps) || guest.minSpawnSteps < 2 ||
        !Number.isInteger(guest.maxSpawnSteps) || guest.maxSpawnSteps < guest.minSpawnSteps ||
        !Number.isInteger(guest.maxFireDistance) || guest.maxFireDistance < 1 ||
        !Number.isInteger(guest.maxCandidateSites) || guest.maxCandidateSites < 1 ||
        !Array.isArray(guest.mealPool) || guest.mealPool.length === 0 ||
        guest.mealPool.some(kind => !['roastedMeat','bakedPotato','cookedFish'].includes(kind)) ||
        !ENEMY_TEMPLATE_BY_NAME['Uninvited Guest']?.adaptiveOnly)
      throw new Error('Invalid adaptive Uninvited Guest settings.')
    const cleaning = value.events.ignored_mushroom_cleaning
    if (!cleaning || cleaning.type !== 'neglected_herbalist_purification' ||
        cleaning.location !== 'next_unvisited_cave_or_dwarven_ruins_floor' ||
        !Number.isInteger(cleaning.minIgnoredVisits) || cleaning.minIgnoredVisits < 1 ||
        !Number.isInteger(cleaning.mushroomsTotal) || cleaning.mushroomsTotal < 1 ||
        !Number.isInteger(cleaning.rawMushrooms) || cleaning.rawMushrooms < 1 ||
        cleaning.rawMushrooms > cleaning.mushroomsTotal ||
        !Number.isInteger(cleaning.clusterRadius) || cleaning.clusterRadius < 1 ||
        !Number.isInteger(cleaning.minPlayerDistance) || cleaning.minPlayerDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(cleaning.maxCandidateSites) || cleaning.maxCandidateSites < cleaning.mushroomsTotal)
      throw new Error('Invalid adaptive ignored-mushroom-cleaning settings.')
    const hungry = value.events.hungry_monster
    if (!hungry || hungry.type !== 'meat_scent_hunter' || hungry.location !== 'native_habitats' ||
        !Number.isInteger(hungry.minCarriedMeat) || hungry.minCarriedMeat < 1 ||
        JSON.stringify(hungry.eligibleMeatKinds) !== JSON.stringify(['meat','roastedMeat']) ||
        JSON.stringify(hungry.monsterPool) !== JSON.stringify(['Ogre','Cyclops','Cave Troll']) ||
        hungry.monsterPool.some(name => !ENEMY_TEMPLATE_BY_NAME[name]) ||
        !Number.isFinite(hungry.healthMultiplier) || hungry.healthMultiplier <= 0 || hungry.healthMultiplier >= 1 ||
        !Number.isFinite(hungry.defenseMultiplier) || hungry.defenseMultiplier <= 0 || hungry.defenseMultiplier >= 1 ||
        !Number.isFinite(hungry.attackMultiplier) || hungry.attackMultiplier <= 1 ||
        !Number.isInteger(hungry.droppedMeatDetectionRange) || hungry.droppedMeatDetectionRange < 1 ||
        hungry.meatUnitsEaten !== 1 ||
        !Number.isInteger(hungry.minSpawnDistance) || hungry.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(hungry.maxSpawnDistance) || hungry.maxSpawnDistance < hungry.minSpawnDistance ||
        !Number.isInteger(hungry.minEntranceDistance) || hungry.minEntranceDistance < 1 ||
        !Number.isInteger(hungry.maxCandidateSites) || hungry.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Hungry Monster settings.')
    const goldImp = value.events.gold_imp
    if (!goldImp || goldImp.type !== 'gold_thief' || goldImp.location !== 'native_imp_habitats' ||
        !ENEMY_TEMPLATE_BY_NAME.Imp?.abilities?.includes('thief') ||
        !Number.isInteger(goldImp.minPlayerGold) || goldImp.minPlayerGold < 1 ||
        !Number.isFinite(goldImp.stealRatio) || goldImp.stealRatio <= 0 || goldImp.stealRatio > 1 ||
        !Number.isInteger(goldImp.maxStolenGold) || goldImp.maxStolenGold < 1 ||
        !Number.isInteger(goldImp.minSpawnDistance) || goldImp.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(goldImp.maxSpawnDistance) || goldImp.maxSpawnDistance < goldImp.minSpawnDistance ||
        !Number.isInteger(goldImp.minEntranceDistance) || goldImp.minEntranceDistance < 1 ||
        !Number.isInteger(goldImp.maxCandidateSites) || goldImp.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Gold Imp settings.')
    const thieves = value.modifiers?.unsold_equipment
    if (!thieves || thieves.type !== 'dynamic_ordinary_thief_encounters' ||
        !Number.isInteger(thieves.minUnequippedGear) || thieves.minUnequippedGear < 1 ||
        !Number.isFinite(thieves.normalChance) || thieves.normalChance < 0 || thieves.normalChance > 1 ||
        !Number.isFinite(thieves.hoardingChance) || thieves.hoardingChance < thieves.normalChance ||
        thieves.hoardingChance > 1 ||
        !Number.isInteger(thieves.minSpawnDistance) || thieves.minSpawnDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(thieves.maxSpawnDistance) || thieves.maxSpawnDistance < thieves.minSpawnDistance ||
        !Number.isInteger(thieves.minEntranceDistance) || thieves.minEntranceDistance < 1 ||
        !Number.isInteger(thieves.maxCandidateSites) || thieves.maxCandidateSites < 1 ||
        !ENEMY_TEMPLATES.some(t => t.abilities?.includes('thief')))
      throw new Error('Invalid adaptive Unsold Equipment modifier.')
    const descent = value.events.early_descent
    if (!descent || descent.type !== 'premature_descent_remains' ||
        descent.location !== 'first_deep_cave_or_dwarven_fort_entry' ||
        !Number.isInteger(descent.maxLevelForDepthTwo) || descent.maxLevelForDepthTwo < 1 ||
        !Number.isInteger(descent.maxLevelForFort) || descent.maxLevelForFort < 1 ||
        descent.gearTier !== 1 ||
        JSON.stringify(descent.gearKinds) !== JSON.stringify(['weapon','armor','shield']) ||
        descent.scrollKind !== 'homecomingscroll' || !ITEM_DEFINITIONS[descent.scrollKind] ||
        !Number.isFinite(descent.scrollChance) || descent.scrollChance < 0 || descent.scrollChance > 1 ||
        !Number.isInteger(descent.goldMin) || descent.goldMin < 0 ||
        !Number.isInteger(descent.goldMax) || descent.goldMax < descent.goldMin ||
        !Number.isInteger(descent.minPathSteps) || descent.minPathSteps < 2 ||
        !Number.isInteger(descent.maxPathSteps) || descent.maxPathSteps < descent.minPathSteps ||
        !Number.isInteger(descent.minStairDistance) || descent.minStairDistance < 1 ||
        !Number.isInteger(descent.maxCandidateSites) || descent.maxCandidateSites < 1)
      throw new Error('Invalid adaptive Early Descent settings.')
    const unread = value.events.unread_scrolls
    if (!unread || unread.type !== 'hoarded_scrolls_note' ||
        unread.location !== 'dwarven_ruins' ||
        !Number.isInteger(unread.minUnusedScrollTurns) || unread.minUnusedScrollTurns < 1 ||
        unread.noteItemKind !== 'tauntingNote' ||
        typeof unread.noteText !== 'string' || !unread.noteText.trim() ||
        !Number.isInteger(unread.minPlayerDistance) || unread.minPlayerDistance <= UndergroundFov.RADIUS ||
        !Number.isInteger(unread.minStairDistance) || unread.minStairDistance < 1 ||
        !Number.isInteger(unread.maxCandidateSites) || unread.maxCandidateSites < 1)
      throw new Error('Invalid adaptive unread-scrolls settings.')
    // The two gear rewards use the same one-time exclusive pool; no second
    // artifact can appear after one of them is placed.
    for (const [id, type] of [['opposite_weapon', 'opposite_specialization_artifact'],
        ['neglected_shield', 'neglected_shield_artifact']]) {
      const e = value.events[id]
      if (!e || e.type !== type || e.location !== 'last_two_dwarven_ruins_floors' ||
          e.exclusiveGroup !== 'neglected_combat_gear' ||
          e.artifactEffectId !== 'blessed_relic' ||
          !Number.isInteger(e.minPlayerDistance) || e.minPlayerDistance <= UndergroundFov.RADIUS ||
          !Number.isInteger(e.minStairDistance) || e.minStairDistance < 1 ||
          !Number.isInteger(e.maxCandidateSites) || e.maxCandidateSites < 1)
        throw new Error(`Invalid adaptive ${id} reward settings.`)
    }
    const opposite = value.events.opposite_weapon
    if (!Number.isInteger(opposite.minPrimarySkill) || opposite.minPrimarySkill < 1 ||
        !Number.isInteger(opposite.maxOppositeSkill) || opposite.maxOppositeSkill < 0 ||
        opposite.maxOppositeSkill >= opposite.minPrimarySkill ||
        !Array.isArray(opposite.weaponPools.oneHanded) ||
        !Array.isArray(opposite.weaponPools.twoHanded) ||
        [opposite.weaponPools.oneHanded,opposite.weaponPools.twoHanded].some((pool,i)=>
          !pool.length || pool.some(name => !WEAPONS.some(weapon =>
            weapon.name === name && !weapon.rangedAtk && !!weapon.twoHanded === !!i && weapon.tier === 5))))
      throw new Error('Invalid adaptive opposite-weapon rewards.')
    const shield = value.events.neglected_shield
    if (!Number.isInteger(shield.minShieldlessFights) || shield.minShieldlessFights < 1 ||
        !Number.isInteger(shield.maxShieldingSkill) || shield.maxShieldingSkill < 0 ||
        !Number.isInteger(shield.quietTurns) || shield.quietTurns < 1 ||
        !SHIELDS.some(item=>item.name===shield.shieldBase && item.tier===5) ||
        !ARTIFACT_EFFECTS.some(effect=>effect.id===shield.artifactEffectId && effect.tier===5) ||
        JSON.stringify(shield.variantPriority) !== JSON.stringify(['atk','def','spd','mf','grace']) ||
        shield.variantPriority.some(stat => !shield.variantBonuses[stat] ||
          Object.values(shield.variantBonuses[stat]).some(value => !Number.isInteger(value) || value <= 0)))
      throw new Error('Invalid adaptive shield reward settings.')
    // Names are data, not generated at runtime: every draw uses seeded game RNG.
    if (!Array.isArray(nameData?.names) || nameData.names.length < 50 ||
        nameData.names.some(name => typeof name !== 'string' ||
          !/^[A-Za-z'-]{3,24}$/.test(name)) ||
        new Set(nameData.names).size !== nameData.names.length)
      throw new Error('Invalid monster name pool (requires at least 50 unique names).')
    monsterNames = nameData.names.slice()
    config = structuredClone(value)
    debugTrollingOverride = null
    clearDerivedState()
  }

  function active() {
    // Cursed World is represented by the resolved world-trait set in both
    // live games and save/replay snapshots. The checkbox alone is UI state.
    return !!config?.enabled && activeWorldTraits.length > 0
  }

  function reset() { state = fresh(); debugTrollingOverride = null; clearDerivedState() }

  function serialize() {
    // No RNG or gameplay mutation during save. Flags are maintained at action
    // boundaries; 'completed' remains the authoritative event-used registry.
    return structuredClone(state)
  }

  // Configured in content/adaptive_player_trolling.json. The console override
  // is temporary and does not enter saves or replays. Logging never draws RNG.
  function debugTrollingEnabled() {
    return debugTrollingOverride ?? !!config?.debugTrolling
  }

  function setDebugTrolling(enabled) {
    if (typeof enabled !== 'boolean') return false
    debugTrollingOverride = enabled
    if (enabled && active()) {
      log('[TROLLING] Debug messages enabled. Ready flags and completed events are stored in the save.', 'trolling-debug')
      syncTriggerFlags()
    }
    return true
  }

  function debugEvent(message) {
    if (debugTrollingEnabled() && active()) log(`[TROLLING] ${message}`, 'trolling-debug')
  }

  function markTrigger(id) {
    if (!active() || !Object.prototype.hasOwnProperty.call(state.triggerFlags,id) ||
        state.triggerFlags[id]) return
    state.triggerFlags[id] = true
    debugEvent(`Condition met: ${id}. Waiting for a valid opportunity.`)
  }

  // Flags are historical: true means the condition was ever observed (or its
  // reaction already occurred), NOT that an optional encounter must spawn now.
  // Transient conditions such as carrying meat are independently rechecked when
  // choosing actual encounters. No expensive spawn searches are run here.
  function syncTriggerFlags() {
    if (!active()) return
    for (const id of state.completed) markTrigger(id)
    const e=config.events
    let inventoryCounts = null
    const carried = () => {
      if (inventoryCounts) return inventoryCounts
      let meat = 0, gear = 0
      for (const item of player.inventory || []) {
        const count = Math.max(0,item.count || 1)
        if (e.hungry_monster.eligibleMeatKinds.includes(item.kind)) meat += count
        if (item.kind === 'weapon' || item.kind === 'armor') gear += count
      }
      return inventoryCounts = {meat, gear}
    }
    if (!state.triggerFlags.merchant_expansion && (Math.max(state.merchantSalesGold, state.merchantPurchasesGold) >= e.merchant_expansion.minTradeGold ||
        completed('merchant_expansion'))) markTrigger('merchant_expansion')
    if (!state.triggerFlags.nemesis && (!!nemesisSpecies())) markTrigger('nemesis')
    if (!state.triggerFlags.fan_club && (!!matchingEquippedPrefix())) markTrigger('fan_club')
    if (!state.triggerFlags.self_fireball && (state.selfFireballHits >= e.self_fireball.minSelfHits)) markTrigger('self_fireball')
    if (!state.triggerFlags.venom_eater && (venomEaterEligible())) markTrigger('venom_eater')
    if (!state.triggerFlags.oculus && (oculusEligible())) markTrigger('oculus')
    if (!state.triggerFlags.ancient_scarab && (state.dugSandCount >= e.ancient_scarab.minPreviousDigs)) markTrigger('ancient_scarab')
    if (!state.triggerFlags.trogloraptor_ambush && (state.extractedMineralDeposits >= e.trogloraptor_ambush.minPreviousDeposits)) markTrigger('trogloraptor_ambush')
    if (!state.triggerFlags.mushroom_prophet && (state.mushroomsCollected >= e.mushroom_prophet.minMushroomsCollected)) markTrigger('mushroom_prophet')
    if (!state.triggerFlags.debt_collector && (state.dwarvenRemainsSearched >= e.debt_collector.minRemainsSearched)) markTrigger('debt_collector')
    if (!state.triggerFlags.uninvited_guest && (state.campfireLightings >= e.uninvited_guest.minPreviousLightings)) markTrigger('uninvited_guest')
    if (!state.triggerFlags.ignored_mushroom_cleaning && (state.herbalistIgnoredVisits >= e.ignored_mushroom_cleaning.minIgnoredVisits)) markTrigger('ignored_mushroom_cleaning')
    if (!state.triggerFlags.hungry_monster && (carried().meat >= e.hungry_monster.minCarriedMeat)) markTrigger('hungry_monster')
    if (!state.triggerFlags.gold_imp && (player.gold >= e.gold_imp.minPlayerGold)) markTrigger('gold_imp')
    if (!state.triggerFlags.unread_scrolls && (!state.scrollEverRead && carryingScroll() &&
        state.unreadScrollTurns >= e.unread_scrolls.minUnusedScrollTurns)) markTrigger('unread_scrolls')
    if (!state.triggerFlags.unused_scroll_ambush && (unusedScrollAmbushReady())) markTrigger('unused_scroll_ambush')
    if (!state.triggerFlags.early_descent && (!!state.events.early_descent)) markTrigger('early_descent')
    if (!state.triggerFlags.unused_healing && (state.unusedHealingDeaths >= e.unused_healing.minDeaths)) markTrigger('unused_healing')
    if (!state.triggerFlags.humanoid_hunter && (humanoidHunterActive())) markTrigger('humanoid_hunter')
    if (!state.triggerFlags.beast_hunter && (beastHunterEligible())) markTrigger('beast_hunter')
    if (!state.triggerFlags.forest_spirit && (foragedTiles.size >= e.forest_spirit.minDistinctForagedForestTiles)) markTrigger('forest_spirit')
    if (!state.triggerFlags.strong_enemy_hunter && (state.strongFightsInitiated.length >= e.strong_enemy_hunter.minInitiatedFights)) markTrigger('strong_enemy_hunter')
    if (!state.triggerFlags.hidden_leader && (state.hiddenLeaderKills.length >= e.hidden_leader.minLeaderFirstKills)) markTrigger('hidden_leader')
    if (!state.triggerFlags.unfinished_business && (state.unfinishedEscapes.length >= e.unfinished_business.minEscapes)) markTrigger('unfinished_business')
    if (!state.triggerFlags.previous_owner && (eligiblePreviousOwnerArtifacts().length > 0)) markTrigger('previous_owner')
    if (!state.triggerFlags.fort_quest && (state.fortQuestAccepted ||
        (!state.fortQuestVisited && player.lvl >= e.fort_quest.minPlayerLevel))) markTrigger('fort_quest')
    if (!state.triggerFlags.depth_guardian && (state.mineWallsBroken >= e.depth_guardian.minWallsBroken)) markTrigger('depth_guardian')
    if (!state.triggerFlags.undead_shield_hunter && ((player.combatSkills?.marksmanship || 0) >= e.undead_shield_hunter.minMarksmanship)) markTrigger('undead_shield_hunter')
    if (!state.triggerFlags.last_survivor && (lastSurvivorSpecies().length > 0)) markTrigger('last_survivor')
    if (!state.triggerFlags.opposite_weapon && (!!oppositeWeaponTarget())) markTrigger('opposite_weapon')
    if (!state.triggerFlags.neglected_shield && (neglectedShieldEligible())) markTrigger('neglected_shield')
    if (!state.triggerFlags.strange_green_potion && (state.potionsDrunk >= e.strange_green_potion.minPotionsDrunk)) markTrigger('strange_green_potion')
    if (!state.triggerFlags.trap_lure && (state.triggeredTrapIds.length >= e.trap_lure.minDistinctTraps)) markTrigger('trap_lure')
    if (!state.triggerFlags.drowning_lure && (state.drowningCrossings >= e.drowning_lure.minCrossings)) markTrigger('drowning_lure')
    if (!state.triggerFlags.low_hp_carrion && (state.lowHpTurns >= e.low_hp_carrion.minBelowHpTurns)) markTrigger('low_hp_carrion')
    if (!state.triggerFlags.reckless_fighter && (state.recklessLowHpFights >= e.reckless_fighter.minFights)) markTrigger('reckless_fighter')
    if (!state.triggerFlags.unsold_equipment && (carried().gear >= config.modifiers.unsold_equipment.minUnequippedGear)) markTrigger('unsold_equipment')
  }

  function restore(saved) {
    if (!saved || typeof saved !== 'object' ||
        !Number.isFinite(saved.merchantSalesGold) || saved.merchantSalesGold < 0 ||
        !Number.isFinite(saved.merchantPurchasesGold) || saved.merchantPurchasesGold < 0 ||
        !(saved.templeClearanceTargets === null || Array.isArray(saved.templeClearanceTargets) &&
          saved.templeClearanceTargets.every(id => typeof id === 'string') &&
          new Set(saved.templeClearanceTargets).size === saved.templeClearanceTargets.length) ||
        !Number.isInteger(saved.templeClearanceKills) || saved.templeClearanceKills < 0 ||
        !Number.isInteger(saved.scrollUses) || saved.scrollUses < 0 ||
        !Array.isArray(saved.scrollKindsUsed) ||
        saved.scrollKindsUsed.some(kind => typeof kind !== 'string' ||
          !(kind === 'homecomingscroll' || kind.startsWith('scrollOf')) || !itemDefinition(kind)) ||
        new Set(saved.scrollKindsUsed).size !== saved.scrollKindsUsed.length ||
        !Array.isArray(saved.completed) || !saved.floorThreats || !saved.events ||
        !saved.triggerFlags || typeof saved.triggerFlags !== 'object' ||
        Array.isArray(saved.triggerFlags) ||
        Object.keys(saved.triggerFlags).length !== TRIGGER_IDS.length ||
        TRIGGER_IDS.some(id => typeof saved.triggerFlags[id] !== 'boolean') ||
        typeof saved.events !== 'object' || Array.isArray(saved.events) ||
        (saved.events.early_descent !== undefined &&
          (!saved.events.early_descent ||
            !['chain','crypt2'].includes(saved.events.early_descent.levelKind) ||
            ![-2,-3].includes(saved.events.early_descent.z) ||
            !Number.isInteger(saved.events.early_descent.caveIndex) ||
            saved.events.early_descent.caveIndex < -1 ||
            (saved.events.early_descent.z === -3 &&
              saved.events.early_descent.levelKind !== 'chain'))) ||
        !saved.deathsBySpecies || !saved.lastDeathBySpecies || !saved.floorChecks ||
        typeof saved.floorChecks !== 'object' || Array.isArray(saved.floorChecks) ||
        !Number.isInteger(saved.deathSerial) || saved.deathSerial < 0 ||
        !Number.isInteger(saved.selfFireballHits) || saved.selfFireballHits < 0 ||
        !Array.isArray(saved.poisonedEnemyIds) ||
        saved.poisonedEnemyIds.some(id => typeof id !== 'string') ||
        !Number.isInteger(saved.undeadVenomAttempts) || saved.undeadVenomAttempts < 0 ||
        !Array.isArray(saved.oculusTargetIds) ||
        saved.oculusTargetIds.some(id => typeof id !== 'string') ||
        !(saved.oculusLastAttackTurn === null ||
          Number.isInteger(saved.oculusLastAttackTurn) && saved.oculusLastAttackTurn >= 0) ||
        !Number.isInteger(saved.oculusEngagementSerial) || saved.oculusEngagementSerial < 0 ||
        typeof saved.oculusEngagementCredited !== 'boolean' ||
        !Number.isInteger(saved.dugSandCount) || saved.dugSandCount < 0 ||
        !Number.isInteger(saved.extractedMineralDeposits) || saved.extractedMineralDeposits < 0 ||
        !Number.isInteger(saved.mineWallsBroken) || saved.mineWallsBroken < 0 ||
        !Number.isInteger(saved.forestSpiritRestTurns) || saved.forestSpiritRestTurns < 0 ||
        !saved.explorerGalleryRolls || typeof saved.explorerGalleryRolls !== 'object' ||
        Array.isArray(saved.explorerGalleryRolls) ||
        Object.entries(saved.explorerGalleryRolls).some(([key, outcome]) =>
          !/^chain:-\d+:dwarven-room:-\d+:\d+$/.test(key) ||
          typeof outcome !== 'boolean') ||
        !(saved.forestSpiritLastSurfaceTurn === null ||
          Number.isInteger(saved.forestSpiritLastSurfaceTurn) && saved.forestSpiritLastSurfaceTurn >= 0) ||
        !(saved.depthGuardianWarning === null ||
          saved.depthGuardianWarning && typeof saved.depthGuardianWarning === 'object' &&
          Number.isInteger(saved.depthGuardianWarning.z) && saved.depthGuardianWarning.z < 0 &&
          Number.isInteger(saved.depthGuardianWarning.startedAtTurn) &&
          saved.depthGuardianWarning.startedAtTurn >= 0) ||
        !Number.isInteger(saved.mushroomsCollected) || saved.mushroomsCollected < 0 ||
        !Number.isInteger(saved.dwarvenRemainsSearched) || saved.dwarvenRemainsSearched < 0 ||
        !Number.isInteger(saved.herbalistIgnoredVisits) || saved.herbalistIgnoredVisits < 0 ||
        !(saved.herbalistVisit === null ||
          saved.herbalistVisit && typeof saved.herbalistVisit === 'object' &&
          typeof saved.herbalistVisit.purified === 'boolean' &&
          Number.isInteger(saved.herbalistVisit.x) && Number.isInteger(saved.herbalistVisit.y)) ||
        !Array.isArray(saved.ordinaryThiefChecks) ||
        saved.ordinaryThiefChecks.some(key => typeof key !== 'string') ||
        new Set(saved.ordinaryThiefChecks).size !== saved.ordinaryThiefChecks.length ||
        typeof saved.fortQuestVisited !== 'boolean' ||
        typeof saved.fortQuestAccepted !== 'boolean' ||
        !Array.isArray(saved.visitedUndergroundFloors) ||
        saved.visitedUndergroundFloors.some(key => typeof key !== 'string') ||
        new Set(saved.visitedUndergroundFloors).size !== saved.visitedUndergroundFloors.length ||
        !Number.isInteger(saved.activationChecks) || saved.activationChecks < 0 ||
        !Number.isInteger(saved.unusedHealingDeaths) || saved.unusedHealingDeaths < 0 ||
        !Array.isArray(saved.strongFightsInitiated) ||
        saved.strongFightsInitiated.length > config.events.strong_enemy_hunter.minInitiatedFights ||
        saved.strongFightsInitiated.some(id => typeof id !== 'string' || !id) ||
        new Set(saved.strongFightsInitiated).size !== saved.strongFightsInitiated.length ||
        !Array.isArray(saved.hiddenLeaderKills) ||
        saved.hiddenLeaderKills.length > config.events.hidden_leader.minLeaderFirstKills ||
        saved.hiddenLeaderKills.some(entry => !entry || typeof entry.leaderId !== 'string' ||
          !entry.leaderId || !Array.isArray(entry.followerIds) ||
          entry.followerIds.length < config.events.hidden_leader.minLivingFollowers ||
          entry.followerIds.some(id => typeof id !== 'string' || !id) ||
          new Set(entry.followerIds).size !== entry.followerIds.length) ||
        new Set(saved.hiddenLeaderKills.map(entry=>entry.leaderId)).size !== saved.hiddenLeaderKills.length ||
        !Array.isArray(saved.unfinishedFightCandidates) ||
        saved.unfinishedFightCandidates.some(id => typeof id !== 'string' || !id) ||
        new Set(saved.unfinishedFightCandidates).size !== saved.unfinishedFightCandidates.length ||
        !(saved.unfinishedLastAttackTurn === null ||
          Number.isInteger(saved.unfinishedLastAttackTurn) && saved.unfinishedLastAttackTurn >= 0) ||
        !Array.isArray(saved.unfinishedEscapes) ||
        saved.unfinishedEscapes.length > config.events.unfinished_business.maxRememberedEscapes ||
        saved.unfinishedEscapes.some(id => typeof id !== 'string' || !id) ||
        new Set(saved.unfinishedEscapes).size !== saved.unfinishedEscapes.length ||
        !Number.isInteger(saved.lowHpTurns) || saved.lowHpTurns < 0 ||        !(saved.survivalLastTurn === null ||
          Number.isInteger(saved.survivalLastTurn) && saved.survivalLastTurn >= 0) ||
        !(saved.combatLastAttackTurn === null ||
          Number.isInteger(saved.combatLastAttackTurn) && saved.combatLastAttackTurn >= 0) ||
        !Number.isInteger(saved.shieldlessFights) || saved.shieldlessFights < 0 ||
        !(saved.shieldlessFightLastAttackTurn === null ||
          Number.isInteger(saved.shieldlessFightLastAttackTurn) && saved.shieldlessFightLastAttackTurn >= 0) ||
        typeof saved.shieldlessFightEligible !== 'boolean' ||
        !Number.isInteger(saved.recklessLowHpFights) || saved.recklessLowHpFights < 0 ||
        !Array.isArray(saved.triggeredTrapIds) ||
        saved.triggeredTrapIds.some(id => typeof id !== 'string') ||
        new Set(saved.triggeredTrapIds).size !== saved.triggeredTrapIds.length ||
        !Number.isInteger(saved.drowningCrossings) || saved.drowningCrossings < 0 ||
        !(saved.waterCrossing === null ||
          saved.waterCrossing && typeof saved.waterCrossing === 'object' &&
          Number.isInteger(saved.waterCrossing.x) && Number.isInteger(saved.waterCrossing.y) &&
          Number.isInteger(saved.waterCrossing.z) &&
          Number.isInteger(saved.waterCrossing.steps) && saved.waterCrossing.steps >= 0 &&
          typeof saved.waterCrossing.damaged === 'boolean') ||
        !Number.isInteger(saved.potionsDrunk) || saved.potionsDrunk < 0 ||
        typeof saved.scrollEverRead !== 'boolean' ||
        !(saved.caveVisit === null ||
          saved.caveVisit && typeof saved.caveVisit === 'object' &&
          Number.isInteger(saved.caveVisit.caveIndex) && saved.caveVisit.caveIndex >= 0 &&
          Number.isInteger(saved.caveVisit.turns) && saved.caveVisit.turns >= 0 &&
          Number.isInteger(saved.caveVisit.lastTurn) && saved.caveVisit.lastTurn >= 0 &&
          saved.caveVisit.kills &&
          ['Goblin','Kobold','Skink'].every(kind => Number.isInteger(saved.caveVisit.kills[kind]) &&
            saved.caveVisit.kills[kind] >= 0)) ||
        !Number.isInteger(saved.unreadScrollTurns) || saved.unreadScrollTurns < 0 ||
        !(saved.unreadScrollLastTurn === null || Number.isInteger(saved.unreadScrollLastTurn) && saved.unreadScrollLastTurn >= 0) ||
        !Number.isInteger(saved.campfireLightings) || saved.campfireLightings < 0 ||
        !Number.isInteger(saved.nextDwarvenLootId) || saved.nextDwarvenLootId < 1 ||
        !Array.isArray(saved.dwarvenGoldLoot) ||
        saved.dwarvenGoldLoot.some(lot => !lot || typeof lot.id !== 'string' ||
          !/^dwarven-loot-\d+$/.test(lot.id) ||
          !Number.isInteger(lot.amount) || lot.amount < 1) ||
        new Set(saved.dwarvenGoldLoot.map(lot => lot.id)).size !== saved.dwarvenGoldLoot.length)
      throw new Error('Save is missing adaptive player trolling state.')
    clearDerivedState()
    debugTrollingOverride = null
    state = {
      merchantSalesGold: saved.merchantSalesGold,
      merchantPurchasesGold: saved.merchantPurchasesGold,
      templeClearanceTargets: saved.templeClearanceTargets === null ? null : saved.templeClearanceTargets.slice(),
      templeClearanceKills: saved.templeClearanceKills,
      scrollUses: saved.scrollUses,
      scrollKindsUsed: saved.scrollKindsUsed.slice(),
      triggerFlags: structuredClone(saved.triggerFlags),
      completed: saved.completed.slice(),
      floorThreats: structuredClone(saved.floorThreats),
      events: structuredClone(saved.events),
      deathsBySpecies: structuredClone(saved.deathsBySpecies),
      lastDeathBySpecies: structuredClone(saved.lastDeathBySpecies),
      deathSerial: saved.deathSerial,
      floorChecks: structuredClone(saved.floorChecks),
      selfFireballHits: saved.selfFireballHits,
      poisonedEnemyIds: saved.poisonedEnemyIds.slice(),
      undeadVenomAttempts: saved.undeadVenomAttempts,
      oculusTargetIds: saved.oculusTargetIds.slice(),
      oculusLastAttackTurn: saved.oculusLastAttackTurn,
      oculusEngagementSerial: saved.oculusEngagementSerial,
      oculusEngagementCredited: saved.oculusEngagementCredited,
      dugSandCount: saved.dugSandCount,
      extractedMineralDeposits: saved.extractedMineralDeposits,
      mineWallsBroken: saved.mineWallsBroken,
      forestSpiritRestTurns: saved.forestSpiritRestTurns,
      explorerGalleryRolls: structuredClone(saved.explorerGalleryRolls),
      forestSpiritLastSurfaceTurn: saved.forestSpiritLastSurfaceTurn,
      depthGuardianWarning: structuredClone(saved.depthGuardianWarning),
      mushroomsCollected: saved.mushroomsCollected,
      dwarvenRemainsSearched: saved.dwarvenRemainsSearched,
      nextDwarvenLootId: saved.nextDwarvenLootId,
      dwarvenGoldLoot: structuredClone(saved.dwarvenGoldLoot),
      campfireLightings: saved.campfireLightings,
      herbalistIgnoredVisits: saved.herbalistIgnoredVisits,
      herbalistVisit: structuredClone(saved.herbalistVisit),
      visitedUndergroundFloors: saved.visitedUndergroundFloors.slice(),
      fortQuestVisited: saved.fortQuestVisited,
      fortQuestAccepted: saved.fortQuestAccepted,
      ordinaryThiefChecks: saved.ordinaryThiefChecks.slice(),
      unreadScrollTurns: saved.unreadScrollTurns,
      unreadScrollLastTurn: saved.unreadScrollLastTurn,
      scrollEverRead: saved.scrollEverRead,
      caveVisit: structuredClone(saved.caveVisit),
      activationChecks: saved.activationChecks,
      unusedHealingDeaths: saved.unusedHealingDeaths,
      lowHpTurns: saved.lowHpTurns,
      strongFightsInitiated: saved.strongFightsInitiated.slice(),
      hiddenLeaderKills: structuredClone(saved.hiddenLeaderKills),
      unfinishedFightCandidates: saved.unfinishedFightCandidates.slice(),
      unfinishedLastAttackTurn: saved.unfinishedLastAttackTurn,
      unfinishedEscapes: saved.unfinishedEscapes.slice(),
      survivalLastTurn: saved.survivalLastTurn,
      combatLastAttackTurn: saved.combatLastAttackTurn,
      shieldlessFights: saved.shieldlessFights,
      shieldlessFightLastAttackTurn: saved.shieldlessFightLastAttackTurn,
      shieldlessFightEligible: saved.shieldlessFightEligible,
      recklessLowHpFights: saved.recklessLowHpFights,
      potionsDrunk: saved.potionsDrunk,
      triggeredTrapIds: saved.triggeredTrapIds.slice(),
      drowningCrossings: saved.drowningCrossings,
      waterCrossing: structuredClone(saved.waterCrossing)
    }
  }

  // Dwarven remains have one irreversible search per prop. Count even empty
  // searches; the ghost is reacting to grave-robbing, not just good luck.
  function onDwarvenRemainsSearched() {
    if (!active()) return
    state.dwarvenRemainsSearched++
  }

  // Unlike separate items, coins are pooled in the normal player.gold total.
  // Each distinct gold find still enters the collector's candidate lottery as
  // one original coin purse, with its exact find amount. Any current coins can
  // repay that purse; we do not attempt to distinguish physically identical
  // coins from later earnings. A purse is eligible only while affordable.
  function onDwarvenRemainsGoldFound(amount) {
    if (!active() || !Number.isInteger(amount) || amount <= 0) return
    state.dwarvenGoldLoot.push({id: `dwarven-loot-${state.nextDwarvenLootId++}`, amount})
  }

  // Retain provenance on actual item instances: recovered gear, gems and
  // ammunition can be individually surrendered. Split stacks get a fresh
  // identifier when a single unit is dropped.
  function tagDwarvenRemainsLoot(item) {
    if (!active() || !item) return item
    item.dwarvenRemainsLootId = `dwarven-loot-${state.nextDwarvenLootId++}`
    return item
  }

  function splitDwarvenRemainsLoot(item) {
    if (!active() || !item?.dwarvenRemainsLootId) return item
    return tagDwarvenRemainsLoot(item)
  }

  // Inventory plus currently equipped gear: carrying a recovered weapon on the
  // player's body doesn't make it invisible to the Collector. Stable sorting
  // avoids UI inventory order affecting the RNG candidate index.
  function recoverableRemainsLoot() {
    const items = [...player.inventory, ...['weapon','shield','armor'].map(slot => player.equip?.[slot])]
      .filter(item => typeof item?.dwarvenRemainsLootId === 'string' && (item.count ?? 1) > 0)
    return items.sort((a,b) => a.dwarvenRemainsLootId.localeCompare(b.dwarvenRemainsLootId))
  }

  function recoverableRemainsCandidates() {
    const items = recoverableRemainsLoot().map(item => ({id: item.dwarvenRemainsLootId}))
    const gold = state.dwarvenGoldLoot.filter(lot => player.gold >= lot.amount)
    // One random candidate per original item/purse, not per coin or arrow.
    return items.concat(gold).sort((a, b) => a.id.localeCompare(b.id))
  }

  function pendingDebtCollector() {
    if (!active()) return null
    const enemy = encounterActor('debt_collector')
    return enemy?.debtDemandState === 'pending' && onCurrentLevel(enemy) ? enemy : null
  }

  function debtCollectorDemand(enemy = pendingDebtCollector()) {
    if (!enemy) return null
    const item = recoverableRemainsLoot().find(it => it.dwarvenRemainsLootId === enemy.debtDemandLootId)
    if (item) return {itemName: artifactDisplayName(item), count: item.count || 1,
      isGold: false, canPay: true}
    const purse = state.dwarvenGoldLoot.find(lot => lot.id === enemy.debtDemandLootId)
    if (purse) return {itemName: null, count: 0, isGold: true,
      gold: purse.amount, recoveredGold: true, canPay: player.gold >= purse.amount}
    return {itemName: null, count: 0, isGold: true,
      gold: config.events.debt_collector.goldDemand, recoveredGold: false,
      canPay: player.gold >= config.events.debt_collector.goldDemand}
  }

  // UI handlers and the replay interpreter both call this synchronous resolver;
  // neither rendering nor modal timing may draw RNG or change the demand.
  function resolveDebtCollector(choice, enemyId = null, record = true) {
    const ghost = pendingDebtCollector()
    if (!ghost || (enemyId && ghost.id !== enemyId) || !['pay','refuse'].includes(choice)) return false
    const demand = debtCollectorDemand(ghost)
    if (choice === 'pay' && !demand?.canPay) return false
    if (record) recordReplayAction({type:'debtCollector', enemyId:ghost.id, choice})
    if (choice === 'refuse') {
      ghost.debtDemandState = 'hostile'
      ghost.aware = true
      ghost.aggro = ENEMY_TEMPLATE_BY_NAME.Ghost.aggro
      log('Debt Collector: "Then I shall collect what you owe in blood."', 'bad')
    } else {
      if (demand.isGold) {
        player.gold -= demand.gold
        // Keep the provenance ledger consistent even though each collector
        // encounter is one-time. Payment is one deterministic rules action.
        if (demand.recoveredGold) state.dwarvenGoldLoot =
          state.dwarvenGoldLoot.filter(lot => lot.id !== ghost.debtDemandLootId)
        log(`You pay the Debt Collector ${demand.gold} gold. The ghost fades away.`, 'info')
      } else {
        const invIdx = player.inventory.findIndex(it => it.dwarvenRemainsLootId === ghost.debtDemandLootId)
        if (invIdx >= 0) player.inventory.splice(invIdx, 1)
        else for (const slot of ['weapon','shield','armor']) {
          if (player.equip?.[slot]?.dwarvenRemainsLootId === ghost.debtDemandLootId) {
            player.equip[slot] = null
            break
          }
        }
        log(`You surrender ${demand.count > 1 ? demand.count+' × ' : ''}${demand.itemName}. The Debt Collector disappears.`, 'info')
      }
      ghost.debtDemandState = 'settled'
      ghost.alive = false
      enemies = enemies.filter(e => e !== ghost)
      occupied.delete(keyXY(ghost.x,ghost.y))
    }
    updateHud()
    renderInventory()
    render()
    return true
  }

  function completed(id) { return state.completed.includes(id) }

  function merchantFloorPrice(item, pricesByTier) {
    if (!item || !['weapon', 'shield', 'armor'].includes(item.kind)) return 0
    return pricesByTier[String(item.tier)] || 0
  }

  // Count actual completed drinks (not merely holding, buying or inspecting
  // potions). These are all ordinary potion actions, including combat potions.
  function strangePotionConfusionTurns() {
    return config.events.strange_green_potion.confusionTurns
  }

  function strangePotionEffect() {
    if (!active()) return null
    return chance(config.events.strange_green_potion.confusionChance) ? 'confusion' : 'poison'
  }

  function onPotionDrunk() {
    if (active()) state.potionsDrunk++
  }

  // The kill totals already belong to the player and are serialized with their
  // species identities. Reuse those instead of duplicating a kill ledger.
  function humanoidHunterActive() {
    if (!active()) return false
    const threshold=config.events.humanoid_hunter
    const {humanoids, total} = killTotals()
    return humanoids >= threshold.minHumanoidKills &&
      humanoids / total >= threshold.minHumanoidKillShare
  }

  // A beast is an ordinary living non-humanoid species; count credited kills,
  // not monster deaths caused by traps or other enemies. Reuse the existing
  // player kill ledger, so no redundant counters or save fields are required.
  function beastHunterEligible() {
    if (!active() || completed('beast_hunter')) return false
    const cfg = config.events.beast_hunter
    const {beasts, total} = killTotals()
    return beasts >= cfg.minBeastKills && total > 0 &&
      beasts / total >= cfg.minBeastKillShare
  }

  // Bestiary is the only source of credited species kills. Prefixed enemies
  // share a base species, while trap-only kills never enter this tally. Do not
  // store a duplicate species counter in the adaptive save state.
  function lastSurvivorSpecies() {
    if (!active() || completed('last_survivor')) return []
    const cfg = config.events.last_survivor
    const {entries, total} = killTotals()
    const kills = entries.filter(([species]) => !!ENEMY_TEMPLATE_BY_NAME[species])
    if (!total) return []
    return kills.filter(([species, n]) => n >= cfg.minSpeciesKills && n / total >= cfg.minKillShare &&
      (ENEMY_TEMPLATE_BY_NAME[species].rarity ?? 0) > 0 &&
      (ENEMY_TEMPLATE_BY_NAME[species].aggro ?? 0) > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([species]) => species)
  }

  // Applied at the point a NEW fight could start, before awareness is set.
  // Already-angered beasts and scripted/adaptive encounters retaliate normally.
  function beastMayInitiateCombat(enemy) {
    if (!active() || !enemy || enemy.aware || enemy.alarmed ||
        enemy.adaptiveEventId || enemy.aggro === 0) return true
    const template=ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name]
    if (!template || template.humanoid || template.family !== config.events.humanoid_hunter.family ||
        template.adaptiveOnly || template.ultraRare || template.aggro === 0 ||
        !humanoidHunterActive()) return true
    const attacks=chance(config.events.humanoid_hunter.initiateCombatChanceMultiplier)
    if (!attacks && enemyIsVisibleOnMainView(enemy))
      spawnDamageNumber(enemy.x,enemy.y,'Hesitates','#cbd5ac')
    return attacks
  }

  // The initial surface population is a fixed objective for this character.
  // Keep target identities even if those enemies leave the radius after a chase;
  // far-wandering enemies are deliberately never required. Later arrivals in
  // the circle are included when a kill is resolved, not on animation frames.
  function trackTempleClearanceTargets() {
    if (!active() || currentZ !== 0 || completed('merchant_expansion')) return
    if (state.templeClearanceTargets === null) state.templeClearanceTargets = []
    const targets = new Set(state.templeClearanceTargets)
    const radius = config.events.merchant_expansion.templeClearanceRadius
    for (const e of enemies) {
      if (!e.alive || (e.level ?? 0) !== 0 || e.wander === 'far' || !e.id) continue
      const dx = e.x - spawnPoint.x, dy = e.y - spawnPoint.y
      if (dx * dx + dy * dy <= radius * radius && !targets.has(e.id)) {
        state.templeClearanceTargets.push(e.id)
        targets.add(e.id)
      }
    }
  }

  function expandMerchantStock(reason) {
    if (!active() || completed('merchant_expansion')) return false
    const event = config.events.merchant_expansion
    // New equipment is selected only at the moment the reward is granted.
    const levelCaps = event.progression.levelTierCaps
    const quality = (levelCaps.find(entry => entry.maxLevel == null || player.lvl <= entry.maxLevel) ||
      levelCaps[levelCaps.length - 1]).tier
    const weapon = makeWeaponItem(quality)
    const protection = chance(0.5) ? makeShieldItem(quality) : makeArmorItem(quality)
    const utility = createItem(pick(event.utilityPool))
    for (const item of [weapon, protection, utility]) {
      // Only actual tier-4/5 gear receives the premium minimum price.
      const minTierPrice = merchantFloorPrice(item, event.minPurchasePriceByTier)
      item.merchantPrice = Math.max(itemBaseValue(item), minTierPrice)
      item.merchantNew = true
      merchantStock.push(item)
    }
    markTrigger('merchant_expansion')
    state.completed.push('merchant_expansion')
    log(reason === 'clearance' ?
      'You have secured the Temple region. The Merchant has brought in three additional wares.' :
      'Your trading has drawn attention. The Merchant has brought in three additional wares.', 'good')
    return true
  }

  function onMerchantTransaction(kind, amount) {
    if (!active() || completed('merchant_expansion')) return false
    if (!['buy', 'sell'].includes(kind) || !Number.isFinite(amount) || amount <= 0) return false
    if (kind === 'sell') state.merchantSalesGold += amount
    else state.merchantPurchasesGold += amount
    const event = config.events.merchant_expansion
    if (Math.max(state.merchantSalesGold, state.merchantPurchasesGold) < event.minTradeGold) return false
    return expandMerchantStock('trade')
  }

  // Called for every real death, including traps and other environmental harm.
  function onTempleClearanceKill(enemy) {
    if (!active() || currentZ !== 0 || completed('merchant_expansion') ||
        !enemy || (enemy.level ?? 0) !== 0) return false
    trackTempleClearanceTargets() // Called while the defeated enemy is still in enemies.
    const targets = state.templeClearanceTargets
    const i = targets.indexOf(enemy.id)
    if (i < 0) return false // Far-wandering or out-of-region kill.
    targets.splice(i, 1)
    state.templeClearanceKills++
    if (targets.length > 0) return false
    return expandMerchantStock('clearance')
  }

  function onScrollResupply(kind) {
    if (completed('scroll_restock') || typeof kind !== 'string' ||
        !(kind === 'homecomingscroll' || kind.startsWith('scrollOf')) || !itemDefinition(kind)) return false
    state.scrollUses++
    if (!state.scrollKindsUsed.includes(kind)) state.scrollKindsUsed.push(kind)
    if (state.scrollUses < config.events.scroll_restock.minSuccessfulUses) return false
    for (const scrollKind of state.scrollKindsUsed) {
      const existing = merchantStock.find(item => item.kind === scrollKind && !item.unlimitedStock)
      if (existing) {
        existing.count = Math.max(0, existing.count ?? 1) + 1
        existing.merchantNew = true
      } else merchantStock.push(createItem(scrollKind, {count: 1, merchantNew: true}))
    }
    state.completed.push('scroll_restock')
    log('The Merchant has stocked additional scrolls inspired by your magic.', 'good')
    return true
  }

  // World-sized surface regions share a lifetime budget. The number of
  // regions scales with world dimensions (XS 2x2, L 3x3, XXL 4x4 at the
  // default target span). Each rectangle spans an equal fraction of its map
  // axis, so the narrow last strip cannot create a tiny overfull region.
  function surfaceRegion(x, y) {
    const target = config.limits.surfaceRegionTargetTiles
    const cols = Math.max(1, Math.ceil(MAP_W / target))
    const rows = Math.max(1, Math.ceil(MAP_H / target))
    const col = Math.min(cols - 1, Math.max(0, Math.floor(x * cols / MAP_W)))
    const row = Math.min(rows - 1, Math.max(0, Math.floor(y * rows / MAP_H)))
    return {col, row, cols, rows, key: `surface:0:${col},${row}`}
  }

  // Shared floor-budget allocation and ordinary ground pickup for later
  // encounters. Surface events claim the region where the action happened,
  // not a single shared budget for the entire overworld.
  function floorKey(levelKind, level, caveIndex, x = player.x, y = player.y) {
    return levelKind === 'surface' ? surfaceRegion(x, y).key :
      `${levelKind}:${level}:${caveIndex ?? -1}`
  }

  function threatLimit(levelKind) {
    return levelKind === 'surface' ? config.limits.surfaceRegionThreats : config.limits.floorThreats
  }

  function availableThreatSlots(levelKind, level, caveIndex, x = player.x, y = player.y) {
    if (!active()) return 0
    const key = floorKey(levelKind, level, caveIndex, x, y)
    return Math.max(0, threatLimit(levelKind) - (state.floorThreats[key] || 0))
  }

  function recordThreat(id, levelKind, level, caveIndex, cost = 1, x = player.x, y = player.y) {
    if (!active() || completed(id) || !Number.isInteger(cost) || cost < 1) return false
    const key = floorKey(levelKind, level, caveIndex, x, y)
    // Nemesis has a dedicated extra place and must never consume either
    // optional slot, even when it appears before those encounters.
    if (id === 'nemesis') {
      if (!config.limits.nemesisBonusThreat || cost > config.limits.nemesisBonusThreat) return false
    } else {
      if ((state.floorThreats[key] || 0) + cost > threatLimit(levelKind)) return false
      state.floorThreats[key] = (state.floorThreats[key] || 0) + cost
    }
    markTrigger(id)
    state.completed.push(id)
    debugEvent(`Event spawned: ${id}; location ${key}; used ${state.floorThreats[key] || 0}/${threatLimit(levelKind)} slots.`)
    return true
  }

  function dropRewardOnGround(id, item, x, y) {
    if (!active() || !item || !Number.isInteger(x) || !Number.isInteger(y) ||
        !TILE[map[y]?.[x]]?.walk ||
        groundItems.some(g => onCurrentLevel(g) && g.x === x && g.y === y && g.kind === 'droppeditem'))
      return false
    groundItems.push({x, y, level: currentZ, levelKind: currentLevelKind(),
      caveIndex: currentCave, kind: 'droppeditem', item: structuredClone(item),
      adaptiveEventId: id})
    minimapDirty = true
    return true
  }

  // A step onto a real floor mechanism counts once per trap identity. It is
  // recorded before damage and does not depend on whether the blow was dodged.
  function onPlayerTriggeredTrap(trap) {
    if (!active() || !trap?.id || completed('trap_lure')) return false
    const key = String(trap.id)
    if (state.triggeredTrapIds.includes(key)) return false
    state.triggeredTrapIds.push(key)
    return state.triggeredTrapIds.length >= config.events.trap_lure.minDistinctTraps
  }

  // A separate crossing begins on entering deep water from shore and ends on
  // reaching land. Merely waiting in water or dipping back onto the same bank
  // does not count. Damage must actually have been applied during the crossing.
  function onWaterEntered(from) {
    if (!active() || completed('drowning_lure') || !from) return
    state.waterCrossing = {x:from.x,y:from.y,z:currentZ,steps:0,damaged:false}
  }
  function onWaterMoved() {
    if (active() && state.waterCrossing?.z === currentZ)
      state.waterCrossing.steps++
  }
  function onDrowningDamage() {
    if (active() && state.waterCrossing?.z === currentZ)
      state.waterCrossing.damaged = true
  }
  function onWaterExited(shore) {
    if (!active()) return false
    const crossing = state.waterCrossing
    state.waterCrossing = null
    if (!crossing || completed('drowning_lure') || crossing.z !== currentZ || !shore) return false
    const cfg = config.events.drowning_lure
    const dx=shore.x-crossing.x,dy=shore.y-crossing.y
    const separation = Math.max(Math.abs(dx),Math.abs(dy))
    // Reject skimming along the same coast: the direct shore-to-shore line
    // must itself pass through a stretch of deep water.
    let waterTiles=0
    for (let i=1;i<separation;i++) {
      const x=Math.round(crossing.x+dx*i/separation)
      const y=Math.round(crossing.y+dy*i/separation)
      if (map[y]?.[x]==='water') waterTiles++
    }
    if (!crossing.damaged || crossing.steps < cfg.minWaterSteps ||
        separation < cfg.minShoreSeparation || waterTiles < cfg.minWaterSteps) return false
    state.drowningCrossings++
    return state.drowningCrossings >= cfg.minCrossings
  }

  function lureTraversable(x,y, allowWater = false) {
    const tile = map[y]?.[x]
    return !!TILE[tile]?.walk && (allowWater || tile !== 'water') &&
      tile !== 'lava' && !Mining.blocksPathAt(x,y) &&
      !CAVE_TRANSITION_TILES.has(tile) && !DungeonTraps.isTrigger(tile)
  }

  function lureDistances(from, maxSteps, allowTraps = false) {
    const result = new Map([[keyXY(from.x,from.y),0]])
    const queue = [from]
    for (let i=0; i<queue.length; i++) {
      const q=queue[i], n=result.get(keyXY(q.x,q.y))
      if (n >= maxSteps) continue
      for (const [dx,dy] of LURE_DIRS) {
        const x=q.x+dx,y=q.y+dy,k=keyXY(x,y),tile=map[y]?.[x]
        if (result.has(k) || !TILE[tile]?.walk || tile === 'water' || tile === 'lava' ||
            Mining.blocksPathAt(x,y) || CAVE_TRANSITION_TILES.has(tile) ||
            (!allowTraps && DungeonTraps.isTrigger(tile))) continue
        result.set(k,n+1);queue.push({x,y})
      }
    }
    return result
  }

  function lureRewardSpotClear(x,y) {
    const tile = map[y]?.[x]
    if (!lureTraversable(x,y) || occupied.has(keyXY(x,y)) ||
        !DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) ||
        groundItemAt(x, y) ||
        enemies.some(e=>e.alive && onCurrentLevel(e) && e.x===x && e.y===y) ||
        currentZ===0 && npcs.some(n=>n.x===x && n.y===y)) return false
    if (currentZ < 0 && undergroundTileVisible(x,y)) return false
    return true
  }

  // A reward beyond an existing *visible* ruin floor mechanism. Its direct
  // path is shorter through a real pressure plate or spike trigger, but a
  // completely trap-free route must already exist and remain fairly short.
  function tryTrapLure() {
    if (!active() || completed('trap_lure') ||
        state.triggeredTrapIds.length < config.events.trap_lure.minDistinctTraps ||
        !fortLevel()) return false
    const cfg=config.events.trap_lure
    const level=deepLevels[chainDepthForZ(currentZ)-2]
    if (!level?.traps?.length) return false
    const safe=lureDistances(player,cfg.maxSafeRoute)
    const direct=lureDistances(player,cfg.maxSafeRoute,true)
    const spots=[]
    invalidateUndergroundFov()
    for (const trap of level.traps) {
      // Pressure plates are concealed, so only visible spikes can advertise the bait.
      if (trap.type!=='spikes') continue
      const t=trap.trigger
      if (!t || !direct.has(keyXY(t.x,t.y))) continue
      for (let dy=-cfg.maxTrapDistance;dy<=cfg.maxTrapDistance;dy++)
        for (let dx=-cfg.maxTrapDistance;dx<=cfg.maxTrapDistance;dx++) {
          if (Math.abs(dx)+Math.abs(dy)>cfg.maxTrapDistance) continue
          const x=t.x+dx,y=t.y+dy,k=keyXY(x,y)
          const safeSteps=safe.get(k), directSteps=direct.get(k)
          if (safeSteps==null || directSteps==null ||
              Math.max(Math.abs(x-player.x),Math.abs(y-player.y))<cfg.minPlayerDistance ||
              directSteps <= direct.get(keyXY(t.x,t.y)) ||
              safeSteps-directSteps<cfg.minDetour || safeSteps-directSteps>cfg.maxDetour ||
              !lureRewardSpotClear(x,y)) continue
          // A loose ground item would absorb an incoming wall arrow.
          // Keep this lure off the projectile's firing lane.
          if (level.traps.some(h=>h.type==='projectile' && h.emitter && h.direction &&
              Array.from({length:h.range||0},(_,i)=>({x:h.emitter.x+h.direction.dx*(i+1),
                y:h.emitter.y+h.direction.dy*(i+1)})).some(p=>p.x===x&&p.y===y))) continue
          spots.push({x,y})
          if (spots.length>=cfg.maxCandidateSites) break
        }
      if (spots.length>=cfg.maxCandidateSites) break
    }
    if (!spots.length) return false
    const pos=pick(spots)
    if (!dropRewardOnGround('trap_lure',createItem(cfg.rewardItemKind),pos.x,pos.y)) return false
    state.completed.push('trap_lure')
    return true
  }

  // Look for an actual stretch of deep water between two shores. The land-only
  // BFS proves the far shore can be reached without swimming or drowning.
  // Never alter terrain, force the hero into the water, or spawn inaccessible loot.
  function tryDrowningLure() {
    if (!active() || completed('drowning_lure') ||
        state.drowningCrossings < config.events.drowning_lure.minCrossings) return false
    const cfg=config.events.drowning_lure
    if (map[player.y]?.[player.x]==='water') return false
    const land=lureDistances(player,cfg.maxSafeRoute)
    const spots=[]
    if (currentZ<0) invalidateUndergroundFov()
    for (const [dx,dy] of LURE_DIRS) {
      for (let near=1;near<=cfg.maxNearShoreDistance;near++) {
        const wx=player.x+dx*near,wy=player.y+dy*near
        if (map[wy]?.[wx]!=='water') continue
        for (let width=cfg.minWaterWidth;width<=cfg.maxWaterWidth;width++) {
          if (!Array.from({length:width},(_,i)=>map[wy+dy*i]?.[wx+dx*i]).every(tile=>tile==='water') ||
              map[wy+dy*width]?.[wx+dx*width]==='water') continue
          const x=wx+dx*width,y=wy+dy*width,k=keyXY(x,y)
          const safeSteps=land.get(k), shortcutSteps=near+width
          if (safeSteps==null || safeSteps-shortcutSteps<cfg.minDetour ||
              !lureRewardSpotClear(x,y)) continue
          spots.push({x,y})
          if (spots.length>=cfg.maxCandidateSites) break
        }
        if (spots.length>=cfg.maxCandidateSites) break
      }
      if (spots.length>=cfg.maxCandidateSites) break
    }
    if (!spots.length) return false
    const pos=pick(spots)
    if (!dropRewardOnGround('drowning_lure',createItem(cfg.rewardItemKind),pos.x,pos.y)) return false
    state.completed.push('drowning_lure')
    return true
  }

  // Count acquired mushrooms, not spawned mushrooms or repeated inventory UI
  // operations. World forage, corpse loot and ground pickups supply the count.
  // Player-dropped mushrooms are marked at drop time and cannot be farmed.
  function onMushroomsCollected(count = 1) {
    if (!active() || completed('mushroom_prophet') ||
        !Number.isInteger(count) || count < 1) return false
    state.mushroomsCollected = Math.min(config.events.mushroom_prophet.minMushroomsCollected,
      state.mushroomsCollected + count)
    return state.mushroomsCollected >= config.events.mushroom_prophet.minMushroomsCollected
  }

  // A genuine Herbalist visit is a visit to her Services while carrying
  // untreated mushrooms. Close/reopen spam within interaction range is the
  // same visit. The episode concludes only when the hero walks away or changes
  // level; purifying even one mushroom means this visit was not ignored.
  function onHerbalistServicesOpened(npc) {
    if (!active() || completed('ignored_mushroom_cleaning') ||
        npc?.name !== 'Herbalist' || currentZ !== 0 || state.herbalistVisit ||
        !player.inventory.some(item => item.kind === 'mushroom' && (item.count || 1) > 0)) return false
    state.herbalistVisit = {x:npc.x, y:npc.y, purified:false}
    return true
  }

  function onHerbalistPurification() {
    if (!active() || !state.herbalistVisit) return
    state.herbalistVisit.purified = true
  }

  function finishHerbalistVisit() {
    if (!active() || !state.herbalistVisit) return false
    // Even if the player used another service, purification itself must have
    // taken place to avoid the reaction.
    if (!state.herbalistVisit.purified && !completed('ignored_mushroom_cleaning'))
      state.herbalistIgnoredVisits++
    state.herbalistVisit = null
    return true
  }

  // The exit ambush observes ONE continuous visit to one ordinary cave.
  // Re-entering after a failed chance roll starts a fresh 100-turn requirement;
  // stair-hopping between depths of the same cave never resets the visit.
  function ordinaryCaveHere() {
    return currentZ < 0 && currentCave >= 0 && currentLevelKind() === 'chain' &&
      !!caves[currentCave] && !caves[currentCave].crypt
  }

  // Damage is credited only when the player's hit actually leaves the target
  // alive under the threshold. Spell/arrow travel and display callbacks never
  // advance an encounter. A whole ongoing fight can earn just one escape.
  function onPlayerWoundedEnemy(enemy, damage) {
    if (!active() || completed('unfinished_business') || !enemy?.id ||
        !(damage > 0) || !(enemy.hp > 0) || !enemy.alive ||
        enemy.hp >= enemy.maxHp * config.events.unfinished_business.hpThreshold ||
        enemy.adaptiveEventId || enemy.prefix || enemy.carriedDungeonKey ||
        enemy.stolenItem || enemy.stolenGold || enemy.pendingAbility ||
        enemy.dungeonRole === 'prisonShooter' ||
        oldHunterQuest?.targetEnemyId === enemy.id ||
        oldHunterQuest?.targetEnemyIds?.includes(enemy.id) ||
        fishermanQuest?.targetId === enemy.id ||
        enemy.name !== (enemy.baseName || enemy.name) ||
        !ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name] ||
        ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name].adaptiveOnly ||
        !(ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name].rarity > 0) ||
        !(ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name].aggro > 0) ||
        !onCurrentLevel(enemy) || state.unfinishedEscapes.includes(enemy.id)) return false
    if (!state.unfinishedFightCandidates.includes(enemy.id))
      state.unfinishedFightCandidates.push(enemy.id)
    return true
  }

  function finishUnfinishedFight(leftFloor = false) {
    if (!state.unfinishedFightCandidates.length) {
      state.unfinishedLastAttackTurn = null
      return false
    }
    const cfg = config.events.unfinished_business
    const eligible = state.unfinishedFightCandidates.map(id => enemies.find(e => e.id === id && e.alive))
      .filter(e => e && e.hp > 0 && e.hp < e.maxHp * cfg.hpThreshold &&
        (leftFloor && !onCurrentLevel(e) || !onCurrentLevel(e) ||
          Math.max(Math.abs(player.x - e.x), Math.abs(player.y - e.y)) >= cfg.escapeDistance))
    if (!eligible.length) {
      // Keep the fight pending while the hero has stopped swinging but has
      // not yet escaped. A later move can still complete the same fight.
      if (state.unfinishedFightCandidates.every(id => !enemies.some(e => e.id === id &&
          e.alive && e.hp > 0 && e.hp < e.maxHp * cfg.hpThreshold))) {
        state.unfinishedFightCandidates=[]
        state.unfinishedLastAttackTurn=null
      }
      return false
    }
    const chosen=eligible[0] // first wounded enemy; fixed ordering, no RNG
    if (!state.unfinishedEscapes.includes(chosen.id)) {
      state.unfinishedEscapes.push(chosen.id)
      if (state.unfinishedEscapes.length > cfg.maxRememberedEscapes)
        state.unfinishedEscapes.shift()
      debugEvent(`Escaped wounded ${chosen.baseName || chosen.name} (${state.unfinishedEscapes.length}/${cfg.minEscapes}).`)
    }
    state.unfinishedFightCandidates=[]
    state.unfinishedLastAttackTurn=null
    if (state.unfinishedEscapes.length >= cfg.minEscapes) markTrigger('unfinished_business')
    return true
  }

  // A real Champion with at least two living followers close enough for its
  // Inspired aura is an identifiable group leader. Followers used to credit
  // one leader cannot also credit another: overlapping packs are one group.
  function onLeaderKilledFirst(enemy) {
    if (!active() || completed('hidden_leader') || !enemy?.alive ||
        enemy.prefix !== 'Champion' || enemy.adaptiveEventId ||
        !enemy.id || !onCurrentLevel(enemy)) return false
    const cfg=config.events.hidden_leader
    if (state.hiddenLeaderKills.length>=cfg.minLeaderFirstKills ||
        state.hiddenLeaderKills.some(entry=>entry.leaderId===enemy.id)) return false
    const used=new Set(state.hiddenLeaderKills.flatMap(entry=>entry.followerIds))
    const companions=enemies.filter(other=>other!==enemy && other.alive && other.hp>0 &&
      other.prefix!=='Champion' && !other.adaptiveEventId && other.id &&
      onCurrentLevel(other) && !used.has(other.id) &&
      Math.max(Math.abs(other.x-enemy.x),Math.abs(other.y-enemy.y))<=cfg.followersWithin)
    if (companions.length<cfg.minLivingFollowers) return false
    state.hiddenLeaderKills.push({leaderId:enemy.id,
      followerIds:companions.map(e=>e.id).sort()})
    debugEvent(`Champion leader defeated with ${companions.length} surviving followers (${state.hiddenLeaderKills.length}/${cfg.minLeaderFirstKills}).`)
    if (state.hiddenLeaderKills.length>=cfg.minLeaderFirstKills) markTrigger('hidden_leader')
    return true
  }

  function onEnemyKilled(enemy) {
    killSummary = null // Called after the existing Bestiary credits the kill.
    if (!active()) return
    onLeaderKilledFirst(enemy)
    onTempleClearanceKill(enemy)
    state.unfinishedFightCandidates = state.unfinishedFightCandidates.filter(id => id !== enemy?.id)
    if (!active() || completed('unused_scroll_ambush') ||
        !ordinaryCaveHere() || !state.caveVisit ||
        state.caveVisit.caveIndex !== currentCave) return
    const species=enemy?.baseName || enemy?.name
    if (config.events.unused_scroll_ambush.ambushSpecies.includes(species)) state.caveVisit.kills[species]++
  }

  function unusedScrollAmbushReady() {
    return !!state.caveVisit && unusedScrollAmbushVisitReady(state.caveVisit)
  }

  function tryUnusedScrollAmbush(departedCave) {
    const visit=state.caveVisit
    // Leaving the cave ends this visit, including a failed or impossible
    // attempt; future entries must earn the condition again.
    state.caveVisit=null
    if (!visit || visit.caveIndex!==departedCave || currentZ!==0 ||
        !unusedScrollAmbushVisitReady(visit) ||
        availableThreatSlots('surface',0,-1)<1) return false
    const cfg=config.events.unused_scroll_ambush
    const cave=caves[departedCave]
    if (!cave || cave.crypt) return false
    const region=surfaceRegion(player.x,player.y).key
    const directions=[[0,-1],[1,0],[0,1],[-1,0]]
    const queue=[{x:player.x,y:player.y,d:0}],seen=new Set([keyXY(player.x,player.y)])
    const pools=cfg.ambushSpecies.filter(name=>visit.kills[name]>0)
      .sort((a,b)=>visit.kills[b]-visit.kills[a] || a.localeCompare(b))
      .map(name=>({name,tmpl:ENEMY_TEMPLATE_BY_NAME[name],sites:new Map()}))
    for(let i=0;i<queue.length;i++) {
      const {x,y,d}=queue[i]
      if (d>=cfg.minSpawnDistance && d<=cfg.maxSpawnDistance &&
          !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
          !occupied.has(keyXY(x,y)) &&
          !npcs.some(n=>n.x===x&&n.y===y) &&
          !groundItemAt(x, y) &&
          sanctuaryDistance(x,y)>FLEE_DISTANCE &&
          separateFromAdaptiveThreats(x,y) &&
          DungeonTraps.safeSpawn(x,y,0,'surface')) {
        for(const pool of pools) if (enemyBiomes(pool.tmpl).includes(map[y]?.[x]) &&
            enemyCanTraverse(pool.tmpl,x,y) && pool.sites.size < cfg.maxCandidateSites)
          pool.sites.set(keyXY(x,y),{x,y})
      }
      if(d>=cfg.maxSpawnDistance) continue
      for(const [dx,dy] of directions) {
        const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
        if(seen.has(key) || !TILE[map[ny]?.[nx]]?.walk ||
            Mining.blocksPathAt(nx,ny) || surfaceRegion(nx,ny).key!==region) continue
        seen.add(key);queue.push({x:nx,y:ny,d:d+1})
      }
    }
    let chosen=null
    for (const pool of pools) {
      const groups=[]
      const sites=[...pool.sites.values()]
      for (const anchor of sites) {
        const others=sites.filter(pos=>
          (pos.x!==anchor.x || pos.y!==anchor.y) &&
          Math.max(Math.abs(pos.x-anchor.x),Math.abs(pos.y-anchor.y))<=cfg.maxCompanionDistance)
        if(others.length>=cfg.groupSize-1)
          groups.push([anchor,...others.slice(0,cfg.groupSize-1)])
      }
      if(groups.length) {chosen={pool,groups};break}
    }
    if(!chosen) return false
    // Exactly one chance roll per qualifying cave exit. An impossible
    // placement consumes no RNG and never creates monsters in walls.
    const rollChance=(cave.entrances || []).length>cfg.multiExitThreshold ?
      cfg.multiExitChance : cfg.normalChance
    if(!chance(rollChance)) {
      debugEvent(`Unused Scroll Ambush at cave ${departedCave}: ${Math.round(rollChance*100)}% roll failed.`)
      return false
    }
    const {pool,groups}=chosen
    const positions=pick(groups)
    if (!recordThreat('unused_scroll_ambush','surface',0,-1)) return false
    for (const pos of positions) {
      const tmpl=pool.tmpl
      const enemy={name:tmpl.name,baseName:tmpl.name,prefix:null,adaptiveEventId:'unused_scroll_ambush',
        tier:tmpl.tier,humanoid:!!tmpl.humanoid,
        hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
        grace:tmpl.grace,aggro:tmpl.aggro??AGGRO_RANGE,
        abilities:[...(tmpl.abilities||[])],
        x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
        level:0,levelKind:'surface',caveIndex:-1,alive:true,aware:true,alarmed:true,
        equipment:null,wander:'roam'}
      prepareEnemyEquipment(enemy)
      addEnemy(enemy)
      occupied.add(keyXY(pos.x,pos.y))
    }
    log(`Ambush! ${positions.length} ${pool.name}s have been waiting near the cave exit!`, 'bad')
    return true
  }

  // Shared rule for qualification after leaving the cave: the caller has
  // already closed the visit so no additional tour of the cave can reuse it.
  function unusedScrollAmbushVisitReady(visit) {
    const cfg=config.events.unused_scroll_ambush
    return active() && !completed('unused_scroll_ambush') && !state.scrollEverRead &&
      visit.turns>=cfg.minTurnsInCave && cfg.ambushSpecies.some(name=>visit.kills[name]>0) &&
      cfg.scrollKinds.some(kind=>(player.inventory || []).reduce((total,item)=>
        total+(item?.kind===kind ? Math.max(0,item.count??1):0),0)>=cfg.minSameKindScrolls)
  }

  // All real scroll types qualify, regardless of identification or magical
  // knowledge. The taunting note is not a scroll and cannot trigger itself.
  function carryingScroll() {
    return player.inventory.some(item => item && (item.count ?? 1) > 0 &&
      typeof item.kind === 'string' &&
      (item.kind === 'homecomingscroll' || item.kind === 'idscroll' || item.kind.startsWith('scrollOf')))
  }

  // Trading/dropping can happen without advancing a world turn. If the last
  // scroll leaves the backpack, invalidate the streak immediately even if
  // another scroll is picked up before the next action.
  function onScrollInventoryChanged() {
    if (active() && !completed('unread_scrolls') && !state.scrollEverRead && !carryingScroll())
      state.unreadScrollTurns = 0
  }

  function oppositeWeaponTarget() {
    if (!active() || completed('opposite_weapon') || completed('neglected_shield')) return null
    const c=config.events.opposite_weapon
    const one=player.combatSkills?.oneHanded || 0, two=player.combatSkills?.twoHanded || 0
    if (one>=c.minPrimarySkill && two<=c.maxOppositeSkill) return 'twoHanded'
    if (two>=c.minPrimarySkill && one<=c.maxOppositeSkill) return 'oneHanded'
    return null
  }

  // A shield is a genuine option only while wielding a one-handed weapon (or
  // while unarmed). Simply carrying one alongside a two-handed weapon does not
  // qualify: such fights cannot be fought with a shield.
  function shieldlessFightPossible() {
    return !player.equip?.shield && !player.equip?.weapon?.twoHanded &&
      (player.inventory || []).some(item => (item.kind==='shield' ||
        item.kind==='artifact' && item.artifactSlot==='shield') && (item.count ?? 1)>0)
  }

  function finishShieldlessFight() {
    if (state.shieldlessFightLastAttackTurn===null) return
    if (state.shieldlessFightEligible && !completed('neglected_shield') &&
        !completed('opposite_weapon')) state.shieldlessFights++
    state.shieldlessFightLastAttackTurn=null
    state.shieldlessFightEligible=false
  }

  function neglectedShieldEligible() {
    return active() && !completed('neglected_shield') && !completed('opposite_weapon') &&
      (player.combatSkills?.shielding || 0) <= config.events.neglected_shield.maxShieldingSkill &&
      state.shieldlessFights >= config.events.neglected_shield.minShieldlessFights
  }

  // Track wear on each *individual* equipped cursed artifact, never an inventory
  // total. The item fields travel with the equipment through saves and replay.
  // Passive trinkets merely carried in inventory are deliberately excluded.
  function eligiblePreviousOwnerArtifacts() {
    if (!active() || completed('previous_owner')) return []
    return ['weapon','shield','armor'].map(slot => player.equip?.[slot])
      .filter(item => item?.kind==='artifact' && item.curse &&
        !item.previousOwnerHauntedBy &&
        (item.previousOwnerWearTurns || 0) >= config.events.previous_owner.minEquippedTurns)
  }

  function tickPreviousOwnerWear() {
    if (completed('previous_owner')) return
    for (const slot of ['weapon','shield','armor']) {
      const item = player.equip?.[slot]
      if (!item || item.kind!=='artifact' || !item.curse || item.previousOwnerHauntedBy ||
          item.previousOwnerLastWearTurn===turnCount) continue
      item.previousOwnerWearTurns = (item.previousOwnerWearTurns || 0) + 1
      item.previousOwnerLastWearTurn = turnCount
    }
  }

  // Count consumed world turns (not frames or time in menus), once per turn.
  // 500 turns is a minimum, not an expiry or automatic spawn. Losing the
  // last scroll resets uninterrupted ownership. Reading *any* scroll at any
  // point permanently disqualifies the character from this event.
  function onWorldTurn() {
    if (!active()) return
    if (state.templeClearanceTargets === null && currentZ === 0) trackTempleClearanceTargets()
    if (state.survivalLastTurn !== turnCount) {
      state.survivalLastTurn = turnCount
      tickPreviousOwnerWear()
      if (ordinaryCaveHere() && state.caveVisit?.caveIndex === currentCave &&
          state.caveVisit.lastTurn !== turnCount) {
        state.caveVisit.turns++
        state.caveVisit.lastTurn=turnCount
      }
      resolveDepthGuardianWarning()
      tickForestSpirit()
      if (state.unfinishedLastAttackTurn !== null &&
          turnCount - state.unfinishedLastAttackTurn > config.events.unfinished_business.quietTurns)
        finishUnfinishedFight()
      const carrion = config.events.low_hp_carrion
      state.lowHpTurns = player.hp > 0 && player.hp < playerMaxHp() * carrion.playerHpRatio
        ? state.lowHpTurns + 1 : 0
      if (state.shieldlessFightLastAttackTurn !== null) {
        if (!shieldlessFightPossible()) state.shieldlessFightEligible=false
        if (turnCount - state.shieldlessFightLastAttackTurn > config.events.neglected_shield.quietTurns)
          finishShieldlessFight()
      }
      // A fight is one continuous stretch of player/enemy attack attempts.
      // The next fight cannot be counted until five full turns without any
      // attack. Health and available potions are assessed at its *end*.
      const last = state.combatLastAttackTurn
      const rule = config.events.reckless_fighter
      if (last !== null && turnCount - last > rule.quietTurns) {
        state.combatLastAttackTurn = null
        const healing = (player.inventory || []).reduce((n,item) =>
          n + (item.kind === 'potion' ? Math.max(0,item.count || 1) : 0), 0)
        if (player.hp > 0 && player.hp < playerMaxHp() * rule.playerHpRatio &&
            healing >= rule.minCarriedPotions)
          state.recklessLowHpFights++
      }
    }
    const visit=state.herbalistVisit
    if (visit && (currentZ !== 0 ||
        Math.max(Math.abs(player.x-visit.x),Math.abs(player.y-visit.y)) > 1))
      finishHerbalistVisit()
    onScrollInventoryChanged()
    if (state.unreadScrollLastTurn !== null && turnCount <= state.unreadScrollLastTurn) {
      syncTriggerFlags()
      return
    }
    state.unreadScrollLastTurn = turnCount
    if (!completed('unread_scrolls') && !state.scrollEverRead && carryingScroll())
      state.unreadScrollTurns++
    syncTriggerFlags()
  }

  function onScrollUsed(kind) {
    if (!active()) return false
    state.scrollEverRead = true
    state.unreadScrollTurns = 0
    // Identification disqualifies the unread-scroll encounter but earns no
    // resupply progress. Other scrolls are counted only after consumption.
    return onScrollResupply(kind)
  }

  // On the first premature descent to z:-2 or the Dwarven Fort, remember
  // the *actual* floor that earned the encounter. If it is too cramped for
  // safe placement, only that same floor can receive the remains later.
  function markEarlyDescent(firstVisit) {
    if (!active() || !firstVisit || completed('early_descent') ||
        state.events.early_descent) return false
    const cfg=config.events.early_descent, kind=currentLevelKind()
    const toDepthTwo=currentZ===-2 && ['chain','crypt2'].includes(kind) &&
      player.lvl<=cfg.maxLevelForDepthTwo
    const toFort=currentZ===-3 && kind==='chain' &&
      player.lvl<=cfg.maxLevelForFort
    if (!toDepthTwo && !toFort) return false
    state.events.early_descent={levelKind:kind,z:currentZ,caveIndex:currentCave}
    return true
  }

  function unenchantedDescentGear() {
    const cfg=config.events.early_descent
    // Copy existing ordinary tier-one gear properties, without rolling a
    // random modifier or a high-tier item for an intentionally early reward.
    const kind=pick(cfg.gearKinds)
    const pool=(kind==='weapon' ? WEAPONS.filter(w=>!w.rangedAtk) :
      kind==='armor' ? ARMORS : SHIELDS).filter(base=>base.tier===cfg.gearTier)
    const base=pick(pool)
    if (kind==='weapon') return {kind,base:base.name,name:base.name,tier:base.tier,
      atk:base.atk,grace:base.grace,baseValue:base.baseValue,twoHanded:!!base.twoHanded}
    if (kind==='armor') return {kind,base:base.name,name:base.name,tier:base.tier,
      def:base.def,baseValue:base.baseValue,speedPenalty:base.speedPenalty||0,
      ...(base.gracePenalty ? {gracePenalty:base.gracePenalty} : {})}
    return {kind,base:base.name,name:base.name,tier:base.tier,
      def:base.def,baseValue:base.baseValue}
  }

  function tryEarlyDescentRemains() {
    const pending=state.events.early_descent
    if (!active() || !pending || completed('early_descent') ||
        currentZ!==pending.z || currentLevelKind()!==pending.levelKind ||
        currentCave!==pending.caveIndex) return false
    const cfg=config.events.early_descent
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const queue=[{x:player.x,y:player.y,steps:0}]
    const visited=new Set([keyXY(player.x,player.y)]), safe=[]
    const traversable=(x,y)=>!!TILE[map[y]?.[x]]?.walk &&
      !Mining.blocksPathAt(x,y) && !CAVE_TRANSITION_TILES.has(map[y]?.[x])
    const clear=(x,y)=>traversable(x,y) && !occupied.has(keyXY(x,y)) &&
      DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) &&
      !groundItemAt(x, y) &&
      !enemies.some(e=>e.alive && onCurrentLevel(e) && e.x===x && e.y===y) &&
      !npcs.some(n=>currentZ===0 && n.x===x && n.y===y)
    for (let i=0;i<queue.length;i++) {
      const pos=queue[i]
      if (pos.steps>=cfg.minPathSteps && pos.steps<=cfg.maxPathSteps &&
          clear(pos.x,pos.y)) {
        const nearStair=Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
          .some(dy=>Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
            .some(dx=>CAVE_TRANSITION_TILES.has(map[pos.y+dy]?.[pos.x+dx])))
        if (!nearStair) safe.push(pos)
      }
      if (pos.steps>=cfg.maxPathSteps) continue
      for (const [dx,dy] of dirs) {
        const x=pos.x+dx,y=pos.y+dy,key=keyXY(x,y)
        if (visited.has(key) || !traversable(x,y)) continue
        visited.add(key);queue.push({x,y,steps:pos.steps+1})
      }
    }
    // Ordinary tier-one gear always lies beside the corpse. The second reward
    // is either a ground scroll or a weapon inside the searchable remains.
    // Retain two safe adjacent sites for either outcome to avoid rerolling loot
    // when a specific floor has insufficient placement space.
    const available=new Set(safe.map(p=>keyXY(p.x,p.y)))
    const candidates=safe.map(body=>({body,lootSites:dirs
      .map(([dx,dy])=>({x:body.x+dx,y:body.y+dy}))
      .filter(p=>available.has(keyXY(p.x,p.y)))}))
      .filter(entry=>entry.lootSites.length>=2)
      .slice(0,cfg.maxCandidateSites)
    if (!candidates.length) return false
    const selected=pick(candidates),equipment=pick(selected.lootSites)
    const hasScroll=chance(cfg.scrollChance)
    const scroll=hasScroll ? pick(selected.lootSites.filter(p=>
      p.x!==equipment.x || p.y!==equipment.y)) : null
    const item=unenchantedDescentGear(),gold=randInt(cfg.goldMin,cfg.goldMax)
    const body={x:selected.body.x,y:selected.body.y,level:currentZ,
      levelKind:currentLevelKind(),caveIndex:currentCave,
      kind:'deadbody',name:'Hasty Explorer',race:'adventurer',killer:'the depths',
      gear:hasScroll ? null : makeImprovisedWeapon(pick(STARTING_WEAPONS)),
      gold,looted:false,adaptiveEventId:'early_descent'}
    if (!dropRewardOnGround('early_descent',item,equipment.x,equipment.y)) return false
    if (scroll && !dropRewardOnGround('early_descent',createItem(cfg.scrollKind),scroll.x,scroll.y)) {
      groundItems.pop() // Roll back the preceding equipment drop.
      return false
    }
    groundItems.push(body)
    state.completed.push('early_descent')
    delete state.events.early_descent
    minimapDirty=true
    log('Someone rushed down here before you. Their abandoned remains are nearby.', 'info')
    return true
  }

  // The mockery is an ordinary, readable floor pickup (never in a chest).
  // The note does not consume either of the two monster encounter slots.
  function tryUnreadScrollNote() {
    if (!active() || completed('unread_scrolls') || state.scrollEverRead || !fortLevel() ||
        !carryingScroll() ||
        state.unreadScrollTurns < config.events.unread_scrolls.minUnusedScrollTurns)
      return false
    const cfg = config.events.unread_scrolls
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue=[{x:player.x,y:player.y}], visited=new Set([keyXY(player.x,player.y)])
    const candidates=[]
    invalidateUndergroundFov()
    const passable=(x,y)=> !!TILE[map[y]?.[x]]?.walk && !Mining.blocksPathAt(x,y) &&
      !CAVE_TRANSITION_TILES.has(map[y]?.[x])
    for (let i=0; i<queue.length; i++) {
      const {x,y}=queue[i]
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= cfg.minPlayerDistance &&
          !undergroundTileVisible(x,y) && !occupied.has(keyXY(x,y)) &&
          DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) &&
          !groundItemAt(x, y) &&
          !queue[i].stair &&
          passable(x,y)) {
        const nearStair = [
          ...Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
        ].some(dy=>Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
          .some(dx=>CAVE_TRANSITION_TILES.has(map[y+dy]?.[x+dx])))
        if (!nearStair) candidates.push({x,y})
        if (candidates.length>=cfg.maxCandidateSites) break
      }
      for (const [dx,dy] of directions) {
        const xx=x+dx,yy=y+dy,k=keyXY(xx,yy)
        if (visited.has(k) || !passable(xx,yy)) continue
        visited.add(k);queue.push({x:xx,y:yy})
      }
    }
    if (!candidates.length) return false
    const pos=pick(candidates)
    if (!dropRewardOnGround('unread_scrolls',
        createItem(cfg.noteItemKind,{inscription:cfg.noteText}),pos.x,pos.y)) return false
    state.completed.push('unread_scrolls')
    return true
  }

  // Special ground loot after drinking 20 potions. It can never be
  // identified in advance, and only appears at scheduled adaptive checks.
  function tryStrangeGreenPotion() {
    if (!active() || completed('strange_green_potion') ||
        state.potionsDrunk < config.events.strange_green_potion.minPotionsDrunk) return false
    const cfg=config.events.strange_green_potion
    const kind=currentLevelKind()
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const seen=new Set([keyXY(player.x,player.y)])
    const queue=[{x:player.x,y:player.y}],candidates=[]
    const passable=(x,y)=>!!TILE[map[y]?.[x]]?.walk &&
      !Mining.blocksPathAt(x,y) && !isClosedDungeonDoorTile(map[y][x]) &&
      !isLockedDungeonDoorTile(map[y][x]) &&
      map[y]?.[x]!=='water' && map[y]?.[x]!=='river' &&
      map[y]?.[x]!=='lava' && !DungeonTraps.isTrigger(map[y]?.[x])
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i]
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y))>=cfg.minPlayerDistance &&
          (currentZ>=0 || !undergroundTileVisible(x,y)) &&
          !groundItemAt(x, y) &&
          !enemies.some(e=>e.alive&&onCurrentLevel(e)&&e.x===x&&e.y===y) &&
          !occupied.has(keyXY(x,y)) &&
          !(currentZ===0 && npcs.some(n=>n.x===x&&n.y===y)) &&
          !(currentZ===0 && sanctuaryDistance(x,y)<=FLEE_DISTANCE) &&
          DungeonTraps.safeSpawn(x,y,currentZ,kind) &&
          !Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
            .some(dy=>Array.from({length:2*cfg.minStairDistance+1},(_,n)=>n-cfg.minStairDistance)
              .some(dx=>CAVE_TRANSITION_TILES.has(map[y+dy]?.[x+dx])))) {
        candidates.push({x,y})
        if(candidates.length>=cfg.maxCandidateSites)break
      }
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
        if(seen.has(key) || !passable(nx,ny))continue
        seen.add(key);queue.push({x:nx,y:ny})
      }
    }
    if(!candidates.length)return false
    const site=pick(candidates)
    if(!dropRewardOnGround('strange_green_potion',createItem(cfg.itemKind),site.x,site.y))return false
    state.completed.push('strange_green_potion')
    return true
  }

  // After two qualifying deaths, an underground corpse holds two Life Potions.
  // This is non-hostile loot; there is no chest or special-threat cost.
  function tryUnusedHealingRemains() {
    if (!active() || currentZ >= 0 || completed('unused_healing') ||
        state.unusedHealingDeaths < config.events.unused_healing.minDeaths) return false
    const cfg = config.events.unused_healing
    const levelKind = currentLevelKind()
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue = [{x:player.x,y:player.y}]
    const visited = new Set([keyXY(player.x,player.y)])
    const candidates = []
    invalidateUndergroundFov()
    const passable = (x,y) => !!TILE[map[y]?.[x]]?.walk &&
      !Mining.blocksPathAt(x,y) && !CAVE_TRANSITION_TILES.has(map[y]?.[x])
    for (let i = 0; i < queue.length; i++) {
      const {x,y} = queue[i]
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= cfg.minPlayerDistance &&
          !undergroundTileVisible(x,y) && !occupied.has(keyXY(x,y)) &&
          DungeonTraps.safeSpawn(x,y,currentZ,levelKind) &&
          !groundItemAt(x, y) &&
          !enemies.some(e => e.alive && onCurrentLevel(e) && e.x === x && e.y === y) &&
          passable(x,y)) {
        let nearStair = false
        for (let dy=-cfg.minStairDistance;dy<=cfg.minStairDistance && !nearStair;dy++)
          for (let dx=-cfg.minStairDistance;dx<=cfg.minStairDistance;dx++)
            if (CAVE_TRANSITION_TILES.has(map[y+dy]?.[x+dx])) { nearStair = true; break }
        if (!nearStair) candidates.push({x,y})
        if (candidates.length >= cfg.maxCandidateSites) break
      }
      for (const [dx,dy] of directions) {
        const xx=x+dx,yy=y+dy,k=keyXY(xx,yy)
        if (visited.has(k) || !passable(xx,yy)) continue
        visited.add(k); queue.push({x:xx,y:yy})
      }
    }
    if (!candidates.length) return false
    const pos = pick(candidates)
    groundItems.push({x:pos.x,y:pos.y,level:currentZ,levelKind,caveIndex:currentCave,
      kind:'deadbody',name:'Unprepared Adventurer',race:'adventurer',
      killer:'the depths',gear:createItem(cfg.rewardItemKind,{count:cfg.rewardCount}),gold:0,looted:false,
      adaptiveEventId:'unused_healing'})
    state.completed.push('unused_healing')
    minimapDirty=true
    log('Someone died with healing potions unused. Their remains lie somewhere ahead.', 'info')
    return true
  }

  // The response is non-hostile loot and does not consume a monster-threat
  // slot. Its six individual mushrooms are normal pickup objects, never chest
  // contents. The whole cluster is committed together, never partly.
  function tryIgnoredMushroomCluster() {
    if (!active() || completed('ignored_mushroom_cleaning') ||
        state.herbalistIgnoredVisits < config.events.ignored_mushroom_cleaning.minIgnoredVisits ||
        currentZ >= 0 || currentLevelKind() !== 'chain' ||
        !(currentZ === -1 || currentZ === -2 || fortLevel())) return false
    const settings = config.events.ignored_mushroom_cleaning
    const positions = []
    const reached = new Set([keyXY(player.x,player.y)])
    const queue = [{x:player.x,y:player.y}]
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]]
    invalidateUndergroundFov()
    const traversable = (x,y) => !!TILE[map[y]?.[x]]?.walk &&
      !Mining.blocksPathAt(x,y) && !CAVE_TRANSITION_TILES.has(map[y]?.[x])
    const safe = (x,y) => traversable(x,y) &&
      !occupied.has(keyXY(x,y)) && !undergroundTileVisible(x,y) &&
      Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= settings.minPlayerDistance &&
      DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) &&
      !groundItemAt(x, y)
    for (let i=0;i<queue.length;i++) {
      const point = queue[i]
      if (safe(point.x,point.y)) positions.push(point)
      for (const [dx,dy] of dirs) {
        const x=point.x+dx,y=point.y+dy,k=keyXY(x,y)
        if (reached.has(k) || !traversable(x,y)) continue
        reached.add(k);queue.push({x,y})
      }
    }
    // Cluster candidates have six safe positions connected to the player.
    // The anchor itself is included; all other tiles fit within the patch.
    const valid=[]
    const posMap=new Map(positions.map(q => [keyXY(q.x,q.y),q]))
    for (const anchor of positions) {
      const group=[anchor]
      for (let dy=-settings.clusterRadius;dy<=settings.clusterRadius;dy++)
        for (let dx=-settings.clusterRadius;dx<=settings.clusterRadius;dx++) {
          if (!dx && !dy) continue
          const spot=posMap.get(keyXY(anchor.x+dx,anchor.y+dy))
          if (spot) group.push(spot)
        }
      if (group.length >= settings.mushroomsTotal) valid.push(group)
      if (valid.length >= settings.maxCandidateSites) break
    }
    if (!valid.length) return false
    const group=pick(valid)
    // Always choose a deterministic subset of the safe patch. All generated
    // items share a locality, but not necessarily the exact same tile.
    const chosen=group.slice(0,settings.mushroomsTotal)
    for (let i=0;i<chosen.length;i++) {
      const {x,y}=chosen[i]
      groundItems.push({x,y,level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
        kind:'droppeditem',item:createItem(i < settings.rawMushrooms ? 'mushroom' : 'ediblemushroom'),
        adaptiveEventId:'ignored_mushroom_cleaning'})
    }
    state.completed.push('ignored_mushroom_cleaning')
    minimapDirty = true
    log('A peculiar cluster of mushrooms has appeared in the depths.', 'info')
    return true
  }

  // A self-inflicted Fireball hit is one committed cast, not one damaged
  // tile or one animation frame. A canceled cast never reaches this hook.
  function onSelfFireballHit() {
    if (!active() || completed('self_fireball')) return false
    state.selfFireballHits++
    return state.selfFireballHits >= config.events.self_fireball.minSelfHits
  }

  // A deliberately tempting Fireball scroll lies in a genuine one-tile-wide
  // corridor. It uses the same pickup path as all other dropped consumables.
  // Do not count this as a special threat or roll its placement on UI refresh.
  function trySelfFireballLure() {
    if (!active() || completed('self_fireball') ||
        state.selfFireballHits < config.events.self_fireball.minSelfHits ||
        currentZ >= 0 || !['chain','cave'].includes(currentLevelKind())) return false
    const event = config.events.self_fireball
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue = [{x:player.x,y:player.y}], visited = new Set([keyXY(player.x,player.y)])
    const candidates = []
    invalidateUndergroundFov()
    function traversable(x,y) {
      return !!TILE[map[y]?.[x]]?.walk && !Mining.blocksPathAt(x,y) &&
        !CAVE_TRANSITION_TILES.has(map[y]?.[x])
    }
    for (let i=0; i<queue.length; i++) {
      const {x,y} = queue[i]
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= event.minPlayerDistance &&
          !undergroundTileVisible(x,y) && !occupied.has(keyXY(x,y)) &&
          DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) &&
          !groundItemAt(x, y) &&
          traversable(x,y)) {
        const open = directions.map(([dx,dy]) => traversable(x+dx,y+dy))
        if ((open[0] && open[2] && !open[1] && !open[3]) ||
            (open[1] && open[3] && !open[0] && !open[2])) {
          candidates.push({x,y})
          if (candidates.length >= event.maxCandidateSites) break
        }
      }
      for (const [dx,dy] of directions) {
        const nx=x+dx, ny=y+dy, key=keyXY(nx,ny)
        if (visited.has(key) || !traversable(nx,ny)) continue
        visited.add(key);queue.push({x:nx,y:ny})
      }
    }
    if (!candidates.length) return false
    const spot = pick(candidates)
    if (!dropRewardOnGround('self_fireball',createItem(event.itemKind),spot.x,spot.y))
      return false
    state.completed.push('self_fireball')
    return true
  }

  // Only a player-initiated attack on a previously unalarmed individual counts.
  // The same enemy can never be counted twice, including after save/replay.
  // Evaluate before attack alarm/damage and ignore cosmetic animation timing.
  function onPlayerInitiatedStrongFight(enemy) {
    if (!active() || completed('strong_enemy_hunter') || !enemy?.alive ||
        enemy.hp <= 0 || !enemy.id || enemy.adaptiveEventId || enemy.alarmed ||
        !onCurrentLevel(enemy) || enemyInsideSanctuary(enemy) || playerInsideSanctuary() ||
        state.strongFightsInitiated.includes(enemy.id)) return false
    const cfg=config.events.strong_enemy_hunter
    if (state.strongFightsInitiated.length >= cfg.minInitiatedFights) return false
    const strength=monsterStrength({atk:enemyAtk(enemy),def:enemyDef(enemy),
      spd:enemySpd(enemy),grace:enemyGrace(enemy)})
    const playerStrength=monsterStrength({atk:playerAtk(),def:playerDef(),
      spd:playerSpd(),grace:playerGrace()})
    if (strength < playerStrength * cfg.minEnemyStrengthRatio) return false
    state.strongFightsInitiated.push(enemy.id)
    if (state.strongFightsInitiated.length >= cfg.minInitiatedFights)
      markTrigger('strong_enemy_hunter')
    return true
  }

  // Track real combat attempts, including misses, so one prolonged battle
  // cannot be split into multiple engagements by changing targets. Ranged
  // attacks and spells count just like melee. No RNG or presentation timing.
  function onCombatAttack(turn) {
    if (!active() || !Number.isInteger(turn) || turn < 0) return
    if (!completed('neglected_shield') && !completed('opposite_weapon')) {
      const last=state.shieldlessFightLastAttackTurn
      if (last !== null && turn-last > config.events.neglected_shield.quietTurns)
        finishShieldlessFight()
      if (state.shieldlessFightLastAttackTurn === null)
        state.shieldlessFightEligible=shieldlessFightPossible()
      else if (!shieldlessFightPossible()) state.shieldlessFightEligible=false
      state.shieldlessFightLastAttackTurn=turn
    }
    // Count attempts from both sides. This also prevents splitting a long
    // battle just because the player switched targets or weapons.
    if (!completed('reckless_fighter')) state.combatLastAttackTurn = turn
    if (!completed('unfinished_business')) {
      if (state.unfinishedLastAttackTurn !== null &&
          turn - state.unfinishedLastAttackTurn > config.events.unfinished_business.quietTurns)
        finishUnfinishedFight()
      state.unfinishedLastAttackTurn = turn
    }
    if (completed('oculus')) return
    const quiet = config.events.oculus.minAttackFreeTurns
    if (state.oculusLastAttackTurn === null || turn - state.oculusLastAttackTurn >= quiet) {
      state.oculusEngagementSerial++
      state.oculusEngagementCredited = false
    }
    state.oculusLastAttackTurn = turn
  }

  // Only a landed attack while an actual Scroll of Invisibility is active
  // counts. God-mode invisibility and repeated hits in one engagement don't.
  // At most one unique enemy can qualify per engagement.
  function onPlayerInvisibleHit(enemy, turn) {
    if (!active() || completed('oculus') || !enemy?.id ||
        typeof enemy.id !== 'string' || !Number.isInteger(turn) ||
        state.oculusEngagementSerial <= 0 || state.oculusLastAttackTurn !== turn ||
        state.oculusEngagementCredited || state.oculusTargetIds.includes(enemy.id)) return false
    state.oculusEngagementCredited = true
    state.oculusTargetIds.push(enemy.id)
    return true
  }

  function oculusEligible() {
    return !completed('oculus') &&
      state.oculusTargetIds.length >= config.events.oculus.minSeparateEngagements
  }

  // A venom attempt is registered only after a non-glancing hit actually
  // spends the coating. No miss, targeting UI, or damage animation can count.
  // Unique targets are tracked by stable enemy IDs, not species or names.
  // This hook runs before family immunity, so undead attempts are counted.
  function onVenomAttempt(enemy) {
    if (!active() || !enemy || !enemy.alive || enemy.hp <= 0) return null
    if (enemy.adaptiveEventId === 'venom_eater') {
      const amount = Math.min(Math.max(0, enemy.maxHp - enemy.hp),
        Math.max(0, Math.round(enemy.maxHp * config.events.venom_eater.venomHealMaxHpRatio)))
      enemy.hp += amount
      return {immune: true, healed: amount}
    }
    if (!active() || completed('venom_eater')) return null
    if (enemy.family === 'undead') {
      state.undeadVenomAttempts = Math.min(config.events.venom_eater.minUndeadPoisonAttempts,
        state.undeadVenomAttempts + 1)
    } else if (enemy.family !== 'construct' && typeof enemy.id === 'string' &&
        state.poisonedEnemyIds.length < config.events.venom_eater.minDistinctPoisonedEnemies &&
        !state.poisonedEnemyIds.includes(enemy.id)) {
      state.poisonedEnemyIds.push(enemy.id)
    }
    return null
  }

  function venomEaterEligible() {
    const event = config.events.venom_eater
    return !completed('venom_eater') &&
      (state.poisonedEnemyIds.length >= event.minDistinctPoisonedEnemies ||
        state.undeadVenomAttempts >= event.minUndeadPoisonAttempts)
  }

  function separateFromAdaptiveThreats(x, y) {
    if (!spawnSearch) return enemies.every(enemy => !enemy.alive || !onCurrentLevel(enemy) ||
      !enemy.adaptiveEventId || Math.max(Math.abs(enemy.x-x),Math.abs(enemy.y-y)) >= config.limits.minThreatSeparation)
    return spawnThreats().every(enemy => Math.max(Math.abs(enemy.x - x),
      Math.abs(enemy.y - y)) >= config.limits.minThreatSeparation)
  }

  // The 36th distinct sand dig (and later attempts if no safe site exists)
  // wakes a Scarab with Champion stats doubled. The visible name/prefix is
  // still Champion, so its regular Champion aura and combat rules apply.
  // The count advances only when the caller has marked a fresh sand tile.
  function onNewSandDig() {
    if (!active() || completed('ancient_scarab') || currentZ !== 0 || player.hp <= 0) return false
    const settings = config.events.ancient_scarab
    state.dugSandCount++
    if (state.dugSandCount <= settings.minPreviousDigs ||
        availableThreatSlots('surface', 0, -1) < 1) return false

    const tmpl = ENEMY_TEMPLATE_BY_NAME.Scarab
    const queue = [{x:player.x, y:player.y, d:0}]
    const seen = new Set([keyXY(player.x,player.y)])
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]]
    const spots = []
    const region = surfaceRegion(player.x, player.y).key
    for (let i = 0; i < queue.length; i++) {
      const tile=queue[i]
      if (tile.d >= settings.minSpawnDistance &&
          map[tile.y]?.[tile.x] === 'sand' &&
          surfaceRegion(tile.x, tile.y).key === region &&
          sanctuaryDistance(tile.x,tile.y) > FLEE_DISTANCE &&
          !occupied.has(keyXY(tile.x,tile.y)) &&
          !groundItemAt(tile.x, tile.y) &&
          separateFromAdaptiveThreats(tile.x,tile.y) &&
          enemyCanTraverse(tmpl,tile.x,tile.y)) spots.push(tile)
      if (tile.d >= settings.maxSpawnDistance) continue
      for (const [dx,dy] of dirs) {
        const x=tile.x+dx,y=tile.y+dy,key=keyXY(x,y)
        if (seen.has(key) || !enemyCanTraverse(tmpl,x,y) ||
            sanctuaryDistance(x,y) <= FLEE_DISTANCE) continue
        seen.add(key)
        queue.push({x,y,d:tile.d+1})
      }
    }
    if (!spots.length) return false
    const pos=pick(spots)
    const enemy={name:'Champion Scarab',baseName:tmpl.name,prefix:'Champion',
      adaptiveEventId:'ancient_scarab',tier:tmpl.tier,humanoid:false,
      hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
      grace:tmpl.grace,aggro:Math.max(tmpl.aggro ?? AGGRO_RANGE, settings.maxSpawnDistance),
      abilities:[...(tmpl.abilities || [])],x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,
      homeTileType:map[pos.y][pos.x],level:0,levelKind:'surface',caveIndex:-1,
      alive:true,aware:true,alarmed:true,equipment:null}
    enemy.prefixBase=prefixBaseStats(enemy)
    applyEnemyPrefix(enemy,'Champion')
    for (const stat of ['hp','maxHp','atk','def','spd'])
      enemy[stat]=Math.round(enemy[stat]*settings.combatMultiplier)
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    if (!recordThreat('ancient_scarab','surface',0,-1)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(pos.x,pos.y))
      return false
    }
    log('The sand trembles. An ancient Champion Scarab has risen nearby!', 'bad')
    return true
  }

  // Each fully extracted *mineral deposit* counts once; chipping a vein,
  // breaking ordinary stone and exposed formations that are still intact do
  // not qualify. Mining calls this only after the extraction has committed.
  function currentMineLevel() {
    if (currentZ >= 0 || currentLevelKind() !== 'chain') return null
    const floor=deepLevels[chainDepthForZ(currentZ)-2]
    return floor?.kind === 'dwarvenMines' ? floor : null
  }

  // Called only after a distinct ordinary mine wall has actually been removed.
  // The same wall cannot progress the threshold again; mineral nodes and
  // surface boulders are intentionally excluded by the mining action.
  function onMineWallBroken() {
    if (!active() || completed('depth_guardian') || !currentMineLevel()) return false
    state.mineWallsBroken++
    const cfg=config.events.depth_guardian
    if (state.mineWallsBroken < cfg.minWallsBroken || state.depthGuardianWarning) return false
    markTrigger('depth_guardian')
    if (availableThreatSlots('chain',currentZ,-1)<1) return false
    state.depthGuardianWarning={z:currentZ,startedAtTurn:turnCount}
    log('Deep in the stone, something heavy stirs. The next few moments may be your last chance to leave.', 'bad')
    return true
  }

  function guardianSites() {
    const level=currentMineLevel()
    if (!level || availableThreatSlots('chain',currentZ,-1)<1) return []
    const cfg=config.events.depth_guardian
    const template=ENEMY_TEMPLATE_BY_NAME[cfg.baseSpecies]
    const endpoints=[level.mineUpstairs,level.mineDownstairs,level.mineCagePad].filter(Boolean)
    return adaptiveMonsterSpawnSites(level,cfg,template,(x,y)=>
      endpoints.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
      !npcs.some(n=>n.x===x && n.y===y && onCurrentLevel(n)))
  }

  function resolveDepthGuardianWarning() {
    const warning=state.depthGuardianWarning
    if (!warning || completed('depth_guardian')) return false
    if (warning.z !== currentZ || !currentMineLevel()) {
      state.depthGuardianWarning=null
      return false
    }
    if (turnCount - warning.startedAtTurn < config.events.depth_guardian.warningTurns) return false
    const sites=guardianSites()
    if (!sites.length) return false // defer, never materialize inside a wall or on the stairs
    const cfg=config.events.depth_guardian,tmpl=ENEMY_TEMPLATE_BY_NAME[cfg.baseSpecies],pos=pick(sites)
    const enemy={name:tmpl.name,baseName:tmpl.name,prefix:null,adaptiveEventId:'depth_guardian',
      family:tmpl.family,tier:tmpl.tier,humanoid:false,
      hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
      grace:tmpl.grace,aggro:tmpl.aggro,abilities:[...tmpl.abilities],wander:tmpl.wander,
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,alarmed:false,
      miningInvestigation:{x:player.x,y:player.y,steps:cfg.investigationSteps,
        sourceZ:currentZ,announced:false,source:'mining'},
      equipment:null}
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    if (!recordThreat('depth_guardian','chain',currentZ,-1)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(pos.x,pos.y))
      return false
    }
    state.depthGuardianWarning=null
    log('The Guardian of the Deep has awakened and is coming for you!', 'bad')
    return true
  }

  function onMineMineralExtracted(x, y) {
    if (!active() || completed('trogloraptor_ambush') || !Mining.activeLevel() ||
        !Number.isInteger(x) || !Number.isInteger(y)) return false
    state.extractedMineralDeposits++
    const settings = config.events.trogloraptor_ambush
    if (state.extractedMineralDeposits <= settings.minPreviousDeposits ||
        !enemyDepthBiomeEligible(ENEMY_TEMPLATE_BY_NAME.Trogloraptor, currentZ) ||
        !availableThreatSlots('chain',currentZ,-1)) return false

    const base = ENEMY_TEMPLATE_BY_NAME.Trogloraptor
    const floor = Mining.activeLevel()
    const stairs = [floor.mineUpstairs, floor.mineDownstairs, floor.mineCagePad].filter(Boolean)
    const queue = [{x:player.x,y:player.y,steps:0}]
    const seen = new Set([keyXY(player.x,player.y)])
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const spots = []
    // Evaluate only the player-connected component. The ambusher must remain
    // hidden beside solid wall; otherwise it would be an ordinary extra mob.
    for (let i=0; i<queue.length; i++) {
      const pos=queue[i]
      if (pos.steps >= settings.minSpawnSteps &&
          Math.max(Math.abs(pos.x-x),Math.abs(pos.y-y)) <= settings.maxDepositDistance &&
          map[pos.y]?.[pos.x] === 'cavefloor2' &&
          enemyWallAmbushWallAt(map,pos.x,pos.y) &&
          !occupied.has(keyXY(pos.x,pos.y)) &&
          !groundItemAt(pos.x, pos.y) &&
          !CAVE_TRANSITION_TILES.has(map[pos.y]?.[pos.x]) &&
          stairs.every(stair=>Math.max(Math.abs(pos.x-stair.x),Math.abs(pos.y-stair.y))>settings.minStairDistance) &&
          DungeonTraps.safeSpawn(pos.x,pos.y,currentZ,'chain') &&
          separateFromAdaptiveThreats(pos.x,pos.y) &&
          enemyCanTraverse(base,pos.x,pos.y)) {
        spots.push({x:pos.x,y:pos.y})
        if (spots.length >= settings.maxCandidateSites) break
      }
      if (pos.steps >= settings.maxSpawnSteps) continue
      for (const [dx,dy] of directions) {
        const nx=pos.x+dx,ny=pos.y+dy,k=keyXY(nx,ny)
        if (seen.has(k) || !TILE[map[ny]?.[nx]]?.walk || Mining.blocksPathAt(nx,ny) ||
            !enemyCanTraverse(base,nx,ny)) continue
        seen.add(k);queue.push({x:nx,y:ny,steps:pos.steps+1})
      }
    }
    if (!spots.length) return false  // No viable hiding spot: retry on next deposit.
    const spot=pick(spots)
    const enemy={name:base.name,baseName:base.name,prefix:null,
      adaptiveEventId:'trogloraptor_ambush',tier:base.tier,humanoid:false,
      hp:base.hp,maxHp:base.hp,atk:base.atk,def:base.def,spd:base.spd,grace:base.grace,
      aggro:base.aggro ?? AGGRO_RANGE,abilities:[...(base.abilities || [])],
      x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:map[spot.y][spot.x],
      level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,
      equipment:null,wallAmbushHidden:true,wallAmbushSpent:false}
    addEnemy(enemy)
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('trogloraptor_ambush','chain',currentZ,-1)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    // The usual wall-ambush telegraph is the player's first warning; revealing
    // the creature here would defeat its existing ambush ability.
    log('The newly opened vein leaves an uneasy silence in the mine.', 'info')
    return true
  }

  // A single path-connected monster must have a valid place to stand and a
  // route to the player. Do not consume spawn RNG until the encounter wins the
  // shared floor lottery. Keep both stairs and already placed loot clear.
  function adaptiveMonsterSpawnSites(floor, settings, monster, accepts = () => true) {
    if (!monster) return []
    const entrances = (floor.caves || []).flatMap(c => c.entrances || [])
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue = [{x:player.x,y:player.y}], seen = new Set([keyXY(player.x,player.y)])
    const spots = []
    invalidateUndergroundFov()
    for (let i=0; i<queue.length; i++) {
      const {x,y}=queue[i]
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= settings.minSpawnDistance &&
          !undergroundTileVisible(x,y) && !occupied.has(keyXY(x,y)) &&
          separateFromAdaptiveThreats(x,y) &&
          !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
          entrances.every(p => Math.max(Math.abs(p.x-x),Math.abs(p.y-y)) > settings.minEntranceDistance) &&
          DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) && enemyCanTraverse(monster,x,y) &&
          accepts(x,y) && !groundItemAt(x, y)) {
        spots.push({x,y})
        if (spots.length >= settings.maxCandidateSites) break
      }
      for (const [dx,dy] of directions) {
        const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
        if (seen.has(key) || !TILE[map[ny]?.[nx]]?.walk || Mining.blocksPathAt(nx,ny) ||
            !enemyCanTraverse(monster,nx,ny)) continue
        seen.add(key);queue.push({x:nx,y:ny})
      }
    }
    return spots
  }

  // Only naturally generated fungus or existing Fungus creatures qualify as
  // habitat clues. The Prophet cannot create a fake patch to justify itself.
  // All spots are path-connected, outside sight and near a fungal landmark.
  function mushroomProphetSites() {
    if (!active() || completed('mushroom_prophet') || currentZ >= 0 ||
        currentLevelKind() !== 'chain' ||
        state.mushroomsCollected < config.events.mushroom_prophet.minMushroomsCollected ||
        !availableThreatSlots('chain',currentZ,-1)) return []
    const settings = config.events.mushroom_prophet
    const fungi = caveDecorations.filter(prop =>
      onCurrentLevel(prop) && ['mushrooms','wall-mushrooms'].includes(prop.kind))
    for (const enemy of enemies) if (enemy.alive && onCurrentLevel(enemy) &&
        (enemy.baseName || enemy.name) === 'Fungus') fungi.push(enemy)
    if (!fungi.length) return []
    const floor = currentZ === -1 ? {caves} :
      currentZ === -2 ? {caves:deepLevels[0]?.caves || []} : {caves:[]}
    return adaptiveMonsterSpawnSites(floor,settings,
      ENEMY_TEMPLATE_BY_NAME['Mushroom Prophet'], (x,y) =>
        fungi.some(fungus => Math.max(Math.abs(fungus.x-x),Math.abs(fungus.y-y)) <=
          settings.maxFungusDistance))
  }

  function spawnMushroomProphet(sites) {
    if (!sites.length) return false
    const pos = pick(sites), base = ENEMY_TEMPLATE_BY_NAME['Mushroom Prophet']
    const enemy = {
      name:base.name, baseName:base.name, prefix:null,
      adaptiveEventId:'mushroom_prophet',tier:base.tier,humanoid:false,
      hp:base.hp,maxHp:base.hp,atk:base.atk,def:base.def,spd:base.spd,
      grace:base.grace,aggro:base.aggro,abilities:[...(base.abilities || [])],
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
      alive:true,aware:false,equipment:null,prophetWarnedAtTurn:null
    }
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    if (!recordThreat('mushroom_prophet','chain',currentZ,-1)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(pos.x,pos.y))
      return false
    }
    // No warning yet: it is not telepathic. It speaks once the player
    // actually sees it and it can see the player.
    return true
  }

  // One successful lighting of an abandoned campfire is a distinct action.
  // Re-fuelling, cooking, using a stove and reopening the UI never count.
  // The ninth lighting (or later, when placement is impossible) may summon
  // exactly one visitor. Spawn before the action's enemy turn, and suppress
  // its action on that turn rather than relying on animation delays.
  function onCampfireLit(fire) {
    if (!active() || completed('uninvited_guest') || fire?.kind !== 'campfire' ||
        !onCurrentLevel(fire)) return false
    state.campfireLightings++
    const settings = config.events.uninvited_guest
    if (state.campfireLightings <= settings.minPreviousLightings) return false
    const levelKind = currentLevelKind(), regionX = fire.x, regionY = fire.y
    // Dwarven and natural chain floors share the same two-threat budget;
    // caveIndex must not create a separate pool for each cave entrance.
    const budgetCaveIndex = levelKind === 'chain' ? -1 : currentCave
    if (availableThreatSlots(levelKind,currentZ,budgetCaveIndex,regionX,regionY) < 1) return false
    const template = ENEMY_TEMPLATE_BY_NAME['Uninvited Guest']
    const region = levelKind === 'surface' ? surfaceRegion(regionX,regionY).key : null
    const queue=[{x:player.x,y:player.y,steps:0}]
    const seen=new Set([keyXY(player.x,player.y)])
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const sites=[]
    const traversable=(x,y)=>TILE[map[y]?.[x]]?.walk && !Mining.blocksPathAt(x,y) &&
      enemyCanTraverse(template,x,y)
    for (let i=0;i<queue.length;i++) {
      const pos=queue[i]
      if (pos.steps >= settings.minSpawnSteps &&
          Math.max(Math.abs(pos.x-fire.x),Math.abs(pos.y-fire.y)) <= settings.maxFireDistance &&
          (!region || surfaceRegion(pos.x,pos.y).key === region) &&
          (levelKind !== 'surface' || sanctuaryDistance(pos.x,pos.y) > FLEE_DISTANCE) &&
          !occupied.has(keyXY(pos.x,pos.y)) &&
          !CAVE_TRANSITION_TILES.has(map[pos.y]?.[pos.x]) &&
          !groundItemAt(pos.x, pos.y) &&
          DungeonTraps.safeSpawn(pos.x,pos.y,currentZ,levelKind) &&
          separateFromAdaptiveThreats(pos.x,pos.y) &&
          UndergroundFov.canSee(map,player.x,player.y,pos.x,pos.y,UndergroundFov.RADIUS)) {
        sites.push({x:pos.x,y:pos.y})
        if (sites.length >= settings.maxCandidateSites) break
      }
      if (pos.steps >= settings.maxSpawnSteps) continue
      for (const [dx,dy] of dirs) {
        const x=pos.x+dx,y=pos.y+dy,k=keyXY(x,y)
        if (seen.has(k) || !traversable(x,y)) continue
        seen.add(k);queue.push({x,y,steps:pos.steps+1})
      }
    }
    if (!sites.length) return false
    const spot=pick(sites)
    const friendly=chance(settings.friendlyChance)
    const meal=friendly ? pick(settings.mealPool) : null
    const enemy={name:template.name,baseName:template.name,prefix:null,
      adaptiveEventId:'uninvited_guest',tier:template.tier,humanoid:true,
      hp:template.hp,maxHp:template.hp,atk:template.atk,def:template.def,
      spd:template.spd,grace:template.grace,aggro:0,abilities:[...(template.abilities||[])],
      x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:map[spot.y][spot.x],
      level:currentZ,levelKind,caveIndex:currentCave,alive:true,aware:false,equipment:null,
      guestDisposition:friendly?'friendly':'warning',guestMealKind:meal,
      summonedTurn:turnCount+1,guestHostileAtTurn:turnCount+1+settings.warningTurns}
    addEnemy(enemy)
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('uninvited_guest',levelKind,currentZ,budgetCaveIndex,1,regionX,regionY)) {
      enemies=enemies.filter(e=>e!==enemy);occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    if (friendly) log('An Uninvited Guest steps into the firelight, holding out a warm meal. Approach and press F to accept it.', 'good')
    else log('An Uninvited Guest approaches the fire with a drawn blade. You have one turn to retreat!', 'bad')
    if (!replayAnimationsDisabled && !replaySimulationMode)
      spawnDamageNumber(spot.x,spot.y,friendly?'FOOD!':'FLEE!',friendly?'#a5e0ac':'#e88469',0,1100)
    return true
  }

  // The peaceful guest waits for a deliberate interaction. The meal is left
  // as ordinary ground loot rather than magically entering the inventory.
  // F already records a forage action, including during replay; this resolver
  // consumes no additional RNG and never records a duplicate replay action.
  function friendlyUninvitedGuestNearby() {
    if (!active()) return null
    return enemies.find(e=>e.alive && onCurrentLevel(e) &&
      e.adaptiveEventId==='uninvited_guest' && e.guestDisposition==='friendly' &&
      Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))<=1) || null
  }

  function claimUninvitedGuestMeal() {
    const guest=friendlyUninvitedGuestNearby()
    if (!guest) return false
    if (!dropRewardOnGround('uninvited_guest',createItem(guest.guestMealKind),guest.x,guest.y)) {
      log('The guest has nowhere to place the meal. Clear the ground and try again.', 'info')
      return true
    }
    guest.alive=false
    enemies=enemies.filter(e=>e!==guest)
    occupied.delete(keyXY(guest.x,guest.y))
    log(`The traveler leaves ${itemDefinition(guest.guestMealKind).name} on the ground, then vanishes into the dark.`, 'loot')
    return true
  }

  // Called exactly once per creature's gameplay action. Its first visible
  // encounter is spent speaking, not pursuing or attacking. The next player
  // action completes one full chance to retreat before hostile AI resumes.
  function onEnemyTurn(enemy, turn) {
    if (!active() || !enemy?.adaptiveEventId) return false
    if (active() && enemy?.adaptiveEventId==='previous_owner' && enemy.alive && enemy.hp>0) {
      // This is one artifact's owner, not a generic aggro bonus. Disarming
      // the cause pauses pursuit unless the player has attacked the ghost.
      const relic = ['weapon','shield','armor'].map(slot => player.equip?.[slot])
        .find(item => item?.kind==='artifact' && item.previousOwnerHauntedBy===enemy.name &&
          item.name===enemy.previousOwnerRelicName)
      if (enemy.hp < enemy.maxHp || enemy.poisonTurns>0) enemy.previousOwnerProvoked=true
      if (!relic && !enemy.previousOwnerProvoked) {
        enemy.aggro=0
        enemy.aware=false
        enemy.alarmed=false
        return true
      }
      if (!enemy.previousOwnerRecognized && !enemy.previousOwnerProvoked) {
        const distance=Math.max(Math.abs(enemy.x-player.x), Math.abs(enemy.y-player.y))
        if (distance>config.events.previous_owner.recognitionDistance ||
            !enemyHasSight(enemy) || playerHiddenFromEnemy(enemy)) return true
        enemy.previousOwnerRecognized=true
        log(`The ghost's hollow gaze fixes upon your ${artifactDisplayName(relic)}.`, 'bad')
      }
      if (enemy.previousOwnerProvoked || enemy.previousOwnerRecognized) {
        enemy.aggro=ENEMY_TEMPLATE_BY_NAME.Ghost.aggro ?? AGGRO_RANGE
        enemy.aware=true
        return false
      }
      return true
    }
    if (active() && enemy?.adaptiveEventId === 'uninvited_guest' && enemy.alive) {
      if (enemy.guestDisposition === 'friendly') {
        if (enemy.hp >= enemy.maxHp && !enemy.poisonTurns) return true
        // A player who strikes the peaceful visitor gives up the meal.
        enemy.guestDisposition = 'hostile'
        enemy.guestMealKind = null
        enemy.aggro = ENEMY_TEMPLATE_BY_NAME['Uninvited Guest'].aggro
        enemy.aware = true
        log('The wounded visitor draws a blade in retaliation.', 'bad')
        return false
      }
      if (enemy.guestDisposition === 'warning') {
        if (turn < enemy.guestHostileAtTurn) return true
        enemy.guestDisposition = 'hostile'
        enemy.aggro = ENEMY_TEMPLATE_BY_NAME['Uninvited Guest'].aggro
        enemy.aware = true
      }
    }
    if (active() && enemy?.adaptiveEventId === 'debt_collector' && enemy.alive && enemy.hp > 0) {
      if (enemy.debtDemandState === 'hostile') return false
      if (enemy.debtDemandState === 'pending') return true
      // A preemptive attack is a refusal; never demand payment politely from
      // a player who has already injured the collector.
      if (enemy.hp < enemy.maxHp || enemy.poisonTurns > 0) {
        enemy.debtDemandState = 'hostile'
        enemy.aware = true
        return true
      }
      if (!undergroundTileVisible(enemy.x,enemy.y) || !enemyCanBeSeen(enemy) ||
          playerHiddenFromEnemy(enemy)) return true
      const loot = recoverableRemainsCandidates()
      enemy.debtDemandLootId = loot.length ? pick(loot).id : null
      enemy.debtDemandState = 'pending'
      clearAutoPath()
      pendingMove = null
      const wanted = debtCollectorDemand(enemy)
      log(wanted.isGold
        ? (wanted.recoveredGold
          ? `Debt Collector demands the ${wanted.gold} gold you recovered from the dwarven dead.`
          : `Debt Collector demands ${wanted.gold} gold for disturbing dwarven remains.`)
        : `Debt Collector demands ${wanted.count > 1 ? wanted.count+' × ' : ''}${wanted.itemName}, recovered from the dwarven dead.`, 'bad')
      return true
    }
    if (!active() || enemy?.adaptiveEventId !== 'mushroom_prophet' ||
        !enemy.alive || enemy.hp <= 0) return false
    if (Number.isInteger(enemy.prophetWarnedAtTurn))
      return turn - enemy.prophetWarnedAtTurn < config.events.mushroom_prophet.warningTurns
    if (!undergroundTileVisible(enemy.x,enemy.y) ||
        !enemyCanBeSeen(enemy) || playerHiddenFromEnemy(enemy) ||
        !enemyHasSight(enemy)) return false
    enemy.prophetWarnedAtTurn=turn
    enemy.aware=true
    log(`Mushroom Prophet: "${config.events.mushroom_prophet.prophecy}"`, 'bad')
    if (!replayAnimationsDisabled && !replaySimulationMode)
      spawnDamageNumber(enemy.x,enemy.y,'FLEE!', '#c9bf83',0,1000)
    return true
  }

  function debtCollectorSites(floor) {
    if (!active() || completed('debt_collector') ||
        state.dwarvenRemainsSearched < config.events.debt_collector.minRemainsSearched ||
        !availableThreatSlots('chain',currentZ,-1)) return []
    return adaptiveMonsterSpawnSites(floor,config.events.debt_collector,ENEMY_TEMPLATE_BY_NAME.Ghost)
  }

  function spawnDebtCollector(sites) {
    if (!sites.length) return false
    const spot=pick(sites), base=ENEMY_TEMPLATE_BY_NAME.Ghost
    const ghost={name:'Debt Collector', baseName:'Ghost', prefix:null,
      adaptiveEventId:'debt_collector',tier:base.tier,humanoid:base.humanoid,
      hp:base.hp,maxHp:base.hp,atk:base.atk,def:base.def,spd:base.spd,
      grace:base.grace,aggro:0,abilities:[...(base.abilities || [])],
      x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:map[spot.y][spot.x],
      level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,
      equipment:null,debtDemandState:'watching',debtDemandLootId:null}
    addEnemy(ghost)
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('debt_collector','chain',currentZ,-1)) {
      enemies=enemies.filter(e=>e!==ghost)
      occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    log('An uneasy chill lingers among the dwarven dead.', 'info')
    return true
  }

  // Cursed artifacts are normally titled by their cursed prefix, not by a
  // dwarf's name. Give this encounter its own historical name when it spawns;
  // leave the artifact's public name and generated lore untouched.
  function previousOwnerSpawnOptions(floor) {
    if (!active() || completed('previous_owner') || !floor ||
        floor.dungeonFloor < floor.floorCount-1 ||
        !availableThreatSlots('chain',currentZ,-1)) return null
    const relics=eligiblePreviousOwnerArtifacts()
    if (!relics.length) return null
    const sites=adaptiveMonsterSpawnSites(floor,config.events.previous_owner,
      ENEMY_TEMPLATE_BY_NAME.Ghost)
    return sites.length ? {relics,sites} : null
  }

  function spawnPreviousOwner(options) {
    if (!active()) return false
    if (!options?.sites.length || !options.relics?.length) return false
    const relic=pick(options.relics), spot=pick(options.sites)
    const name=pick(ARTIFACT_NAMES_DWARF)
    const base=ENEMY_TEMPLATE_BY_NAME.Ghost
    const ghost={name,baseName:'Ghost',prefix:null,adaptiveEventId:'previous_owner',
      tier:base.tier,humanoid:!!base.humanoid,family:base.family,
      hp:base.hp,maxHp:base.hp,atk:base.atk,def:base.def,spd:base.spd,grace:base.grace,
      aggro:0,abilities:[...(base.abilities||[])],
      x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:map[spot.y][spot.x],
      level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,
      equipment:null,previousOwnerRelicName:relic.name,
      previousOwnerRecognized:false,previousOwnerProvoked:false}
    addEnemy(ghost)
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('previous_owner','chain',currentZ,-1)) {
      enemies=enemies.filter(enemy=>enemy!==ghost)
      occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    relic.previousOwnerHauntedBy=name
    // No global log announcement: the owner reveals himself by his name and
    // by recognising the cursed relic when he sees the player carrying it.
    return true
  }

  function shieldHunterEligible() {
    return active() && !completed('undead_shield_hunter') &&
      (player.combatSkills?.marksmanship || 0) >= config.events.undead_shield_hunter.minMarksmanship
  }

  function shieldHunterRemaining(enemy) {
    if (!active() || enemy?.adaptiveEventId !== 'undead_shield_hunter' || enemy.shieldGuardBroken) return 0
    return Math.max(0,config.events.undead_shield_hunter.shieldHits - (enemy.shieldGuardHits || 0))
  }

  // Only landed arrows wear the shield down; positioning and monster facing
  // never affect the guard. Normal melee, spell and environmental damage bypass it.
  function shieldHunterArrowHit(enemy, damage) {
    if (!active() || enemy?.adaptiveEventId !== 'undead_shield_hunter' || enemy.shieldGuardBroken)
      return {damage, absorbed:false, broken:false}
    const cfg = config.events.undead_shield_hunter
    enemy.shieldGuardHits++
    const broken = enemy.shieldGuardHits >= cfg.shieldHits
    if (broken) enemy.shieldGuardBroken = true
    return {damage:damage > 0 ? Math.max(1,Math.floor(damage*cfg.shieldDamageMultiplier)) : 0,
      absorbed:true,broken}
  }

  function spawnShieldHunter(sites) {
    if (!sites.length || !shieldHunterEligible()) return false
    const cfg = config.events.undead_shield_hunter
    const pos = pick(sites), base = ENEMY_TEMPLATE_BY_NAME[cfg.baseSpecies]
    const enemy = {
      name:cfg.name,baseName:base.name,adaptiveEventId:'undead_shield_hunter',
      family:'undead',prefix:null,tier:cfg.tier,humanoid:true,
      hp:cfg.hp,maxHp:cfg.hp,atk:cfg.atk,def:cfg.def,spd:cfg.spd,grace:cfg.grace,
      aggro:base.aggro??AGGRO_RANGE,abilities:[],wander:'homeReanchored',
      shieldGuardHits:0,shieldGuardBroken:false,
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,equipment:null
    }
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    if (!recordThreat('undead_shield_hunter','chain',currentZ,-1)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(pos.x,pos.y))
      return false
    }
    log('The Undead Warden prowls the ruins with its battered shield raised against arrows.', 'bad')
    return true
  }

  function spawnVenomEater(sites) {
    if (!sites.length) return false
    const spot = pick(sites), base = ENEMY_TEMPLATE_BY_NAME['Venom Eater']
    const enemy = {
      baseName: base.name, name: base.name, prefix: null,
      adaptiveEventId: 'venom_eater',
      tier: base.tier, humanoid: !!base.humanoid, hp: base.hp, maxHp: base.hp,
      atk: base.atk, def: base.def, spd: base.spd, grace: base.grace,
      aggro: base.aggro ?? AGGRO_RANGE, abilities: [...(base.abilities || [])],
      x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y,
      homeTileType: map[spot.y][spot.x], level: currentZ,
      levelKind: 'chain', caveIndex: -1, alive: true, aware: false, equipment: null
    }
    addEnemy(enemy)
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('venom_eater','chain',currentZ,-1)) {
      enemies = enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    log('Something in the ruins has learned to hunger for venom.', 'bad')
    return true
  }

  function spawnChampionOculus(sites) {
    if (!sites.length) return false
    const spot = pick(sites), base = ENEMY_TEMPLATE_BY_NAME.Oculus
    const enemy = {
      baseName: base.name, name: `Champion ${base.name}`, prefix: 'Champion',
      adaptiveEventId: 'oculus', tier: base.tier, humanoid: !!base.humanoid,
      hp: base.hp, maxHp: base.hp, atk: base.atk, def: base.def, spd: base.spd,
      grace: base.grace, aggro: base.aggro ?? AGGRO_RANGE,
      abilities: [...(base.abilities || [])],
      x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y,
      homeTileType: map[spot.y][spot.x], level: currentZ,
      levelKind: 'chain', caveIndex: -1, alive: true, aware: false, equipment: null
    }
    enemy.prefixBase = prefixBaseStats(enemy)
    applyEnemyPrefix(enemy, 'Champion')
    prepareEnemyEquipment(enemy)
    addEnemy(enemy)
    occupied.add(keyXY(spot.x, spot.y))
    if (!recordThreat('oculus', 'chain', currentZ, -1)) {
      enemies = enemies.filter(e => e !== enemy)
      occupied.delete(keyXY(spot.x, spot.y))
      return false
    }
    log('A Champion Oculus has come to see through your tricks.', 'bad')
    return true
  }

  // Death is resolved exactly once by die(), including environmental deaths.
  // Whether a potion was drunk earlier in the fight does not matter: the
  // reaction responds to dying while still carrying at least two Life Potions.
  function onPlayerDied(killer) {
    if (!active()) return
    state.shieldlessFightLastAttackTurn = null
    state.shieldlessFightEligible = false
    state.waterCrossing = null
    state.lowHpTurns = 0
    state.combatLastAttackTurn = null
    state.unfinishedFightCandidates = []
    state.unfinishedLastAttackTurn = null
    const cfg = config.events.unused_healing
    const carried = (player.inventory || []).reduce((sum, item) =>
      sum + (item?.kind === cfg.itemKind ? Math.max(0, item.count || 1) : 0), 0)
    if (carried >= cfg.minCarriedPotions) state.unusedHealingDeaths++
    onPlayerKilledBy(killer)
  }

  function onPlayerKilledBy(killer) {
    if (!active() || !killer) return
    const species = killer.baseName || killer.name
    if (!ENEMY_TEMPLATE_BY_NAME[species]) return
    state.deathSerial++
    state.deathsBySpecies[species] = (state.deathsBySpecies[species] || 0) + 1
    state.lastDeathBySpecies[species] = state.deathSerial
  }

  function nemesisSpecies() {
    const threshold = config.events.nemesis.minDeathsBySpecies
    const eligible = Object.keys(state.deathsBySpecies).filter(species =>
      state.deathsBySpecies[species] >= threshold && ENEMY_TEMPLATE_BY_NAME[species])
    eligible.sort((a, b) => state.deathsBySpecies[b] - state.deathsBySpecies[a] ||
      state.lastDeathBySpecies[b] - state.lastDeathBySpecies[a] || a.localeCompare(b))
    return eligible[0] || null
  }

  // Use a connected, safe tile well outside the player's view. Path-connected
  // terrain is evaluated with the same dungeon walkability rules as the player;
  // rejected placements are deferred rather than consuming the event.
  function nemesisLocation(tmpl) {
    const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    const queue = [{x: player.x, y: player.y}]
    const visited = new Set([keyXY(player.x, player.y)])
    const candidates = []
    invalidateUndergroundFov()
    for (let i = 0; i < queue.length; i++) {
      const tile = queue[i]
      const far = Math.max(Math.abs(tile.x - player.x), Math.abs(tile.y - player.y)) > UndergroundFov.RADIUS
      if (far && !undergroundTileVisible(tile.x, tile.y) &&
          DungeonTraps.safeSpawn(tile.x, tile.y, currentZ, currentLevelKind()) &&
          !occupied.has(keyXY(tile.x, tile.y)) &&
          separateFromAdaptiveThreats(tile.x, tile.y) &&
          !groundItems.some(g => onCurrentLevel(g) && g.x === tile.x && g.y === tile.y &&
            ['chest', 'dwarvenkey', 'dwarvenstove'].includes(g.kind)) &&
          enemyCanTraverse(tmpl, tile.x, tile.y)) candidates.push(tile)
      for (const [dx, dy] of directions) {
        const x = tile.x + dx, y = tile.y + dy, key = keyXY(x, y)
        if (visited.has(key) || !TILE[map[y]?.[x]]?.walk || Mining.blocksPathAt(x, y)) continue
        visited.add(key)
        queue.push({x, y})
      }
    }
    return candidates.length ? pick(candidates) : null
  }

  function tryNemesis() {
    if (!active() || completed('nemesis') || currentLevelKind() !== 'chain') return false
    const floor = deepLevels[chainDepthForZ(currentZ) - 2]
    if (!floor || floor.dungeonPackage !== 'dwarvenRuins' ||
        floor.dungeonFloor !== floor.floorCount) return false
    const species = nemesisSpecies()
    if (!species) return false
    const base = ENEMY_TEMPLATE_BY_NAME[species]
    const caveIndex = -1
    if (!config.limits.nemesisBonusThreat) return false
    const spot = nemesisLocation(base)
    if (!spot) return false
    const enemy = {
      baseName: base.name, name: `Champion ${base.name}`, prefix: 'Champion',
      tier: base.tier, humanoid: !!base.humanoid,
      hp: base.hp, maxHp: base.hp, atk: base.atk, def: base.def, spd: base.spd,
      grace: base.grace, aggro: base.aggro ?? AGGRO_RANGE,
      abilities: [...(base.abilities || [])],
      x: spot.x, y: spot.y, homeX: spot.x, homeY: spot.y,
      homeTileType: map[spot.y][spot.x], level: currentZ, levelKind: 'chain',
      caveIndex, alive: true, aware: false, equipment: null
    }
    enemy.prefixBase = prefixBaseStats(enemy)
    applyEnemyPrefix(enemy, 'Champion')
    prepareEnemyEquipment(enemy)
    addEnemy(enemy)
    occupied.add(keyXY(spot.x, spot.y))
    if (!recordThreat('nemesis', 'chain', currentZ, caveIndex)) {
      // Defensive rollback, though capacity was checked before any spawn RNG.
      enemies = enemies.filter(e => e !== enemy)
      occupied.delete(keyXY(spot.x, spot.y))
      return false
    }
    log('A terrible foe waits somewhere in these halls. The ruins remember your defeats.', 'bad')
    return true
  }


  function fortLevel() {
    if (currentLevelKind() !== 'chain') return null
    const floor = deepLevels[chainDepthForZ(currentZ) - 2]
    return floor?.dungeonPackage === 'dwarvenRuins' &&
      Number.isInteger(floor.dungeonFloor) && Number.isInteger(floor.floorCount)
      ? floor : null
  }

  // Resample the five-floor curve at equivalent relative depths when the
  // world has fewer or more ruin floors. Probabilities belong to attempts,
  // not to visits; an unchanged set of candidates cannot be rerolled.
  function fortChance(floorNumber, floorCount) {
    const curve = config.fortEncounterChances
    const position = floorCount <= 1 ? curve.length - 1 :
      (Math.max(1, Math.min(floorCount, floorNumber)) - 1) * (curve.length - 1) / (floorCount - 1)
    const left = Math.floor(position), right = Math.min(curve.length - 1, left + 1)
    return curve[left] + (curve[right] - curve[left]) * (position - left)
  }

  function matchingEquippedPrefix() {
    const club = config.events.fan_club
    const gear = club.equipmentKinds.map(slot => player.equip?.[slot])
    if (gear.filter(Boolean).length < club.minMatchingEquippedItems) return null
    const prefixes = gear.map(item => {
      // Read the actual modifier identity, not the display-name's first word.
      // Unique/artifact names don't qualify as randomly prefixed gear.
      if (!['weapon','shield','armor'].includes(item?.kind) || !item.base || !item.mod) return null
      const modifier = MODIFIERS.find(mod => mod.stat === item.mod && item.name === `${mod.name} ${item.base}`)
      return modifier?.name || null
    })
    return prefixes[0] && prefixes.every(name => name === prefixes[0]) ? prefixes[0] : null
  }

  function fanClubSpawnSites() {
    const club = config.events.fan_club
    const templates = club.members.map(name => ENEMY_TEMPLATE_BY_NAME[name])
    if (templates.some(t => !t)) return []
    // Search only the player-reachable component. The extra distance keeps
    // all members outside underground FOV, not merely the group anchor.
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue = [{x:player.x,y:player.y}], seen = new Set([keyXY(player.x,player.y)])
    const possible = [], near = new Map()
    invalidateUndergroundFov()
    function canPlace(x,y) {
      if (Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) <= Math.max(club.minSpawnDistance, UndergroundFov.RADIUS)) return false
      if (undergroundTileVisible(x,y) || occupied.has(keyXY(x,y)) ||
          !separateFromAdaptiveThreats(x,y) || !TILE[map[y]?.[x]]?.walk ||
          CAVE_TRANSITION_TILES.has(map[y]?.[x]) || Mining.blocksPathAt(x,y) ||
          !DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) ||
          groundItems.some(g => onCurrentLevel(g) && g.x===x && g.y===y &&
            ['chest','dwarvenkey','dwarvenstove'].includes(g.kind))) return false
      return templates.every(t => enemyCanTraverse(t,x,y))
    }
    for (let i=0; i<queue.length; i++) {
      const p=queue[i], key=keyXY(p.x,p.y)
      if (canPlace(p.x,p.y)) {
        possible.push(p)
        near.set(key,p)
      }
      for (const [dx,dy] of directions) {
        const x=p.x+dx,y=p.y+dy,k=keyXY(x,y)
        if (seen.has(k) || !TILE[map[y]?.[x]]?.walk || Mining.blocksPathAt(x,y)) continue
        seen.add(k); queue.push({x,y})
      }
    }
    const clusters=[]
    for (const anchor of possible) {
      const neighbours=[]
      for (let dy=-club.maxMemberDistance;dy<=club.maxMemberDistance;dy++) {
        for (let dx=-club.maxMemberDistance;dx<=club.maxMemberDistance;dx++) {
          if (!dx && !dy) continue
          const nearby=near.get(keyXY(anchor.x+dx,anchor.y+dy))
          if (nearby) neighbours.push(nearby)
        }
      }
      if (neighbours.length < club.members.length - 1) continue
      clusters.push([anchor,...neighbours.slice(0,club.members.length-1)])
      if (clusters.length >= club.maxCandidateSites) break
    }
    return clusters
  }

  function fanClubGear(kind, tier, name) {
    // Build unmodified real equipment, then apply precisely the shared gear
    // modifier. A second enemy prefix would double these bonuses.
    const modifier = MODIFIERS.find(m => m.name === name)
    if (!modifier) throw new Error('Unknown Fan Club equipment modifier: ' + name)
    const catalog = kind === 'weapon' ? WEAPONS.filter(w => !w.rangedAtk) :
      kind === 'shield' ? SHIELDS : ARMORS
    const base = pickEquipmentBase(catalog, tier, tier)
    let item
    if (kind === 'weapon') item = {kind,base:base.name,name:base.name,tier:base.tier,
      atk:base.atk,grace:base.grace,baseValue:base.baseValue,twoHanded:!!base.twoHanded}
    else if (kind === 'shield') item = {kind,base:base.name,name:base.name,tier:base.tier,
      def:base.def,baseValue:base.baseValue}
    else item = {kind,base:base.name,name:base.name,tier:base.tier,
      def:base.def,baseValue:base.baseValue,speedPenalty:base.speedPenalty || 0,
      ...(base.gracePenalty ? {gracePenalty:base.gracePenalty} : {})}
    return applyGearModifier(base.name,item,modifier,0,tier)
  }

  function spawnFanClub(prefix, clusters) {
    const club=config.events.fan_club
    if (!clusters.length) return false
    const positions = pick(clusters)
    const playerGearTier = Math.max(...club.equipmentKinds.map(kind => player.equip?.[kind]?.tier || 0))
    const gearTier = Math.min(club.maxGearTier, Math.max(club.minGearTier, playerGearTier))
    const key=floorKey('chain',currentZ,-1)
    if ((state.floorThreats[key] || 0) >= config.limits.floorThreats) return false
    for (let i=0; i<club.members.length; i++) {
      const base=ENEMY_TEMPLATE_BY_NAME[club.members[i]], pos=positions[i]
      const enemy={name:`${prefix} ${base.name}`, baseName:base.name,
        prefix:null, adaptiveEventId:'fan_club', tier:base.tier, humanoid:!!base.humanoid,
        hp:base.hp,maxHp:base.hp,atk:base.atk,def:base.def,spd:base.spd,grace:base.grace,
        aggro:base.aggro ?? AGGRO_RANGE, abilities:[...(base.abilities || [])],
        x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
        level:currentZ,levelKind:'chain',caveIndex:-1,alive:true,aware:false,equipment:null}
      // Keep world-trait humanoid toughness consistent with normal monsters.
      const hpMultiplier=WORLD_GEN_CONFIG.environment.humanoidHpMultiplier
      enemy.hp=Math.max(1,Math.round(enemy.hp * hpMultiplier));enemy.maxHp=enemy.hp
      addEnemy(enemy)
      const item=fanClubGear(club.equipmentKinds[i],gearTier,prefix)
      applyEnemyEquipment(enemy,item)
      occupied.add(keyXY(pos.x,pos.y))
    }
    recordThreat('fan_club','chain',currentZ,-1)
    log(`A strange fan club of a kobold, goblin and skink has gathered somewhere in the ruins. They imitate your ${prefix} equipment!`, 'bad')
    return true
  }

  // Raw or roasted meat can qualify independently, but never summon anything
  // mid-turn. The next transition to a natural habitat attempts a real spawn.
  // Candidate scans are deterministic and consume no encounter RNG.
  function hungryMonsterOptions() {
    if (!active() || completed('hungry_monster')) return []
    const cfg = config.events.hungry_monster
    const qualifiesMeat = cfg.eligibleMeatKinds.some(kind =>
      player.inventory.reduce((n, item) => n +
        (item.kind === kind ? Math.max(0, item.count || 1) : 0), 0) >= cfg.minCarriedMeat)
    const levelKind = currentLevelKind()
    if (!qualifiesMeat || !['surface','chain'].includes(levelKind) ||
        availableThreatSlots(levelKind,currentZ,currentCave) < 1) return []
    const mine = currentZ < 0 && levelKind === 'chain' &&
      deepLevels[chainDepthForZ(currentZ) - 2]?.dungeonPackage === 'dwarvenMines'
    const natives = cfg.monsterPool.map(name => ENEMY_TEMPLATE_BY_NAME[name]).filter(tmpl =>
      currentZ === 0 ? (tmpl.name !== 'Cave Troll') :
        (tmpl.name !== 'Cyclops' && enemyDepthBiomeEligible(tmpl,currentZ) &&
         (tmpl.name !== 'Cave Troll' || mine)))
    if (!natives.length) return []
    const entrances = spawnEntrances()
    const directions = [[0,-1],[1,0],[0,1],[-1,0]]
    const options=[]
    for (const tmpl of natives) {
      const spots=[], queue=[{x:player.x,y:player.y}]
      const seen=new Set([keyXY(player.x,player.y)])
      const biomes=new Set(enemyBiomes(tmpl))
      for (let i=0; i<queue.length; i++) {
        const {x,y}=queue[i]
        const distance=Math.max(Math.abs(player.x-x),Math.abs(player.y-y))
        if (distance>=cfg.minSpawnDistance && distance<=cfg.maxSpawnDistance &&
            (currentZ!==0 || (biomes.has(map[y]?.[x]) &&
              surfaceRegion(x,y).key===surfaceRegion(player.x,player.y).key)) &&
            (currentZ===0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
              !undergroundTileVisible(x,y)) &&
            !occupied.has(keyXY(x,y)) &&
            !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
            !groundItemAt(x, y) &&
            !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
            entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
            separateFromAdaptiveThreats(x,y) &&
            DungeonTraps.safeSpawn(x,y,currentZ,levelKind) &&
            enemyCanTraverse(tmpl,x,y)) {
          spots.push({x,y})
          if (spots.length>=cfg.maxCandidateSites) break
        }
        if (distance>=cfg.maxSpawnDistance) continue
        for (const [dx,dy] of directions) {
          const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
          if (seen.has(key) || !TILE[map[ny]?.[nx]]?.walk ||
              !enemyCanTraverse(tmpl,nx,ny) ||
              (currentZ===0 && surfaceRegion(nx,ny).key!==surfaceRegion(player.x,player.y).key)) continue
          seen.add(key);queue.push({x:nx,y:ny})
        }
      }
      if (spots.length) options.push({tmpl,sites:spots})
    }
    return options
  }

  function spawnHungryMonster(options) {
    if (!options?.length || completed('hungry_monster')) return false
    const selected=pick(options), base=selected.tmpl, pos=pick(selected.sites)
    const cfg=config.events.hungry_monster
    const reduced=(value,factor)=>value>0 ? Math.max(0,Math.min(value-1,Math.round(value*factor))) : 0
    const hp=Math.max(1,reduced(base.hp,cfg.healthMultiplier))
    const monster={
      baseName:base.name,name:`Hungry ${base.name}`,adaptiveEventId:'hungry_monster',
      tier:base.tier,humanoid:!!base.humanoid,family:base.family,
      hp,maxHp:hp,atk:Math.max(base.atk+1,Math.round(base.atk*cfg.attackMultiplier)),
      def:reduced(base.def,cfg.defenseMultiplier),spd:base.spd,grace:base.grace,
      aggro:base.aggro??AGGRO_RANGE, abilities:[...(base.abilities||[])],
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
      alive:true,aware:true,alarmed:true,equipment:null,wander:'roam',
      hungryIgnoredMeatKeys:[],hungryTargetMeat:null,hungryAngryThroughTurn:-1
    }
    addEnemy(monster)
    occupied.add(keyXY(pos.x,pos.y))
    if (!recordThreat('hungry_monster',currentLevelKind(),currentZ,currentCave)) {
      enemies=enemies.filter(e=>e!==monster)
      occupied.delete(keyXY(pos.x,pos.y))
      return false
    }
    log('The scent of meat has drawn a hungry hunter.', 'bad')
    return true
  }

  // An attack interrupts the current lure, including misses and protected
  // hits. The monster ignores that *particular pile*, not every future drop.
  function onHungryMonsterAttacked(enemy) {
    if (!active() || enemy?.adaptiveEventId!=='hungry_monster') return
    if (enemy.hungryTargetMeat && !enemy.hungryIgnoredMeatKeys.includes(enemy.hungryTargetMeat))
      enemy.hungryIgnoredMeatKeys.push(enemy.hungryTargetMeat)
    enemy.hungryTargetMeat=null
    enemy.hungryAngryThroughTurn=turnCount+1
  }

  // Runs after ordinary Fear, sanctuary and invisibility checks, so meat
  // doesn't bypass established protections. One movement or one eating action
  // is resolved here; damage and pathing never depend on animation timing.
  function takeHungryMonsterTurn(enemy) {
    if (!active() || enemy?.adaptiveEventId!=='hungry_monster' ||
        !enemy.alive || enemy.hp<=0 || !onCurrentLevel(enemy)) return false
    const cfg=config.events.hungry_monster
    if (enemy.hungryAngryThroughTurn<turnCount) {
      const food=groundItems.filter(g=>onCurrentLevel(g) && g.kind==='droppeditem' &&
        g.playerDropped===true && g.item?.kind==='meat' && (g.item.count||1)>0 &&
        !enemy.hungryIgnoredMeatKeys.includes(`${currentZ}:${g.x},${g.y}`) &&
        Math.max(Math.abs(enemy.x-g.x),Math.abs(enemy.y-g.y))<=cfg.droppedMeatDetectionRange)
        .sort((a,b)=>Math.max(Math.abs(enemy.x-a.x),Math.abs(enemy.y-a.y)) -
          Math.max(Math.abs(enemy.x-b.x),Math.abs(enemy.y-b.y)) || a.y-b.y || a.x-b.x)
      for (const pile of food) {
        const key=`${currentZ}:${pile.x},${pile.y}`
        if (enemy.x===pile.x && enemy.y===pile.y) {
          const count=pile.item.count||1
          pile.item.count=count-cfg.meatUnitsEaten
          if (pile.item.count<=0) groundItems.splice(groundItems.indexOf(pile),1)
          minimapDirty=true
          enemy.hungryTargetMeat=null
          if (!enemy.hungryIgnoredMeatKeys.includes(key)) enemy.hungryIgnoredMeatKeys.push(key)
          if (enemyIsVisibleOnMainView(enemy))
            log(`The ${enemy.name} devours a piece of meat, momentarily distracted.`, 'info')
          return true // Eating consumes exactly this enemy action.
        }
        const step=enemyFindStepToFood(enemy,pile.x,pile.y)
        if (!step) continue
        enemy.hungryTargetMeat=key
        enemyStepTowardPlayer(enemy,step)
        return true
      }
    }
    enemy.hungryTargetMeat=null
    const distance=Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))
    // At normal combat range, defer to the species' existing attack, spells,
    // missile choice and defense behavior. Beyond it, actively seek the hero.
    if (distance<=Math.max(ATTACK_RANGE,effectiveAggroRange(enemy))) return false
    const step=enemyFindStep(enemy,true)
    if (!step) return false
    enemy.aware=true
    enemyStepTowardPlayer(enemy,step)
    return true
  }


  // The existing Imp already knows how to steal and escape. This one seeks
  // coins instead of backpack items. The same off-screen/path-reachable/native
  // habitat constraints as Hungry Monster apply, with no extra worldgen roll.
  function goldImpSpawnSites() {
    if (!active() || completed('gold_imp') || player.gold < config.events.gold_imp.minPlayerGold ||
        !['surface','chain'].includes(currentLevelKind()) ||
        availableThreatSlots(currentLevelKind(),currentZ,currentCave) < 1) return []
    const tmpl=ENEMY_TEMPLATE_BY_NAME.Imp, cfg=config.events.gold_imp
    if (currentZ===0 ? !enemyBiomes(tmpl).some(b=>['hill','forest'].includes(b)) :
        !enemyDepthBiomeEligible(tmpl,currentZ)) return []
    const entrances = spawnEntrances()
    const queue=[{x:player.x,y:player.y}], seen=new Set([keyXY(player.x,player.y)])
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const sites=[]
    if(currentZ<0) invalidateUndergroundFov()
    const region=currentZ===0 ? surfaceRegion(player.x,player.y).key : null
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i], distance=Math.max(Math.abs(x-player.x),Math.abs(y-player.y))
      if(distance>=cfg.minSpawnDistance && distance<=cfg.maxSpawnDistance &&
          (currentZ!==0 || (['hill','forest'].includes(map[y]?.[x]) &&
            surfaceRegion(x,y).key===region && sanctuaryDistance(x,y)>FLEE_DISTANCE)) &&
          (currentZ===0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
            !undergroundTileVisible(x,y)) &&
          !occupied.has(keyXY(x,y)) && !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
          !groundItemAt(x, y) &&
          !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
          entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
          separateFromAdaptiveThreats(x,y) && DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) &&
          enemyCanTraverse(tmpl,x,y)) {
        sites.push({x,y})
        if(sites.length>=cfg.maxCandidateSites) break
      }
      if(distance>=cfg.maxSpawnDistance) continue
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
        if(seen.has(k) || !TILE[map[ny]?.[nx]]?.walk || !enemyCanTraverse(tmpl,nx,ny) ||
            (region && surfaceRegion(nx,ny).key!==region)) continue
        seen.add(k);queue.push({x:nx,y:ny})
      }
    }
    return sites
  }

  function spawnGoldImp(sites) {
    if(!sites?.length || completed('gold_imp')) return false
    const tmpl=ENEMY_TEMPLATE_BY_NAME.Imp, pos=pick(sites)
    const enemy={name:'Gold Imp',baseName:'Imp',adaptiveEventId:'gold_imp',
      tier:tmpl.tier,humanoid:tmpl.humanoid,family:tmpl.family,
      hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,grace:tmpl.grace,
      aggro:tmpl.aggro,abilities:[...(tmpl.abilities||[])],
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
      alive:true,aware:true,alarmed:true,equipment:null,wander:'roam',
      stolenGold:0,theftUsed:false,theftEscapeSteps:0}
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    if(!recordThreat('gold_imp',currentLevelKind(),currentZ,currentCave)) {
      enemies=enemies.filter(e=>e!==enemy);occupied.delete(keyXY(pos.x,pos.y));return false
    }
    log('A Gold Imp has caught the scent of your wealth.', 'bad')
    return true
  }

  // The thief's existing melee chance/escape rules resolve the theft. Compute
  // the amount from current gold at the moment of success, not on spawning.
  function goldImpStealAmount() {
    if(!active()) return 0
    return Math.max(0,Math.min(config.events.gold_imp.maxStolenGold,
      Math.floor(player.gold*config.events.gold_imp.stealRatio)))
  }

  function takeGoldImpTurn(enemy) {
    if(!active() || enemy?.adaptiveEventId!=='gold_imp' || !enemy.alive ||
        enemy.hp<=0 || !onCurrentLevel(enemy) || enemy.theftUsed) return false
    const distance=Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))
    if(distance<=Math.max(ATTACK_RANGE,effectiveAggroRange(enemy))) return false
    const step=enemyFindStep(enemy,true)
    if(!step) return false
    enemy.aware=true
    enemyStepTowardPlayer(enemy,step)
    return true
  }

  // Ordinary thief encounters use the normal thief AI/loot and never spend the
  // special-threat budget. A floor or surface region receives one opportunity
  // for the character: a failed probability roll cannot be farmed by returning.
  function ordinaryThiefAreaKey() {
    const kind=currentLevelKind()
    return kind==='surface' ? surfaceRegion(player.x,player.y).key :
      `${kind}:${currentZ}:${currentCave}`
  }

  function ordinaryThiefSpawnOptions() {
    const cfg=config.modifiers.unsold_equipment, kind=currentLevelKind()
    if (!['surface','chain','crypt2'].includes(kind)) return []
    let templates=ENEMY_TEMPLATES.filter(t=>t.abilities?.includes('thief') &&
      t.adaptiveOnly!==true && naturalSpawnEligible(t))
    if (kind!=='surface') {
      const packageId=currentDungeonPackageId()
      const encounterCfg=packageId ? dungeonPackageConfig(packageId)?.encounters : null
      if (packageId==='dwarvenMines' && encounterCfg) {
        // Mines use floor-indexed species groups, not the ruins' tier minima.
        const firstZ=dungeonPackageConfig(packageId).firstZ
        const floorIndex=firstZ-currentZ
        const weights=encounterCfg.groupWeights?.[floorIndex] || []
        const groups=['early','middle','late']
        const allowed=new Set(groups.flatMap((group,i)=>weights[i]>0 ?
          encounterCfg.groups?.[group] || [] : []))
        templates=templates.filter(t=>allowed.has(t.name) &&
          enemyDepthBiomeEligible(t,currentZ))
      } else if (encounterCfg) {
        const allowed=new Set(dungeonEncounterTemplatesForDepth(packageId,currentZ,encounterCfg)
          .map(t=>t.name))
        templates=templates.filter(t=>allowed.has(t.name))
      } else {
        // Ordinary caves use the existing cave-biome membership. Depth-only
        // mine residents are not added to unrelated caves.
        templates=templates.filter(t=>enemyBiomes(t).includes('cave'))
      }
    }
    if (!templates.length) return []
    const region=kind==='surface' ? surfaceRegion(player.x,player.y).key : null
    const entranceKeys=new Set()
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++)
      if(CAVE_TRANSITION_TILES.has(map[y]?.[x])) entranceKeys.add(keyXY(x,y))
    const entrances=[...entranceKeys].map(key=>{const [x,y]=key.split(',').map(Number);return {x,y}})
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const queue=[{x:player.x,y:player.y}],seen=new Set([keyXY(player.x,player.y)])
    const options=templates.map(tmpl=>({tmpl,sites:[]}))
    if(kind!=='surface')invalidateUndergroundFov()
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i],distance=Math.max(Math.abs(x-player.x),Math.abs(y-player.y))
      if(distance>=cfg.minSpawnDistance && distance<=cfg.maxSpawnDistance &&
          (kind!=='surface' || (surfaceRegion(x,y).key===region && sanctuaryDistance(x,y)>FLEE_DISTANCE &&
            Math.max(Math.abs(x-spawnPoint.x),Math.abs(y-spawnPoint.y))>=
              WORLD_GEN_CONFIG.surfaceEnemies.highTierMinTempleDistance)) &&
          (kind==='surface' ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
            !undergroundTileVisible(x,y)) &&
          !occupied.has(keyXY(x,y)) &&
          !npcs.some(n=>kind==='surface' && n.x===x && n.y===y) &&
          !groundItemAt(x, y) &&
          !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
          entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
          DungeonTraps.safeSpawn(x,y,currentZ,kind) &&
          !Mining.blocksPathAt(x,y)) {
        for(const option of options) {
          if(option.sites.length>=cfg.maxCandidateSites ||
              (kind==='surface' && !enemyBiomes(option.tmpl).includes(map[y][x])) ||
              !enemyCanTraverse(option.tmpl,x,y))continue
          option.sites.push({x,y})
        }
      }
      if(distance>=cfg.maxSpawnDistance)continue
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
        if(seen.has(k)||!TILE[map[ny]?.[nx]]?.walk||Mining.blocksPathAt(nx,ny)||
            (region&&surfaceRegion(nx,ny).key!==region))continue
        seen.add(k);queue.push({x:nx,y:ny})
      }
    }
    return options.filter(option=>option.sites.length)
  }

  function tryOrdinaryThiefEncounter() {
    if(!active())return false
    const key=ordinaryThiefAreaKey()
    if(state.ordinaryThiefChecks.includes(key))return false
    // Lock the first visit before scanning. An area with no legal thieves or
    // placements is not rerolled on the next step, avoiding repeat flood fills.
    state.ordinaryThiefChecks.push(key)
    const candidates=ordinaryThiefSpawnOptions()
    if(!candidates.length)return false
    const cfg=config.modifiers.unsold_equipment
    const spare=player.inventory.reduce((n,it)=>n+
      (['weapon','armor'].includes(it.kind) ? Math.max(1,it.count||1) : 0),0)
    const probability=spare>=cfg.minUnequippedGear ? cfg.hoardingChance : cfg.normalChance
    if(!chance(probability))return false
    const chosen=pickWeighted(candidates,option=>Math.max(0,option.tmpl.rarity||0))
    const pos=pick(chosen.sites),tmpl=chosen.tmpl
    const enemy={name:tmpl.name,baseName:tmpl.name,adaptiveEventId:'unsold_equipment',
      tier:tmpl.tier,humanoid:!!tmpl.humanoid,family:tmpl.family,
      hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
      grace:tmpl.grace,aggro:tmpl.aggro??AGGRO_RANGE,
      abilities:[...(tmpl.abilities||[])],wander:tmpl.wander,
      x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
      ordinarySurface:currentZ===0,alive:true,aware:false,alarmed:false,equipment:null}
    if(enemy.humanoid)prepareEnemyEquipment(enemy)
    addEnemy(enemy)
    occupied.add(keyXY(pos.x,pos.y))
    return true
  }

  // Pick existing living beasts native to the player's *current* habitat.
  // A chosen instance receives its special ability; the template registry and
  // every ordinary member of its species remain unchanged.
  function adaptiveHunterOptions(eventId) {
    if (!active() || completed(eventId) ||
        (eventId !== 'beast_hunter' && activeAdaptivePursuit()) ||
        availableThreatSlots(currentLevelKind(),currentZ,currentCave) < 1) return []
    const cfg = config.events[eventId], kind = currentLevelKind()
    if (!['surface','chain','crypt2'].includes(kind)) return []
    if (eventId === 'beast_hunter' && (kind !== 'surface' || !beastHunterEligible())) return []
    if (eventId === 'low_hp_carrion' &&
        (state.lowHpTurns < cfg.minBelowHpTurns ||
         player.hp >= playerMaxHp() * cfg.playerHpRatio ||
         state.combatLastAttackTurn !== null)) return []
    if (eventId === 'reckless_fighter' && state.recklessLowHpFights < cfg.minFights) return []
    const packageId = kind === 'chain' && currentZ < 0
      ? deepLevels[chainDepthForZ(currentZ) - 2]?.dungeonPackage : null
    const encounters = packageId ? dungeonPackageConfig(packageId)?.encounters : null
    const nativeUnderground = encounters
      ? new Set(dungeonEncounterTemplatesForDepth(packageId,currentZ,encounters).map(t=>t.name))
      : null
    const eligible = ENEMY_TEMPLATES.filter(tmpl =>
      (eventId !== 'beast_hunter' || cfg.monsterPool.includes(tmpl.name)) &&
      tmpl.family === 'living' && !tmpl.humanoid && (tmpl.aggro ?? 0) > 0 &&
      (tmpl.rarity ?? 0) > 0 && tmpl.tier >= cfg.minTier &&
      tmpl.hp >= cfg.minHp && tmpl.atk >= cfg.minAtk &&
      !tmpl.abilities?.includes('rupture') && !tmpl.abilities?.includes('thief') &&
      (currentZ === 0 ? enemyBiomes(tmpl).some(b=>!b.startsWith('z-') && b!=='cave') :
        nativeUnderground ? nativeUnderground.has(tmpl.name) :
        enemyBiomes(tmpl).includes('cave') || enemyDepthBiomeEligible(tmpl,currentZ)))
    if (!eligible.length) return []
    const entrances = spawnEntrances()
    const region = currentZ === 0 ? surfaceRegion(player.x,player.y).key : null
    const queue=[{x:player.x,y:player.y}], seen=new Set([keyXY(player.x,player.y)])
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const options=eligible.map(tmpl=>({tmpl,sites:[]}))
    if(currentZ<0)invalidateUndergroundFov()
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i],distance=Math.max(Math.abs(x-player.x),Math.abs(y-player.y))
      if(distance>=cfg.minSpawnDistance && distance<=cfg.maxSpawnDistance &&
          (!region || (surfaceRegion(x,y).key===region && sanctuaryDistance(x,y)>FLEE_DISTANCE)) &&
          (currentZ===0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
            !undergroundTileVisible(x,y)) &&
          !occupied.has(keyXY(x,y)) &&
          !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
          !groundItemAt(x, y) &&
          !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
          entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
          separateFromAdaptiveThreats(x,y) &&
          DungeonTraps.safeSpawn(x,y,currentZ,kind) && !Mining.blocksPathAt(x,y)) {
        for(const option of options) {
          if(option.sites.length>=cfg.maxCandidateSites ||
              (region && !enemyBiomes(option.tmpl).includes(map[y]?.[x])) ||
              !enemyCanTraverse(option.tmpl,x,y))continue
          option.sites.push({x,y})
        }
      }
      if(distance >= cfg.maxSpawnDistance) continue
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
        if(seen.has(key) || !TILE[map[ny]?.[nx]]?.walk || Mining.blocksPathAt(nx,ny) ||
            (region && surfaceRegion(nx,ny).key!==region))continue
        seen.add(key);queue.push({x:nx,y:ny})
      }
    }
    return options.filter(option=>option.sites.length)
  }

  // A returning enemy is an existing entity with its original ID. The site
  // search finds native, connected, unseen habitat on the current level; if no
  // such site exists, nothing is removed or created and the event waits.
  function unfinishedBusinessOptions() {
    if (!active() || completed('unfinished_business')) return []
    const cfg=config.events.unfinished_business, kind=currentLevelKind()
    if (!['surface','chain','crypt2'].includes(kind) ||
        state.unfinishedEscapes.length < cfg.minEscapes ||
        availableThreatSlots(kind,currentZ,kind==='surface'?-1:currentCave)<1) return []
    const packageId=kind==='chain' && currentZ<0
      ? deepLevels[chainDepthForZ(currentZ)-2]?.dungeonPackage : null
    const packageConfig=packageId ? dungeonPackageConfig(packageId)?.encounters : null
    const nativeUnderground=packageConfig ? new Set(
      dungeonEncounterTemplatesForDepth(packageId,currentZ,packageConfig).map(t=>t.name)) : null
    // Refresh visibility before excluding any original survivor in sight.
    if (currentZ<0) invalidateUndergroundFov()
    const survivors=state.unfinishedEscapes.map(id=>enemies.find(e=>e.alive && e.id===id))
      .filter(enemy=>{
        if (!enemy || enemy.adaptiveEventId || enemy.carriedDungeonKey ||
            enemy.stolenItem || enemy.stolenGold || enemy.pendingAbility ||
            oldHunterQuest?.targetEnemyId === enemy.id ||
            oldHunterQuest?.targetEnemyIds?.includes(enemy.id) ||
            fishermanQuest?.targetId === enemy.id) return false
        const species=enemy.baseName || enemy.name
        const tmpl=ENEMY_TEMPLATE_BY_NAME[species]
        if (!tmpl || tmpl.adaptiveOnly) return false
        if (onCurrentLevel(enemy) && (currentZ===0
          ? enemy.x>=camX && enemy.x<camX+VIEW_W && enemy.y>=camY && enemy.y<camY+VIEW_H
          : undergroundTileVisible(enemy.x,enemy.y))) return false
        return currentZ===0 ? enemyBiomes(tmpl).some(b=>!b.startsWith('z-') && b!=='cave') :
          nativeUnderground ? nativeUnderground.has(species) :
            enemyBiomes(tmpl).includes('cave') || enemyDepthBiomeEligible(tmpl,currentZ)
      })
    if (!survivors.length) return []
    const entrances = spawnEntrances()
    const region=currentZ===0 ? surfaceRegion(player.x,player.y).key : null
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    const options=[]
    for (const enemy of survivors) {
      const tmpl=ENEMY_TEMPLATE_BY_NAME[enemy.baseName || enemy.name]
      const queue=[{x:player.x,y:player.y,d:0}],seen=new Set([keyXY(player.x,player.y)])
      const sites=[]
      for(let i=0;i<queue.length;i++) {
        const {x,y,d}=queue[i],oldPos=onCurrentLevel(enemy) && enemy.x===x && enemy.y===y
        if (d>=cfg.minSpawnDistance && d<=cfg.maxSpawnDistance &&
            Math.max(Math.abs(x-player.x),Math.abs(y-player.y)) >= cfg.minSpawnDistance && !oldPos &&
            (!region || surfaceRegion(x,y).key===region &&
              sanctuaryDistance(x,y)>FLEE_DISTANCE && enemyBiomes(tmpl).includes(map[y]?.[x])) &&
            (currentZ===0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
              !undergroundTileVisible(x,y)) &&
            !occupied.has(keyXY(x,y)) &&
            !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
            !groundItemAt(x, y) &&
            !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
            entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
            separateFromAdaptiveThreats(x,y) &&
            DungeonTraps.safeSpawn(x,y,currentZ,kind) && !Mining.blocksPathAt(x,y)) {
          sites.push({x,y})
          if(sites.length>=cfg.maxCandidateSites) break
        }
        if(d>=cfg.maxSpawnDistance) continue
        for(const [dx,dy] of dirs) {
          const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
          if(seen.has(k) || !TILE[map[ny]?.[nx]]?.walk || Mining.blocksPathAt(nx,ny) ||
              !enemyCanTraverse(enemy,nx,ny) || region && surfaceRegion(nx,ny).key!==region) continue
          seen.add(k);queue.push({x:nx,y:ny,d:d+1})
        }
      }
      if(sites.length) options.push({enemy,sites})
    }
    return options
  }

  function spawnUnfinishedBusiness(options) {
    if (!options.length || completed('unfinished_business')) return false
    const cfg=config.events.unfinished_business
    const {enemy,sites}=options[0]
    if (!enemy.alive || !enemies.includes(enemy)) return false
    const kind=currentLevelKind(), caveIndex=kind==='surface'?-1:currentCave
    if (!availableThreatSlots(kind,currentZ,caveIndex)) return false
    const spot=pick(sites), name=pick(monsterNames)
    const wasHere=onCurrentLevel(enemy), oldX=enemy.x, oldY=enemy.y
    // The enemy remains the SAME persistent creature, never an extra spawn.
    // Already-prepared abilities, gear, kills and ID stay attached to it.
    if (wasHere) occupied.delete(keyXY(oldX,oldY))
    enemy.x=spot.x;enemy.y=spot.y
    enemy.level=currentZ;enemy.levelKind=kind;enemy.caveIndex=caveIndex
    enemy.homeX=spot.x;enemy.homeY=spot.y;enemy.homeTileType=map[spot.y][spot.x]
    enemy.farPath=null;enemy.farTargetX=null;enemy.farTargetY=null
    enemy.farPrevX=null;enemy.farPrevY=null;enemy.pendingAbility=null
    enemy.miningInvestigation=null;enemy.aware=true;enemy.alarmed=true
    enemy.alarmedZ=currentZ;enemy.alarmedLevelKind=kind
    enemy.forestConcealX=null;enemy.forestConcealY=null
    enemy.sleeping=false;enemy.summonedTurn=turnCount
    enemy.prefixBase=prefixBaseStats(enemy)
    enemy.prefix=cfg.returnPrefix
    applyEnemyPrefix(enemy,cfg.returnPrefix)
    enemy.hp=enemy.maxHp
    enemy.name=`${name}, the Unfinished ${enemy.baseName || enemy.name}`
    enemy.adaptiveEventId='unfinished_business'
    occupied.add(keyXY(spot.x,spot.y))
    if (!recordThreat('unfinished_business',kind,currentZ,caveIndex))
      throw new Error('Unfinished Business lost its reserved threat slot.')
    log(`${enemy.name} has returned. The wounds you left behind have made it stronger!`, 'bad')
    debugEvent(`Unfinished Business returns as original enemy ${enemy.id}.`)
    return true
  }

  // The Last Survivor retaliates only where its species could occur naturally.
  // All three participants must belong to the player's connected component,
  // stay out of sight, and leave stairs and exits unblocked. Failed placement
  // consumes neither a threat slot nor RNG; a later milestone can retry.
  function lastSurvivorOptions() {
    if (!active() || completed('last_survivor')) return []
    const kind = currentLevelKind(), cfg = config.events.last_survivor
    if (!['surface','chain','crypt2'].includes(kind) ||
        availableThreatSlots(kind,currentZ,kind === 'surface' ? -1 : currentCave) < 1) return []
    const names = lastSurvivorSpecies()
    if (!names.length) return []
    const dungeonPackage = kind === 'chain' && currentZ < 0
      ? deepLevels[chainDepthForZ(currentZ)-2]?.dungeonPackage : null
    const encounters = dungeonPackage ? dungeonPackageConfig(dungeonPackage)?.encounters : null
    const nativeUnderground = encounters
      ? new Set(dungeonEncounterTemplatesForDepth(dungeonPackage,currentZ,encounters).map(t=>t.name))
      : null
    const templates = names.map(name=>ENEMY_TEMPLATE_BY_NAME[name]).filter(tmpl =>
      currentZ === 0 ? enemyBiomes(tmpl).some(b=>!b.startsWith('z-') && b !== 'cave') :
      nativeUnderground ? nativeUnderground.has(tmpl.name) :
      enemyBiomes(tmpl).includes('cave') || enemyDepthBiomeEligible(tmpl,currentZ))
    if (!templates.length) return []
    const entrances = spawnEntrances()
    const region = currentZ === 0 ? surfaceRegion(player.x,player.y).key : null
    const directions=[[0,-1],[1,0],[0,1],[-1,0]]
    if (currentZ < 0) invalidateUndergroundFov()
    const options=[]
    // A per-species reachability walk prevents swimmers and non-swimmers
    // sharing a merely tile-connected path across water or blocked terrain.
    for (const tmpl of templates) {
      const queue=[{x:player.x,y:player.y,d:0}],seen=new Set([keyXY(player.x,player.y)])
      const sites=new Map()
      for (let i=0;i<queue.length;i++) {
        const {x,y,d}=queue[i]
        if (d >= cfg.minSpawnDistance && d <= cfg.maxSpawnDistance &&
            (!region || (surfaceRegion(x,y).key === region &&
              sanctuaryDistance(x,y) > FLEE_DISTANCE && enemyBiomes(tmpl).includes(map[y]?.[x]))) &&
            (currentZ === 0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
              !undergroundTileVisible(x,y)) &&
            !occupied.has(keyXY(x,y)) &&
            !npcs.some(n=>currentZ===0 && n.x===x && n.y===y) &&
            !groundItemAt(x, y) &&
            !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
            entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
            separateFromAdaptiveThreats(x,y) &&
            DungeonTraps.safeSpawn(x,y,currentZ,kind)) sites.set(keyXY(x,y),{x,y})
        if (d >= cfg.maxSpawnDistance) continue
        for (const [dx,dy] of directions) {
          const nx=x+dx,ny=y+dy,key=keyXY(nx,ny)
          if (seen.has(key) || !TILE[map[ny]?.[nx]]?.walk || Mining.blocksPathAt(nx,ny) ||
              !enemyCanTraverse(tmpl,nx,ny) ||
              (region && surfaceRegion(nx,ny).key !== region)) continue
          seen.add(key); queue.push({x:nx,y:ny,d:d+1})
        }
      }
      const groups=[]
      for (const anchor of sites.values()) {
        const nearby=[]
        for(let dy=-cfg.maxCompanionDistance;dy<=cfg.maxCompanionDistance;dy++)
          for(let dx=-cfg.maxCompanionDistance;dx<=cfg.maxCompanionDistance;dx++) {
            if (!dx && !dy) continue
            const site=sites.get(keyXY(anchor.x+dx,anchor.y+dy))
            if (site) nearby.push(site)
          }
        if (nearby.length < cfg.companions) continue
        groups.push([anchor,...nearby.slice(0,cfg.companions)])
        if (groups.length >= cfg.maxCandidateSites) break
      }
      if (groups.length) options.push({tmpl,groups})
    }
    return options
  }

  // Counter a habit of assassinating the Champion before its escort. A
  // front rank is created from a shortest path to the player, rather than
  // just placing a cosmetic "rear" label on a random trio.
  function hiddenLeaderOptions() {
    if (!active() || completed('hidden_leader')) return []
    const cfg=config.events.hidden_leader, kind=currentLevelKind()
    if (state.hiddenLeaderKills.length<cfg.minLeaderFirstKills ||
        !['surface','chain','crypt2'].includes(kind) ||
        availableThreatSlots(kind,currentZ,currentCave)<1) return []
    const packageId=kind==='chain' && currentZ<0
      ? deepLevels[chainDepthForZ(currentZ)-2]?.dungeonPackage:null
    const encounters=packageId ? dungeonPackageConfig(packageId)?.encounters:null
    const nativeUnderground=encounters
      ? new Set(dungeonEncounterTemplatesForDepth(packageId,currentZ,encounters).map(t=>t.name)):null
    const templates=cfg.monsterPool.map(name=>ENEMY_TEMPLATE_BY_NAME[name]).filter(tmpl=>
      tmpl && (currentZ===0 ? enemyBiomes(tmpl).some(b=>!b.startsWith('z-') && b!=='cave') :
        nativeUnderground ? nativeUnderground.has(tmpl.name) :
        enemyBiomes(tmpl).includes('cave') || enemyDepthBiomeEligible(tmpl,currentZ)))
    if (!templates.length) return []
    const entrances = spawnEntrances()
    const region=currentZ===0 ? surfaceRegion(player.x,player.y).key:null
    if(currentZ<0) invalidateUndergroundFov()
    const options=[]
    for(const tmpl of templates) {
      const queue=[{x:player.x,y:player.y,d:0,parent:null}]
      const sites=new Map([[keyXY(player.x,player.y),queue[0]]])
      for(let i=0;i<queue.length;i++) {
        const step=queue[i]
        if(step.d>=cfg.maxSpawnDistance)continue
        for(const [dx,dy] of LURE_DIRS) {
          const x=step.x+dx,y=step.y+dy,k=keyXY(x,y)
          if(sites.has(k) || !TILE[map[y]?.[x]]?.walk || Mining.blocksPathAt(x,y) ||
              !enemyCanTraverse(tmpl,x,y) ||
              (region && surfaceRegion(x,y).key!==region))continue
          const entry={x,y,d:step.d+1,parent:step}
          sites.set(k,entry);queue.push(entry)
        }
      }
      const legal=(site)=>!!site && site.d>=cfg.minSpawnDistance &&
        site.d<=cfg.maxSpawnDistance &&
        (currentZ!==0 || (surfaceRegion(site.x,site.y).key===region &&
          sanctuaryDistance(site.x,site.y)>FLEE_DISTANCE &&
          enemyBiomes(tmpl).includes(map[site.y]?.[site.x]))) &&
        (currentZ===0 ? !(site.x>=camX && site.x<camX+VIEW_W &&
          site.y>=camY && site.y<camY+VIEW_H) : !undergroundTileVisible(site.x,site.y)) &&
        !occupied.has(keyXY(site.x,site.y)) &&
        !npcs.some(n=>n.x===site.x&&n.y===site.y&&(currentZ===0||onCurrentLevel(n))) &&
        !groundItemAt(site.x, site.y) &&
        !CAVE_TRANSITION_TILES.has(map[site.y]?.[site.x]) &&
        entrances.every(pos=>Math.max(Math.abs(pos.x-site.x),Math.abs(pos.y-site.y))>cfg.minEntranceDistance) &&
        separateFromAdaptiveThreats(site.x,site.y) &&
        DungeonTraps.safeSpawn(site.x,site.y,currentZ,kind)
      const groups=[]
      for(const leader of queue) {
        if(!legal(leader) || !legal(leader.parent) ||
            Math.max(Math.abs(leader.parent.x-player.x),Math.abs(leader.parent.y-player.y)) >=
              Math.max(Math.abs(leader.x-player.x),Math.abs(leader.y-player.y)))continue
        // Primary guard blocks the known path from the hero to the leader.
        // Secondary guards must also be in front and adjacent to that guard.
        const front=[]
        for(const [dx,dy] of LURE_DIRS) {
          const other=sites.get(keyXY(leader.parent.x+dx,leader.parent.y+dy))
          if(other && other!==leader && other!==leader.parent && legal(other) &&
              other.d<=leader.d &&
              Math.max(Math.abs(other.x-player.x),Math.abs(other.y-player.y)) <
                Math.max(Math.abs(leader.x-player.x),Math.abs(leader.y-player.y)) &&
              Math.max(Math.abs(other.x-leader.x),Math.abs(other.y-leader.y))<=cfg.followersWithin)
            front.push(other)
        }
        if(front.length<cfg.followers-1)continue
        // Prefer a flanking guard rather than lining all three fighters up
        // behind the same corridor tile. A narrow passage can still use the
        // forward second guard, without creating an inaccessible encounter.
        const forwardX=leader.x-leader.parent.x,forwardY=leader.y-leader.parent.y
        front.sort((a,b)=>{
          const alongA=(a.x-leader.parent.x)*forwardX+(a.y-leader.parent.y)*forwardY
          const alongB=(b.x-leader.parent.x)*forwardX+(b.y-leader.parent.y)*forwardY
          return Math.abs(alongA)-Math.abs(alongB)
        })
        // The search order is fixed, and random selection happens only after
        // the checkpoint chooses the event, never during eligibility probing.
        groups.push([leader,leader.parent,...front.slice(0,cfg.followers-1)])
        if(groups.length>=cfg.maxCandidateSites)break
      }
      if(groups.length)options.push({tmpl,groups})
    }
    return options
  }

  function spawnHiddenLeader(options) {
    if(!options?.length || completed('hidden_leader'))return false
    const {tmpl,groups}=pick(options),positions=pick(groups)
    const kind=currentLevelKind(),caveIndex=kind==='surface'?-1:currentCave
    if(availableThreatSlots(kind,currentZ,caveIndex)<1)return false
    const cfg=config.events.hidden_leader,created=[]
    for(let i=0;i<positions.length;i++) {
      const pos=positions[i],leader=i===0
      const enemy={name:leader?`Guarded Champion ${tmpl.name}`:tmpl.name,
        baseName:tmpl.name,prefix:leader?'Champion':null,adaptiveEventId:'hidden_leader',
        tier:tmpl.tier,humanoid:!!tmpl.humanoid,family:tmpl.family,
        hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,grace:tmpl.grace,
        aggro:tmpl.aggro??AGGRO_RANGE,abilities:[...(tmpl.abilities||[])],wander:tmpl.wander,
        x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
        level:currentZ,levelKind:kind,caveIndex,alive:true,aware:true,alarmed:true,
        equipment:null,hiddenLeaderRole:leader?'leader':'guard'}
      if(leader){enemy.prefixBase=prefixBaseStats(enemy);applyEnemyPrefix(enemy,cfg.leaderPrefix)}
      // Ordinary shooter gear, monster prefixes and the native gangPower
      // ability stay intact. No new stat multiplier is layered onto Champion.
      addEnemy(enemy);occupied.add(keyXY(pos.x,pos.y));created.push(enemy)
    }
    for(const enemy of created)enemy.hiddenLeaderGroupId=created[0].id
    if(!recordThreat('hidden_leader',kind,currentZ,caveIndex)) {
      for(const enemy of created)occupied.delete(keyXY(enemy.x,enemy.y))
      enemies=enemies.filter(e=>!created.includes(e));return false
    }
    log('A wary Champion has assembled bodyguards and now hides behind their front line.', 'bad')
    return true
  }

  // While any bodyguard survives, the Champion refuses to lead a charge.
  // Luring guards away removes Inspired naturally; attacking or approaching
  // the Champion forces its ordinary combat AI to take over immediately.
  function takeHiddenLeaderTurn(enemy) {
    if(!active() || enemy?.adaptiveEventId!=='hidden_leader' ||
      enemy.hiddenLeaderRole!=='leader' || !enemy.alive || enemy.hp<=0 ||
      !onCurrentLevel(enemy) || enemy.hp<enemy.maxHp || enemy.poisonTurns>0 ||
      Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))<=ATTACK_RANGE ||
      !enemies.some(other=>other!==enemy && other.alive && other.hp>0 &&
        onCurrentLevel(other) && other.adaptiveEventId==='hidden_leader' &&
        other.hiddenLeaderRole==='guard' && other.hiddenLeaderGroupId===enemy.id))return false
    return true
  }

  // A coordinated pack of individually weak humanoids reacts to a player's
  // habit of starting unfairly ambitious fights. Reuse native species and
  // ordinary gangPower/shooting, not synthetic extra damage or teleports.
  function strongEnemyPackOptions() {
    if (!active() || completed('strong_enemy_hunter')) return []
    const cfg=config.events.strong_enemy_hunter,kind=currentLevelKind()
    if (state.strongFightsInitiated.length < cfg.minInitiatedFights ||
        !['surface','chain','crypt2'].includes(kind) ||
        availableThreatSlots(kind,currentZ,currentCave)<1) return []
    const playerStrength=monsterStrength({atk:playerAtk(),def:playerDef(),
      spd:playerSpd(),grace:playerGrace()})
    const packageId=kind==='chain' && currentZ<0
      ? deepLevels[chainDepthForZ(currentZ)-2]?.dungeonPackage:null
    const encounters=packageId ? dungeonPackageConfig(packageId)?.encounters:null
    const nativeUnderground=encounters
      ? new Set(dungeonEncounterTemplatesForDepth(packageId,currentZ,encounters).map(t=>t.name)):null
    const templates=cfg.monsterPool.map(name=>ENEMY_TEMPLATE_BY_NAME[name]).filter(tmpl=>
      tmpl && tmpl.tier<=cfg.maxPackTier && tmpl.abilities?.includes('gangPower') &&
      monsterStrength(tmpl)<=playerStrength*cfg.maxPackStrengthRatio &&
      (currentZ===0 ? enemyBiomes(tmpl).some(b=>!b.startsWith('z-') && b!=='cave') :
        nativeUnderground ? nativeUnderground.has(tmpl.name) :
        enemyBiomes(tmpl).includes('cave') || enemyDepthBiomeEligible(tmpl,currentZ)))
    if (!templates.length) return []
    const entrances = spawnEntrances()
    const region=currentZ===0 ? surfaceRegion(player.x,player.y).key:null
    const dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    if(currentZ<0)invalidateUndergroundFov()
    const options=[]
    for(const tmpl of templates) {
      const queue=[{x:player.x,y:player.y,d:0}],seen=new Set([keyXY(player.x,player.y)])
      const sites=new Map()
      for(let i=0;i<queue.length;i++) {
        const {x,y,d}=queue[i]
        if(d>=cfg.minSpawnDistance && d<=cfg.maxSpawnDistance &&
           (!region || (surfaceRegion(x,y).key===region &&
             sanctuaryDistance(x,y)>FLEE_DISTANCE && enemyBiomes(tmpl).includes(map[y]?.[x]))) &&
           (currentZ===0 ? !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) :
             !undergroundTileVisible(x,y)) &&
           !occupied.has(keyXY(x,y)) &&
           !npcs.some(n=>n.x===x&&n.y===y&&(currentZ===0||onCurrentLevel(n))) &&
           !groundItemAt(x, y) &&
           !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
           entrances.every(pos=>Math.max(Math.abs(pos.x-x),Math.abs(pos.y-y))>cfg.minEntranceDistance) &&
           separateFromAdaptiveThreats(x,y) &&
           DungeonTraps.safeSpawn(x,y,currentZ,kind) && !Mining.blocksPathAt(x,y))
          sites.set(keyXY(x,y),{x,y})
        if(d>=cfg.maxSpawnDistance)continue
        for(const [dx,dy] of dirs){
          const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
          if(seen.has(k)||!TILE[map[ny]?.[nx]]?.walk||Mining.blocksPathAt(nx,ny)||
             !enemyCanTraverse(tmpl,nx,ny) ||
             (region && surfaceRegion(nx,ny).key!==region))continue
          seen.add(k);queue.push({x:nx,y:ny,d:d+1})
        }
      }
      const groups=[]
      for(const anchor of sites.values()) {
        const companions=[]
        for(let dy=-cfg.maxCompanionDistance;dy<=cfg.maxCompanionDistance;dy++)
          for(let dx=-cfg.maxCompanionDistance;dx<=cfg.maxCompanionDistance;dx++){
            if(!dx&&!dy)continue
            const site=sites.get(keyXY(anchor.x+dx,anchor.y+dy))
            if(site)companions.push(site)
          }
        if(companions.length<cfg.groupSize-1)continue
        groups.push([anchor,...companions.slice(0,cfg.groupSize-1)])
        if(groups.length>=cfg.maxCandidateSites)break
      }
      if(groups.length)options.push({tmpl,groups})
    }
    return options
  }

  function spawnStrongEnemyPack(options) {
    if(!options?.length||completed('strong_enemy_hunter'))return false
    const {tmpl,groups}=pick(options),positions=pick(groups)
    const kind=currentLevelKind(), caveIndex=kind==='surface'?-1:currentCave
    if(availableThreatSlots(kind,currentZ,caveIndex)<1)return false
    const created=[]
    for(const pos of positions){
      const enemy={name:`Opportunist ${tmpl.name}`,baseName:tmpl.name,
        adaptiveEventId:'strong_enemy_hunter',tier:tmpl.tier,
        humanoid:!!tmpl.humanoid,family:tmpl.family,
        hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
        grace:tmpl.grace,aggro:tmpl.aggro??AGGRO_RANGE,
        abilities:[...(tmpl.abilities||[])],wander:tmpl.wander,
        x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
        level:currentZ,levelKind:kind,caveIndex,alive:true,aware:false,alarmed:false,
        equipment:null}
      // Assign existing shooters their native ranged role and ammunition, but
      // do not roll strengthening equipment: every member stays individually
      // weaker than the player at this checkpoint.
      initializeEnemyShooter(enemy)
      addEnemy(enemy);occupied.add(keyXY(pos.x,pos.y));created.push(enemy)
    }
    if(!recordThreat('strong_enemy_hunter',kind,currentZ,caveIndex)){
      for(const e of created)occupied.delete(keyXY(e.x,e.y))
      enemies=enemies.filter(e=>!created.includes(e));return false
    }
    log('A pack of opportunists has gathered to test your appetite for dangerous fights.', 'bad')
    return true
  }

  function spawnLastSurvivor(options) {
    if (!options.length || completed('last_survivor')) return false
    // The most slaughtered *placeable* species wins. Selection and placement
    // happen only at this scheduled checkpoint, using gameplay RNG.
    const {tmpl,groups}=options[0], positions=pick(groups), cfg=config.events.last_survivor
    const levelKind=currentLevelKind(), caveIndex=levelKind==='surface' ? -1 : currentCave
    if (availableThreatSlots(levelKind,currentZ,caveIndex)<1) return false
    // Rolled once when this actual band spawns; the full name lives on the
    // persistent enemy entity, while baseName stays the species identifier.
    const leaderName = pick(monsterNames)
    const created=[]
    for (let i=0;i<positions.length;i++) {
      const pos=positions[i], leader=i===0
      const enemy={name:leader?`${leaderName}, Last Survivor`:tmpl.name,
        baseName:tmpl.name,prefix:leader?'Champion':null,adaptiveEventId:'last_survivor',
        tier:tmpl.tier,humanoid:!!tmpl.humanoid,
        hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
        grace:tmpl.grace,aggro:tmpl.aggro??AGGRO_RANGE,
        abilities:[...(tmpl.abilities||[])],
        x:pos.x,y:pos.y,homeX:pos.x,homeY:pos.y,homeTileType:map[pos.y][pos.x],
        level:currentZ,levelKind,caveIndex,alive:true,aware:false,equipment:null}
      if (leader) {
        enemy.prefixBase=prefixBaseStats(enemy)
        applyEnemyPrefix(enemy,cfg.leaderPrefix)
      }
      prepareEnemyEquipment(enemy)
      if (leader) {
        enemy.hp=Math.max(1,Math.round(enemy.hp*cfg.leaderHpMultiplier))
        enemy.maxHp=enemy.hp
      }
      addEnemy(enemy)
      occupied.add(keyXY(pos.x,pos.y))
      created.push(enemy)
    }
    if (!recordThreat('last_survivor',levelKind,currentZ,caveIndex)) {
      for (const e of created) occupied.delete(keyXY(e.x,e.y))
      enemies=enemies.filter(e=>!created.includes(e))
      return false
    }
    log(`The ${tmpl.name} you have hunted are gathering. A Last Survivor has rallied the remaining fighters.`, 'bad')
    return true
  }

  // Forest foraging already uses persistent unique surface coordinates. No
  // parallel kill/forage ledger is needed; 70 empty harvests also count.
  function forestSpiritEntity() {
    const enemy = encounterActor('forest_spirit')
    return enemy?.hp > 0 ? enemy : null
  }

  // Breadth-first traversal from the player's current connected component.
  // Initial manifestation requires forest; after a retreat the spirit may
  // return outside forests, as a consequence that follows the character.
  function forestSpiritSites(forestOnly) {
    if (currentZ !== 0) return []
    const cfg = config.events.forest_spirit, dirs = [[0,-1],[1,0],[0,1],[-1,0]]
    const queue=[{x:player.x,y:player.y,d:0}],seen=new Set([keyXY(player.x,player.y)])
    const entrances = spawnEntrances()
    const sites=[]
    for (let i=0;i<queue.length;i++) {
      const {x,y,d}=queue[i], tile=map[y]?.[x]
      if(d>=cfg.minSpawnDistance && d<=cfg.maxSpawnDistance &&
          (!forestOnly || tile===cfg.initialBiome) &&
          sanctuaryDistance(x,y)>FLEE_DISTANCE &&
          !(x>=camX && x<camX+VIEW_W && y>=camY && y<camY+VIEW_H) &&
          !occupied.has(keyXY(x,y)) &&
          !npcs.some(n=>n.x===x && n.y===y) &&
          !groundItemAt(x, y) &&
          !CAVE_TRANSITION_TILES.has(tile) && !Mining.blocksPathAt(x,y) &&
          entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>cfg.minEntranceDistance) &&
          DungeonTraps.safeSpawn(x,y,0,'surface') &&
          separateFromAdaptiveThreats(x,y) &&
          !enemies.some(e=>e.alive && onCurrentLevel(e) && e.x===x && e.y===y)) {
        sites.push({x,y})
        if (sites.length>=cfg.maxCandidateSites) break
      }
      if(d>=cfg.maxSpawnDistance)continue
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
        if(seen.has(k) || !TILE[map[ny]?.[nx]]?.walk ||
            Mining.blocksPathAt(nx,ny) || CAVE_TRANSITION_TILES.has(map[ny]?.[nx]) ||
            !enemyCanTraverse(ENEMY_TEMPLATE_BY_NAME[cfg.enemy],nx,ny))continue
        seen.add(k);queue.push({x:nx,y:ny,d:d+1})
      }
    }
    return sites
  }

  function spawnForestSpirit(sites) {
    if (!sites.length || completed('forest_spirit') || currentZ!==0 ||
        availableThreatSlots('surface',0,-1)<1) return false
    const tmpl=ENEMY_TEMPLATE_BY_NAME[config.events.forest_spirit.enemy],site=pick(sites)
    const enemy={name:tmpl.name,baseName:tmpl.name,adaptiveEventId:'forest_spirit',
      level:0,levelKind:'surface',caveIndex:-1,alive:true,aware:true,
      alarmed:true,alarmedZ:0,alarmedLevelKind:'surface',forestSpiritDormant:false,
      hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
      grace:tmpl.grace,tier:tmpl.tier,aggro:tmpl.aggro,humanoid:false,
      abilities:[...tmpl.abilities],x:site.x,y:site.y,homeX:site.x,homeY:site.y,
      homeTileType:map[site.y][site.x],equipment:null,wander:'roam',summonedTurn:turnCount}
    addEnemy(enemy);occupied.add(keyXY(site.x,site.y))
    if(!recordThreat('forest_spirit','surface',0,-1)) {
      enemies=enemies.filter(e=>e!==enemy);occupied.delete(keyXY(site.x,site.y))
      return false
    }
    state.forestSpiritRestTurns=0;state.forestSpiritLastSurfaceTurn=turnCount
    log('The forest remembers every grove you stripped. Its spirit is hunting you.', 'bad')
    return true
  }

  function withdrawForestSpirit(enemy) {
    if (!enemy || enemy.forestSpiritDormant || !enemy.alive) return
    if (currentZ===0) occupied.delete(keyXY(enemy.x,enemy.y))
    enemy.forestSpiritDormant=true
    enemy.aware=false;enemy.alarmed=false
    enemy.alarmedZ=null;enemy.alarmedLevelKind=null
    state.forestSpiritRestTurns=0
    state.forestSpiritLastSurfaceTurn=turnCount
    debugEvent('Forest Spirit lost the trail; 100 surface turns before it can return.')
  }

  function tickForestSpirit() {
    if (currentZ!==0 || state.forestSpiritLastSurfaceTurn===turnCount) return
    state.forestSpiritLastSurfaceTurn=turnCount
    const enemy=forestSpiritEntity()
    if (!enemy) return
    if (!enemy.forestSpiritDormant) {
      if (!enemy.aware) withdrawForestSpirit(enemy)
      return
    }
    state.forestSpiritRestTurns++
    const cfg=config.events.forest_spirit
    if (state.forestSpiritRestTurns<cfg.returnSurfaceTurns ||
        (state.forestSpiritRestTurns-cfg.returnSurfaceTurns)%cfg.returnRetryInterval!==0)return
    const sites=forestSpiritSites(false)
    if (!sites.length)return
    const site=pick(sites)
    // Exactly the old actor: HP, identity and status remain. No second
    // encounter slot, duplicate drops or restored health.
    enemy.x=site.x;enemy.y=site.y;enemy.homeX=site.x;enemy.homeY=site.y
    enemy.homeTileType=map[site.y][site.x]
    enemy.forestSpiritDormant=false;enemy.aware=true;enemy.alarmed=true
    enemy.alarmedZ=0;enemy.alarmedLevelKind='surface';enemy.summonedTurn=turnCount
    occupied.add(keyXY(site.x,site.y))
    state.forestSpiritRestTurns=0
    log('A familiar green glow rises on the horizon. The Forest Spirit has found you again.', 'bad')
  }

  function takeForestSpiritTurn(enemy) {
    if (!active() || currentZ!==0 || enemy?.adaptiveEventId!=='forest_spirit' ||
        enemy.forestSpiritDormant || !enemy.alive || !enemy.aware) return false
    const distance=Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))
    if(distance<=Math.max(ATTACK_RANGE,effectiveAggroRange(enemy)))return false
    if(chance(speedChaseChance(playerSpd()-enemySpd(enemy)))) {
      withdrawForestSpirit(enemy)
      return true
    }
    const {idleChance,roamChance}=config.events.forest_spirit.pursuit,roll=rng()
    if(roll<idleChance)return true
    if(roll<idleChance+roamChance) {
      const sites=[]
      for(const [dx,dy] of DIRS8) {
        const x=enemy.x+dx,y=enemy.y+dy
        if(!enemyCanPathThrough(enemy,x,y) || occupied.has(keyXY(x,y)) ||
            enemyWanderTrapBlocked(enemy,map,x,y) || x===player.x && y===player.y)continue
        sites.push({x,y})
      }
      if(sites.length)enemyStepTowardPlayer(enemy,pick(sites))
      return true
    }
    const step=enemyFindStep(enemy,true)
    if(step)enemyStepTowardPlayer(enemy,step)
    return true
  }

  function activeAdaptivePursuit() {
    return enemies.some(e=>e.alive && e.hp>0 && onCurrentLevel(e) &&
      ['low_hp_carrion','reckless_fighter'].includes(e.adaptiveEventId))
  }

  function spawnAdaptiveHunter(id,options) {
    if(!options.length || (id !== 'beast_hunter' && activeAdaptivePursuit()) ||
        completed(id))return false
    const choice=pick(options),base=choice.tmpl,spot=pick(choice.sites)
    const cfg=config.events[id],isGraceful=id==='reckless_fighter',
      isBeastHunter=id==='beast_hunter'
    const hp=isGraceful ? Math.max(Math.round(base.hp*cfg.hpMultiplier),
      Math.round(playerMaxHp()*cfg.minPlayerHpMultiplier)) : base.hp
    const title=isGraceful?'Graceful':isBeastHunter?'Hunting':'Carrion'
    const enemy={baseName:base.name,name:`${title} ${base.name}`,
      prefix:title,adaptiveEventId:id,
      tier:base.tier,humanoid:false,family:base.family,
      hp,maxHp:hp,
      atk:isGraceful?Math.round(base.atk*cfg.atkMultiplier):base.atk,
      def:isGraceful?Math.round(base.def*cfg.defMultiplier):base.def,
      spd:base.spd,grace:isGraceful?Math.max(base.grace,playerGrace()+cfg.graceLead):base.grace,
      aggro:base.aggro??AGGRO_RANGE,
      abilities:[...(base.abilities||[])],
      x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:map[spot.y][spot.x],
      level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,
      alive:true,aware:true,alarmed:true,equipment:null,wander:'roam',summonedTurn:turnCount}
    if(!isGraceful && !isBeastHunter && !enemy.abilities.includes('carrionInstinct'))
      enemy.abilities.push('carrionInstinct')
    enemy.prefixBase={hp:base.hp,atk:base.atk,def:base.def,spd:base.spd,aggro:base.aggro??AGGRO_RANGE}
    addEnemy(enemy)
    occupied.add(keyXY(spot.x,spot.y))
    if(!recordThreat(id,currentLevelKind(),currentZ,currentCave)) {
      enemies=enemies.filter(e=>e!==enemy)
      occupied.delete(keyXY(spot.x,spot.y))
      return false
    }
    if(isGraceful)log(`A Graceful ${base.name} is hunting you. Its timing is frighteningly precise.`, 'bad')
    else if(isBeastHunter) {
      log(`The beasts have noticed your slaughter. A Hunting ${base.name} is tracking you!`, 'bad')
      spawnDamageNumber(player.x, player.y, 'HUNTED!', '#df9770', 0, 1200)
    } else log(`Something hungry for the wounded is following your scent: a Carrion ${base.name}.`, 'bad')
    return true
  }

  // The retaliation beast initially follows beyond normal AGGRO but obeys
  // the regular SPD-based chance of losing a chase. Invisibility/forest cover,
  // sanctuary and blocked routes are handled by the normal enemy turn first.
  // Once it gives up, it reverts to ordinary animal AI, not a permanent beacon.
  function takeBeastHunterTurn(enemy) {
    if (!active() || enemy?.adaptiveEventId !== 'beast_hunter' ||
        !enemy.alive || enemy.hp <= 0 || !onCurrentLevel(enemy) || !enemy.aware)
      return false
    const distance = Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))
    if (distance <= Math.max(ATTACK_RANGE,effectiveAggroRange(enemy))) return false
    const escapeChance = speedChaseChance(playerSpd()-enemySpd(enemy))
    if (escapeChance > 0 && chance(escapeChance)) {
      enemy.aware = false
      enemy.alarmed = false
      enemy.alarmedZ = null
      enemy.alarmedLevelKind = null
      if (enemyIsVisibleOnMainView(enemy))
        spawnDamageNumber(enemy.x,enemy.y,'Lost scent','#bccebb')
      return false
    }
    // Same movement rhythm as far wandering: 40% idle, 20% attempt a
    // non-directed wander and 40% purposeful tracking. Never fall through to
    // normal always-toward-player AI while still on the distant trail.
    const roll = rng(), behavior = config.events.beast_hunter.pursuit
    if (roll < behavior.idleChance) return true
    if (roll < behavior.idleChance + behavior.roamChance) {
      const options=[]
      for (const [dx,dy] of DIRS8) {
        const x=enemy.x+dx,y=enemy.y+dy
        if (!enemyCanPathThrough(enemy,x,y) || occupied.has(keyXY(x,y)) ||
            enemyWanderTrapBlocked(enemy,map,x,y) ||
            (x===player.x && y===player.y)) continue
        options.push({x,y})
      }
      if (options.length) enemyStepTowardPlayer(enemy,pick(options))
      return true
    }
    const step = enemyFindStep(enemy,true)
    if (step) enemyStepTowardPlayer(enemy,step)
    return true
  }

  // These special hunters track the player outside ordinary aggression range.
  // Do not bypass invisibility, sanctuary, blocked paths or enemy-turn rules.
  function takeAdaptiveHunterTurn(enemy) {
    if(!active() || !['low_hp_carrion','reckless_fighter'].includes(enemy?.adaptiveEventId) ||
        !enemy.alive || enemy.hp<=0 || !onCurrentLevel(enemy))return false
    const distance=Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))
    if(distance<=Math.max(ATTACK_RANGE,effectiveAggroRange(enemy)))return false
    const step=enemyFindStep(enemy,true)
    if(!step)return false
    enemy.aware=true
    enemy.alarmed=true
    enemyStepTowardPlayer(enemy,step)
    return true
  }

  // The first two attempts are due at 500/1,000 real walking steps OR on
  // arriving at ruin floors 2/3, whichever happens first for each milestone.
  // Later attempts are due at every further 500 walking steps. Count only
  // actual movement (player.steps), not waits, mining, animations or turns.
  // When two overdue milestones coincide, consume both but make only one
  // encounter-selection pass; a floor arrival must never produce extra RNG
  // rolls just because the player skipped an intermediate stair.
  function claimActivationCheck() {
    if (!active()) return 0
    const schedule = config.activationChecks
    const floor = fortLevel()
    const before = state.activationChecks
    while (true) {
      const next = state.activationChecks + 1
      const fromSteps = player.steps >= next * schedule.stepsPerCheck
      const fromRuins = next <= schedule.earlyRuinsFloors.length && floor &&
        floor.dungeonFloor >= schedule.earlyRuinsFloors[next - 1]
      if (!fromSteps && !fromRuins) break
      state.activationChecks++
    }
    if (before !== state.activationChecks) {
      syncTriggerFlags()
      debugEvent(`Checkpoint ${state.activationChecks} at step ${player.steps}, ${currentLevelKind()} ${currentZ}.`)
    }
    return before !== state.activationChecks ? state.activationChecks : 0
  }

  // A movement on the surface also enters new ordinary-thief regions.
  // Periodic adaptive checks work on EVERY level, not just the overworld.
  function onPlayerMoved() {
    if (!active()) return false
    const thief = currentZ === 0 && tryOrdinaryThiefEncounter()
    const checkpoint = claimActivationCheck()
    if (checkpoint) observeExplorerExploration()
    syncTriggerFlags()
    return (checkpoint ? runOptionalEncounterCheck(checkpoint) : false) || thief
  }

  // Pick only path-connected, clear floor tiles without inspecting random
  // names or rolling loot. Failed placements can be retried on a future visit.
  function adaptiveGearRewardSites(settings) {
    const queue=[{x:player.x,y:player.y}],seen=new Set([keyXY(player.x,player.y)])
    const sites=[],dirs=[[0,-1],[1,0],[0,1],[-1,0]]
    invalidateUndergroundFov()
    const passable=(x,y) => !!TILE[map[y]?.[x]]?.walk &&
      !Mining.blocksPathAt(x,y) && !CAVE_TRANSITION_TILES.has(map[y]?.[x]) &&
      !isClosedDungeonDoorTile(map[y][x]) && !isLockedDungeonDoorTile(map[y][x]) &&
      map[y]?.[x] !== 'water' && map[y]?.[x] !== 'lava' &&
      !DungeonTraps.isTrigger(map[y]?.[x])
    const entrances = spawnEntrances()
    for(let i=0;i<queue.length;i++) {
      const {x,y}=queue[i]
      if(Math.max(Math.abs(x-player.x),Math.abs(y-player.y))>=settings.minPlayerDistance &&
          !undergroundTileVisible(x,y) && passable(x,y) &&
          !occupied.has(keyXY(x,y)) &&
          !groundItemAt(x, y) &&
          !npcs.some(n=>n.x===x&&n.y===y&&(n.level===currentZ||(currentZ===0&&n.level==null))) &&
          !enemies.some(e=>e.alive&&onCurrentLevel(e)&&e.x===x&&e.y===y) &&
          entrances.every(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))>settings.minStairDistance) &&
          DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind())) {
        sites.push({x,y})
        if(sites.length>=settings.maxCandidateSites)break
      }
      for(const [dx,dy] of dirs) {
        const nx=x+dx,ny=y+dy,k=keyXY(nx,ny)
        if(seen.has(k) || !passable(nx,ny))continue
        seen.add(k);queue.push({x:nx,y:ny})
      }
    }
    return sites
  }

  // Compare points invested beyond the human starting attributes plus
  // racial modifiers. Free level-based SPD/GRACE growth must never override
  // the player's actual build; equipment and temporary buffs are excluded.
  function shieldAttunement() {
    const focus={atk:player.baseAtk-2+raceBonus('atk'),
      def:player.baseDef+raceBonus('def'),
      spd:player.baseSpd-5+raceBonus('spd'),
      mf:player.baseMf+raceBonus('mf'),
      grace:raceGrace()}
    return config.events.neglected_shield.variantPriority.reduce((best,stat)=>
      focus[stat]>focus[best] ? stat : best, 'atk')
  }

  function tryNeglectedCombatGear() {
    if (!active() || completed('opposite_weapon') || completed('neglected_shield'))return false
    const floor=fortLevel()
    if(!floor || floor.dungeonFloor < floor.floorCount-1)return false
    const target=oppositeWeaponTarget(), shield=neglectedShieldEligible()
    const options=[]
    if(target)options.push('opposite_weapon')
    if(shield)options.push('neglected_shield')
    if(!options.length)return false
    const settings=config.events[options[0]]
    const sites=adaptiveGearRewardSites(settings)
    if(!sites.length)return false
    // Equal weighting when both behavior profiles qualify; do not consume RNG
    // to select a reward until a legal place for it has been established.
    const id=options.length===1?options[0]:pick(options)
    const cfg=config.events[id]
    const site=pick(sites)
    let item
    if(id==='opposite_weapon') {
      item=makeAdaptiveGearArtifact(pick(cfg.weaponPools[target]),cfg.artifactEffectId)
    } else {
      const variant=shieldAttunement()
      item=makeAdaptiveGearArtifact(cfg.shieldBase,cfg.artifactEffectId,cfg.variantBonuses[variant])
      item.adaptiveAttunement=variant
    }
    if(!dropRewardOnGround(id,item,site.x,site.y))return false
    markTrigger(id)
    state.completed.push(id)
    debugEvent(`Reward placed: ${id} on ruins floor ${floor.dungeonFloor}; shared reward claimed.`)
    log(id==='opposite_weapon'
      ? 'A strange weapon lies somewhere on this floor, crafted for a style you have neglected.'
      : 'An ancient shield lies abandoned in the ruins, attuned to your enduring strengths.', 'info')
    return true
  }

  // The Old Hunter's existing surface flood fill defines walkable terrain.
  // Count only reachable explored cells; edge visits use the separate game
  // achievements instead of counting areas revealed by hints or God Mode.
  function explorerExploration() {
    if (!active()) return {ready:false,seen:0,total:0,edges:[]}
    if (player.godMode || !discovered || !surfaceMap || !spawnPoint) return {ready:false,seen:0,total:0,edges:[]}
    const cfg=config.events.explorer_galleries
    const reachable=hunterReachableSurfaceTiles()
    let total=0,seen=0
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++) {
      if(!reachable[y*MAP_W+x])continue
      total++
      if(discovered[y]?.[x])seen++
    }
    // Use the game's existing *visited* edge achievements, not merely
    // fog-of-war revealed around an edge by a map hint or another effect.
    const opposite=(worldEdgesReached.west && worldEdgesReached.east ||
      worldEdgesReached.north && worldEdgesReached.south)
    return {ready:total>0 && seen/total>=cfg.minReachableExploredFraction && opposite,
      seen,total,edges:Object.keys(worldEdgesReached).filter(k=>worldEdgesReached[k])}
  }

  function observeExplorerExploration() {
    if (!active() || state.triggerFlags.explorer_galleries || player.godMode) return
    const progress=explorerExploration()
    if (progress.ready) markTrigger('explorer_galleries')
  }

  // This is a persistent *floor modifier*, not a one-off encounter. Its two
  // extra archers do not consume special-threat slots or reroll on revisits.
  function tryExplorerGalleries() {
    if (!active() || player.godMode) return false
    const floor=fortLevel()
    if(!floor) return false
    observeExplorerExploration()
    if (!state.triggerFlags.explorer_galleries) return false
    const cfg=config.events.explorer_galleries
    const rooms=(floor.rooms || []).filter(room=>room.gallery).slice()
      .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
    let changed=false
    for(const room of rooms) {
      const key=`chain:${currentZ}:${room.id}`
      if(Object.prototype.hasOwnProperty.call(state.explorerGalleryRolls,key))continue
      const guards=enemies.filter(enemy=>enemy.alive && enemy.level===currentZ &&
        (enemy.levelKind || 'chain')==='chain' && enemy.dungeonRoomId===room.id &&
        ['gallery0','gallery1'].includes(enemy.dungeonRole) && enemyIsShooter(enemy))
      // A previously cleared gallery never mysteriously resurrects its crew.
      if(!guards.length) {state.explorerGalleryRolls[key]=false;continue}
      const candidates=[0,1].map(side=>(room.gallery.bays?.[side] || []).filter(p=>
        map[p.y]?.[p.x]==='marble' && !occupied.has(keyXY(p.x,p.y)) &&
        !groundItemAt(p.x, p.y) &&
        !npcs.some(n=>n.x===p.x&&n.y===p.y) &&
        DungeonTraps.safeSpawn(p.x,p.y,currentZ,currentLevelKind()) &&
        room.gallery.fireTargets.some(target=>dungeonClearProjectileLine(map,p,target))))
      // A temporarily obstructed room remains unrolled until a later visit.
      if(candidates.some(side=>!side.length))continue
      if(!chance(cfg.reinforcementChance)) {
        state.explorerGalleryRolls[key]=false
        debugEvent(`Explorer gallery ${key}: 85% reinforcement roll failed.`)
        continue
      }
      // Preserve the baseline 10 ranged defenders. Upgrading an existing
      // shooter rather than spawning an extra captain keeps total size at 12.
      const captain=guards.find(e=>e.prefix==='Champion') ||
        guards.find(e=>!e.prefix) || guards[0]
      const template=ENEMY_TEMPLATE_BY_NAME[captain.baseName]
      const ability=shooterAbilityForTemplate(template)
      if(!template || !ability)continue
      if(captain.prefix!=='Champion') {
        const hpFraction=captain.maxHp>0 ? captain.hp/captain.maxHp : 1
        if(captain.prefix && captain.prefixBase) {
          for(const [stat,value] of Object.entries(captain.prefixBase))
            if(['hp','maxHp','atk','def','spd','aggro'].includes(stat))
              captain[stat==='hp'?'maxHp':stat]=value
        }
        captain.prefix=cfg.leaderPrefix
        captain.prefixBase=prefixBaseStats(captain)
        applyEnemyPrefix(captain,cfg.leaderPrefix)
        // Keep the existing wound percentage, even when replacing a prefix.
        captain.hp=Math.max(1,Math.min(captain.maxHp,
          Math.round(captain.maxHp*hpFraction)))
        captain.name=`${cfg.leaderPrefix} ${captain.baseName}`
      }
      // One additional shooter per side, inside the actual firing cells.
      for(let side=0;side<cfg.extraShooters;side++) {
        const site=pick(candidates[side])
        const guard={name:template.name,baseName:template.name,
          tier:template.tier,level:currentZ,levelKind:'chain',caveIndex:-1,
          hp:template.hp,maxHp:template.hp,atk:template.atk,def:template.def,
          spd:template.spd,grace:template.grace,aggro:template.aggro ?? AGGRO_RANGE,
          abilities:[...(template.abilities||[])],humanoid:!!template.humanoid,
          x:site.x,y:site.y,homeX:site.x,homeY:site.y,
          homeTileType:map[site.y][site.x],alive:true,
          equipment:null,prefix:null,shooterAbility:ability,
          shotsRemaining:RANGED_CONFIG.startingShots,shooterMode:'ranged',
          dungeonRole:`galleryReinforcement${side}`,
          dungeonRoomId:room.id,adaptiveEventId:'explorer_galleries'}
        prepareEnemyEquipment(guard)
        addEnemy(guard)
        occupied.add(keyXY(site.x,site.y))
      }
      state.explorerGalleryRolls[key]=true
      changed=true
      debugEvent(`Explorer gallery ${key}: Champion promoted and two archers added.`)
      log('The far-travelled adventurer finds a prison gallery reinforced with veteran guards.', 'bad')
    }
    return changed
  }

  // Optional Merchant quest is dialogue-driven, not a random encounter. The
  // character must reach level 10 *before* visiting the dwarven fort.
  function fortQuestOption() {
    if (!active() || completed('fort_quest')) return null
    if (state.fortQuestAccepted) return (player.inventory || []).some(item =>
      item.kind === config.events.fort_quest.itemKind) ? 'turnin' : 'active'
    return !state.fortQuestVisited && player.lvl >= config.events.fort_quest.minPlayerLevel
      ? 'offer' : null
  }

  function interactFortQuest() {
    const option=fortQuestOption()
    if (!option || currentZ!==0) return false
    const cfg=config.events.fort_quest
    if (option==='offer') {
      state.fortQuestAccepted=true
      markTrigger('fort_quest')
      // The merchant's quest marks a real entrance, rather than creating an
      // arbitrary new landmark; no RNG is drawn and the normal rumor survives.
      if (dwarvenRuin && Number.isInteger(dwarvenRuin.x) && Number.isInteger(dwarvenRuin.y))
        revealArea(dwarvenRuin.x,dwarvenRuin.y,cfg.mapRevealRadius)
      log('Merchant says: You have seen enough of this world to handle a real errand. Find the Dwarven Trade Ledger on the second level of the dwarven ruins, two floors beneath the fort (depth -5). Bring it back, and I will pay you well. I have marked the fort on your map.', 'info')
    } else if (option==='active') {
      log('Merchant says: The Dwarven Trade Ledger lies on the second level of the dwarven ruins (depth -5). I will pay when you bring it to me.', 'info')
    } else {
      const index=player.inventory.findIndex(item=>item.kind===cfg.itemKind)
      if (index<0) return false
      player.inventory.splice(index,1)
      player.gold+=cfg.rewardGold
      state.completed.push('fort_quest')
      debugEvent('Fort Quest completed and paid; no repeat reward.')
      log(`Merchant says: The old trade records! That is exactly what I needed. Here are your ${cfg.rewardGold} gold, as promised.`, 'good')
    }
    return true
  }

  // A single physical quest pickup, placed on a reachable path on z:-5.
  // Never hide it behind a locked door or in a disconnected chamber.
  // If no legal spot exists on arrival, retry when revisiting the same floor.
  function tryPlaceFortQuestLedger() {
    if (!active() || !state.fortQuestAccepted || completed('fort_quest')) return false
    const cfg=config.events.fort_quest
    const floor=fortLevel()
    if (currentZ!==cfg.targetZ || floor?.dungeonFloor!==2) return false
    if (player.inventory.some(item=>item.kind===cfg.itemKind) ||
        groundItems.some(item=>item.kind==='droppeditem' && item.item?.kind===cfg.itemKind)) return false
    const distances=lureDistances(player,cfg.maxPathSteps)
    const sites=[]
    for (const [key,steps] of distances) {
      if (steps < cfg.minPathSteps) continue
      const [x,y]=key.split(',').map(Number),tile=map[y]?.[x]
      if (!TILE[tile]?.walk || CAVE_TRANSITION_TILES.has(tile) ||
          occupied.has(key) || Mining.blocksPathAt(x,y) ||
          !DungeonTraps.safeSpawn(x,y,currentZ,currentLevelKind()) ||
          groundItemAt(x, y)) continue
      sites.push({x,y,steps})
    }
    if (!sites.length) return false
    // Deterministic farthest reachable position. No per-floor random roll or
    // placement after the player has already picked it up.
    sites.sort((a,b)=>b.steps-a.steps || a.y-b.y || a.x-b.x)
    const target=sites[0]
    if (!dropRewardOnGround('fort_quest',createItem(cfg.itemKind),target.x,target.y)) return false
    log("The Merchant's ledger is hidden somewhere on this level of the dwarven ruins.", 'info')
    return true
  }

  function onFloorChanged(transition = null) {
    if (!active()) return false
    if (currentZ <= -3 && currentLevelKind()==='chain') state.fortQuestVisited=true
    const ledger=tryPlaceFortQuestLedger()
    // The player left the wounded enemy on another floor. Resolve the same
    // escape before checking new-floor encounters or resetting combat state.
    if (transition && state.unfinishedFightCandidates.length) finishUnfinishedFight(true)
    // Any descent breaks the forest spirit's pursuit. Surface turns alone
    // count toward reacquiring the trail; leaving again resets the wait.
    if (transition?.fromZ===0 && currentZ!==0) withdrawForestSpirit(forestSpiritEntity())
    let caveAmbush=false
    if (transition?.fromZ===0 && ordinaryCaveHere()) {
      state.caveVisit={caveIndex:currentCave,turns:0,lastTurn:turnCount,
        kills:{Goblin:0,Kobold:0,Skink:0}}
    } else if (transition?.fromZ===-1 && currentZ===0 &&
               Number.isInteger(transition.fromCave) && transition.fromCave>=0) {
      caveAmbush=tryUnusedScrollAmbush(transition.fromCave)
    }
    if (state.depthGuardianWarning &&
        (state.depthGuardianWarning.z !== currentZ || !currentMineLevel()))
      state.depthGuardianWarning=null
    // A floor transition cannot complete a swimming crossing.
    if (state.waterCrossing?.z !== currentZ) state.waterCrossing = null
    onWorldTurn()
    const galleryReinforcements = tryExplorerGalleries()
    if (!fortLevel()) observeExplorerExploration()
    const floorId = currentZ < 0 ? `${currentLevelKind()}:${currentZ}` : null
    const firstVisit = floorId && !state.visitedUndergroundFloors.includes(floorId)
    // Remember first access even when the reward has not yet qualified;
    // returning to an already explored level is never a new opportunity.
    if (firstVisit) state.visitedUndergroundFloors.push(floorId)
    markEarlyDescent(firstVisit)
    const descent=tryEarlyDescentRemains()
    const thief = tryOrdinaryThiefEncounter()
    const cleaning = firstVisit && tryIgnoredMushroomCluster()
    const note = tryUnreadScrollNote()
    const adaptiveGear = tryNeglectedCombatGear()
    // Rewards and Nemesis are independent of the normal two-threat budget.
    const lure=trySelfFireballLure()
    const nemesis=tryNemesis()
    const checkpoint = claimActivationCheck()
    syncTriggerFlags()
    const optional = checkpoint ? runOptionalEncounterCheck(checkpoint) : false
    return optional || ledger || galleryReinforcements || caveAmbush || descent || thief || cleaning || note || adaptiveGear || nemesis || lure
  }

  // Optional encounters run only at the scheduled milestones. Mandatory
  // Nemesis, first-visit loot, thieves and action-triggered responses are
  // processed by their normal hooks and do not consume these milestones.
  function runOptionalEncounterCheck(checkpoint) {
    if (!active()) return false
    spawnSearch = {}
    try { return resolveOptionalEncounterCheck(checkpoint) }
    finally { spawnSearch = null }
  }

  function resolveOptionalEncounterCheck(checkpoint) {
    const healingRemains = tryUnusedHealingRemains()
    const strangePotion = tryStrangeGreenPotion()
    const trapReward = tryTrapLure()
    const waterReward = tryDrowningLure()
    const floor=fortLevel()
    if (!floor) {
      // Other habitats activate on level arrival, independently of the ruins
      // probability curve, but share their local two-threat lifetime budget.
      let spawned=false
      const tried=new Set()
      while (availableThreatSlots(currentLevelKind(),currentZ,currentCave)>0) {
        spawnSearch.threats = null // A returning actor may have moved without changing array length.
        const sites=!tried.has('mushroom_prophet') ? mushroomProphetSites() : []
        const hungry=!tried.has('hungry_monster') ? hungryMonsterOptions() : []
        const goldSites=!tried.has('gold_imp') ? goldImpSpawnSites() : []
        const carrionOptions = !tried.has('low_hp_carrion') ? adaptiveHunterOptions('low_hp_carrion') : []
        const gracefulOptions = !tried.has('reckless_fighter') ? adaptiveHunterOptions('reckless_fighter') : []
        const beastOptions = !tried.has('beast_hunter') ? adaptiveHunterOptions('beast_hunter') : []
        const survivorOptions = !tried.has('last_survivor') ? lastSurvivorOptions() : []
        const strongOptions = !tried.has('strong_enemy_hunter') ? strongEnemyPackOptions() : []
        const hiddenOptions = !tried.has('hidden_leader') ? hiddenLeaderOptions() : []
        const unfinishedOptions = !tried.has('unfinished_business') ? unfinishedBusinessOptions() : []
        const spiritSites = !tried.has('forest_spirit') && currentZ===0 &&
          !completed('forest_spirit') &&
          foragedTiles.size>=config.events.forest_spirit.minDistinctForagedForestTiles
          ? forestSpiritSites(true) : []
        const candidates=[]
        if (sites.length) candidates.push('mushroom_prophet')
        if (hungry.length) candidates.push('hungry_monster')
        if (goldSites.length) candidates.push('gold_imp')
        if (carrionOptions.length) candidates.push('low_hp_carrion')
        if (gracefulOptions.length) candidates.push('reckless_fighter')
        if (beastOptions.length) candidates.push('beast_hunter')
        if (survivorOptions.length) candidates.push('last_survivor')
        if (strongOptions.length) candidates.push('strong_enemy_hunter')
        if (hiddenOptions.length) candidates.push('hidden_leader')
        if (unfinishedOptions.length) candidates.push('unfinished_business')
        if (spiritSites.length) candidates.push('forest_spirit')
        if (!candidates.length) {
          if (!tried.size) debugEvent(`Checkpoint ${checkpoint}: no eligible placeable encounter in this habitat.`)
          break
        }
        debugEvent(`Checkpoint ${checkpoint}: eligible at this location: ${candidates.join(', ')}.`)
        const chosen=pick(candidates)
        tried.add(chosen)
        spawned=(chosen==='mushroom_prophet' ? spawnMushroomProphet(sites) :
          chosen==='gold_imp' ? spawnGoldImp(goldSites) :
          chosen==='low_hp_carrion' ? spawnAdaptiveHunter(chosen,carrionOptions) :
          chosen==='reckless_fighter' ? spawnAdaptiveHunter(chosen,gracefulOptions) :
          chosen==='beast_hunter' ? spawnAdaptiveHunter(chosen,beastOptions) :
          chosen==='last_survivor' ? spawnLastSurvivor(survivorOptions) :
          chosen==='strong_enemy_hunter' ? spawnStrongEnemyPack(strongOptions) :
          chosen==='hidden_leader' ? spawnHiddenLeader(hiddenOptions) :
          chosen==='unfinished_business' ? spawnUnfinishedBusiness(unfinishedOptions) :
          chosen==='forest_spirit' ? spawnForestSpirit(spiritSites) :
          spawnHungryMonster(hungry)) || spawned
      }
      return spawned || healingRemains || strangePotion || trapReward || waterReward
    }
    const key=floorKey('chain',currentZ,-1)
    let spawned=false
    // One chance gate for the first optional threat. A successful spawn can
    // earn another *independent* depth-weighted chance, up to the remaining
    // floor budget. Failed checks end this visit's attempts, preventing an
    // extra roll merely because the floor has two empty slots.
    while (availableThreatSlots('chain',currentZ,-1)>0) {
      spawnSearch.threats = null
      const prefix=!completed('fan_club') ? matchingEquippedPrefix() : null
      const clubs=prefix ? fanClubSpawnSites() : []
      const eaterSites=venomEaterEligible() && floor.dungeonFloor >= floor.floorCount-1
        ? adaptiveMonsterSpawnSites(floor,config.events.venom_eater,ENEMY_TEMPLATE_BY_NAME['Venom Eater']) : []
      const oculusSites=oculusEligible() && floor.dungeonFloor >= floor.floorCount-1
        ? adaptiveMonsterSpawnSites(floor,config.events.oculus,ENEMY_TEMPLATE_BY_NAME.Oculus) : []
      const ownerOptions=previousOwnerSpawnOptions(floor)
      const shieldSites=shieldHunterEligible() && floor.dungeonFloor >= floor.floorCount-1
        ? adaptiveMonsterSpawnSites(floor,config.events.undead_shield_hunter,
          ENEMY_TEMPLATE_BY_NAME[config.events.undead_shield_hunter.baseSpecies]) : []
      const prophetSites=mushroomProphetSites()
      const debtSites=floor.dungeonFloor >= floor.floorCount-1 ? debtCollectorSites(floor) : []
      const hungry=hungryMonsterOptions()
      const goldSites=goldImpSpawnSites()
      const carrionOptions=adaptiveHunterOptions('low_hp_carrion')
      const gracefulOptions=adaptiveHunterOptions('reckless_fighter')
      const survivorOptions=lastSurvivorOptions()
      const strongOptions=strongEnemyPackOptions()
      const hiddenOptions=hiddenLeaderOptions()
      const unfinishedOptions=unfinishedBusinessOptions()
      const candidates=[]
      if (prophetSites.length) candidates.push('mushroom_prophet')
      if (debtSites.length) candidates.push('debt_collector')
      if (clubs.length) candidates.push('fan_club')
      if (eaterSites.length) candidates.push('venom_eater')
      if (oculusSites.length) candidates.push('oculus')
      if (shieldSites.length) candidates.push('undead_shield_hunter')
      if (ownerOptions) candidates.push('previous_owner')
      if (hungry.length) candidates.push('hungry_monster')
      if (goldSites.length) candidates.push('gold_imp')
      if (carrionOptions.length) candidates.push('low_hp_carrion')
      if (gracefulOptions.length) candidates.push('reckless_fighter')
      if (survivorOptions.length) candidates.push('last_survivor')
      if (strongOptions.length) candidates.push('strong_enemy_hunter')
      if (hiddenOptions.length) candidates.push('hidden_leader')
      if (unfinishedOptions.length) candidates.push('unfinished_business')
      if (!candidates.length) {
        debugEvent(`Checkpoint ${checkpoint}: no eligible placeable ruins encounters.`)
        break
      }
      debugEvent(`Checkpoint ${checkpoint}: eligible ruins encounters: ${candidates.join(', ')}.`)
      // The next draw is identified by the currently eligible reaction set
      // and number of free slots. Recording failed second attempts also
      // blocks stair-hopping rerolls, including across save/replay.
      const free=availableThreatSlots('chain',currentZ,-1)
      const signature=`${checkpoint}:${candidates.slice().sort().join(',')}:${free}:placeable`
      if (state.floorChecks[key]===signature) break
      state.floorChecks[key]=signature
      if (!chance(fortChance(floor.dungeonFloor,floor.floorCount))) {
        debugEvent(`Ruins depth roll failed (chance ${Math.round(fortChance(floor.dungeonFloor,floor.floorCount)*100)}%).`)
        break
      }
      const chosen=candidates.length===1 ? candidates[0] : pick(candidates.slice().sort())
      const succeeded=chosen==='fan_club' ? spawnFanClub(prefix,clubs) :
        chosen==='venom_eater' ? spawnVenomEater(eaterSites) :
        chosen==='undead_shield_hunter' ? spawnShieldHunter(shieldSites) :
        chosen==='previous_owner' ? spawnPreviousOwner(ownerOptions) :
        chosen==='mushroom_prophet' ? spawnMushroomProphet(prophetSites) :
        chosen==='debt_collector' ? spawnDebtCollector(debtSites) :
        chosen==='hungry_monster' ? spawnHungryMonster(hungry) :
        chosen==='gold_imp' ? spawnGoldImp(goldSites) :
        chosen==='low_hp_carrion' ? spawnAdaptiveHunter(chosen,carrionOptions) :
        chosen==='reckless_fighter' ? spawnAdaptiveHunter(chosen,gracefulOptions) :
        chosen==='last_survivor' ? spawnLastSurvivor(survivorOptions) :
        chosen==='strong_enemy_hunter' ? spawnStrongEnemyPack(strongOptions) :
        chosen==='hidden_leader' ? spawnHiddenLeader(hiddenOptions) :
        chosen==='unfinished_business' ? spawnUnfinishedBusiness(unfinishedOptions) :
        spawnChampionOculus(oculusSites)
      if (!succeeded) break
      spawned=true
    }
    return spawned || healingRemains || strangePotion || trapReward || waterReward
  }

  return {onPlayerWoundedEnemy, onPlayerInitiatedStrongFight, takeHiddenLeaderTurn, onPlayerDied, onPlayerKilledBy, onVenomAttempt, onSelfFireballHit, onCombatAttack, onPlayerInvisibleHit,
    onEnemyKilled, onMushroomsCollected, onHerbalistServicesOpened, onHerbalistPurification, onWorldTurn, onScrollUsed,
    onScrollInventoryChanged, onPotionDrunk, strangePotionEffect, strangePotionConfusionTurns, humanoidHunterActive, beastMayInitiateCombat,
    onDwarvenRemainsSearched, onDwarvenRemainsGoldFound,
    tagDwarvenRemainsLoot,
    splitDwarvenRemainsLoot, pendingDebtCollector, debtCollectorDemand, resolveDebtCollector,
    onEnemyTurn, onCampfireLit, friendlyUninvitedGuestNearby, claimUninvitedGuestMeal,
    onHungryMonsterAttacked, takeHungryMonsterTurn, takeAdaptiveHunterTurn, takeBeastHunterTurn, takeForestSpiritTurn,
    shieldHunterArrowHit, shieldHunterRemaining,
    goldImpStealAmount, takeGoldImpTurn,
    onFloorChanged, onPlayerMoved, onNewSandDig, onMineMineralExtracted, onMineWallBroken,
    onPlayerTriggeredTrap, onWaterEntered, onWaterMoved, onDrowningDamage, onWaterExited,
    configure, active, reset, serialize, restore, setDebugTrolling, debugTrollingEnabled, syncTriggerFlags,
    completed, surfaceRegion, availableThreatSlots, recordThreat, dropRewardOnGround,
    tryNeglectedCombatGear, explorerExploration, tryExplorerGalleries,
    eligiblePreviousOwnerArtifacts, previousOwnerSpawnOptions, spawnPreviousOwner,
    onMerchantTransaction, onTempleClearanceKill, fortQuestOption, interactFortQuest, tryPlaceFortQuestLedger}
})()
