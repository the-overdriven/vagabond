// Batch 5: exercise the shared Death Bolt in the actual combat/save/replay runtime.
function deathBoltRulesCheck() {
  const check = (ok, why) => { if (!ok) throw Error(why) }
  const original = {chance, pick}
  try {
    setupEnemySpellArena()
    const bolt = makeSpellTestEnemy('Skeleton', ['deathBolt'], 38, 40)
    check(ENEMY_TEMPLATE_BY_NAME.Lich.abilities.includes('deathBolt'), 'Lich is configured with Death Bolt')
    check(availableEnemySpells(bolt).includes('deathBolt'), 'other monster can use generic Death Bolt')
    setupEnemySpellArena()
    const lich=makeSpellTestEnemy('Lich', ['weaken','slow','disarm','dispel','deathBolt','immunity'],38,40)
    player.equip.weapon={kind:'weapon',name:'Sword',base:'Sword',atk:2}
    player.berryRegenTurns=8
    let rollChoices=null
    pick=choices=>{rollChoices=choices;return 'deathBolt'}
    chance=p=>p===ENEMY_SPELL_CHANCE
    check(tryEnemySpell(lich),'Lich can select weighted Death Bolt')
    check(rollChoices.length===10 && rollChoices.filter(s=>s==='deathBolt').length===5,
      'Death Bolt has five selection entries against five distinct ordinary alternatives')
    setupEnemySpellArena()
    const bolt2=makeSpellTestEnemy('Skeleton',['deathBolt'],38,40)
    // The rest of the damage, graphics and replay checks use a single-ability caster.
    check(DEATH_BOLT_CONFIG.atk === 20 && DEATH_BOLT_CONFIG.animationMs === 650, 'balanced values are configured')
    check(RENDER_STYLE.projectiles.deathBolt.image === 'img/projectiles/death-bolt.png', 'supplied skull asset is used')
    const hp = player.hp
    replayAnimationsDisabled = false
    projectileAnims = []
    chance = p => p === ENEMY_SPELL_CHANCE
    pick = choices => choices[0]
    check(tryEnemySpell(bolt2), 'Death Bolt casts')
    check(player.hp < hp && player.hp > 0, '20 ATK damage applies before animation completes')
    check(turnCount === 0 && bolt2.shotsRemaining === 0, 'casting neither advances a second turn nor spends ammunition')
    check(projectileAnims.length === 1 && projectileAnims[0].projectile === 'deathBolt' &&
      projectileAnims[0].duration === 650, 'visual skull has independent slow flight')
    check(projectileAnims[0].path[0].x === 38 && projectileAnims[0].path.at(-1).x === 40, 'flight traces the current shot')
    check(damageAnims.some(a => typeof a.amount === 'number' && a.delay === 650), 'impact number waits for skull visually')
    const one = player.hp
    check(tryEnemySpell(bolt2) && player.hp < one, 'Death Bolt never runs out of ammo')
    check(projectileAnims[1].start >= projectileAnims[0].start + 650,
      'consecutive Death Bolts are presented after one another, never together')

    // Two creature lunges must finish before the dodged skull flies. The
    // visual dodge shifts the sprite only; neither position nor turns change.
    setupEnemySpellArena()
    const firstMelee = makeSpellTestEnemy('Giant Rat', [], 39, 39)
    const secondMelee = makeSpellTestEnemy('Goblin', [], 40, 39)
    const orderedBolt = makeSpellTestEnemy('Skeleton', ['deathBolt'], 38, 40)
    replayAnimationsDisabled = false
    chance = () => true // melee misses; spell succeeds and its projectile is dodged
    check(!enemyAttackPlayer(firstMelee) && !enemyAttackPlayer(secondMelee), 'two normal melee attacks resolve')
    check(firstMelee.attackVisualQueue.length === 1 && secondMelee.attackVisualQueue.length === 1 &&
      secondMelee.attackVisualQueue[0] >= firstMelee.attackVisualQueue[0] + ENEMY_MELEE_ANIM_MS,
      'melee attack animations have separate ordered start times')
    const combatX = player.x, combatY = player.y, combatTurn = turnCount
    check(tryEnemySpell(orderedBolt), 'Death Bolt casts after the melee strikes')
    const orderedShot = projectileAnims[0]
    check(orderedShot.projectile === 'deathBolt' &&
      orderedShot.start >= secondMelee.attackVisualQueue[0] + ENEMY_MELEE_ANIM_MS,
      'Death Bolt starts after the second monster lunge finishes')
    check(playerProjectileDodges.length === 1 &&
      playerProjectileDodges[0].start < orderedShot.start + orderedShot.duration &&
      playerProjectileDodges[0].start > orderedShot.start + orderedShot.duration - PLAYER_DODGE_ANIM_MS,
      'dodged Death Bolt begins recoiling just before projectile impact')
    check(player.x === combatX && player.y === combatY && turnCount === combatTurn,
      'projectile dodge never moves the player or advances a turn')
    check(enemyAttackPresentationPending(), 'input stays locked through Death Bolt and recoil')
    skipTurn()
    check(turnCount === combatTurn, 'waiting cannot skip the queued visuals')
    tryMove(1, 0)
    check(pendingMove?.dx === 1 && player.x === combatX, 'movement input buffers until the attack queue finishes')

    setupEnemySpellArena()
    const dodgeCaster = makeSpellTestEnemy('Skeleton', ['deathBolt'])
    const untouched = player.hp
    chance = () => true // cast roll succeeds; ranged dodge succeeds
    check(tryEnemySpell(dodgeCaster) && player.hp === untouched, 'ranged dodge fully avoids Death Bolt')
    check(damageAnims.some(a => a.amount === 'Miss!' && a.delay === 650), 'miss text follows skull')

    setupEnemySpellArena()
    const armoredCaster = makeSpellTestEnemy('Skeleton', ['deathBolt'])
    player.equip.armor = {kind:'armor',name:'Test cuirass',base:'Test cuirass',def:200}
    const hpBeforeArmor = player.hp
    let rolls = 0
    chance = () => ++rolls === 1 || rolls === 3 // cast; dodge fails; glancing succeeds; critical fails
    check(tryEnemySpell(armoredCaster) && player.hp === hpBeforeArmor, 'glancing zero damage stays zero')

    setupEnemySpellArena()
    const critCaster = makeSpellTestEnemy('Skeleton', ['deathBolt'])
    rngState = 101
    let rollCount = 0
    chance = () => ++rollCount === 1 // cast, no dodge, no critical
    check(tryEnemySpell(critCaster), 'base bolt hits')
    const regularDamage = 1000 - player.hp
    rngState = 101; player.hp = 1000; rollCount = 0
    chance = () => {rollCount++;return rollCount === 1 || rollCount === 3}
    check(tryEnemySpell(critCaster) && 1000 - player.hp === regularDamage * 2,
      'Death Bolt critical uses exactly normal ranged double damage')

    setupEnemySpellArena()
    const shieldCaster = makeSpellTestEnemy('Skeleton', ['deathBolt'])
    player.hp = 1; player.deathShieldReady = true
    chance = p => p === ENEMY_SPELL_CHANCE
    check(tryEnemySpell(shieldCaster) && player.hp === 1 && !player.deathShieldReady,
      'player Death Shield intercepts a lethal skull, no delayed second hit')

    setupEnemySpellArena()
    const turnCaster = makeSpellTestEnemy('Skeleton', ['deathBolt'], 39, 40)
    const fullHp = player.hp
    chance = p => p === ENEMY_SPELL_CHANCE
    enemyTurn()
    check(turnCount === 1 && player.hp < fullHp, 'spell replaces adjacent monster melee in an actual turn')
    check(turnCaster.shotsRemaining === 0, 'ability is independent of shooter state')
  } finally {
    chance = original.chance; pick = original.pick
    replayAnimationsDisabled = true
  }
}

