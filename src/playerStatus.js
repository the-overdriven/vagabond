'use strict'

// A read-only view of existing gameplay counters; never advances a turn or RNG.
function activePlayerStatuses() {
  if (player.hp <= 0) return []
  const statuses = []
  if (isDrowning()) statuses.push({id: 'drowning', icon: '≈', label: 'Drowning', counter: '',
    detail: 'Drowning: lose 5% of maximum HP (at least 1) each swimming step or wait. Reach shore to recover.'})
  const turns = n => `${n} turn${n === 1 ? '' : 's'}`
  if (player.freezing?.active) {
    const left = WORLD_GEN_CONFIG.environment.freezingDamageIntervalTurns - player.freezing.turns
    statuses.push({id: 'freezing', icon: '❄', label: 'Freezing', counter: `${left}t`,
      detail: `Freezing: −${WORLD_GEN_CONFIG.environment.freezingDamage} HP in ${turns(left)}. Ends when you leave cold terrain.`})
  }
  // Combine penalties only when both their stat and expiry match. Different
  // expiry times remain visible, without revealing an unidentified artifact.
  const penalties = new Map()
  for (const debuff of player.curseDebuffs) {
    if (debuff.turnsLeft <= 0) continue
    const key = `${debuff.stat}-${debuff.turnsLeft}`
    const entry = penalties.get(key)
    if (entry) entry.amt += debuff.amt
    else penalties.set(key, {...debuff})
  }
  for (const [key, debuff] of penalties) {
    const label = `${debuff.stat.toUpperCase()} ${debuff.amt}`
    statuses.push({id: `penalty-${key}`, icon: '↓', label, counter: `${debuff.turnsLeft}t`,
      detail: `${label}: temporary penalty, ${turns(debuff.turnsLeft)} remaining.`})
  }
  if (player.berryRegenTurns > 0) {
    statuses.push({id: 'regen', icon: '✚', label: 'Regen', counter: `${player.berryRegenTurns}t`,
      detail: `Regeneration: ${turns(player.berryRegenTurns)} remaining. Berries restore ${consumablePower(1)} HP every 5 turns; eating more extends the duration.`})
  }
  if (playerIsInvisible()) {
    statuses.push({id: 'invisible', icon: '◇', label: 'Invisible', counter: player.godMode ? '∞' : `${player.invisibleTurns}t`,
      detail: player.godMode ? 'Invisibility: active until god-mode invisibility is toggled off.'
        : `Invisibility: ${turns(player.invisibleTurns)} remaining. Enemies cannot normally detect you, but an enemy you hit can retaliate.`})
  }
  if (player.speedPotionTurns > 0) {
    statuses.push({id: 'speed', icon: 'ϟ', label: 'Speed', counter: `${player.speedPotionTurns}t`,
      detail: `Speed potion: ${turns(player.speedPotionTurns)} remaining.`})
  }
  return statuses
}

const playerStatusRoot = document.getElementById('playerStatuses')
const playerStatusList = document.getElementById('playerStatusList')
const playerStatusDetail = document.getElementById('playerStatusDetail')
let inspectedPlayerStatus = null
let pinnedPlayerStatus = null
let playerStatusSignature = null

function inspectPlayerStatus(id) {
  inspectedPlayerStatus = id
  const button = Array.from(playerStatusList.children).find(el => el.dataset.status === id)
  playerStatusDetail.hidden = !button
  playerStatusDetail.textContent = button?.dataset.detail || ''
  for (const el of playerStatusList.children) {
    el.setAttribute('aria-expanded', String(el === button))
  }
}

function updatePlayerStatuses() {
  const statuses = activePlayerStatuses()
  const signature = JSON.stringify(statuses)
  if (signature === playerStatusSignature) return
  playerStatusSignature = signature
  const ids = new Set(statuses.map(status => status.id))
  for (const button of Array.from(playerStatusList.children)) {
    if (!ids.has(button.dataset.status)) button.remove()
  }
  statuses.forEach((status, index) => {
    let button = Array.from(playerStatusList.children).find(el => el.dataset.status === status.id)
    if (!button) {
      button = document.createElement('button')
      button.type = 'button'
      button.className = 'player-status'
      button.dataset.status = status.id
      button.setAttribute('aria-controls', 'playerStatusDetail')
      const icon = document.createElement('span')
      icon.className = 'player-status-icon'
      icon.setAttribute('aria-hidden', 'true')
      const label = document.createElement('span')
      button.append(icon, label)
    }
    button.children[0].textContent = status.icon
    const text = status.counter ? `${status.label} · ${status.counter}` : status.label
    if (button.children[1].textContent !== text) button.children[1].textContent = text
    button.dataset.detail = status.detail
    button.setAttribute('aria-label', status.detail)
    if (playerStatusList.children[index] !== button) {
      playerStatusList.insertBefore(button, playerStatusList.children[index] || null)
    }
  })
  playerStatusRoot.hidden = !statuses.length
  if (!ids.has(pinnedPlayerStatus)) pinnedPlayerStatus = null
  inspectPlayerStatus(ids.has(inspectedPlayerStatus) ? inspectedPlayerStatus : null)
}

playerStatusList.addEventListener('pointerover', event => {
  if (event.pointerType !== 'mouse' || pinnedPlayerStatus) return
  const button = event.target.closest('button')
  if (button) inspectPlayerStatus(button.dataset.status)
})
playerStatusRoot.addEventListener('pointerleave', () => {
  if (!pinnedPlayerStatus) inspectPlayerStatus(null)
})
playerStatusList.addEventListener('focusin', event => inspectPlayerStatus(event.target.dataset.status))
playerStatusList.addEventListener('focusout', () => {
  if (!pinnedPlayerStatus) inspectPlayerStatus(null)
})
playerStatusList.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (!button) return
  pinnedPlayerStatus = pinnedPlayerStatus === button.dataset.status ? null : button.dataset.status
  inspectPlayerStatus(pinnedPlayerStatus)
  event.stopPropagation()
})
playerStatusRoot.addEventListener('keydown', event => {
  // Space activates the focused badge, rather than inspecting the terrain.
  if (event.key === ' ' || event.key === 'Enter') event.stopPropagation()
  if (event.key === 'Escape') {
    pinnedPlayerStatus = null
    inspectPlayerStatus(null)
    event.stopPropagation()
  }
})
document.addEventListener('pointerdown', event => {
  if (!playerStatusRoot.contains(event.target)) {
    pinnedPlayerStatus = null
    inspectPlayerStatus(null)
  }
})
