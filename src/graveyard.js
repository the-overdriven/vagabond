'use strict'

const Graveyard = (() => {
  const DEATH_COUNT_KEY = 'vagabond_death_count_'
  let visible = false
  let requestNumber = 0
  let replayActive = () => false
  let visibilityChanged = () => {}
  let filter = 'all'

  function newCharacterId() {
    return OnlineSupabase.newId() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  function reconcileDeathCount(player, worldSeed, died = false) {
    if (replayActive()) {
      if (died) player.deaths++
      return player.deaths
    }
    if (typeof player.characterId !== 'string' || !player.characterId) {
      player.characterId = `legacy-${JSON.stringify([worldSeed, player.name, player.race, player.permadeath])}`
    }
    const key = DEATH_COUNT_KEY + player.characterId
    let savedCount = 0
    try {
      const stored = localStorage.getItem(key)
      if (stored !== null) {
        const parsed = Number(stored)
        if (Number.isSafeInteger(parsed) && parsed >= 0) savedCount = parsed
        else console.warn('Invalid local Graveyard death count')
      }
    } catch (error) {
      console.warn('Could not read local Graveyard death count', error)
    }
    const currentCount = Number.isSafeInteger(player.deaths) && player.deaths >= 0 ? player.deaths : 0
    player.deaths = Math.max(currentCount, savedCount) + (died ? 1 : 0)
    try {
      localStorage.setItem(key, String(player.deaths))
    } catch (error) {
      console.warn('Could not save local Graveyard death count', error)
    }
    return player.deaths
  }

  function snapshotItem(item, statLine) {
    if (!item) return null
    const {kind, base, name, count, inscription, replayId, tier, mod, modAmt, effectId, identified,
      bonuses, curse, artifactSlot, maxHpPct, twoHanded, atk, def, spd, grace,
      speedPenalty, xpBonus} = item
    return {kind, base, name, count, inscription, replayId, tier, mod, modAmt, effectId, identified,
      atk, def, spd, grace, speedPenalty, xpBonus, stat_line: statLine(item),
      bonuses: bonuses ? {...bonuses} : undefined,
      curse: curse ? {...curse, types: curse.types?.slice()} : curse,
      artifactSlot, maxHpPct, twoHanded}
  }

  function snapshotEquipment(equip, statLine) {
    return Object.fromEntries(['weapon', 'armor', 'shield'].map(slot => [slot, snapshotItem(equip[slot], statLine)]))
  }

  function snapshotArtifacts(inventory, statLine) {
    return inventory.filter(item => item.kind === 'artifact').map(item => snapshotItem(item, statLine))
  }

  function snapshotStrongestEnemyKill(kill) {
    if (!kill) return null
    const statNames = ['atk', 'def', 'spd', 'grace']
    // Spawned enemy stats stay exact in saves/replays for ranking. Supabase's
    // death_strongest_enemy_check expects integers for all five uploaded numbers.
    if (typeof kill.name !== 'string' || !kill.name ||
        typeof kill.species !== 'string' || !kill.species ||
        !Number.isFinite(kill.tier) ||
        !statNames.every(stat => Number.isFinite(kill.stats?.[stat]))) {
      console.warn('Invalid strongest-kill snapshot; uploading death without the trophy')
      return null
    }
    const exactStrength = statNames.reduce((sum, stat) => sum + kill.stats[stat], 0)
    const strength = Math.round(exactStrength)
    const tier = Math.round(kill.tier)
    const stats = Object.fromEntries(statNames.map(stat => [stat, Math.round(kill.stats[stat])]))
    if (![strength, tier, ...Object.values(stats)].every(Number.isSafeInteger)) {
      console.warn('Out-of-range strongest-kill snapshot; uploading death without the trophy')
      return null
    }
    // Derive strength from exact stats, not an old saved strength field. It may
    // differ from the sum of independently rounded stats by one or two points.
    return {name: kill.name, species: kill.species, tier, strength, stats}
  }

  function recordDeath(snapshot) {
    // This guard precedes UUID generation, storage access, SDK loading and all network activity.
    if (replayActive() || !OnlineSupabase.onlineAvailable()) return
    const death_event_id = OnlineSupabase.newId()
    const player_id = OnlineSupabase.onlinePlayerId()
    if (!death_event_id || !player_id) return
    const record = {...snapshot,
      strongest_enemy_killed: snapshotStrongestEnemyKill(snapshot.strongest_enemy_killed),
      death_event_id, player_id,
      killed_at: new Date().toISOString(), game_version: self.VAGABOND_GAME_VERSION}
    // No await in the death path. Never retry or queue an offline death.
    OnlineSupabase.getOnlineClient().then(client => {
      if (!client || !OnlineSupabase.onlineAvailable()) return null
      return client.from('death_records').insert(record)
    }).then(result => { if (result?.error) console.warn('Graveyard submission unavailable') })
      .catch(() => console.warn('Graveyard submission unavailable'))
  }

  function status(message) {
    document.getElementById('graveyardStatus').textContent = message
  }

  function detail(label, value) {
    const line = document.createElement('div')
    line.textContent = `${label}: ${value ?? '-'}`
    return line
  }

  function gearLabel(item, fallback) {
    if (!item) return fallback || '-'
    const name = item.name || fallback || '-'
    return name + (typeof item.stat_line === 'string' && item.stat_line ? ` (${item.stat_line})` : '')
  }

  function deathCause(row) {
    if (row.killer_name) return row.killer_name
    return {
      drowning: 'Drown',
      poisonous_mushroom: 'Ate poisonous mushroom',
      freezing: 'Frozen to death',
      poison: 'Poisoned to death',
      'dungeon trap': 'Dungeon trap',
      'dwarven crusher': 'Dwarven crusher',
      'poison gas': 'Poison gas',
      dungeon_trap: 'Dungeon trap',
      environment: 'Unknown environmental cause'
    }[String(row.cause_of_death || '').trim().toLowerCase()] || 'Unknown cause'
  }

  function render(rows) {
    const list = document.getElementById('graveyardList')
    list.replaceChildren()
    if (!rows.length) {
      status('No records yet.')
      return
    }
    status('')
    for (const row of rows) {
      const card = document.createElement('details')
      card.className = `graveyard-record ${row.permadeath ? 'permadeath' : 'normal-death'}`
      const heading = document.createElement('summary')
      const name = document.createElement('strong')
      const race = typeof row.race === 'string' ? row.race : '?'
      name.textContent = `${row.character_name} the ${race.charAt(0).toUpperCase() + race.slice(1)}`
      heading.append(name, detail('Level', row.level),
        detail(row.killer_name ? 'Slain by' : 'Cause', deathCause(row)),
        detail('Mode', row.permadeath ? 'Permadeath' : `Non-permadeath · Death #${row.death_number}`),
        detail('Date', new Date(row.killed_at).toLocaleString()))
      card.append(heading)
      const extras = document.createElement('div')
      extras.className = 'graveyard-details'
      for (const [label, value] of [
        ['ATK', row.atk], ['DEF', row.def], ['SPD', row.spd], ['GRACE', row.grace],
        ['Max HP', row.max_hp], ['Weapon', gearLabel(row.equipment?.weapon, row.weapon)],
        ['Armor', gearLabel(row.equipment?.armor, row.armor)],
        ['Shield', gearLabel(row.equipment?.shield, row.shield)],
        ['Dropped item', gearLabel(row.dropped_item, null)],
        ['World size', row.world_size || '-'],
        ['World traits', Array.isArray(row.world_traits) && row.world_traits.length
          ? row.world_traits.map(trait => trait?.name).filter(Boolean).join(', ') : 'None'],
        ['Artifacts', Array.isArray(row.artifacts) ? row.artifacts.map(item => item?.name).join(', ') : '-'],
        ['Gold', row.gold], ['Cumulated XP', row.cumulated_xp], ['Deaths', row.death_number],
        ['Steps', row.steps_taken], ['Creatures slain', row.creatures_slain],
        ['Strongest slain enemy', row.strongest_enemy_killed
          ? `${row.strongest_enemy_killed.name} (strength ${Math.round(row.strongest_enemy_killed.strength)})` : 'None']
      ]) extras.appendChild(detail(label, value))
      card.append(extras)
      list.append(card)
    }
  }

  async function refresh() {
    const request = ++requestNumber
    document.getElementById('graveyardList').replaceChildren()
    if (replayActive()) { status('Graveyard unavailable during replay.'); return }
    if (!OnlineSupabase.online()) { status('Online Graveyard unavailable while offline.'); return }
    if (!OnlineSupabase.configured()) { status('Online Graveyard unavailable.'); return }
    status('Loading...')
    try {
      const client = await OnlineSupabase.getOnlineClient()
      if (!client || request !== requestNumber || !visible || !OnlineSupabase.onlineAvailable() || replayActive()) return
      let query = client.from('death_records')
        .select('character_name,race,level,killer_name,cause_of_death,permadeath,death_number,killed_at,atk,def,spd,grace,max_hp,weapon,armor,shield,equipment,artifacts,gold,cumulated_xp,steps_taken,creatures_slain,strongest_enemy_killed,dropped_item,world_traits,world_size')
        .order('created_at', {ascending: false}).limit(50)
      if (filter !== 'all') query = query.eq('permadeath', filter === 'true')
      const {data, error} = await query
      if (request !== requestNumber || !visible) return
      if (error) throw error
      render(data)
    } catch {
      if (request === requestNumber && visible) status('Online Graveyard unavailable.')
      console.warn('Graveyard query unavailable')
    }
  }

  function open() {
    if (visible) return
    visible = true
    document.getElementById('graveyardOverlay').classList.add('show')
    visibilityChanged()
    void refresh()
  }

  function close() {
    if (!visible) return
    visible = false
    requestNumber++
    document.getElementById('graveyardOverlay').classList.remove('show')
    visibilityChanged()
  }

  function init(options) {
    replayActive = options.isReplayPlaybackActive
    visibilityChanged = options.onVisibilityChange
    document.getElementById('btnGraveyard').addEventListener('click', open)
    document.getElementById('btnGraveyardClose').addEventListener('click', close)
    document.getElementById('graveyardOverlay').addEventListener('click', event => {
      if (event.target.id === 'graveyardOverlay') close()
    })
    document.getElementById('graveyardFilters').addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]')
      if (!button) return
      filter = button.dataset.mode
      for (const option of button.parentElement.children) option.classList.toggle('active', option === button)
      void refresh()
    })
    window.addEventListener('offline', () => { if (visible) void refresh() })
  }

  return {init, open, close, isOpen: () => visible, recordDeath, snapshotItem, snapshotEquipment, snapshotArtifacts,
    newCharacterId, reconcileDeathCount,
    snapshotStrongestEnemyKill}
})()
