// Presentation only: no game RNG, turn processing, save fields or replay actions.
const LootAudio = (() => {
  const files = [null, 'gear-drop', 'rare-drop', 'exceptional-prefix-drop', 'artifact-drop']
  const storageKey = 'vagabond_sound_muted'
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  const button = document.getElementById('btnSound')
  const buffers = new Map()
  let muted = false
  let context = null, active = null
  let loading = false
  try { muted = localStorage.getItem(storageKey) === '1' } catch { /* Storage is optional. */ }

  function updateButton() {
    button.textContent = muted ? '🔇' : '🔊'
    button.setAttribute('aria-pressed', String(!muted))
    button.title = muted ? 'Enable sound' : 'Mute sound'
  }

  function stop() {
    const previous = active
    active = null
    if (previous) {
      try { previous.source.stop() } catch { /* Already ended. */ }
    }
  }

  function unlock(event) {
    // Do not start playback just before the speaker's own mute click.
    if (event?.target?.closest?.('#btnSound')) return
    MusicAudio.sync(!muted, true)
    unlockEffects()
  }

  function unlockEffects() {
    if (muted || !AudioContextClass) return
    try {
      if (!context) context = new AudioContextClass()
      if (context.state !== 'running') context.resume().catch(() => {})
      if (loading || buffers.size === files.length - 1) return
      loading = true
      // Begin on the first user gesture, before any loot is normally awarded.
      // Failed assets are retried on a later gesture, without blocking play.
      Promise.all(files.slice(1).map(async (name, index) => {
        const priority = index + 1
        if (buffers.has(priority)) return
        try {
          const response = await fetch(`audio/loot/${name}.wav`)
          if (response.ok) buffers.set(priority, await context.decodeAudioData(await response.arrayBuffer()))
        } catch { /* Audio failures must never interrupt the game. */ }
      })).finally(() => { loading = false })
    } catch { /* Audio may be unavailable or blocked by the browser. */ }
  }

  function play(priority) {
    if (muted || document.hidden || !priority || context?.state !== 'running' ||
        !buffers.has(priority)) return
    // Do not stack many simultaneous loot sounds. An ongoing rarer cue wins.
    if (active && active.priority > priority) return
    stop()
    try {
      const source = context.createBufferSource()
      const gain = context.createGain()
      source.buffer = buffers.get(priority)
      gain.gain.value = 0.45
      source.connect(gain)
      gain.connect(context.destination)
      source.onended = () => {
        if (active?.source === source) active = null
        source.disconnect()
        gain.disconnect()
      }
      source.start()
      active = {source, priority}
    } catch { /* A failed cue does not affect loot. */ }
  }

  function toggle() {
    muted = !muted
    try { localStorage.setItem(storageKey, muted ? '1' : '0') } catch { /* Optional. */ }
    updateButton()
    MusicAudio.sync(!muted, true)
    if (muted) stop()
    else unlockEffects()
  }

  updateButton()
  button.addEventListener('click', toggle)
  // Touch browsers may require pointerup or click instead of pointerdown.
  for (const type of ['pointerdown', 'pointerup', 'keydown', 'click'])
    document.addEventListener(type, unlock, {capture:true, passive:true})
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop()
    MusicAudio.sync(!muted)
  })
  return {play, stop, syncMusic: () => MusicAudio.sync(!muted)}
})()