function deathBoltBlockersCheck() {
  const check = (ok, why) => { if (!ok) throw Error(why) }
  const original = {chance, pick}
  try {
    setupEnemySpellArena()
    const caster = makeSpellTestEnemy('Skeleton', ['deathBolt'], 37, 40)
    check(availableEnemySpells(caster).includes('deathBolt'), 'unobstructed Death Bolt initially eligible')
    map[40][38] = 'mountain'
    chance = () => { throw Error('no RNG roll allowed for blocked bolt') }
    check(!availableEnemySpells(caster).includes('deathBolt') && !tryEnemySpell(caster), 'solid terrain blocks cast and consumes no RNG')
    map[40][38] = 'grass'
    const groundAlly = makeSpellTestEnemy('Goblin', [], 38, 40)
    check(!availableEnemySpells(caster).includes('deathBolt'), 'living ground monster intercepts line; no friendly fire')
    groundAlly.abilities = ['fly']
    check(availableEnemySpells(caster).includes('deathBolt'), 'flying creatures do not block the projectile')
    groundAlly.alive = false
    player.invisibleTurns = 4
    check(!tryEnemySpell(caster), 'invisible player not targetable by normal caster')
    caster.abilities.push('trueSight')
    chance = p => p === ENEMY_SPELL_CHANCE
    check(tryEnemySpell(caster), 'true sight can cast at an invisible player if shot is clear')
    player.invisibleTurns = 0
    spawnPoint = {x:player.x,y:player.y}
    check(!tryEnemySpell(caster), 'sanctuary prevents a bolt')
    spawnPoint = {x:5,y:5}
    caster.x = 12; caster.y = 12
    check(!tryEnemySpell(caster), 'caster outside effective aggro cannot shoot')
  } finally {chance = original.chance;pick = original.pick}
}

