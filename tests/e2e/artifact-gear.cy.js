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
        if(slot==='weapon'){
          check(item.atk===base.atk && item.grace===base.grace,'weapon stats '+base.name)
          check(item.twoHanded===base.twoHanded,'weapon handedness '+base.name)
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
    cy.get('#slotWeapon').should('contain.text','Unidentified Dagger').and('contain.text','???')
    cy.get('#slotWeapon').should('not.contain.text','Hidden Dwarf').and('not.contain.text','ATK +5')
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
    cy.get('#slotWeapon').should('have.class','tier3')
  })
})
