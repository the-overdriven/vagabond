// Artifact gear should behave as normal gear with independent magical bonuses.
// Keep this separate from 1-smoke.cy.js.
function loadedGame() {
  cy.visit('/')
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
  cy.readFile('tests/saves/Tester_start.json').then(save => {
    cy.window().then(win => {
      win.__artifactSaveFixture = save
      win.eval('loadGameFromObject(window.__artifactSaveFixture,{isReplayInit:true})')
      delete win.__artifactSaveFixture
    })
  })
}

describe('Gear bases on procedural artifacts', () => {
  beforeEach(loadedGame)

  it('keeps ground item prefixes and artifact identities concealed until collection', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const club={kind:'weapon',base:'Club',name:'Profound Club',atk:2,mod:'mf',modAmt:3}
      const artifact={kind:'artifact',name:'Scimitar of Thingar',noun:'Scimitar',
        base:'Scimitar',identified:false,artifactSlot:'weapon',bonuses:{atk:12}}
      check(groundItemLabel({kind:'droppeditem',item:club})==='Club',
        'ordinary prefix is not visible before pickup')
      check(groundItemLabel({kind:'droppeditem',item:artifact})==='Scimitar',
        'artifact identity is not visible on ground')
      check(groundGlyph({kind:'droppeditem',item:artifact}).ch ===
        groundGlyph({kind:'droppeditem',item:club}).ch,
        'ASCII floor symbol does not reveal an artifact weapon')
      check(groundGlyph({kind:'droppeditem',item:{...artifact,artifactSlot:'trinket'}}).ch !== '♦',
        'non-gear artifacts use a neutral floor symbol')
      currentZ=0;map=surfaceMap;player.x=40;player.y=40;enemies=[];npcs=[]
      const drop={kind:'droppeditem',item:club,x:41,y:40,level:0}
      groundItems=[drop]
      let tooltip=tileInspectInfo(drop.x,drop.y)?.html || ''
      check(tooltip.includes('>Club<')&&!tooltip.includes('Profound'),
        'ground hover only shows the base equipment name')
      drop.item=artifact
      tooltip=tileInspectInfo(drop.x,drop.y)?.html || ''
      check(tooltip.includes('>Scimitar<')&&!tooltip.includes('Thingar'),
        'ground hover never names an unidentified artifact')
      groundItems=[{kind:'gear',x:41,y:40,level:0}]
      check(!tileInspectInfo(41,40)?.html?.includes('Equipment'),
        'buried gear remains hidden until it is dug up')
      const catalog=Object.entries(ITEM_DEFINITIONS || {})
      check(catalog.every(([kind,definition])=>typeof definition.description==='string' &&
        definition.description.trim()),'every catalog item has a readable description')
      check(!!TILE_DESC.mausoleumtrapdoor,'mausoleum trapdoor is inspectable')
    })()`))
  })

  it('does not append redundant equipment categories to artifact stats', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      for (const [slot,noun,stat] of [['armor','Tunic','DEF 4'],['weapon','Spear','ATK 7'],['shield','Buckler','DEF 3']]) {
        const item={kind:'artifact',artifactSlot:slot,noun,base:noun,
          name:noun+' of Shasar',identified:true,def:slot==='weapon'?0:slot==='armor'?4:3,
          atk:slot==='weapon'?7:0,grace:2,bonuses:{mf:2}}
        const line=itemStatLine(item)
        check(line.includes(stat)&&line.includes('MF +2'),'artifact stats still visible')
        check(!['WEAPON','ARMOR','SHIELD'].some(label=>line.includes(label)),
          'no redundant category for '+slot)
        item.identified=false
        check(itemStatLine(item)==='???','unidentified artifact stays secret')
      }
    })()`))
  })

  it('discounts only artifact selling when unidentified or identified as cursed', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const art={kind:'artifact',tier:3,mod:'atk',modAmt:2,baseValue:200,
        identified:false,curse:null}
      const normal=SELL_VALUE_BY_TIER[3]+10
      check(itemSellValue(art)===Math.floor(normal/2),'unidentified artifact sells for half')
      art.curse={everyTurns:10,types:['hp']}
      check(itemSellValue(art)===Math.floor(normal/2),'hidden curse does not stack discounts')
      art.identified=true
      check(itemSellValue(art)===Math.floor(normal/4),'identified cursed artifact sells for quarter')
      art.curse=null
      check(itemSellValue(art)===normal,'identified clean artifact keeps normal sell value')
      check(itemBaseValue(art)===220,'artifact purchase base remains unchanged')
      check(itemSellValue({kind:'weapon',tier:3,mod:'atk',modAmt:2})===normal,
        'ordinary equipment remains unaffected by artifact discounts')
    })()`))
  })

  it('uses identification-dependent artifact prices without repricing merchant stock', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const ability=ARTIFACT_ABILITIES.abilities
      check(Object.keys(ability).length===51,'the implemented artifact catalog still has 51 powers')
      check(Object.entries(ability).every(([id,a])=>Number.isInteger(a.priceBonus)&&a.priceBonus>=0),
        'every ability has an individual nonnegative premium')
      check(ability.sacred_aegis.priceBonus===720&&ability.taunt.priceBonus===70,
        'high and low prices are configured per ability')
      const item={kind:'artifact',tier:5,baseValue:280,artifactSlot:'armor',
        abilityId:'sacred_aegis',identified:false,curse:null,merchantPrice:280}
      check(itemBuyValue(item)===480,'unidentified costs base plus 200 gold')
      check(itemSellValue(item)===70,'unidentified selling has no premium')
      item.identified=true
      check(itemBuyValue(item)===1000,'identified price uses ability premium and purchase cap')
      check(itemSellValue(item)===320,'identified selling adds 25 percent of ability premium')
      item.curse={everyTurns:10,types:['hp']}
      check(itemSellValue(item)===215,'curse only discounts base selling price')
      check(item.merchantPrice===280&&itemBaseValue(item)===280,'base inputs are never mutated')
      item.abilityId='taunt';item.curse=null
      check(itemBuyValue(item)===350,'cheap power uses its own premium')
      item.identified=false
      check(itemBuyValue(item)===480,'unidentified price is independent of hidden ability')
      const trinket={kind:'artifact',artifactSlot:'trinket',baseValue:280,identified:false}
      check(itemBuyValue(trinket)===280,'powerless trinket has no gambling surcharge')
      check(itemBuyValue({kind:'weapon',baseValue:80,merchantPrice:60})===60,
        'ordinary merchant base overrides are unchanged')
      check(itemBuyValue(item)===480,'repeated price reads cannot accumulate surcharges')
    })()`))
  })

  it('pulls names from all gear catalogs and carries base stats on every generated gear artifact', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const all=[['weapon',WEAPONS],['shield',SHIELDS],['armor',ARMORS]]
      for(const [slot,items] of all)for(const base of items){
        check(!ARTIFACT_NOUNS.includes(base.name),'duplicated noun '+base.name)
        const tier=Math.max(3,base.tier)
        const oldPick=pick,oldRng=rng
        let item
        try {
          rng=()=>.9
          pick=pool=>pool.includes(base.name) ? base.name :
            pool.find(value=>value?.id && value.tier===tier) || oldPick(pool)
          item=makeArtifactItem(tier)
        } finally {pick=oldPick;rng=oldRng}
        check(item.noun===base.name && item.base===base.name,'selected noun '+base.name)
        check(item.artifactSlot===slot,'slot '+base.name)
        check(item.tier===tier,'effect tier '+base.name)
        check(!!ARTIFACT_ABILITIES.abilities[item.abilityId]?.enabled,
          'generated gear has an enabled ability '+base.name)
        check(artifactAbilityPool(item).includes(item.abilityId),
          'ability belongs to the gear domain '+base.name)
        if(base.rangedAtk)check(artifactAbilityPool(item).every(id=>ARTIFACT_ABILITIES.domains.archery.includes(id)),
          'bow has archery powers only '+base.name)
        if(slot==='weapon'){
          check(item.atk===base.atk && item.grace===base.grace,'weapon stats '+base.name)
          check(item.twoHanded===base.twoHanded,'weapon handedness '+base.name)
          if(base.rangedAtk)check(item.rangedAtk===base.rangedAtk && item.rangedRange===base.rangedRange,
            'ranged artifact stats '+base.name)
        } else check(item.def===base.def,'defense '+base.name)
        if(slot==='armor')check(item.speedPenalty===(base.speedPenalty||0) &&
          (item.gracePenalty||0)===(base.gracePenalty||0),'armor penalties '+base.name)
      }
      const previousPick=pick, previousRng=rng
      try {
        rng=()=>.9
        pick=pool=>pool.includes('Amulet')?'Amulet':previousPick(pool)
        check(/^The Amulet of /.test(makeArtifactItem(3).name),'non-gear artifacts keep The')
      } finally {pick=previousPick;rng=previousRng}
      const eligible=[...WEAPONS,...SHIELDS,...ARMORS].filter(base=>base.tier<=3).map(base=>base.name)
      check(!eligible.includes('Titan Warpick') && eligible.includes('Brigandine'),'tier limit')
    })()`))
  })

  it('keeps physical stats, bonus effects, speed, grace and item data after saving and equipping', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      enemies=[];npcs=[];occupied=new Set();oldHunterQuest=null
      player.equip={weapon:null,shield:null,armor:null};player.inventory=[]
      const brigandine={kind:'artifact',name:'Brigandine of Ermis',noun:'Brigandine',base:'Brigandine',
        tier:3,artifactSlot:'armor',identified:true,def:12,speedPenalty:2,
        bonuses:{def:4,spd:3},maxHpPct:0,curse:null,curseTimer:0}
      const initial=playerPermanentStats()
      player.inventory=[brigandine]
      startReplayRecording();equipItem(0)
      // Recording assigns a stable replayId to equipment. Compare the resulting
      // equipped item, not the pre-recording inventory object.
      const beforeItem=JSON.stringify(player.equip.armor)
      check(player.equip.armor?.base==='Brigandine','equip armor')
      const after=playerPermanentStats()
      check(after.def===initial.def+16,'12 base + 4 enchanted DEF')
      check(after.spd===initial.spd+1,'-2 armor SPD + 3 enchanted SPD')
      check(itemStatLine(player.equip.armor).includes('DEF 12'),'base DEF visible')
      check(itemStatLine(player.equip.armor).includes('DEF +4'),'enchantment visible')
      check(itemStatLine(player.equip.armor).includes('SPD -2'),'penalty visible')
      const recorded=JSON.parse(JSON.stringify(replayData))
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      check(JSON.stringify(player.equip.armor)===beforeItem,'equipped artifact persisted')
      check(JSON.stringify(playerPermanentStats())===JSON.stringify(after),'restored stats')
      window.__artifactReplayFixture={recorded, after, beforeItem}
    })()`))
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const {recorded,after,beforeItem}=window.__artifactReplayFixture
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true
      activeReplay=recorded;replayRngIndex=0
      try {
        for(const action of recorded.actions)await runReplayAction(action)
        check(JSON.stringify(player.equip.armor)===beforeItem,'replay equipped artifact')
        check(JSON.stringify(playerPermanentStats())===JSON.stringify(after),'replay stats')
      } finally {
        replayPlaying=false;replaySimulationMode=false;activeReplay=null
        delete window.__artifactReplayFixture
      }
    })()`))
  })

  it('keeps two-handed restrictions, and shield and armor speed/grace penalties', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      enemies=[];npcs=[];occupied=new Set();oldHunterQuest=null
      const weapon={kind:'artifact',artifactSlot:'weapon',name:'Sword artifact',noun:'Two-handed Sword',
        base:'Two-handed Sword',tier:4,identified:true,atk:11,grace:2,twoHanded:true,bonuses:{atk:2}}
      const shield={kind:'artifact',artifactSlot:'shield',name:'Tower Shield artifact',noun:'Tower Shield',
        base:'Tower Shield',tier:4,identified:true,def:10,bonuses:{def:3}}
      const armor={kind:'artifact',artifactSlot:'armor',name:'Hauberk artifact',noun:'Hauberk',
        base:'Hauberk',tier:3,identified:true,def:9,speedPenalty:3,gracePenalty:1,bonuses:{}}
      player.equip={weapon:null,shield:null,armor:null};player.inventory=[weapon,shield,armor]
      equipItem(1)
      check(player.equip.shield===shield,'shield equipped')
      check(gearGracePenalty(shield)===1,'shield grace penalty')
      const shieldPenalty=playerPermanentStats()
      equipItem(player.inventory.indexOf(armor))
      check(playerSpdRaw(true)===shieldPenalty.spd-3,'hauberk SPD penalty')
      check(playerGracePenalty(true)===2,'shield and armor GRACE penalties')
      equipItem(player.inventory.indexOf(weapon))
      check(player.equip.weapon===weapon && player.equip.shield===null,'two-handed weapon removes shield')
      check(playerGrace(true)===Math.max(0,weapon.grace+playerGraceBonus()-1),'artifact weapon uses GRACE')
      check(Math.abs(combatDelay(weapon,true)-6/playerCombatGrace(weapon))<1e-9,
        'artifact weapon uses effective combat GRACE')
      check(itemStatLine(armor).includes('GRACE -1'),'armor penalty in UI')
    })()`))
  })

  for (const width of [1440,390]) it('shows artifact stats in inventory at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win => win.eval(`(() => {
      const item={kind:'artifact',name:'Brigandine of Ingvar',noun:'Brigandine',base:'Brigandine',
        tier:3,artifactSlot:'armor',identified:true,def:12,speedPenalty:2,bonuses:{def:4}}
      player.inventory=[item];invTab='armor';toggleInv(true)
    })()`))
    cy.get('#invList').should('contain.text','Brigandine of Ingvar')
    cy.get('#invList').should('contain.text','DEF 12')
    cy.get('#invList').should('contain.text','DEF +4')
    cy.get('#invList').should('contain.text','SPD -2')
  })


  it('keeps enemy artifact debuffs and bravery charge through current save/replay', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      const victim=addEnemy({...t,id:'artifact-batch2-check',name:'Goblin',baseName:'Goblin',
        level:currentZ,levelKind:currentLevelKind(),x:player.x+1,y:player.y,
        alive:true,hp:100,maxHp:100,atk:10,def:10,spd:8,aggro:6,
        artifactSunderStacks:3,artifactBlindAtkPenalty:2,
        artifactBlindAggroPenalty:true,artifactSlowUntilTurn:turnCount+3})
      player.artifactBraveryCharge=true
      player.artifactRiposteReady=true;player.artifactRetributionStored=14
      player.artifactBloodReservoirStored=2.5;player.artifactPainEaterHits=3
      player.artifactRhythmGuardReady=true;player.artifactEvasionPrepared=true
      player.artifactSacredReadyTurn=turnCount+7
      player.artifactLastStandCooldownUntil=turnCount+40
      player.artifactBoneplateExpiries=[turnCount+3,turnCount+6]
      victim.artifactExecutionerUsed=true;victim.artifactBound=true
      player.artifactElusiveReady=true;player.artifactMartialEvasionPending=true
      const before={def:enemyDef(victim),atk:enemyAtk(victim),aggro:enemyAggroRange(victim),spd:enemySpd(victim)}
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      check(saved.enemies.find(e=>e.id===victim.id).aggro===6,'save raw AGGRO')
      loadGameFromObject(saved,{isReplayInit:true})
      const restored=enemies.find(e=>e.id===victim.id)
      check(restored && enemyDef(restored)===before.def && enemyAtk(restored)===before.atk &&
        enemyAggroRange(restored)===before.aggro && enemySpd(restored)===before.spd,
        'status does not stack twice after restoration')
      check(restored.artifactExecutionerUsed===true && restored.artifactBound===true,
        'Executioner and Binding retain enemy-local markers')
      check(player.artifactBraveryCharge===true,'Bravery charge survives replay state')
      check(player.artifactRiposteReady===true && player.artifactRetributionStored===14 &&
        player.artifactBloodReservoirStored===2.5 && player.artifactPainEaterHits===3,
        'martial and damage-event charges survive the save')
      check(player.artifactRhythmGuardReady===true && player.artifactEvasionPrepared===true &&
        player.artifactSacredReadyTurn===turnCount+7 &&
        player.artifactLastStandCooldownUntil===turnCount+40 &&
        JSON.stringify(player.artifactBoneplateExpiries)===JSON.stringify([turnCount+3,turnCount+6]),
        'ward cooldowns and independent Boneplate expiries survive the save')
      check(player.artifactElusiveReady===true && player.artifactMartialEvasionPending===true,
        'free-step and sidestep state survives the save')
    })()`))
  })

  it('retains enemy control and fear-source fields in saves and the shared ability pool', () => {
    cy.window().then(win => win.eval(`(() => {
      const abilities=ARTIFACT_ABILITIES.abilities
      const expected=['petrifying_strike','silence','confusion','disarm','taunt',
        'fear_aura','fear_eater','executioners_aura']
      for(const id of expected) if(!abilities[id]?.enabled)throw Error('Missing ability '+id)
      const target=enemies.find(e=>e.alive&&onCurrentLevel(e))
      if(!target)throw Error('Missing test enemy')
      target.artifactPetrified=true
      target.artifactSilencedUntilTurn=turnCount+4
      target.artifactConfusedUntilTurn=turnCount+4
      target.artifactDisarmed=true
      target.artifactRangedDisarmed=true
      target.artifactFearAuraOnly=true
      target.artifactFearAuraCheckedTurn=turnCount
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(snapshot,{isReplayInit:true})
      const restored=enemies.find(e=>e.id===target.id)
      if(!restored?.artifactPetrified||!restored.artifactDisarmed||!restored.artifactRangedDisarmed||
         restored.artifactSilencedUntilTurn!==turnCount+4||
         restored.artifactConfusedUntilTurn!==turnCount+4||
         !restored.artifactFearAuraOnly||restored.artifactFearAuraCheckedTurn!==turnCount)
        throw Error('Control and fear state lost during save/replay restoration')
    })()`))
  })

  it('keeps Soul Eater ghosts and independent Soul Fed stacks in current saves', () => {
    cy.window().then(win => win.eval(`(() => {
      if (!ARTIFACT_ABILITIES.abilities.soul_eater?.enabled) throw Error('Soul Eater missing')
      player.equip.weapon={kind:'artifact',artifactSlot:'weapon',name:'Soul Eater',
        base:'Dagger',identified:true,abilityId:'soul_eater'}
      player.artifactSoulFedExpiries=[turnCount+20,turnCount+90]
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      if(JSON.stringify(saved.player.artifactSoulFedExpiries)!==JSON.stringify(player.artifactSoulFedExpiries))
        throw Error('Soul Fed stack durations not saved')
      const enemy=enemies.find(e=>e.alive&&onCurrentLevel(e))
      if(!enemy)throw Error('No fixture enemy')
      enemy.artifactSoulGhost=true
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(snapshot,{isReplayInit:true})
      if(!enemies.find(e=>e.id===enemy.id)?.artifactSoulGhost || artifactSoulFedStacks()!==2)
        throw Error('Soul Eater state lost during save/replay restoration')
    })()`))
  })

  it('keeps the new slot-restricted abilities and Berserker roll deterministic across saves', () => {
    cy.window().then(win => win.eval(`(() => {
      const verify=(condition,message)=>{if(!condition)throw Error(message)}
      for(const id of ['ambusher','tideguard','fortunes_fang','veteran_xp','veteran_level',
        'berserkers_oath','duelist','weaponmaster']) {
        verify(ARTIFACT_ABILITIES.abilities[id]?.enabled,'Missing enabled ability '+id)
        verify(Number.isInteger(ARTIFACT_ABILITIES.abilities[id].priceBonus),'Missing price '+id)
      }
      const bow={kind:'artifact',artifactSlot:'weapon',base:'Short Bow',rangedAtk:5,twoHanded:true}
      const armor={kind:'artifact',artifactSlot:'armor',base:'Tunic'}
      const shield={kind:'artifact',artifactSlot:'shield',base:'Buckler'}
      verify(artifactAbilityPool(bow).includes('ambusher'),'Ambusher not available for bows')
      verify(!artifactAbilityPool(bow).includes('fortunes_fang'),'Bow rolled a melee-only ability')
      verify(!artifactAbilityPool(bow).includes('weaponmaster'),'Bow rolled armor ability')
      verify(artifactAbilityPool(armor).includes('berserkers_oath'),'Berserker missing from armor')
      verify(artifactAbilityPool(shield).includes('tideguard'),'Shield lacks Tideguard')
      verify(!artifactAbilityPool(shield).includes('berserkers_oath'),'Shield rolled armor-only ability')
      player.equip={weapon:{kind:'weapon',base:'Dagger',atk:2,grace:5},shield:null,
        armor:{kind:'artifact',artifactSlot:'armor',base:'Tunic',def:0,bonuses:{},
          name:'Tunic of the Oath',noun:'Tunic',identified:true,abilityId:'berserkers_oath',
          berserkerOathRoll:2}}
      const originalId=player.equip.armor.abilityId
      player.equip.armor.abilityId=null
      const before={atk:playerAtk(),def:playerDef()}
      player.equip.armor.abilityId=originalId
      verify(playerAtk()===before.atk+2 && playerDef()===before.def-2,
        'Berserker rolled stat exchange is not applied')
      const beforeSave={atk:playerAtk(),def:playerDef()}
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      verify(player.equip.armor?.berserkerOathRoll===2,'Berserker roll rerolled during load')
      verify(playerAtk()===beforeSave.atk && playerDef()===beforeSave.def,
        'Berserker derived stats changed during restoration')
      verify(itemStatLine(player.equip.armor).includes('DEF -2'),
        'Identified Berserker roll is not disclosed in item details')
    })()`))
  })

  it('recalculates the skill-built artifact bonuses when the loadout changes', () => {
    cy.window().then(win => win.eval(`(() => {
      const verify=(condition,message)=>{if(!condition)throw Error(message)}
      player.combatSkills.oneHanded=80;player.combatSkills.twoHanded=60
      player.equip={weapon:{kind:'weapon',base:'Dagger',twoHanded:false,atk:2,grace:5},
        armor:{kind:'artifact',artifactSlot:'armor',base:'Tunic',def:0,identified:true,
          abilityId:'duelist'},shield:null}
      verify(artifactDuelistBonus()===.20,'Duelist damage does not scale with skill')
      player.equip.shield={kind:'shield',base:'Buckler',def:1}
      verify(artifactDuelistBonus()===0,'Equipping shield must cancel Duelist')
      player.equip.shield=null
      player.equip.armor.abilityId=null
      const grace=playerGraceBonus()
      player.equip.armor.abilityId='weaponmaster'
      verify(playerGraceBonus()===grace+3,'Weaponmaster does not reward both skills')
      player.equip.weapon={kind:'weapon',base:'Short Bow',twoHanded:true,rangedAtk:5}
      verify(playerGraceBonus()===grace,'Bow must not receive Weaponmaster GRACE')
    })()`))
  })

  for (const width of [1440,390]) it('displays granted powers and inspection text at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win=>win.eval(`(() => {
      const ability=ARTIFACT_ABILITIES.abilities.vigorplate
      if(!ability?.enabled)throw Error('Vigorplate must be enabled')
      const item={kind:'artifact',name:'Brigandine of Aldrek',noun:'Brigandine',base:'Brigandine',
        artifactSlot:'armor',tier:3,identified:true,def:12,speedPenalty:2,bonuses:{},
        description:'A remarkably resilient suit.',abilityId:'vigorplate'}
      player.inventory=[item];player.equip={weapon:null,shield:null,armor:null}
      const originalLog=log, messages=[]
      try {log=(msg)=>messages.push(msg);inspectArtifact(0)}finally{log=originalLog}
      if(!messages.some(msg=>msg.includes('Vigorplate:') && msg.includes(ability.description)))
        throw Error('inspecting an identified artifact must describe its power')
      invTab='armor';toggleInv(true)
    })()`))
    cy.get('#invList').should('contain.text','Brigandine of Aldrek').and('contain.text','Vigorplate')
  })

  for (const width of [1440,390]) it('equips an unidentified artifact without revealing it at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win=>win.eval(`(() => {
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      enemies=[];npcs=[];occupied=new Set();oldHunterQuest=null
      player.equip.weapon=null
      player.inventory=[{kind:'artifact',noun:'Dagger',name:'Dagger of Hidden Dwarf',
        artifactSlot:'weapon',base:'Dagger',tier:3,identified:false,atk:7,grace:2,
        bonuses:{atk:5},curse:{everyTurns:8,types:['hp']},curseTimer:0}]
      invTab='weapon';toggleInv(true)
    })()`))
    cy.get('#invList').should('contain.text','Unidentified Dagger').and('contain.text','???')
    cy.get('#invList').should('not.contain.text','Hidden Dwarf').and('not.contain.text','ATK +5')
      .and('not.contain.text','[T3]')
    cy.get('#invList .nm').should('not.have.class','tier3')
    cy.get('#invList .invitem').should($row=>{
      const drop=$row[0].querySelector('.inventory-drop-btn')
      const name=$row[0].querySelector('.nm')
      expect(name.getBoundingClientRect().right, 'Drop follows the item name')
        .to.be.at.most(drop.getBoundingClientRect().left)
      const identify=$row[0].querySelector('button:not(.inventory-drop-btn)')
      expect(drop.getBoundingClientRect().right, 'Drop is the leftmost action')
        .to.be.at.most(identify.getBoundingClientRect().left)
    })
    cy.contains('#invList button','Equip').should('be.visible').click()
    cy.get('#slotWeapon .val').should('contain.text','Unidentified Dagger').and('contain.text','???')
    cy.get('#slotWeapon .val').should('not.contain.text','Hidden Dwarf').and('not.contain.text','ATK +5')
      .and('not.have.class','tier3')
    cy.window().then(win=>win.eval(`(() => {
      if(player.equip.weapon?.identified!==false || player.equip.weapon?.bonuses?.atk!==5)
        throw Error('unidentified gear effects and hidden state must survive equipping')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      if(player.equip.weapon?.identified!==false || player.equip.weapon?.bonuses?.atk!==5)
        throw Error('unidentified equipped gear must survive save/replay restoration')
    })()`))
    cy.window().then(win=>win.eval('player.equip.weapon.identified=true;renderInventory()'))
    cy.get('#slotWeapon .val').should('have.class','tier3')
  })
})
