// Presentation-only soundtrack. Keep the playlist and attribution in sync with
// CREDITS.md and the service worker's offline asset list.
const MusicAudio = (() => {
  const playlist = [
    'audio/music/dark-fantasy-gothic-dungeon.mp3'
  ]
  const gapMs = 120_000
  const audio = typeof window.Audio === 'function' ? new window.Audio() : null
  let index = 0, nextAt = 0, timer = null
  let enabled = false, unlocked = false, pending = null
  let loadedIndex = -1
  if (!audio || !playlist.length) return {sync() {}, suspend() {}}
  audio.preload = 'none'
  audio.volume = 0.25

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

  function advance() {
    if (loadedIndex < 0) return
    loadedIndex = -1
    pending = null
    index = (index + 1) % playlist.length
    nextAt = Date.now() + gapMs
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
    // same track; a media error advances after the normal quiet interval.
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

  audio.addEventListener('ended', advance)
  audio.addEventListener('error', advance)
  return {sync, suspend}
})()
