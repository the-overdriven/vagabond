'use strict'

// Fill these with the Project URL and browser publishable (or legacy anon) key.
const SUPABASE_URL = 'https://xjpxokbcnbntddzhyixu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qpfz-3NXo6CUz8u91xrKHg_2VlTIR0b'

// Shared transport for Graveyard and Highscores. No gameplay state or RNG.
const OnlineSupabase = (() => {
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.js'
  const TIMEOUT_MS = 6000
  const PLAYER_ID_KEY = 'vagabond_online_player_id'
  let sdkPromise = null
  let clientPromise = null
  let replayActive = () => false

  function configured() {
    if (window.Cypress && !window.__VAGABOND_TEST_GRAVEYARD__) return false
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

  // Shared transport for online records. Keep one SDK/client/configuration and
  // apply replay/offline guards again after asynchronous SDK initialization.
  function onlineAvailable() {
    return !replayActive() && online() && configured()
  }

  function getOnlineClient() {
    if (!onlineAvailable()) return Promise.resolve(null)
    return getClient().then(client => onlineAvailable() ? client : null)
  }

  function onlinePlayerId() {
    return onlineAvailable() ? playerId() : null
  }

  function init(options) {
    replayActive = options.isReplayPlaybackActive
  }

  return {init, configured, online, onlineAvailable, getOnlineClient, onlinePlayerId, newId}
})()
