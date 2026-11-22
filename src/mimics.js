'use strict'

// A dormant mimic is an ordinary chest in EVERY presentation path. Only this
// game-rule module reads its hidden flag. All state lives on the chest/enemy,
// so the existing save and replay serializers preserve it unchanged.
const Mimics = (() => {
  const UNSEEN_THRESHOLD = 3
  const SHIFT_CHANCE = 0.65
  const BONUS_GOLD = 15
  const STATIONARY_AFTER_REVEAL = false
  const ATTACK_ON_REVEAL = true
  const FORT_CHEST_COUNT = 4
  const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]]
  const key = (x,y) => `${x},${y}`
  let lastLevel = null

  function levelKey() { return `${currentLevelKind()}:${currentZ}` }
  function hashFloat(chest, salt) {
    const input = `${WORLD_SEED}|${chest.level}|${chest.id}|${chest.episode}|${salt}`
    let h = 2166136261
    for (let i=0;i<input.length;i++) h = Math.imul(h ^ input.charCodeAt(i), 16777619)
    return (h >>> 0) / 4294967296
  }
  function protectedChest(g) {
    return g.kind !== 'chest' || g.opened || g.artifactGuaranteed ||
      g.royalThroneChest || g.towerMazeTreasure || g.gasChamberId ||
      g.crusherReward || g.progressionKey || g.galleryChest || g.vaultId ||
      g.prisonChest || g.galleryReward || g.galleryBonusChest
  }

  function addFortChests() {
    const level = deepLevels[1], z = -3
    if (!level?.map || !dwarvenRuin) throw new Error('Missing Dwarven Fort for ordinary chest placement')
    const safe = DungeonTraps.safeReachable(level.map, dwarvenRuin,
      new Set((level.traps || []).map(t => keyXY(t.trigger.x,t.trigger.y))))
    const landings=[]
    for(let y=1;y<MAP_H-1;y++)for(let x=1;x<MAP_W-1;x++)
      if(/(stairs|shaft|entrance|exit)/i.test(level.map[y]?.[x])) landings.push({x,y})
    const candidates = []
    for (let y=1;y<MAP_H-1;y++) for (let x=1;x<MAP_W-1;x++) {
      if (level.map[y]?.[x] !== 'marble' || !safe.has(key(x,y)) ||
          Math.max(Math.abs(x-dwarvenRuin.x),Math.abs(y-dwarvenRuin.y)) < 9 ||
          landings.some(p=>Math.max(Math.abs(x-p.x),Math.abs(y-p.y))<=1) ||
          dirs.filter(([dx,dy])=>TILE[level.map[y+dy]?.[x+dx]]?.walk).length<5 ||
          groundItems.some(g => g.level===z && g.x===x && g.y===y) ||
          enemies.some(e => e.alive && e.level===z && e.x===x && e.y===y) ||
          !DungeonTraps.safeSpawn(x,y,z)) continue
      candidates.push({x,y})
    }
    for (let n=0;n<FORT_CHEST_COUNT;n++) {
      const possible = candidates.filter(p => groundItems.every(g =>
        g.level!==z || g.kind!=='chest' || Math.max(Math.abs(p.x-g.x),Math.abs(p.y-g.y))>=5))
      if (!possible.length) throw new Error('Dwarven Fort has too few safe, spaced chest locations')
      const p = pick(possible)
      groundItems.push({...p,kind:'chest',opened:false,tier:Math.min(4,2+n%3),
        level:z,levelKind:'chain',caveIndex:dwarvenRuin.caveIndex})
    }
  }

  // This is the same normal-chest loot table/gear factory, resolved at world
  // placement instead of at opening. No player action or save reload rerolls it.
  function rollChestContents(chest) {
    const tier = chest.tier, mf = 0
    const {result, entry, item} = rollOrdinaryChestMainReward(tier, mf)
    const loot = {gold:0,items:[]}
    if (result==='artifact') loot.items.push(item)
    else if (result==='gold') loot.gold = Math.max(1,Math.round(
      randInt(entry.goldMin,entry.goldMax)*(entry.goldPerTier?tier:1)*
      WORLD_GEN_CONFIG.lootRules.worldGoldMultiplier))
    else if (result==='arrows' || result==='chitin')
      loot.items.push(createItem(result,{count:randInt(entry.countMin,entry.countMax)}))
    else if (result==='shortBow') loot.items.push(makeShortBowItem(mf,tier,true))
    else if (result==='gear') {
      const itemTier = Math.min(tier,entry.gearMaxTier||tier), choice=rng()
      loot.items.push(choice<entry.weaponChance ? makeWeaponItem(itemTier,mf) :
        choice<entry.weaponChance+entry.armorChance ? makeArmorItem(itemTier,mf) :
        makeShieldItem(itemTier,mf))
    } else loot.items.push(createItem(result))
    if (chance(0.005)) loot.items.push(createItem('flint'))
    if (chance(0.005)) loot.items.push(createItem('potato'))
    return loot
  }

  function mark(chest, id) {
    chest.id=id;chest.isMimic=true;chest.unseenTurns=0
    chest.rolled=false;chest.episode=0
    chest.loot=rollChestContents(chest)
  }
  function initialize() {
    lastLevel=null
    addFortChests()
    const choices=groundItems.filter(g=>!protectedChest(g) && g.levelKind==='chain' &&
      g.level<=-3 && g.level>=-(3+dungeonPackageLevels('dwarvenRuins').length))
    // 10% of entire Dwarven complex has none; otherwise one guaranteed.
    const count=chance(0.10)?0:1+(chance(0.30)?randInt(1,2):0)
    const limit=Math.min(3,Math.floor(groundItems.filter(g=>g.kind==='chest' &&
      g.levelKind==='chain' && g.level<=-3 &&
      g.level>=-(3+dungeonPackageLevels('dwarvenRuins').length)).length/2),
      Math.max(0,choices.length))
    const fort=choices.filter(g=>g.level===-3),ruins=choices.filter(g=>g.level<-3)
    for(let i=0;i<Math.min(count,limit);i++) {
      let pool = i===0 && fort.length && ruins.length ? (chance(0.5)?fort:ruins) :
        i===1 && fort.length && ruins.length && choices.some(g=>g.isMimic&&g.level===-3) ? ruins :
        i===1 && fort.length && ruins.length && choices.some(g=>g.isMimic&&g.level<-3) ? fort : choices
      pool=pool.filter(g=>!g.isMimic)
      if (!pool.length) pool=choices.filter(g=>!g.isMimic)
      mark(pick(pool),`mimic_fort_${i+1}`)
    }
    const labyrinth=groundItems.find(g=>g.towerMazeMimic && g.level===-1)
    if (!labyrinth) throw new Error('First Tower labyrinth level has no mimic chest')
    mark(labyrinth,'mimic_labyrinth_1')
  }

  function shift(chest,visible) {
    const options=[]
    // A disguised chest is an ordinary, traversable ground item. Treating it
    // as a solid blocker falsely prevented shifts in one-tile corridors and
    // maze dead ends; its destination does not alter terrain connectivity.
    for (const [dx,dy] of dirs) {
      const x=chest.x+dx,y=chest.y+dy,tile=map[y]?.[x]
      if (!TILE[tile]?.walk || tile==='water' || tile==='river' ||
        /(stair|door|gate|trap|lever|shaft|hole|exit|entrance|fissure|lava)/i.test(tile) ||
        visible.has(key(x,y)) || x===player.x && y===player.y ||
        groundItems.some(g=>onCurrentLevel(g)&&g.x===x&&g.y===y) ||
        enemies.some(e=>e.alive&&onCurrentLevel(e)&&e.x===x&&e.y===y) ||
        !DungeonTraps.safeSpawn(x,y,currentZ) ||
        DungeonTraps.isTrigger(tile) || DungeonHazards.knownDanger(x,y) ||
        DungeonHazards.isCrusherTrigger(x,y) || DungeonHazards.gasAt(x,y)) continue
      options.push({x,y})
    }
    if(!options.length)return false
    const p=options[Math.floor(hashFloat(chest,'destination')*options.length)]
    chest.x=p.x;chest.y=p.y
    // Memory remembers terrain, not separate chest objects. Invalidate the
    // minimap cache; never erase exploration of the old terrain square.
    minimapDirty=true
    mapPreviewBase=null
    return true
  }
  function onLevelChange() {
    lastLevel=levelKey()
    for (const g of groundItems) if(g.isMimic&&onCurrentLevel(g)) {
      g.unseenTurns=0;g.rolled=false
    }
  }
  function update() {
    const current=levelKey()
    if (current!==lastLevel) onLevelChange()
    if(currentZ>=0)return
    const visible=currentUndergroundFov()
    for (const g of groundItems) {
      if(!g.isMimic || g.opened || !onCurrentLevel(g))continue
      if(visible?.has(key(g.x,g.y))) {g.unseenTurns=0;g.rolled=false;continue}
      g.unseenTurns++
      if(g.unseenTurns>=UNSEEN_THRESHOLD && !g.rolled) {
        g.rolled=true;g.episode++
        if(hashFloat(g,'shift')<SHIFT_CHANCE)shift(g,visible||new Set())
      }
    }
  }
  function onLoad() {lastLevel=levelKey()}

  function reveal(chest, surprise=true) {
    if(!chest?.isMimic || !onCurrentLevel(chest))return false
    const template=ENEMY_TEMPLATE_BY_NAME.Mimic
    if(!template)throw new Error('Mimic monster template missing')
    // Reuse the Ruins' progression interpolation rather than frame/turn timing.
    const level=deepLevels[-chest.level-2]
    const scale=chest.towerMazeMimic ? 1 : dungeonProgressMultiplier([1,1.4],level?.progress||0,1)
    const e={...template, name:template.name,baseName:template.name,
      abilities:[...template.abilities],level:chest.level,levelKind:chest.levelKind,
      caveIndex:chest.caveIndex,x:chest.x,y:chest.y,homeX:chest.x,homeY:chest.y,
      homeTileType:map[chest.y][chest.x],hp:Math.round(template.hp*scale),
      maxHp:Math.round(template.hp*scale),atk:Math.round(template.atk*scale),
      def:Math.round(template.def*scale),spd:template.spd,grace:template.grace,
      aggro:template.aggro,humanoid:false,equipment:null,prefix:null,alive:true,aware:true,
      mimicStationary:STATIONARY_AFTER_REVEAL,mimicLoot:structuredClone(chest.loot),
      mimicSkipTurn:surprise && ATTACK_ON_REVEAL ? turnCount+1 : 0}
    const prefixChance=chest.towerMazeMimic ? WORLD_GEN_CONFIG.cavePopulation.deepPrefixChance :
      Math.min(1,(dungeonPackageConfig('dwarvenRuins')?.encounters?.prefixBaseChance||0.1)+
      Math.max(0,-chest.level-4)*(dungeonPackageConfig('dwarvenRuins')?.encounters?.prefixGrowthPerFloor||0))
    if(chance(prefixChance)) {
      const names=Object.keys(ENEMY_PREFIXES)
      if(names.length) {const prefix=pick(names);e.prefix=prefix;e.prefixBase=prefixBaseStats(e)
        applyEnemyPrefix(e,prefix);e.name=prefix+' '+e.name}
    }
    groundItems.splice(groundItems.indexOf(chest),1)
    addEnemy(e)
    rebuildActiveLevelOccupancy()
    if (surprise) spawnAmbushAnim()
    log(surprise ? `Ambush! The chest transforms into a ${e.name}!` :
      `The chest transforms into a ${e.name}!`, 'bad')
    if(surprise && ATTACK_ON_REVEAL && Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))<=1 &&
      !deathTransition && player.hp>0)enemyAttackPlayer(e)
    return true
  }
  // Spell effects reveal hidden chests first, so this same spell can affect
  // the resulting monster. A spell-caused reveal never grants a free ambush hit.
  function revealBySpell(affects) {
    const targets=groundItems.filter(g => g.isMimic && !g.opened &&
      onCurrentLevel(g) && affects(g.x,g.y))
    for (const chest of targets) reveal(chest,false)
    return targets.length
  }
  function revealAdjacent() {
    if (playerIsInvisible()) return false
    const adjacent=groundItems.filter(g=>g.isMimic&&onCurrentLevel(g)&&
      Math.max(Math.abs(g.x-player.x),Math.abs(g.y-player.y))<=1)
    for (const chest of adjacent) if(player.hp>0 && !deathTransition)reveal(chest)
    return adjacent.length>0
  }
  function hiddenAt(x,y) {
    return groundItems.find(g=>g.isMimic&&onCurrentLevel(g)&&g.x===x&&g.y===y)
  }
  function revealBump(x,y) { return reveal(hiddenAt(x,y)) }
  function deathLoot(e) {
    if(!e.mimicLoot)return false
    const loot=e.mimicLoot
    const gold=(loot.gold||0)+Math.max(1,Math.round(BONUS_GOLD*WORLD_GEN_CONFIG.lootRules.worldGoldMultiplier))
    if(gold){player.gold+=gold;log(`You recover ${gold} gold from the ${e.name}.`,'loot')}
    for(const item of loot.items||[]) {
      // These are precisely the pre-rolled contents of the disguised chest.
      if(isStackableKind(item.kind))addInventoryItem(item.kind,{count:item.count||1})
      else carryItem(item)
      const label = item.kind === 'artifact' ? artifactDisplayName(item) : item.name || itemDefinition(item.kind)?.name || item.kind
      lootLog(`The ${e.name} contained ${label}.`,item,label)
      if (item.kind === 'artifact' && enemyIsVisibleOnMainView(e)) spawnRareDropAnim(e)
    }
    return true
  }
  return {initialize,update,onLoad,onLevelChange,revealAdjacent,hiddenAt,revealBump,revealBySpell,deathLoot,
    UNSEEN_THRESHOLD,SHIFT_CHANCE,BONUS_GOLD,STATIONARY_AFTER_REVEAL,ATTACK_ON_REVEAL}
})()
