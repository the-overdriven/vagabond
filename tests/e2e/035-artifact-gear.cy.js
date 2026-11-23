// Artifact gear should behave as normal gear with independent magical bonuses.
// Keep this separate from 001-smoke.cy.js.
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
    // Item icons are decoded in the background after the loading overlay closes.
    // Retry the readiness check without injecting an image or retrying state mutations.
    cy.window({timeout:60000}).should(win => {
      expect(win.eval("preloadedImages.has('img/icons/trinkets/Feather.svg')"),
        'artifact SVG is preloaded and decoded').to.equal(true)
    }).then(win => win.eval(`(() => {
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
      const trinket={kind:'artifact',artifactSlot:'trinket',noun:'Feather'}
      check(groundGlyph({kind:'droppeditem',item:trinket}).ch !== '♦',
        'non-gear artifacts use a neutral ASCII floor symbol')
      const trinketVisual=droppedInventoryVisual(trinket)
      check(trinketVisual?.image==='img/icons/trinkets/Feather.svg',
        'ground tiles use the trinket noun artwork')
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

  it('generates powered trinkets, applies Wayfaring and preserves carried rolls', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      currentZ=0;map=surfaceMap;player.x=40;player.y=40;map[40][40]='grass'
      player.inventory=[];player.equip={weapon:null,shield:null,armor:null}
      player.race='human';player.baseDef=20;player.baseSpd=10;player.lvl=1;player.maxHp=100;player.hp=100
      player.weakenTurns=0;player.stoneSkinTurns=0;player.berserkTurns=0;player.curseDebuffs=[]
      player.slowTurns=0;player.speedPotionTurns=0;player.gazeTurns=0
      replayAnimationsDisabled=true;replayRecording=false
      const wanted=ARTIFACT_ABILITIES.domains.wayfaring
      const effect=ARTIFACT_EFFECTS.find(e=>e.tier===3)
      const sample=id=>makeWayfaringTrinket('Feather',effect,0,id)
      for(let i=0;i<30;i++) {
        const item=makeArtifactItem(5,0,{nonGearOnly:true})
        check(eligibleArtifactTrinketNouns(item.tier).includes(item.noun)&&wanted.includes(item.abilityId), 'eligible loot')
        check(!item.identified&&!Object.keys(item.bonuses).length&&item.maxHpPct===0,'power-only trinket')
      }
      const pilgrimText=artifactInspectionText(sample('pilgrim'))
      const trailblazerText=artifactInspectionText(sample('trailblazer'))
      check(pilgrimText.includes('700 newly discovered tiles') && pilgrimText.includes('10% of your maximum HP') &&
        pilgrimText.includes('30 XP per character level'),'Pilgrim inspection explains the reward threshold and amounts')
      check(trailblazerText.includes('5 newly discovered tiles reduce all active cooldowns of Wayfaring artifacts by 1 turn') &&
        trailblazerText.includes('Your XP bonus determines the percentage chance of reducing them by an additional turn'),
        'Trailblazer inspection explains which artifacts recharge and the bonus chance')
      const def=playerDef(),speed=playerSpd(),mf=playerMf()
      player.inventory=[sample('highlander')];map[40][40]='hill'
      check(playerDef()===def+4&&playerSpd()===speed,'Highlander replaces hill penalty and defense')
      map[40][40]='grass';player.inventory=[sample('adrenaline')];player.hp=25
      check(playerSpd()===speed,'Adrenaline inactive at exact threshold')
      player.hp=24;check(playerSpd()===speed+3&&playerSpd(true)===speed,'Adrenaline active below threshold, excluded from permanent SPD')
      player.baseSpd=30;player.inventory.push(sample('adrenaline'))
      check(playerSpd()===35&&playerSpd(true)===30,'Adrenaline scales with permanent SPD without stacking')
      player.speedPotionTurns=1;player.speedPotionBonus=10
      check(playerSpd()===45,'Adrenaline does not scale from temporary SPD')
      player.speedPotionTurns=0;player.baseSpd=10
      player.inventory=[sample('permafrost')];map[40][40]='snow';player.freezing={active:true,turns:1}
      tickFreezing();check(!player.freezing.active&&playerDef()===def+3,'Permafrost immunity and defense')
      map[40][40]='sand';check(playerDef()===def-3,'sand penalty')
      player.inventory=[sample('exile')];player.hp=25;player.poisonTurns=2
      tryTempleHeal();check(player.hp===25&&player.poisonTurns===0,'Exile blocks healing but not cleansing')
      player.inventory.push(createItem('homecomingscroll',{count:2}))
      const exileTurn=turnCount,exileRng=rngState
      useHomecomingScroll(1)
      check(player.inventory[1].count===2&&turnCount===exileTurn&&rngState===exileRng,'Exile blocks Homecoming without spending resources')
      player.inventory[0].identified=false;useHomecomingScroll(1)
      check(player.inventory[1].count===2&&turnCount===exileTurn&&rngState===exileRng,'unidentified Exile still blocks Homecoming')
      player.inventory=[sample('drifter'),sample('drifter'),createItem('homecomingscroll')]
      check(playerMf()===mf+22,'Drifter copies stack')
      const turn=turnCount,rng=rngState
      useHomecomingScroll(2);check(turnCount===turn&&rngState===rng&&player.inventory[2].kind==='homecomingscroll','blocked scroll is not consumed')
      player.inventory=[];player.hp=100;map[40][40]='grass';carryItem(sample('troglodyte'))
      check(playerMaxHp()===80&&player.hp===80,'Troglodyte acquisition clamps HP')
      currentZ=-4;markPlayerPositionChanged();check(playerMaxHp()===100&&player.hp===80,'depth does not heal')
      currentZ=0;map=surfaceMap;markPlayerPositionChanged()
      const drifter=sample('drifter');drifter.godTestArtifact=false;carryItem(drifter)
      const saved=structuredClone(buildSaveObject());loadGameFromObject(saved,{isReplayInit:true})
      check(player.inventory.some(i=>i.abilityId==='drifter'&&i.drifterMf===11)&&playerMaxHp()===80,'save keeps rolls and derived HP')
      player.inventory=[sample('pilgrim')];player.equip={weapon:null,shield:null,armor:null}
      player.wayfaring=ArtifactWayfaring.freshState();player.race='human';player.lvl=1
      player.maxHp=100;player.hp=50;player.xp=0;player.totalXpEarned=0
      ArtifactWayfaring.discover(699);ArtifactWayfaring.discover(700,'farsight')
      check(player.wayfaring.pilgrimTiles===699&&player.hp===50&&player.totalXpEarned===0,
        'Pilgrim waits for the threshold and ignores magical discovery')
      const originalLog=log,messages=[]
      try {
        log=msg=>messages.push(msg)
        ArtifactWayfaring.discover(1)
        // A Human receives 20% extra XP: 30 base XP becomes 36.
        check(player.wayfaring.pilgrimTiles===0&&player.hp===60&&player.totalXpEarned===36,
          'Pilgrim grants the 700-tile reward including the Human XP bonus')
        check(messages[0]==='Pilgrim rewards your exploration: +10 HP.'&&messages[1]==='You gain 36 XP.',
          'Pilgrim announces the reward before its modified XP')
        messages.length=0;player.inventory=[sample('expedition')];currentZ=-1
        ArtifactWayfaring.visitDepth()
        check(messages[0]==='Expedition rewards your descent.'&&messages[1]==='You gain 120 XP.'&&
          messages[2].startsWith('You reached Level 2!'),'Expedition announces the reward before XP and level-up')
        messages.length=0;player.inventory[0].identified=false;currentZ=-2
        ArtifactWayfaring.visitDepth()
        check(messages[0]==='A strange power rewards your descent.'&&messages[1]==='You gain 120 XP.',
          'Unidentified Expedition announces the reward without revealing its name')
      } finally {log=originalLog}
    })()`))
  })

  it('shares Wayfaring enemy phases and spends stacked free steps separately', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const originalChance=chance,originalPhase=resolveEnemyPhase
      try {
        replayAnimationsDisabled=true;replayRecording=false
        currentZ=0;map=surfaceMap;player.x=40;player.y=40;player.hp=100;player.maxHp=100
        player.rootTurns=0;player.godMode=false;player.poisonTurns=0
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        for(let y=38;y<=42;y++)for(let x=37;x<=45;x++)map[y][x]='grass'
        player.wayfaring=ArtifactWayfaring.freshState()
        const sample=id=>makeWayfaringTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
        player.inventory=[sample('longstrider'),sample('never_look_back'),sample('windwalker')]
        // Exercise both phase modifiers with presentation enabled, including hidden identity.
        const originalLog=log,originalPopup=spawnDamageNumber
        try {
          const messages=[],popups=[]
          log=(msg,tone)=>messages.push([msg,tone]);spawnDamageNumber=(x,y,amount)=>popups.push(amount)
          replayAnimationsDisabled=false;replaySimulationMode=false
          for(const known of [true,false]) {
            player.inventory[1].identified=known
            player.wayfaring.discoveredPrevious=false;chance=p=>p===.25
            check(ArtifactWayfaring.enemyPhases()===2,'extra phase unchanged')
            check(messages.pop().join('|')===(known?'Never Look Back':'A strange power')+' gives enemies an additional turn!|bad','explicit extra-turn log')
            player.wayfaring.discoveredPrevious=true;chance=p=>p===.5
            check(ArtifactWayfaring.enemyPhases()===0,'skipped phase unchanged')
            check(messages.pop().join('|')===(known?'Never Look Back':'A strange power')+' quickens your actions!|good','skip log preserved')
          }
          check(popups.length===0,'Never Look Back has no popups, including Magic!')
          artifactAbilityMessage('longstrider','Longstrider grants a swift step!','A strange power quickens your step!')
          check(popups.length===1&&popups[0]==='Longstrider','other artifact popups remain')
        } finally {
          log=originalLog;spawnDamageNumber=originalPopup;replayAnimationsDisabled=true
          player.inventory[1].identified=true
        }
        player.equip={weapon:null,shield:null,armor:{kind:'artifact',artifactSlot:'armor',base:'Tunic',name:'Test',identified:true,abilityId:'elusive',def:1}}
        player.wayfaring.windwalkerReady=true;player.artifactElusiveReady=true
        player.wayfaring.longstriderThreshold=5;player.wayfaring.longstriderSteps=4
        const before=turnCount
        let phases=0;resolveEnemyPhase=()=>phases++;chance=p=>p===.25
        await tryMove(1,0);await tryMove(1,0)
        check(player.x===42&&turnCount===before&&phases===0,'two separate free steps, no world turn')
        check(player.wayfaring.longstriderSteps===4,'free movement does not charge Longstrider')
        player.wayfaring.discoveredPrevious=false;player.poisonTurns=2
        await tryMove(1,0)
        check(turnCount===before+1&&phases===1&&player.poisonTurns===1,'skip and extra phase cancel, clocks tick once')
        player.wayfaring.discoveredPrevious=false;enemyTurn()
        check(phases===3&&player.poisonTurns===0,'extra phase does not double-tick poison')
        const saved=structuredClone(buildSaveObject());loadGameFromObject(saved,{isReplayInit:true})
        check(player.wayfaring.longstriderThreshold>=5&&player.wayfaring.longstriderThreshold<=10,'threshold persists')
      } finally {chance=originalChance;resolveEnemyPhase=originalPhase}
    })()`))
  })

  it('charges Water Walking per turn, lava per entered tile and gives Castaway priority', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayAnimationsDisabled=true;replayRecording=false
      currentZ=0;map=surfaceMap;player.x=40;player.y=40;player.race='human';player.hp=200;player.maxHp=200
      player.rootTurns=0;player.godMode=false;player.swimming=0;player.poisonTurns=0;player.berserkTurns=0
      player.equip={weapon:null,shield:null,armor:null};resetSwimming()
      enemies=[];npcs=[];groundItems=[];occupied=new Set()
      for(let y=35;y<=45;y++)for(let x=35;x<=50;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
      player.wayfaring=ArtifactWayfaring.freshState()
      const sample=id=>makeWayfaringTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
      player.inventory=[sample('water_walking'),sample('emberwalker'),sample('castaway'),sample('rush')]
      map[40][41]='water';map[40][42]='lava';map[40][43]='lava';map[40][44]='lava'
      await tryMove(1,0);check(!isActuallySwimming()&&canUseItemsWhileSwimming()&&ArtifactWayfaring.waterRemaining()===7,'water walking permits item use')
      await skipTurn();check(ArtifactWayfaring.waterRemaining()===6,'waiting spends reserve')
      const hp=player.hp;check(ArtifactWayfaring.activate(3),'Rush available')
      ArtifactWayfaring.rushStep(1,0);ArtifactWayfaring.rushStep(1,0);ArtifactWayfaring.rushStep(1,0);ArtifactWayfaring.finishRush()
      check(player.hp===hp-30,'three entered lava tiles charge exactly three times')
      player.inventory=[sample('castaway')];player.x=41;player.y=40;player.swimming=30;player.hp=0;player.deathShieldReady=true
      check(absorbPlayerFatalDamage()&&player.hp===7&&player.deathShieldReady&&currentZ===0,'Castaway precedes Death Shield')
      check(player.wayfaring.castawaySpent&&!isActuallySwimming(),'safe shore and spent rescue')
      const saved=structuredClone(buildSaveObject());loadGameFromObject(saved,{isReplayInit:true})
      check(player.wayfaring.castawaySpent,'rescue charge survives reload')
    })()`))
  })

  it('activates identified Wayfaring powers and saves a partially completed Rush', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayAnimationsDisabled=true;replayRecording=false
      currentZ=0;map=surfaceMap;player.x=40;player.y=40;player.hp=100;player.maxHp=100
      player.rootTurns=0;player.godMode=false;player.berserkTurns=0
      enemies=[];npcs=[];groundItems=[];occupied=new Set()
      for(let y=25;y<=55;y++)for(let x=25;x<=55;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
      player.wayfaring=ArtifactWayfaring.freshState();ArtifactWayfaring.baselinePosition()
      const sample=id=>makeWayfaringTrinket('Feather',ARTIFACT_EFFECTS.find(e=>e.tier===3),0,id)
      player.inventory=[sample('rush'),sample('backtrack'),sample('blink'),sample('phantom_trail')]
      player.inventory[0].identified=false
      check(!ArtifactWayfaring.activate(0),'unidentified power is unavailable')
      player.inventory[0].identified=true
      const before=turnCount
      check(ArtifactWayfaring.activate(0),'start sprint')
      check(!document.getElementById('wayfaringRushOverlay'),'no separate movement panel')
      check(activePlayerStatuses().some(s=>s.id==='artifact-rush'&&s.counter==='4 steps'),'remaining steps in status strip')
      const key=k=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k,cancelable:true}))
      const clickTile=(x,y)=>{
        const rect=canvas.getBoundingClientRect()
        const clientX=rect.left+(x-Math.floor(camX)+0.5)*TILE_PX*rect.width/canvas.width
        const clientY=rect.top+(y-Math.floor(camY)+0.5)*TILE_PX*rect.height/canvas.height
        canvas.dispatchEvent(new MouseEvent('click',{clientX,clientY,bubbles:true,cancelable:true}))
      }
      key('d')
      document.querySelector('.dpad button[data-dx="0"][data-dy="1"]').click()
      check(turnCount===before&&player.x===41&&player.y===41,'normal keyboard and D-pad steps do not advance time')
      clickTile(43,41)
      document.getElementById('touchInventory').click()
      check(!autoPath&&!invOpen&&player.x===41&&player.wayfaring.rush.steps===2,'no distant path or interleaved inventory action')
      const saved=structuredClone(buildSaveObject());loadGameFromObject(saved,{isReplayInit:true})
      check(player.wayfaring.rush.steps===2,'in-progress sprint survives save')
      clickTile(42,41)
      check(player.x===42&&player.wayfaring.rush.steps===3&&turnCount===before,'adjacent canvas click spends one sprint step')
      clickTile(42,41)
      check(!player.wayfaring.rush&&turnCount===before+1,'clicking player finishes early and spends one turn')
      check(!activePlayerStatuses().some(s=>s.id==='artifact-rush'),'rush status clears')
      check(ArtifactWayfaring.cooldownRemaining('rush')>0&&!ArtifactWayfaring.activate(0),'cooldown shared')
      player.rootTurns=2;check(ArtifactWayfaring.activate(2),'Blink can escape while rooted')
      check(currentZ===0,'Blink never changes Z')
      const origin={x:player.x,y:player.y,z:currentZ,turn:turnCount}
      check(ArtifactWayfaring.activate(3),'Phantom activation')
      const phantom=ArtifactWayfaring.phantomPosition()
      check(phantom.x===origin.x&&phantom.y===origin.y&&phantom.z===origin.z&&phantom.until===origin.turn+8,'Phantom starts on the player tile and lasts eight turns')
      player.rootTurns=0
      const dx=player.x<40?1:-1
      await tryMove(dx,0)
      check(player.x===origin.x+dx&&ArtifactWayfaring.phantomPosition().x===origin.x,'Phantom stays behind when the player moves')
      const fromX=origin.x-dx
      const foe=addEnemy(Object.assign({},ENEMY_TEMPLATE_BY_NAME.Goblin,{name:'Goblin',baseName:'Goblin',id:'phantom_pursuit_test',x:fromX,y:origin.y,level:0,alive:true,hp:100,maxHp:100,aware:true,alarmed:true,abilities:[],aggro:4,equipment:null,shooterAbility:null,spd:30}))
      occupied.add(keyXY(foe.x,foe.y))
      const originalChance=chance
      try {
        chance=p=>p===0.5
        resolveEnemyPhase(null,null,false)
        check(foe.x===fromX&&ArtifactWayfaring.takeSurprise(foe),'Pursuer attacks the phantom instead of following the player')
      } finally {chance=originalChance}
    })()`))
  })

  it('converts exceptional bows and low-tier gear without replacing their original properties', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const bow=makeBowItem('Hunting Bow')
      Object.assign(bow,{name:'Mighty Hunting Bow',mod:'atk',modAmt:20,tier:5,replayId:'converted_bow_test'})
      const original=structuredClone(bow)
      check(convertEquipmentToArtifact(bow,20)===bow,'same physical item')
      check(bow.kind==='artifact'&&bow.tier===5&&bow.replayId===original.replayId,'tier and identity')
      check(bow.rangedAtk===original.rangedAtk&&bow.rangedRange===original.rangedRange&&bow.twoHanded,'physical bow properties')
      check(bowRangedAtk(bow)===original.rangedAtk+20&&bow.atk===original.atk,'Mighty applies to ranged ATK only')
      check(!Object.keys(bow.bonuses).length&&bow.maxHpPct===0,'no random additional artifact stats')
      check(artifactAbilityPool(bow).includes(bow.abilityId),'eligible ability')
      check(itemStatLine(bow)==='???'&&visibleItemTier(bow)===null,'unidentified is concealed')
      check(itemSellValue(bow)===Math.floor((SELL_VALUE_BY_TIER[5]+100)/2),'bow sell value cannot bypass artifact pricing')
      const dagger={kind:'weapon',base:'Dagger',name:'Swift Dagger',atk:2,grace:5,tier:1,baseValue:30,mod:'spd',modAmt:5}
      convertEquipmentToArtifact(dagger,20)
      check(dagger.tier===1&&dagger.modAmt===5,'low-tier modifier preserved')
      player.inventory=[bow,dagger]
      player.godMode=true
      replayAnimationsDisabled=true
      identifyArtifact(0)
      check(bow.identified&&itemStatLine(bow).includes('RANGED ATK 7+20')&&itemStatLine(bow).includes(artifactAbilityDefinition(bow).name),'identified modifier and power visible')
       check(!itemStatLine(bow).includes('Original:')&&!itemStatLine(bow).includes('Mighty Hunting Bow'),'no redundant original name')
      const save=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(save,{isReplayInit:true})
      check(player.inventory.some(item=>item.replayId==='converted_bow_test'&&item.abilityId===bow.abilityId&&item.identified),'converted item survived save/reload')
      check(player.inventory.some(item=>item.base==='Dagger'&&item.kind==='artifact'&&item.tier===1&&!item.identified),'low tier artifact survives restore')
    })()`))
  })

  it('uses one persistent conversion chance across Disarm, save/load and death', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const originalChance=chance
      try {
        replayAnimationsDisabled=true;currentZ=0;currentCave=-1;map=surfaceMap
        player.x=40;player.y=40;player.baseMf=10;player.inventory=[];oldHunterQuest=null
        player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Testing',
          atk:8,grace:4,identified:true,abilityId:'disarm'},armor:null,shield:null,blackkey:null}
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        for(let y=39;y<=42;y++)for(let x=39;x<=43;x++)map[y][x]='grass'
        let target=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'artifact_conversion_target',
          name:'Brutal Goblin',baseName:'Goblin',prefix:'Brutal',level:0,alive:true,x:41,y:40,
          homeX:41,homeY:40,homeTileType:'grass',hp:100,maxHp:100,grace:3,gearScale:.5,abilities:[],equipment:null,shooterAbility:null,shotsRemaining:0})
        occupied.add(keyXY(41,40))
        const weapon={kind:'weapon',base:'Dagger',name:'Mighty Dagger',tier:1,baseValue:30,atk:2,grace:5,mod:'atk',modAmt:20}
        applyEnemyEquipment(target,weapon)
        const probability=enemyGearArtifactChance(monsterLootStrength(enemyPermanentStats(target)),playerMf())
        chance=p=>p===artifactRule('disarm','chance')||p===probability
        check(artifactDisarmEnemy(target)&&target.gearArtifactConversionChecked,'disarm spent conversion')
        check(weapon.kind==='artifact'&&weapon.modAmt===20&&weapon.tier===1&&!weapon.identified,'physical conversion')
        check(groundItems.filter(g=>g.item===weapon).length===1,'one physical drop')
        applyEnemyEquipment(target,{kind:'shield',base:'Buckler',name:'Buckler',tier:1,baseValue:30,def:3})
        prepareEnemyEquipment(target)
        check(target.equipmentPrepared,'existing equipment marks preparation complete')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        check(snapshot.enemies.find(e=>e.id==='artifact_conversion_target').equipmentPrepared,'preparation saved')
        loadGameFromObject(snapshot,{isReplayInit:true})
        target=enemies.find(e=>e.id==='artifact_conversion_target')
        check(target.gearArtifactConversionChecked,'attempt restored')
        check(target.equipmentPrepared,'preparation restored')
        const strength=monsterLootStrength(enemyPermanentStats(target))
        const mf=playerMf(),gearChance=enemyGearArtifactChance(strength,mf),trinketChance=enemyTrinketArtifactChance(strength,mf)
        chance=p=>p===gearChance||p===trinketChance
        target.hp=0;killEnemy(target,true,'melee')
        check(player.inventory.some(i=>i.kind==='shield'&&i.base==='Buckler'),'replacement shield cannot convert')
        check(player.inventory.some(i=>i.artifactSlot==='trinket'),'independent trinket still rolls')
        check(groundItems.filter(g=>g.item?.base==='Dagger'&&g.item?.kind==='artifact').length===1,'save/death keeps exact disarm drop')
      } finally {chance=originalChance}
    })()`))
  })

  it('allows equipped ordinary tier-3+ humanoids to convert with the same strength rule', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)},oldChance=chance
      try {
        const item={kind:'weapon',base:'Dagger',name:'Dagger',tier:1,baseValue:30,atk:2,grace:5}
        const e={humanoid:true,prefix:null,tier:2,equipment:item,level:-3}
        check(!enemyGearArtifactEligible(e,item),'ordinary tier 2 excluded')
        e.tier=3
        check(enemyGearArtifactEligible(e,item),'ordinary tier 3 qualifies')
        check(!enemyGearArtifactEligible(e,null),'no equipment means no attempt')
        const probability=enemyGearArtifactChance(40,10)
        chance=p=>p===probability
        check(tryEnemyGearArtifactConversion(e,item,40,10)&&item.kind==='artifact','same conversion odds and retained tier')
        check(e.gearArtifactConversionChecked,'attempt consumed')
        check(!enemyGearArtifactEligible(e,{kind:'weapon',base:'Dagger',tier:1}),'no second attempt')
        check([0,-1,-2,-3,-4,-5,-6].map(z=>Math.round(enemyEquipmentDepthMultiplier(z)*100)).join(',')==='100,102,104,106,108,110,110','depth progression')
        check(Math.abs(enemyEquipmentRollChance(e)-.54*1.06)<1e-10,'depth scales the existing first roll')
        check(Math.abs(enemyEquipmentRollChance(e,true,10)-.74*1.06)<1e-10,'depth scales the existing MF fallback')
      } finally {chance=oldChance}
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
      const domainIds=new Set(Object.values(ARTIFACT_ABILITIES.domains).flat())
      check(Object.keys(ability).length>0 &&
        Object.keys(ability).every(id=>domainIds.has(id)) &&
        [...domainIds].every(id=>ability[id]),'artifact powers and domains must stay in sync')
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
        pick=pool=>pool.includes('Feather')?'Feather':pool.includes('highlander')?'highlander':previousPick(pool)
        check(/^The Feather of /.test(makeArtifactItem(3).name),'non-gear artifacts keep The')
      } finally {pick=previousPick;rng=previousRng}
      const eligible=[...WEAPONS,...SHIELDS,...ARMORS].filter(base=>base.tier<=3).map(base=>base.name)
      check(!eligible.includes('Titan Warpick') && eligible.includes('Brigandine'),'tier limit')
    })()`))
  })

  it('converts excess consumable healing with Alchemist armor and preserves save state', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const originalRace=player.race,originalEquip=player.equip,originalHp=player.hp
      const originalMaxHp=player.maxHp,originalTurn=turnCount
      try {
        player.race='human';player.maxHp=100;player.hp=75
        player.equip={weapon:null,shield:null,armor:{kind:'artifact',artifactSlot:'armor',
          base:'Tunic',def:0,identified:true,abilityId:'alchemists_vest_hp'}}
        player.artifactAlchemistTempHp=0
        check(healWithAlchemist(100)===25,'normal HP heals once')
        check(player.hp===100 && player.artifactAlchemistTempHp===50,'excess caps at 50% maximum HP')
        check(artifactLosePlayerHp(20,{directHit:true})===0,'buffer absorbs enemy attack')
        check(player.hp===100 && player.artifactAlchemistTempHp===30,'buffer consumed first')
        const saved=buildSaveObject()
        check(saved.version===SAVE_VERSION && saved.player.artifactAlchemistTempHp===30,
          'save includes temporary HP')
        player.equip.armor.abilityId='alchemists_vest_guard'
        player.artifactAlchemistTempHp=0
        player.artifactAlchemistGuardDef=0
        player.artifactAlchemistGuardUntilTurn=0
        const baseline=playerDef()
        healWithAlchemist(100)
        check(player.artifactAlchemistGuardDef===10 && playerDef()===baseline+10,
          'Guard contributes existing DEF for five turns')
        const until=player.artifactAlchemistGuardUntilTurn
        healWithAlchemist(20)
        check(player.artifactAlchemistGuardUntilTurn===until && player.artifactAlchemistGuardDef===10,
          'smaller conversion cannot extend or weaken Guard')
      } finally {
        player.equip=originalEquip;player.race=originalRace;player.hp=originalHp
        player.maxHp=originalMaxHp;turnCount=originalTurn
        player.artifactAlchemistTempHp=0;player.artifactAlchemistGuardDef=0
        player.artifactAlchemistGuardUntilTurn=0
      }
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
      check(itemStatLine(player.equip.armor).includes('DEF 12+4'),'base DEF and enchantment combined')
      check(!['SPD -','GRACE -','DEF +4'].some(part=>itemStatLine(player.equip.armor).includes(part)),'no duplicate DEF or inherent penalties')
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
      check(!itemStatLine(armor).includes('GRACE -1'),'inherent armor GRACE penalty hidden in UI')
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
    cy.get('#invList').should('contain.text','DEF 12+4')
    cy.get('#invList').should('not.contain.text','DEF +4')
    cy.get('#invList').should('not.contain.text','SPD -2')
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

  it('keeps domain-gated abilities and Berserker roll deterministic across saves', () => {
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
      verify(JSON.stringify(artifactDomains(armor))===JSON.stringify(['bulwark','armors']),
        'Armor must combine shared bulwark and exclusive armors domains')
      verify(JSON.stringify(artifactDomains(shield))===JSON.stringify(['bulwark','shields']),
        'Shields must combine shared bulwark and exclusive shields domains')
      verify(artifactAbilityPool(armor).includes('berserkers_oath'),'Berserker missing from armor')
      verify(artifactAbilityPool(shield).includes('tideguard'),'Shield lacks Tideguard')
      for (const id of ARTIFACT_ABILITIES.domains.armors) {
        verify(artifactAbilityPool(armor).includes(id),'Armor must include '+id)
        verify(!artifactAbilityPool(shield).includes(id),'Shield must exclude '+id)
        verify(!ARTIFACT_ABILITIES.domains.bulwark.includes(id),
          'Armor-only ability leaked into shared bulwark domain: '+id)
      }
      verify(Object.values(ARTIFACT_ABILITIES.abilities).every(ability=>!('slots' in ability)),
        'Artifact equipment-slot restrictions must be expressed through domains')
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

  it('keeps Dancer, Growing Malice and Vengeful Precision deterministic through save/replay', () => {
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayAnimationsDisabled=true;replaySimulationMode=true
      player.equip={weapon:{kind:'artifact',artifactSlot:'weapon',base:'Dagger',name:'Dagger',
        identified:true,atk:2,grace:0,abilityId:'growing_malice',twoHanded:false},
        shield:{kind:'artifact',artifactSlot:'shield',base:'Buckler',def:2,
          identified:true,abilityId:'vengeful_precision'},
        armor:{kind:'artifact',artifactSlot:'armor',base:'Tunic',def:1,
          identified:true,abilityId:'dancer'}}
      player.artifactMaliceTargetId=null;player.artifactMaliceHits=0
      player.artifactVengefulPrecisionReady=true;player.artifactDancerUntilTurn=0
      const normalDef=playerDef()
      markPlayerPositionChanged(true)
      check(artifactDancerActive(),'voluntary move must activate Dancer')
      check(playerDef()>=normalDef,'Dancer must never reduce defense')
      const enemy={id:'artifact-series-target'}
      artifactGrowingMaliceHit(enemy)
      check(player.artifactMaliceHits===1,'first landed hit prepares a critical chance bonus')
      check(artifactTakeVengefulPrecision()===.08,'block charge must aid one melee strike')
      check(!player.artifactVengefulPrecisionReady,'charge must be spent once')
      player.artifactVengefulPrecisionReady=true
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      check(snapshot.version===SAVE_VERSION,'fixture and saved format must match')
      loadGameFromObject(snapshot,{isReplayInit:true})
      check(artifactDancerActive() && player.artifactMaliceHits===1 &&
        player.artifactMaliceTargetId==='artifact-series-target' &&
        player.artifactVengefulPrecisionReady,'combat state must survive replay restoration')
      const statuses=activePlayerStatuses().map(s=>s.label)
      check(statuses.some(s=>s.includes('Dancer')) &&
        statuses.some(s=>s.includes('Growing Malice')) &&
        statuses.some(s=>s.includes('Vengeful Precision')),'known charges remain visible')
      player.equip.armor.identified=false
      player.equip.weapon.identified=false
      player.equip.shield.identified=false
      const hidden=activePlayerStatuses().map(s=>s.label).join(' ')
      check(!['Dancer','Growing Malice','Vengeful Precision'].some(s=>hidden.includes(s)),
        'unidentified abilities must remain concealed in the status UI')
    })()`))
  })

  it('restores Reaper reserve and restricts it to two-handed melee weapons', () => {
    cy.window().then(win=>win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const candidate=(twoHanded,rangedAtk=0)=>({kind:'artifact',artifactSlot:'weapon',
        base:'War Hammer',twoHanded,rangedAtk})
      check(artifactAbilityPool(candidate(true)).includes('reaper'),'two-handed weapon allowed')
      check(!artifactAbilityPool(candidate(false)).includes('reaper'),'one-handed weapon excluded')
      check(!artifactAbilityPool(candidate(true,5)).includes('reaper'),'bow excluded')
      player.equip={weapon:{...candidate(true),abilityId:'reaper',identified:true},
        shield:null,armor:null}
      player.artifactReaperStored=7;player.artifactReaperOriginId='former-enemy'
      check(artifactReaperStoredFor({id:'new-enemy'})===7,'different target releases reserve')
      check(artifactReaperStoredFor({id:'former-enemy'})===0,'origin cannot receive reserve')
      const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(snapshot,{isReplayInit:true})
      check(player.artifactReaperStored===7 && player.artifactReaperOriginId==='former-enemy',
        'reserve and origin must survive save/replay')
      artifactClearWeaponCombatState()
      check(player.artifactReaperStored===0 && player.artifactReaperOriginId===null,
        'weapon removal must clear reserve')
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
