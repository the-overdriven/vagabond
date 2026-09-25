'use strict'

// Fill these with the Project URL and browser publishable (or legacy anon) key.
const SUPABASE_URL = 'https://xjpxokbcnbntddzhyixu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qpfz-3NXo6CUz8u91xrKHg_2VlTIR0b'

const Graveyard = (() => {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js'
  const TIMEOUT_MS = 6000
  const PLAYER_ID_KEY = 'vagabond_online_player_id'
  let sdkPromise = null
  let clientPromise = null
  let visible = false
  let requestNumber = 0
  let replayActive = () => false
  let visibilityChanged = () => {}
  let filter = 'all'

  function configured() {
    try {
      const url = new URL(SUPABASE_URL)
      return url.protocol === 'https:' && !!url.hostname && !/placeholder|example|your[-_]/i.test(url.hostname) &&
        SUPABASE_PUBLISHABLE_KEY.length > 30 && /^(sb_publishable_|eyJ)/.test(SUPABASE_PUBLISHABLE_KEY)
    } catch {
      return false
    }
  }

  function online() {
    return navigator.onLine !== false
  }

  function newId() {
    if (typeof crypto === 'undefined') return null
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
    if (typeof crypto.getRandomValues !== 'function') return null
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }

  function playerId() {
    try {
      const stored = localStorage.getItem(PLAYER_ID_KEY)
      if (stored && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(stored)) return stored
      const id = newId()
      if (!id) return null
      localStorage.setItem(PLAYER_ID_KEY, id)
      return id
    } catch {
      return null
    }
  }

  function loadSdk() {
    if (window.supabase?.createClient) return Promise.resolve(window.supabase)
    if (!sdkPromise) {
      sdkPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = SDK_URL
        script.async = true
        let timer
        const fail = () => {
          clearTimeout(timer)
          script.remove()
          reject(new Error('Supabase SDK unavailable'))
        }
        script.onload = () => {
          clearTimeout(timer)
          if (window.supabase?.createClient) resolve(window.supabase)
          else fail()
        }
        script.onerror = fail
        timer = setTimeout(fail, TIMEOUT_MS)
        document.head.appendChild(script)
      }).catch(error => {
        sdkPromise = null
        throw error
      })
    }
    return sdkPromise
  }

  function getClient() {
    if (!clientPromise) {
      clientPromise = loadSdk().then(sdk => sdk.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
        global: {fetch: (input, init) => {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
          return fetch(input, {...init, signal: controller.signal}).finally(() => clearTimeout(timer))
        }}
      })).catch(error => {
        clientPromise = null
        throw error
      })
    }
    return clientPromise
  }

  function snapshotItem(item) {
    if (!item) return null
    const {kind, base, name, replayId, tier, mod, modAmt, effectId, identified,
      bonuses, curse, artifactSlot, maxHpPct, twoHanded} = item
    return {kind, base, name, replayId, tier, mod, modAmt, effectId, identified,
      bonuses: bonuses ? {...bonuses} : undefined,
      curse: curse ? {...curse, types: curse.types?.slice()} : curse,
      artifactSlot, maxHpPct, twoHanded}
  }

  function snapshotEquipment(equip) {
    return Object.fromEntries(['weapon', 'armor', 'shield'].map(slot => [slot, snapshotItem(equip[slot])]))
  }

  function snapshotArtifacts(inventory) {
    return inventory.filter(item => item.kind === 'artifact').map(snapshotItem)
  }

  function recordDeath(snapshot) {
    // This guard precedes UUID generation, storage access, SDK loading and all network activity.
    if (replayActive() || !online() || !configured()) return
    const death_event_id = newId()
    const player_id = playerId()
    if (!death_event_id || !player_id) return
    const record = {...snapshot, death_event_id, player_id,
      killed_at: new Date().toISOString(), game_version: self.VAGABOND_GAME_VERSION}
    // No await in the death path. Never retry or queue an offline death.
    getClient().then(client => client.from('death_records').insert(record))
      .then(({error}) => { if (error) console.warn('Graveyard submission unavailable') })
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

  function deathCause(row) {
    if (row.killer_name) return row.killer_name
    return {
      poisonous_mushroom: 'Ate poisonous mushroom',
      freezing: 'Frozen to death',
      environment: 'Unknown environmental cause'
    }[row.cause_of_death] || 'Unknown cause'
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
        ['Max HP', row.max_hp], ['Weapon', row.equipment?.weapon?.name || row.weapon],
        ['Armor', row.equipment?.armor?.name || row.armor],
        ['Shield', row.equipment?.shield?.name || row.shield],
        ['Artifacts', Array.isArray(row.artifacts) ? row.artifacts.map(item => item?.name).join(', ') : '-'],
        ['Gold', row.gold], ['Cumulated XP', row.cumulated_xp], ['Deaths', row.death_number],
        ['Steps', row.steps_taken], ['Creatures slain', row.creatures_slain]
      ]) extras.appendChild(detail(label, value))
      card.append(extras)
      list.append(card)
    }
  }

  async function refresh() {
    const request = ++requestNumber
    document.getElementById('graveyardList').replaceChildren()
    if (replayActive()) { status('Graveyard unavailable during replay.'); return }
    if (!online()) { status('Online Graveyard unavailable while offline.'); return }
    if (!configured()) { status('Online Graveyard unavailable.'); return }
    status('Loading...')
    try {
      const client = await getClient()
      if (request !== requestNumber || !visible || !online() || replayActive()) return
      let query = client.from('death_records')
        .select('character_name,race,level,killer_name,cause_of_death,permadeath,death_number,killed_at,atk,def,spd,grace,max_hp,weapon,armor,shield,equipment,artifacts,gold,cumulated_xp,steps_taken,creatures_slain')
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

  return {init, open, close, isOpen: () => visible, recordDeath, snapshotEquipment, snapshotArtifacts}
})()
