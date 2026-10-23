'use strict'

const Highscores = (() => {
  const STATS = ['atk', 'def', 'spd', 'grace']

  // Pure ranking rules: no game state, storage, network, clocks or RNG.
  function strength(stats) {
    if (!STATS.every(stat => Number.isFinite(stats?.[stat]))) return null
    const sum = STATS.reduce((total, stat) => total + stats[stat], 0)
    return Number.isFinite(sum) ? sum : null
  }

  // The live item applies its real bonuses, but public snapshots must never
  // expose an unidentified artifact's owner or hidden rolled properties.
  function unidentifiedName(item) {
    if (typeof item.noun === 'string' && item.noun.trim()) return `Unidentified ${item.noun.trim()}`
    const name = typeof item.name === 'string' ? item.name.trim() : ''
    // Stored highscore snapshots may retain the display name without noun.
    // Strip the owner from the game's non-cursed naming form before display.
    const owned = /^(?:The )?(.+?) of .+$/.exec(name.replace(/^Unidentified /i, ''))
    if (owned) return `Unidentified ${owned[1]}`
    if (/^Unidentified \S/i.test(name)) return name
    return 'Unidentified artifact'
  }

  function publicItem(item) {
    if (!item || item.kind !== 'artifact' || item.identified !== false) return item
    return {kind:'artifact', identified:false,
      ...(typeof item.noun === 'string' ? {noun:item.noun} : {}),
      name:unidentifiedName(item),
      stat_line:'???'}
  }

  function compare(a, b) {
    if (a.level !== b.level) return b.level - a.level
    if (a.strength !== b.strength) return b.strength - a.strength
    // Keep the normalized server timestamp's sub-millisecond precision.
    const time = a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0
    if (time) return time
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  }

  function eligible(candidate, board) {
    if (!Number.isSafeInteger(candidate.level) || candidate.level < 2 ||
        !Number.isFinite(candidate.strength) || !candidate.character_id ||
        typeof candidate.permadeath !== 'boolean') return false
    // null means unavailable/loading; [] means a successful empty response.
    if (board === null) return true
    const rows = board.filter(row => row.permadeath === candidate.permadeath)
    if (rows.length < 10) return true
    const previous = rows.find(row => row.character_id === candidate.character_id)
    if (previous && candidate.level > previous.level) return true
    const cutoff = [...rows].sort(compare)[9]
    return candidate.level > cutoff.level ||
      (candidate.level === cutoff.level && candidate.strength > cutoff.strength)
  }

  const EXCLUSION_KEY = 'vagabond_highscores_disqualified_'
  const disqualified = new Set()
  const inFlight = new Set()
  const submitted = new Set()
  const boards = [false, true].map(() => ({status:'unavailable', rows:null, request:0}))
  let replayActive = () => false
  let started = false
  let visible = false
  let selectedMode = false
  let viewRequest = 0
  let previousFocus = null
  let visibilityChanged = () => {}

  function markDisqualified(character) {
    character.highscoresDisqualified = true
    // Replay reproduces the saved flag, but never affects browser-local history.
    if (replayActive() || !character.characterId) return
    disqualified.add(character.characterId)
    try { localStorage.setItem(EXCLUSION_KEY + character.characterId, '1') }
    catch { /* Storage failures do not interrupt play; memory still blocks rollback. */ }
  }

  function reconcileExclusion(character, replayRestore = false) {
    if (replayRestore || replayActive()) return
    if (character.highscoresDisqualified || character.godMode) {
      markDisqualified(character)
      return
    }
    if (!character.characterId) return
    let excluded = disqualified.has(character.characterId)
    try { excluded ||= localStorage.getItem(EXCLUSION_KEY + character.characterId) === '1' }
    catch { /* The saved flag remains authoritative when storage is unavailable. */ }
    if (excluded) markDisqualified(character)
  }

  function getBoard(permadeath) {
    const board = boards[Number(permadeath)]
    return {status:board.status, rows:board.rows === null ? null : structuredClone(board.rows)}
  }

  function validRankingRow(row, mode) {
    return row && typeof row.id === 'string' && typeof row.created_at === 'string' &&
      typeof row.character_id === 'string' && row.character_id.length > 0 &&
      row.permadeath === mode && (!mode || typeof row.is_dead === 'boolean') &&
      Number.isSafeInteger(row.level) && row.level >= 2 && Number.isFinite(row.strength)
  }

  async function refresh(permadeath) {
    const board = boards[Number(permadeath)]
    const request = ++board.request
    if (replayActive() || !OnlineSupabase.onlineAvailable()) {
      board.status = 'unavailable'; board.rows = null
      return getBoard(permadeath)
    }
    board.status = 'loading'
    try {
      // src/supabase.js creates the shared client with SUPABASE_URL and
      // SUPABASE_PUBLISHABLE_KEY. Keep one configuration and SDK instance.
      const client = await OnlineSupabase.getOnlineClient()
      if (!client || replayActive() || !OnlineSupabase.onlineAvailable()) throw Error('Online read cancelled')
      // The normal leaderboard never touches Graveyard. Only the permadeath
      // RPC joins the ten ranked characters against their recorded deaths.
      const {data, error} = permadeath
        ? await client.rpc('highscores_permadeath_top_ten')
        : await client.rpc('highscores_top_ten', {p_permadeath:false})
      if (error) throw error
      if (!Array.isArray(data) || data.length > 10 ||
          !data.every(row => validRankingRow(row, permadeath)) ||
          new Set(data.map(row => row.character_id)).size !== data.length) throw Error('Invalid leaderboard')
      if (request === board.request) {
        board.rows = structuredClone(data).sort(compare)
        board.status = 'loaded'
      }
    } catch {
      if (request === board.request) {
        board.status = 'unavailable'; board.rows = null
      }
    }
    return getBoard(permadeath)
  }

  function recordLevel(character, makeSnapshot) {
    // Guard before snapshot construction, identity/storage access or SDK loading.
    if (replayActive() || character.highscoresDisqualified || character.godMode ||
        disqualified.has(character.characterId) || !OnlineSupabase.onlineAvailable()) return
    try {
      const record = structuredClone(makeSnapshot())
      const score = strength(record)
      if (score === null || record.spd < 1 || record.grace < 0 ||
          !['atk','def','spd','grace'].every(stat => Math.abs(record[stat]) <= 1e9) ||
          typeof record.character_id !== 'string' || record.character_id.length > 200 ||
          typeof record.character_name !== 'string' || !record.character_name.trim() ||
          record.character_name.length > 80 || record.level > 1000000) return
      const candidate = {...record, strength:score}
      const board = boards[Number(record.permadeath)]
      if (!board || !eligible(candidate, board.rows)) return
      const key = JSON.stringify([record.character_id, record.level])
      if (inFlight.has(key) || submitted.has(key)) return
      record.player_id = OnlineSupabase.onlinePlayerId()
      record.game_version = self.VAGABOND_GAME_VERSION
      record.strongest_enemy_killed = Graveyard.snapshotStrongestEnemyKill(record.strongest_enemy_killed)
      if (record.equipment && typeof record.equipment === 'object')
        for (const slot of ['weapon','armor','shield']) record.equipment[slot] = publicItem(record.equipment[slot])
      if (Array.isArray(record.artifacts)) record.artifacts = record.artifacts.map(publicItem)
      // Ranking score and server identity/timestamps are never client insert fields.
      delete record.strength; delete record.id; delete record.created_at
      inFlight.add(key)
      Promise.resolve().then(() => {
        if (replayActive() || !OnlineSupabase.onlineAvailable() || disqualified.has(record.character_id)) return null
        return OnlineSupabase.getOnlineClient()
      }).then(client => {
        // A pending SDK load must not submit after playback begins, connectivity
        // disappears, or this captured character enables god mode.
        if (!client || replayActive() || !OnlineSupabase.onlineAvailable() ||
            disqualified.has(record.character_id)) return null
        return client.from('highscore_records').insert(record)
      }).then(result => {
        if (!result) return
        if (!result.error || result.error.code === '23505') submitted.add(key)
        else console.warn('Highscores submission unavailable')
      }).catch(() => console.warn('Highscores submission unavailable'))
        .finally(() => inFlight.delete(key))
    } catch {
      console.warn('Highscores snapshot unavailable')
    }
  }

  function text(value, fallback = '-') {
    return typeof value === 'string' ? value : fallback
  }

  function number(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : '-'
  }

  function detail(label, value) {
    const line = document.createElement('div')
    line.textContent = `${label}: ${value}`
    return line
  }

  function gearLabel(item, fallback) {
    if (item?.kind === 'artifact' && item.identified === false)
      return unidentifiedName(item) + ' (???)'
    const name = text(item?.name, text(fallback))
    const stats = text(item?.stat_line, '')
    return name + (stats ? ` (${stats})` : '')
  }

  function renderRows(rows) {
    const list = document.getElementById('highscoresList')
    list.replaceChildren()
    document.getElementById('highscoresStatus').textContent = rows.length ? '' : 'No highscores yet.'
    rows.forEach((row, index) => {
      const card = document.createElement('details')
      card.className = `graveyard-record ${row.permadeath ? 'permadeath' : 'normal-death'}`
      const heading = document.createElement('summary')
      const name = document.createElement('strong')
      const race = text(row.race, '?')
      name.textContent = `#${index + 1} ${text(row.character_name, 'Unknown')} the ${race.charAt(0).toUpperCase() + race.slice(1)}`
      if (row.permadeath && row.is_dead) {
        const skull = document.createElement('span')
        skull.textContent = ' 💀'
        skull.title = 'Died in permadeath'
        skull.setAttribute('aria-label', 'Died in permadeath')
        name.append(skull)
      }
      heading.append(name, detail('Level', number(row.level)), detail('Strength', number(row.strength)))
      const extras = document.createElement('div')
      extras.className = 'graveyard-details'
      const date = new Date(row.created_at)
      for (const [label, value] of [
        ['ATK', number(row.atk)], ['DEF', number(row.def)],
        ['SPD', number(row.spd)], ['GRACE', number(row.grace)],
        ['Max HP', number(row.max_hp)], ['MF', number(row.mf)],
        ['Weapon', gearLabel(row.equipment?.weapon, row.weapon)],
        ['Armor', gearLabel(row.equipment?.armor, row.armor)],
        ['Shield', gearLabel(row.equipment?.shield, row.shield)],
        ['Artifacts', Array.isArray(row.artifacts) && row.artifacts.length
          ? row.artifacts.map(item => gearLabel(item, null)).join('; ') : 'None'],
        ['Gold', number(row.gold)], ['Cumulated XP', number(row.cumulated_xp)],
        ['Deaths', number(row.death_number)], ['Steps', number(row.steps_taken)],
        ['Creatures slain', number(row.creatures_slain)],
        ['Strongest slain enemy', row.strongest_enemy_killed
          ? `${text(row.strongest_enemy_killed.name, 'Unknown')} (strength ${number(row.strongest_enemy_killed.strength)})` : 'None'],
        ['World seed', number(row.world_seed)], ['World size', text(row.world_size)],
        ['World traits', Array.isArray(row.world_traits) && row.world_traits.length
          ? row.world_traits.map(trait => text(trait?.name, '')).filter(Boolean).join(', ') || 'None' : 'None'],
        ['Game version', text(row.game_version)],
        ['Date', Number.isFinite(date.valueOf()) ? date.toLocaleString() : '-']
      ]) extras.append(detail(label, value))
      card.append(heading, extras)
      list.append(card)
    })
  }

  async function showMode(mode) {
    selectedMode = mode
    const request = ++viewRequest
    for (const button of document.getElementById('highscoresFilters').children) {
      const active = button.dataset.mode === String(mode)
      button.classList.toggle('active', active)
      button.setAttribute('aria-pressed', String(active))
    }
    document.getElementById('highscoresList').replaceChildren()
    const status = document.getElementById('highscoresStatus')
    if (replayActive()) { status.textContent = 'Highscores unavailable during replay.'; return }
    if (navigator.onLine === false) { status.textContent = 'Online Highscores unavailable while offline.'; return }
    status.textContent = 'Loading...'
    const board = await refresh(mode)
    if (!visible || request !== viewRequest || selectedMode !== mode) return
    if (replayActive()) { status.textContent = 'Highscores unavailable during replay.'; return }
    if (navigator.onLine === false) { status.textContent = 'Online Highscores unavailable while offline.'; return }
    if (board.status !== 'loaded') { status.textContent = 'Online Highscores unavailable.'; return }
    renderRows(board.rows)
  }

  function open() {
    if (visible) return
    previousFocus = document.activeElement
    visible = true
    document.getElementById('highscoresOverlay').classList.add('show')
    visibilityChanged()
    void showMode(selectedMode)
    document.getElementById('btnHighscoresClose').focus({preventScroll:true})
  }

  function close(restoreFocus = true) {
    if (!visible) return
    visible = false
    viewRequest++
    document.getElementById('highscoresOverlay').classList.remove('show')
    visibilityChanged()
    if (restoreFocus) {
      const target = previousFocus?.isConnected && previousFocus.getClientRects().length
        ? previousFocus : document.getElementById('btnHighscores')
      target.focus({preventScroll:true})
    }
    previousFocus = null
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    if (event.key !== 'Tab') return
    const elements = [...document.getElementById('highscoresOverlay').querySelectorAll('button, summary')]
    const first = elements[0], last = elements[elements.length - 1]
    const current = document.activeElement
    if (!elements.includes(current) || (event.shiftKey && current === first) || (!event.shiftKey && current === last)) {
      event.preventDefault()
      const target = event.shiftKey ? last : first
      target.focus({preventScroll:true})
    }
  }

  function init(options) {
    replayActive = options.isReplayPlaybackActive
    visibilityChanged = options.onVisibilityChange || (() => {})
    if (started) return
    started = true
    document.getElementById('btnHighscores').addEventListener('click', open)
    document.getElementById('btnHighscoresClose').addEventListener('click', () => close())
    document.getElementById('highscoresOverlay').addEventListener('click', event => {
      if (event.target.id === 'highscoresOverlay') close()
    })
    document.getElementById('highscoresFilters').addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]')
      if (button) void showMode(button.dataset.mode === 'true')
    })
    window.addEventListener('offline', () => { if (visible) void showMode(selectedMode) })
    // No await: boot, world generation and gameplay are independent of Supabase.
    void refresh(false)
    void refresh(true)
  }

  return {init, refresh, getBoard, recordLevel, markDisqualified, reconcileExclusion,
    open, close, isOpen: () => visible, handleKeydown, strength, compare, eligible}
})()
