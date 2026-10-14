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

describe('Exceptional prefixes and monster loot quality', () => {
  beforeEach(() => beginRareHuntGame('Quality Tester'))

  it('promotes all over-range bonuses and keeps old ceilings ordinary', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)},oldRng=rng
      const scripted=values=>{const queue=[...values];rng=()=>{check(queue.length,'unexpected RNG draw');return queue.shift()}}
      try {
        for(const [stat,min,max,oldMax] of [['atk',11,20,10],['def',11,20,10],['spd',11,20,10],['mf',11,20,10],['hp',60,100,59],['xp',16,30,15]]) {
          for(const [u,value] of [[0,min],[.999999,max]]) {
            scripted([0,u,.5])
            const item=applyGearModifier('Dagger',{kind:'weapon',base:'Dagger',atk:2,grace:5,tier:1,baseValue:30},{name:'Test',stat})
            check((stat==='xp'?item.xpBonus:item.modAmt)===value && item.tier===5,'exceptional '+stat+' '+value)
            check(item.atk===2 && item.grace===5 && item.base==='Dagger','base stats retained')
          }
          scripted([.001,.999999,.999999,.999999])
          const normal=applyGearModifier('Dagger',{kind:'weapon',atk:2,tier:1},{name:'Test',stat})
          check((stat==='xp'?normal.xpBonus:normal.modAmt)===oldMax && normal.tier===1,'old maximum '+stat)
        }
        scripted([.001,.999999])
        const mfHp=applyGearModifier('Robe',{kind:'armor',tier:1},{name:'Resilient',stat:'hp'},10)
        check(mfHp.modAmt===62 && mfHp.tier===5,'MF-adjusted HP promotion')
        scripted([.001,.999999]);check(rollModifierAmount('hp',1000)===100,'HP hard cap')
        scripted([.001,.999999,.999999]);check(rollModifierAmount('atk',1000)===10,'MF cannot open exceptional gate')
      } finally {rng=oldRng}
    })()`))
  })

  it('weights monster base items and uses original tier for both equipment paths', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)},oldRng=rng,oldChance=chance,oldMaker=makeWeaponItem
      try {
        const bases=[{tier:5,name:'same'},{tier:4,name:'previous'},{tier:2,name:'older'}]
        for(const [u,name] of [[.44,'same'],[.45,'previous'],[.77,'previous'],[.78,'older']]) {
          rng=()=>u;check(pickEquipmentBase(bases,5,5).name===name,'weighted boundary '+u)
        }
        rng=()=>.4;check(pickEquipmentBase(bases,5).name==='previous','non-monster uniform selection')
        const calls=[];makeWeaponItem=(...args)=>{calls.push(args);return {kind:'weapon'}}
        chance=()=>true;rng=()=>0;player.baseMf=50
        rollEnemyEquipment({tier:5,humanoid:true});rollEnemyDropEquipment({tier:5,humanoid:true})
        check(JSON.stringify(calls)===JSON.stringify([[5,0,5],[4,0,5]]),'source tier survives fallback; player MF is not quality')
        for(const tier of [1,2,3,4,5]) {
          const gates=[];chance=p=>{gates.push(p);return false};rng=()=>0
          rollModifierAmount('atk',100,tier)
          check(Math.abs(gates[0]-(.001+(tier-1)*.0002))<1e-12,'rare gate tier '+tier)
          check(rollOrdinaryModifierAmount('atk',0,tier)===1,'small quality boost preserves low rolls')
        }
      } finally {rng=oldRng;chance=oldChance;makeWeaponItem=oldMaker}
    })()`))
  })

  it('prices exceptional Merchant items above their sell value without raising ordinary prices', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)},oldRng=rng
      try {
        for(const [values,stat] of [[[0,.4,0,.999999],'atk'],[[0,0,0,.999999,0],'xp']]) {
          const queue=[...values];rng=()=>{check(queue.length,'unexpected Merchant RNG draw');return queue.shift()}
          const item=makeMerchantMagicWeapon()
          check(item.tier===5 && item.mod===stat,'promoted merchant '+stat)
          check(item.merchantPrice===Math.max(itemBaseValue(item)*MERCHANT_STOCK_CONFIG.magicWeapon.priceMultiplier/2,itemSellValue(item)+1),'approved price floor')
          check(item.merchantPrice>itemSellValue(item),'no buy/sell profit')
        }
        const queue=[0,.4,.5,0];rng=()=>{check(queue.length,'unexpected ordinary Merchant RNG draw');return queue.shift()}
        const ordinary=makeMerchantMagicWeapon()
        check(ordinary.tier===1 && ordinary.modAmt===1,'ordinary item')
        check(ordinary.merchantPrice===itemBaseValue(ordinary)*MERCHANT_STOCK_CONFIG.magicWeapon.priceMultiplier/2,'ordinary price unchanged')
      } finally {rng=oldRng}
    })()`))
  })

  it('preserves promoted gear through save/load and recorded equip replay', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
      enemies=[];occupied=new Set();oldHunterQuest=null
      npcs=[{name:'Merchant',x:spawnPoint.x+3,y:spawnPoint.y,homeX:spawnPoint.x+3,homeY:spawnPoint.y,talkFreezeTurns:0}]
      player.x=spawnPoint.x;player.y=spawnPoint.y;player.equip={weapon:null,shield:null,armor:null}
      const oldRng=rng;let queue=[0,.999999]
      try {rng=()=>queue.shift();player.inventory=[applyGearModifier('Dagger',{kind:'weapon',name:'Dagger',base:'Dagger',atk:2,grace:5,tier:1,baseValue:30},{name:'Mighty',stat:'atk'})]}
      finally {rng=oldRng}
      startReplayRecording();equipItem(0)
      const recorded=JSON.parse(JSON.stringify(replayData)),expected=JSON.stringify(player.equip.weapon),turn=turnCount
      loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())))
      check(JSON.stringify(player.equip.weapon)===expected,'save restores tier and bonus unchanged')
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true;activeReplay=recorded;replayRngIndex=0
      try {
        for(const action of recorded.actions) await runReplayAction(action)
        check(JSON.stringify(player.equip.weapon)===expected && turnCount===turn,'equip replay preserves promoted item')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

  for(const width of [1440,390]) it('shows promoted names in red at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win => win.eval(`(() => {
      player.inventory=[{kind:'weapon',name:'Mighty Dagger',base:'Dagger',atk:2,grace:5,tier:5,baseValue:30,mod:'atk',modAmt:20}]
      invTab='all';toggleInv(true)
    })()`))
    cy.get('#invList .nm.tier5').contains('Mighty Dagger').should('have.css','color','rgb(224, 71, 63)')
    cy.get('#invList .invitem').contains('Mighty Dagger').parent().should('contain.text','ATK 2+20')
  })
})
