function beginRareHuntGame(name = 'Rare Hunt Tester') {
  cy.viewport(1440, 900)
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.window().then(win => win.eval('WORLD_SEED = 246813579; rngState = WORLD_SEED'))
  cy.get('#raceName').clear().type(name)
  cy.get('#worldSizeSelect').select('XS')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should($overlay => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
}

describe('One-time Merchant Dwarven Fort hint', () => {
  beforeEach(() => {
    beginRareHuntGame('Fort Hint Tester')
    cy.window().then(win => win.eval(`(() => {
      window.hintCheck=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      currentZ=0;map=surfaceMap;enemies=[];groundItems=[];occupied=new Set();oldHunterQuest=null
      merchantFortHintGiven=false
      const f=dwarvenRuin
      hintCheck(f && surfaceMap[f.y][f.x]==='dwarvengate','generated surface fort entrance')
      player.x=f.x<MAP_W/2?MAP_W-6:5;player.y=f.y<MAP_H/2?MAP_H-6:5
      for(let y=player.y-1;y<=player.y+1;y++)for(let x=player.x-1;x<=player.x+2;x++) {
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));discovered[y][x]=true
      }
      player.hp=1000;player.maxHp=1000;player.poisonTurns=0;player.godMode=false
      player.freezing={active:false,turns:0};resetSwimming()
      const template=NPC_TEMPLATES.find(item=>item.name==='Merchant')
      npcs=[{...template,x:player.x+1,y:player.y,homeX:player.x+1,homeY:player.y,talkFreezeTurns:0}]
      for(let y=f.y-2;y<=f.y+2;y++)for(let x=f.x-2;x<=f.x+2;x++)if(discovered[y]?.[x]!==undefined)discovered[y][x]=false
      rebuildMinimapBases()
    })()`))
  })

  it('uses an exact 50% gate, reveals the entrance area, and rolls no more after success', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldRng=rng;let value=.5,draws=0
      try {
        rng=()=>{draws++;return value}
        hintCheck(!tryMerchantFortHint(npcs[0]) && !merchantFortHintGiven,'50% boundary fails')
        hintCheck(!discovered[dwarvenRuin.y][dwarvenRuin.x] && draws===1,'failed roll changes no discovery')
        value=.499999
        hintCheck(tryMerchantFortHint(npcs[0]) && merchantFortHintGiven && draws===2,'below 50% succeeds')
        for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++) {
          const x=dwarvenRuin.x+dx,y=dwarvenRuin.y+dy
          if(discovered[y]?.[x]!==undefined)hintCheck(discovered[y][x],'5x5 fort discovery')
        }
        const text=document.getElementById('logpanel').textContent
        hintCheck(text.includes('They say the old dwarven fort still holds a fortune.') && text.includes('Few came back.'),'approved dialogue')
        hintCheck(text.includes('marks the dwarven fort ruins on your map'),'visible confirmation')
        hintCheck(!tryMerchantFortHint(npcs[0]) && draws===2,'one-time hint consumes no more RNG')
      } finally {rng=oldRng}
    })()`))
  })

  it('skips known entrances, other NPCs, missing forts and underground levels without RNG', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldRng=rng,fort=dwarvenRuin
      try {
        rng=()=>{throw Error('ineligible interaction consumed hint RNG')}
        discovered[fort.y][fort.x]=true;hintCheck(!tryMerchantFortHint(npcs[0]),'already discovered')
        discovered[fort.y][fort.x]=false;hintCheck(!tryMerchantFortHint({name:'Herbalist'}),'other NPC')
        dwarvenRuin=null;hintCheck(!tryMerchantFortHint(npcs[0]),'missing fort')
        dwarvenRuin=fort;currentZ=-1;hintCheck(!tryMerchantFortHint(npcs[0]),'underground')
      } finally {rng=oldRng;dwarvenRuin=fort;currentZ=0}
    })()`))
  })

  it('keeps ordinary talk separate from the fort rumor across save/load', () => {
    cy.window().then(win => win.eval(`(async () => {
      const oldRng=rng,oldLog=log,messages=[]
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        rng=()=>{throw Error('opening the conversation rolled RNG')};log=message=>{messages.push(message);oldLog(message)}
        await tryMove(1,0)
        hintCheck(npcMenuOpen && document.getElementById('npcOverlay').classList.contains('show'),'bump opens menu')
        hintCheck(!messages.length && !merchantFortHintGiven,'opening menu makes no gameplay changes')
        hintCheck(document.querySelector('#npcChoices [data-action="trade"]'),'merchant has a trade choice')
        rng=()=>.1
        document.querySelector('#npcChoices [data-action="talk"]').click()
        hintCheck(messages.includes('Merchant says: '+npcs[0].lines[0]),'ordinary dialogue retained')
        hintCheck(!merchantFortHintGiven,'ordinary talk does not roll the fort rumor')
        document.querySelector('#npcChoices [data-action="rumors"]').click()
        hintCheck(messages.filter(text=>text.includes('They say the old dwarven fort')).length===1,'hint appended once')
        hintCheck(document.getElementById('npcSpeech').textContent.includes('They say the old dwarven fort'),
          'spoken rumor appears in the conversation panel')
        rng=()=>{throw Error('repeating a known rumor consumed RNG')}
        document.querySelector('#npcChoices [data-action="rumors"]').click()
        hintCheck(messages.filter(text=>text.includes('They say the old dwarven fort')).length===2,
          'repeat rumors uses the original line even after the map reveal')
        hintCheck(document.getElementById('npcSpeech').textContent===NPC_TEMPLATES.find(n=>n.name==='Merchant').fortHint.line,
          'repeat rumor remains visible in the conversation panel')
        closeNpcMenu()
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        hintCheck(saved.merchantFortHintGiven===true,'flag serialized')
        log=oldLog;rng=oldRng
        loadGameFromObject(before);hintCheck(!merchantFortHintGiven && !discovered[dwarvenRuin.y][dwarvenRuin.x],'pre-hint save restoration')
        loadGameFromObject(saved);hintCheck(merchantFortHintGiven && discovered[dwarvenRuin.y][dwarvenRuin.x],'post-hint save restoration')
        rng=()=>{throw Error('loaded successful hint rerolled')};hintCheck(!tryMerchantFortHint(npcs[0]),'no repeated loaded hint')
        resetForNewCharacter();hintCheck(merchantFortHintGiven,'same-world permadeath character retains flag')
      } finally {rng=oldRng;log=oldLog}
    })()`))
  })

  it('records and replays rumor reveals with identical discovery and RNG consumption', () => {
    cy.window().then(win => win.eval(`(async () => {
      rngState=12345;startReplayRecording()
      const turn=turnCount
      hintCheck(openNpcMenu(npcs[0]),'adjacent click can open the dialogue menu')
      document.querySelector('#npcChoices [data-action="trade"]').click()
      hintCheck(tradeOpen && !npcMenuOpen,'trade choice opens the existing shop')
      hintCheck(!merchantFortHintGiven,'trading alone does not reveal the fort')
      toggleTrade(false)
      for(let attempt=0;attempt<20 && !merchantFortHintGiven;attempt++){
        hintCheck(openNpcMenu(npcs[0]),'rumor menu opens')
        document.querySelector('#npcChoices [data-action="rumors"]').click()
        closeNpcMenu()
      }
      hintCheck(merchantFortHintGiven && turnCount===turn,'rumor reveals fort without advancing a turn')
      const recorded=JSON.parse(JSON.stringify(replayData)),expected=JSON.stringify(discovered)
      // Match startReplayPlayback: dismiss the live shop before restoring playback.
      toggleTrade(false)
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      hintCheck(!merchantFortHintGiven,'replay begins before hint')
      replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true
      activeReplay=recorded;replayRngIndex=0
      try {
        for(const action of recorded.actions)await runReplayAction(action)
        hintCheck(merchantFortHintGiven && JSON.stringify(discovered)===expected,'same replay flag and map')
        hintCheck(replayRngIndex===recorded.rng.length && turnCount===turn,'same RNG and turn count')
        hintCheck(!tradeOpen,'replay does not open trade overlay')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

  for(const width of [1440,390]) it('shows the revealed entrance on the map in tile/ASCII modes at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldMode=USE_TILE_IMAGES,f=dwarvenRuin
      try {
        chance=()=>true
        for(const images of [false,true]) {
          USE_TILE_IMAGES=images;merchantFortHintGiven=false
          for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(discovered[f.y+dy]?.[f.x+dx]!==undefined)discovered[f.y+dy][f.x+dx]=false
          rebuildMinimapBases()
          const pixel=()=>Array.from(miniBases[MAP_SCALE].ctx.getImageData(f.x*MAP_SCALE,f.y*MAP_SCALE,1,1).data).join(',')
          const fog=pixel();tryMerchantFortHint(npcs[0])
          hintCheck(pixel()!==fog,'fort map pixel changes from fog in mode '+images)
          mapPanX=f.x;mapPanY=f.y;toggleMap(true)
          hintCheck(document.getElementById('mapOverlay').classList.contains('show'),'map visible')
        }
      } finally {chance=oldChance;USE_TILE_IMAGES=oldMode}
    })()`))
    cy.get('#mapOverlay').should('be.visible')
  })

  it('resets the hint only when generating a new world', () => {
    cy.window().then(win => win.eval(`(async () => {
      merchantFortHintGiven=true
      await generateNewWorld()
      hintCheck(!merchantFortHintGiven,'new world starts with unused hint')
    })()`))
  })


  it('only activates adaptive trading in cursed worlds and preserves its progress in saves', () => {
    cy.window().then(win => win.eval(`(() => {
      const prior=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        AdaptivePlayerTrolling.reset()
        const originalCount=merchantStock.length
        hintCheck(!AdaptivePlayerTrolling.active(),'ordinary world must disable adaptive trolling')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('sell',2000),'ordinary-world sales cannot expand stock')
        hintCheck(merchantStock.length===originalCount,'ordinary stock unchanged')
        activeWorldTraits=[{name:'test curse',effects:[]}]
        hintCheck(AdaptivePlayerTrolling.active(),'cursed-world flag enables adaptive reactions')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('buy',100),'purchases start their own independent total')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('sell',1499),'sales below 1500 do not trigger despite prior purchases')
        hintCheck(merchantStock.length===originalCount,'no early stock expansion')
        hintCheck(AdaptivePlayerTrolling.onMerchantTransaction('sell',1),'exact threshold triggers expansion')
        hintCheck(merchantStock.length===originalCount+3,'merchant receives exactly three items')
        const added=merchantStock.slice(-3)
        hintCheck(added[0].kind==='weapon','additional weapon')
        hintCheck(['armor','shield'].includes(added[1].kind),'additional protective item')
        hintCheck(added[2].kind.startsWith('scroll'),'additional utility item')
        const floors={4:500,5:1000}
        hintCheck(added.every(it=>it.merchantPrice===Math.max(itemBaseValue(it),
          ['weapon','shield','armor'].includes(it.kind)?(floors[it.tier]||0):0)),
          'expanded gear uses actual rolled tier pricing; utility retains ordinary price')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('sell',1500),'expansion occurs once per character')
        hintCheck(merchantStock.length===originalCount+3,'repeat sale produces no more stock')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        hintCheck(saved.adaptivePlayerTrolling.completed.includes('merchant_expansion'),'completion is serialized')
        AdaptivePlayerTrolling.reset()
        hintCheck(!AdaptivePlayerTrolling.completed('merchant_expansion'),'new character state resets one-time completion')
        AdaptivePlayerTrolling.restore(saved.adaptivePlayerTrolling)
        hintCheck(AdaptivePlayerTrolling.completed('merchant_expansion'),'save restores completed reaction')
        hintCheck(AdaptivePlayerTrolling.serialize().merchantSalesGold===1500 &&
          AdaptivePlayerTrolling.serialize().merchantPurchasesGold===100,'independent trade totals restored exactly')
        AdaptivePlayerTrolling.reset()
        const countBeforePurchases=merchantStock.length
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('sell',900) &&
          !AdaptivePlayerTrolling.onMerchantTransaction('buy',600),
          '900 sales plus 600 purchases cannot combine into one threshold')
        const progress=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(progress,{isReplayInit:true})
        hintCheck(AdaptivePlayerTrolling.serialize().merchantSalesGold===900 &&
          AdaptivePlayerTrolling.serialize().merchantPurchasesGold===600,
          'partial progress in both directions survives replay initialization')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('buy',899),
          '1499 spent is still below the purchase threshold')
        hintCheck(AdaptivePlayerTrolling.onMerchantTransaction('buy',1) &&
          merchantStock.length===countBeforePurchases+3,
          'exactly 1500 spent triggers the same stock expansion')
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('sell',600) &&
          merchantStock.length===countBeforePurchases+3,
          'reaching the other threshold cannot expand stock again')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.reset()
        hintCheck(!AdaptivePlayerTrolling.onMerchantTransaction('buy',1500) &&
          AdaptivePlayerTrolling.serialize().merchantPurchasesGold===0,
          'ordinary-world purchases do not track progress or expand stock')
      } finally {
        loadGameFromObject(prior,{isReplayInit:true})
      }
    })()`))
  })

  it('rewards clearing the Temple area without counting far wanderers or lured enemies', () => {
    cy.window().then(win => win.eval(`(() => {
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const at=(id,dx,dy,wander='home',level=0)=>({id,name:'Rat',baseName:'Rat',
          alive:true,hp:1,level,wander,x:spawnPoint.x+dx,y:spawnPoint.y+dy})
        const first=at('clear-1',10,0), second=at('clear-2',20,0)
        const distant=at('clear-distant',120,120), far=at('clear-far',15,0,'far')
        const underground=at('clear-underground',12,0,'home',-1)
        enemies=[first,second,distant,far,underground]
        const count=merchantStock.length
        AdaptivePlayerTrolling.onWorldTurn() // Capture initial mandatory targets.
        const initial=AdaptivePlayerTrolling.serialize().templeClearanceTargets
        hintCheck(initial.length===2 && initial.includes(first.id) && initial.includes(second.id),
          'snapshot keeps only normal surface enemies inside the circular Temple radius')
        second.x=spawnPoint.x+120 // Simulate luring outside the region.
        AdaptivePlayerTrolling.onEnemyKilled(first)
        first.alive=false;enemies=enemies.filter(e=>e!==first)
        hintCheck(merchantStock.length===count && !AdaptivePlayerTrolling.completed('merchant_expansion'),
          'luring the last tracked enemy away does not qualify')
        AdaptivePlayerTrolling.onEnemyKilled(far)
        far.alive=false;enemies=enemies.filter(e=>e!==far)
        hintCheck(merchantStock.length===count,'far wandering kill does not qualify')
        AdaptivePlayerTrolling.onEnemyKilled(underground)
        hintCheck(merchantStock.length===count,'underground monster does not qualify')
        const arrival=at('clear-new',11,0)
        enemies.push(arrival) // New threats inside the region must also be cleared.
        AdaptivePlayerTrolling.onEnemyKilled(second)
        second.alive=false;enemies=enemies.filter(e=>e!==second)
        hintCheck(merchantStock.length===count,'newly arrived surface enemies prevent early reward')
        AdaptivePlayerTrolling.onTempleClearanceKill(arrival) // Actual trap death, no player XP credit.
        arrival.alive=false;enemies=enemies.filter(e=>e!==arrival)
        hintCheck(merchantStock.length===count+3 && AdaptivePlayerTrolling.completed('merchant_expansion'),
          'killing the last tracked enemy, even with a trap, completes clearance')
        hintCheck(merchantStock.slice(-3).every(item=>item.merchantNew),'new wares are marked')
        const afterClear=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(afterClear,{isReplayInit:true})
        hintCheck(AdaptivePlayerTrolling.completed('merchant_expansion') &&
          AdaptivePlayerTrolling.serialize().templeClearanceKills===3,
          'clearance award and kill counter survive save and replay initialization')
        const kept=merchantStock.length
        resetForNewCharacter()
        hintCheck(merchantStock.length===kept,'merchant keeps expansions across permadeath character reset')
        hintCheck(!AdaptivePlayerTrolling.completed('merchant_expansion'),'new character can earn expansion again')
        hintCheck(AdaptivePlayerTrolling.onMerchantTransaction('buy',1500) && merchantStock.length===kept+3,
          'permadeath successor can expand merchant again through trade')
      } finally { loadGameFromObject(original,{isReplayInit:true}) }
    })()`))
  })

  it('restocks only successfully used non-identification scroll kinds after 12 uses', () => {
    cy.window().then(win => win.eval(`(() => {
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        merchantStock=merchantStock.filter(item=>item.kind!=='scrollOfFear')
        const home=merchantStock.find(item=>item.kind==='homecomingscroll')
        hintCheck(!!home,'default Homecoming stock is present')
        const startingCount=home.count
        AdaptivePlayerTrolling.onScrollUsed('idscroll')
        hintCheck(AdaptivePlayerTrolling.serialize().scrollUses===0,'identification never counts')
        for (let i=0;i<6;i++) AdaptivePlayerTrolling.onScrollUsed('homecomingscroll')
        for (let i=0;i<5;i++) AdaptivePlayerTrolling.onScrollUsed('scrollOfFear')
        const partial=JSON.parse(JSON.stringify(buildSaveObject()))
        hintCheck(AdaptivePlayerTrolling.serialize().scrollUses===11 &&
          !AdaptivePlayerTrolling.completed('scroll_restock'), 'eleven valid uses are not sufficient')
        loadGameFromObject(partial,{isReplayInit:true})
        hintCheck(AdaptivePlayerTrolling.serialize().scrollUses===11,'scroll progress survives replay initialization')
        hintCheck(AdaptivePlayerTrolling.onScrollUsed('scrollOfFear'),'twelfth successful read supplies stock')
        hintCheck(merchantStock.find(it=>it.kind==='homecomingscroll').count===startingCount+1,
          'stocked kind gains exactly one extra copy')
        const fear=merchantStock.filter(it=>it.kind==='scrollOfFear')
        hintCheck(fear.length===1 && fear[0].count===1 && fear[0].merchantPrice===undefined,
          'previously unavailable scroll appears at normal base price')
        hintCheck(merchantStock.find(it=>it.kind==='homecomingscroll').merchantNew && fear[0].merchantNew,
          'restocked entries are labeled NEW')
        hintCheck(!AdaptivePlayerTrolling.completed('merchant_expansion'),
          'scroll supply does not consume independent equipment expansion')
        renderTrade()
        hintCheck(document.getElementById('tradeBuyList').textContent.includes('NEW · Scroll of Fear'),
          'visible trade label distinguishes newly stocked magic')
        const awarded=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(awarded,{isReplayInit:true})
        hintCheck(AdaptivePlayerTrolling.completed('scroll_restock') &&
          merchantStock.find(it=>it.kind==='scrollOfFear').count===1,
          'save and replay load preserve finite stock exactly')
        hintCheck(!AdaptivePlayerTrolling.onScrollUsed('scrollOfChaos') &&
          !merchantStock.some(it=>it.kind==='scrollOfChaos' && it.merchantNew),
          'later reads cannot trigger a second resupply for this character')
        const stockCount=merchantStock.length
        resetForNewCharacter()
        hintCheck(merchantStock.length===stockCount && !AdaptivePlayerTrolling.completed('scroll_restock'),
          'next permadeath character inherits merchant supply but can earn another resupply')
      } finally { loadGameFromObject(original,{isReplayInit:true}) }
    })()`))
  })

  it('scales the merchant expansion gear cap with the hero level, not the current floor', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalWeapon=makeWeaponItem, originalShield=makeShieldItem, originalArmor=makeArmorItem
      const levels=[]
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        makeWeaponItem=(tier,...args)=>{levels.push(tier);return originalWeapon(tier,...args)}
        makeShieldItem=(tier,...args)=>{levels.push(tier);return originalShield(tier,...args)}
        makeArmorItem=(tier,...args)=>{levels.push(tier);return originalArmor(tier,...args)}
        for (const [lvl,expected] of [[1,2],[4,2],[5,3],[7,3],[8,4],[11,4],[12,5],[50,5]]) {
          player.lvl=lvl
          AdaptivePlayerTrolling.reset()
          check(AdaptivePlayerTrolling.onMerchantTransaction('sell',1500),'merchant event at threshold')
          check(levels.slice(-2).every(tier=>tier===expected),
            'both equipment categories use level-scaled quality at level '+lvl)
          merchantStock.splice(-3)
        }
      } finally {
        makeWeaponItem=originalWeapon;makeShieldItem=originalShield;makeArmorItem=originalArmor
        loadGameFromObject(before)
      }
    })()`))
  })

  it('prices tier 4 and 5 expansion gear at least 500g and 1000g, without taxing lower tiers', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalWeapon=makeWeaponItem, originalShield=makeShieldItem, originalArmor=makeArmorItem
      const tiers=[4,5,2]
      let chosen=0
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        const lowValue=(kind,tier)=>({kind,base:'test gear',name:'test gear',tier,baseValue:1})
        makeWeaponItem=()=>lowValue('weapon',tiers[chosen])
        makeShieldItem=()=>lowValue('shield',tiers[chosen])
        makeArmorItem=()=>lowValue('armor',tiers[chosen])
        for (const [i,expected] of [[0,500],[1,1000],[2,1]]) {
          chosen=i
          player.lvl=i===0?8:i===1?12:4
          AdaptivePlayerTrolling.reset()
          const count=merchantStock.length
          check(AdaptivePlayerTrolling.onMerchantTransaction('sell',1500),'trading threshold met')
          const added=merchantStock.slice(-3)
          check(added[0].tier===tiers[i] && added[1].tier===tiers[i],'actual tier used')
          check(added[0].merchantPrice===expected && added[1].merchantPrice===expected,
            'correct price floor for tier '+tiers[i])
          check(added[2].merchantPrice===itemBaseValue(added[2]),'utility price unchanged')
          check(merchantStock.length===count+3,'exactly three new wares')
          merchantStock.splice(-3)
        }
      } finally {
        makeWeaponItem=originalWeapon;makeShieldItem=originalShield;makeArmorItem=originalArmor
        loadGameFromObject(original)
      }
    })()`))
  })

  it('places special gear as a persistent ordinary ground pickup, not in a chest', () => {
    cy.window().then(win => win.eval(`(() => {
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const pos={x:player.x,y:player.y}
        const terrain=map[pos.y][pos.x]
        hintCheck(TILE[terrain]?.walk,'valid walkable ground for test')
        const treasure=makeShieldItem(1)
        const preCount=groundItems.length
        const beforeInventory=player.inventory.length
        hintCheck(AdaptivePlayerTrolling.dropRewardOnGround('test_reward',treasure,pos.x,pos.y),'special reward is dropped')
        const dropped=groundItems.find(it=>it.adaptiveEventId==='test_reward')
        hintCheck(dropped?.kind==='droppeditem' && dropped.item.kind==='shield','uses ordinary droppeditem format')
        hintCheck(groundItems.length===preCount+1,'no chest spawned')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        hintCheck(saved.groundItems.some(it=>it.adaptiveEventId==='test_reward'),'ground item survives save')
        lootSkeletonOrForage()
        hintCheck(player.inventory.length===beforeInventory+1,'regular forage picks up the reward')
        hintCheck(!groundItems.some(it=>it.adaptiveEventId==='test_reward'),'ground reward removed on pickup')
        hintCheck(!AdaptivePlayerTrolling.dropRewardOnGround('test_reward',null,pos.x,pos.y),'invalid drops refused')
      } finally {
        activeWorldTraits=traits
        loadGameFromObject(original)
      }
    })()`))
  })

})
