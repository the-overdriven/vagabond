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

  it('preserves the ordinary bump dialogue and succeeds only once across save/load', () => {
    cy.window().then(win => win.eval(`(async () => {
      const oldRng=rng,oldLog=log,messages=[]
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        rng=()=>.1;log=message=>messages.push(message)
        await tryMove(1,0)
        hintCheck(messages.includes('Merchant says: '+npcs[0].lines[0]),'ordinary dialogue retained')
        hintCheck(messages.filter(text=>text.includes('They say the old dwarven fort')).length===1,'hint appended once')
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

  it('records and replays shop reveals with identical discovery and RNG consumption', () => {
    cy.window().then(win => win.eval(`(async () => {
      rngState=12345;startReplayRecording()
      const turn=turnCount
      for(let attempt=0;attempt<20 && !merchantFortHintGiven;attempt++)tryOpenTrade(npcs[0])
      hintCheck(merchantFortHintGiven && turnCount===turn,'free shop interaction reveals fort')
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
})
