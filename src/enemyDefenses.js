'use strict'

// Generic ability-gated defense rules; none depend on a monster's species.
// Only completed simulation actions advance these timers, never animations.
function enemyExposed(e) {
  return enemyHasAbility(e,'exposed') && turnCount < e.exposedUntilTurn
}

function enemyShellRetreating(e) {
  return enemyHasAbility(e,'shellRetreat') && e.shellRetreatTurns > 0 && e.alive && e.hp > 0
}

function enemyDefensiveBase(e) {
  let defense=e.def
  if(enemyExposed(e)) {
    // Select the new base BEFORE spawn scaling/prefixes. Compute both prefix
    // results from the same baseline; never repeatedly mutate the live DEF.
    const template=enemyTemplateForSavedEnemy(e)
    const original=e.prefixBase?.def ?? (e.def-(e.gearBonuses?.def||0))
    const ratio=template?.def>0 ? original/template.def : 1
    const modified=Math.max(0,Math.round(ENEMY_DEFENSE_CONFIG.exposed.baseDef*ratio))
    const withPrefix=base=>{
      const effect=ENEMY_PREFIXES[e.prefix]?.def
      if(!effect)return base
      let value=effect.set!==undefined?effect.set:base
      if(effect.multiply!==undefined)value*=effect.multiply
      if(effect.add!==undefined)value+=effect.add
      if(effect.round)value=Math.round(value)
      if(effect.min!==undefined)value=Math.max(effect.min,value)
      return Math.round(value)
    }
    defense+=withPrefix(modified)-withPrefix(original)
  }
  if(enemyShellRetreating(e))defense+=ENEMY_DEFENSE_CONFIG.shellRetreat.defBonus
  return Math.max(0,defense)
}

function exposeEnemyAfterMelee(e) {
  if(!enemyHasAbility(e,'exposed') || !e.alive || e.hp<=0)return
  const cfg=ENEMY_DEFENSE_CONFIG.exposed
  e.exposedUntilTurn=turnCount+cfg.durationActions
  if(enemyIsVisibleOnMainView(e)) {
    log(cfg.message.replace(/<enemy>/g,`The ${e.name}`),'info')
    spawnDamageNumber(e.x,e.y,'Exposed!','#ffbb71')
  }
}

function triggerEnemyShellRetreat(e) {
  if(!enemyHasAbility(e,'shellRetreat') || !e.alive || e.hp<=0 || e.shellRetreatUsed ||
      e.hp>=e.maxHp*ENEMY_DEFENSE_CONFIG.shellRetreat.healthThreshold)return false
  const cfg=ENEMY_DEFENSE_CONFIG.shellRetreat
  e.shellRetreatUsed=true
  // The triggering attack still calls enemyTurn. Preserve two FULL following
  // player actions by counting that first enemy phase separately.
  e.shellRetreatTurns=cfg.durationTurns+1
  if(enemyIsVisibleOnMainView(e)) {
    log(cfg.message.replace(/<enemy>/g,`The ${e.name}`),'bad')
    spawnDamageNumber(e.x,e.y,'Shell!','#b2d4e8')
  }
  return true
}

function tickEnemyDefensiveTimers() {
  for(const e of enemies)if(e.alive && onCurrentLevel(e) && e.shellRetreatTurns>0)e.shellRetreatTurns--
}

function tickEnemyRegeneration() {
  const cfg=ENEMY_DEFENSE_CONFIG.regen
  for(const e of enemies) {
    if(!e.alive || e.hp<=0 || !onCurrentLevel(e) || !enemyHasAbility(e,'regen'))continue
    e.regenPhase++
    if(e.regenPhase<cfg.intervalTurns)continue
    e.regenPhase=0
    const healed=Math.min(cfg.healAmount,Math.max(0,e.maxHp-e.hp))
    if(healed<=0)continue
    e.hp+=healed
    if(enemyIsVisibleOnMainView(e))spawnDamageNumber(e.x,e.y,`+${healed}`,'#82e49b')
  }
}
