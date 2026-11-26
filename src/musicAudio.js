// Presentation-only soundtrack. Keep the playlist and attribution in sync with
// CREDITS.md. New tracks are fetched on demand, not precached.
const MusicAudio = (() => {
  const playlist = [
    "dark-fantasy-gothic-dungeon.mp3",
    "RPG - Misty Mountains.mp3",
    "RPG_Lost_In_Time.mp3",
    "Temple%20of%20the%20Manes.mp3",
    "rpg_ambience_-_exploration.mp3",
    "RPG - The Enchanted Forest of Min.mp3",
    "Kokopelli's Labyrinth Theme ~ Full.mp3",
    "012_Sirens_in_Darkness.mp3",
    "lonely_mournful_tune.mp3",
    "RPG - The Cave (Ambient).mp3",
    "RPG - Dungeon Exploration Music (The Black Temple).mp3",
    "devilish-design.mp3",
    "A Darkness Opus.mp3",
    "sunset_plains.mp3",
    "GameMusic_ForestTheme_24.mp3",
    "RPG The Lost Town.mp3",
    "RPG - The Great Collapse.mp3"
  ].map(filename => `audio/music/${encodeURIComponent(filename)}`)
  const failureRetryMs = 120_000
  const audio = typeof window.Audio === 'function' ? new window.Audio() : null
  let index = 0, nextAt = 0, timer = null
  let enabled = false, unlocked = false, pending = null
  let loadedIndex = -1, failedInRow = 0
  if (!audio || !playlist.length) return {sync() {}, suspend() {}}
  audio.preload = 'none'
  audio.volume = 0.25

  // Use presentation randomness, never the seeded gameplay RNG. Each round
  // plays every track once; avoid repeating the last track across rounds.
  function shuffle(last = null) {
    for (let i = playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const track = playlist[i]
      playlist[i] = playlist[j]
      playlist[j] = track
    }
    if (playlist.length > 1 && playlist[0] === last) {
      const j = 1 + Math.floor(Math.random() * (playlist.length - 1))
      const track = playlist[0]
      playlist[0] = playlist[j]
      playlist[j] = track
    }
  }
  shuffle()

  function allowed() {
    return enabled && unlocked && !document.hidden &&
      !replayPlaying && !replaySimulationMode && !replayAnimationsDisabled
  }

  function suspend() {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
    audio.pause()
  }

  function advance(failed = false) {
    if (loadedIndex < 0) return
    loadedIndex = -1
    pending = null
    const last = playlist[index]
    if (++index === playlist.length) {
      shuffle(last)
      index = 0
    }
    // An uncached track can be unavailable offline. Try other tracks without
    // a wait, but back off after a playlist-length streak of failures.
    failedInRow = failed ? failedInRow + 1 : 0
    const backoff = failedInRow >= playlist.length
    if (backoff) failedInRow = 0
    nextAt = backoff ? Date.now() + failureRetryMs : 0
    sync(enabled)
  }

  function sync(soundEnabled, gesture = false) {
    enabled = soundEnabled
    if (gesture) unlocked = true
    if (!allowed()) { suspend(); return }
    if (nextAt > Date.now()) {
      if (timer === null) timer = setTimeout(() => {
        timer = null
        sync(enabled)
      }, nextAt - Date.now())
      return
    }
    if (timer !== null) clearTimeout(timer)
    timer = null
    if (pending || (!audio.paused && loadedIndex === index)) return
    if (loadedIndex !== index) {
      loadedIndex = index
      audio.src = playlist[index]
    }
    // Autoplay can be rejected on touch browsers. A later gesture retries the
    // same track; a media error skips to another available track.
    const attempt = {}
    pending = attempt
    try {
      Promise.resolve(audio.play()).catch(() => {}).finally(() => {
        if (pending === attempt) pending = null
      })
    } catch {
      if (pending === attempt) pending = null
    }
  }

  audio.addEventListener('ended', () => advance())
  audio.addEventListener('error', () => advance(true))
  return {sync, suspend}
})()