async function deathBoltReplayCheck() {
  const check = (ok, why) => { if (!ok) throw Error(why) }
  setupEnemySpellArena()
  const caster = makeSpellTestEnemy('Skeleton', ['deathBolt'], 39, 40)
  player.hp = 5000;player.maxHp = 5000
  rngState = 67
  const state = () => JSON.stringify({hp:player.hp,turnCount,x:player.x,y:player.y,
    caster:enemies.filter(e => e.baseName === 'Skeleton').map(e => [e.x,e.y,e.hp,e.shotsRemaining]),shield:player.deathShieldReady})
  startReplayRecording()
  const trace = [], startHp = player.hp
  for (let i=0;i<28;i++) {
    await tryMove(i%2===0 ? 1 : -1, 0)
    trace.push(state())
  }
  check(player.hp < startHp, 'seeded replay actually includes Death Bolt damage')
  const saved = JSON.parse(JSON.stringify(buildSaveObject()))
  const recorded = JSON.parse(JSON.stringify(replayData))
  const expected = state()
  loadGameFromObject(recorded.initialState, {isReplayInit:true})
  replayPlaying = true; replayRecording = false; replaySimulationMode = true; replayAnimationsDisabled = true
  activeReplay = recorded; replayRngIndex = 0
  try {
    const replayTrace = []
    for (const action of recorded.actions) {
      await runReplayAction(action)
      replayTrace.push(state())
    }
    if (JSON.stringify(trace) !== JSON.stringify(replayTrace)) {
      const mismatch = trace.findIndex((value,index) => value !== replayTrace[index])
      throw Error('each bolt turn replays identically (first mismatch '+mismatch+': '+trace[mismatch]+' vs '+replayTrace[mismatch]+')')
    }
    check(state() === expected, 'final replay state is identical')
    check(replayRngIndex === recorded.rng.length, 'replay consumes exact recorded RNG calls')
  } finally {replayPlaying = false;replaySimulationMode = false;activeReplay = null}
  loadGameFromObject(saved, {isReplayInit:true})
  check(state() === expected && rngState === saved.rngState, 'current save restores damage and seeded RNG')
}
if (typeof module !== 'undefined') module.exports = {deathBoltRulesCheck,deathBoltBlockersCheck,deathBoltReplayCheck}
