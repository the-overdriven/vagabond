describe('World-wide rare hunt species exclusions', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__huntFixture=save
        win.eval(`loadGameFromObject(window.__huntFixture,{isReplayInit:true})
          replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
          currentZ=0;map=surfaceMap;enemies=[];groundItems=[];occupied=new Set()
          worldKilledSpecies=new Set();player.killsBySpecies={};player.trackingLearned=true
          oldHunterQuestSerial=40
          oldHunterQuest={id:'hunter_40',type:'investigate_area',state:'completed'}
          window.huntCheck=(ok,msg)=>{if(!ok)throw Error(msg)}
          window.huntEnemy=(tmpl,id,level=0)=>addEnemy({...tmpl,id,baseName:tmpl.name,
            name:'Fierce '+tmpl.name,prefix:'Fierce',x:player.x+4,y:player.y+4,
            homeX:player.x+4,homeY:player.y+4,homeTileType:'grass',level,
            alive:true,hp:tmpl.hp,maxHp:tmpl.hp,equipment:null})`)
        delete win.__huntFixture
      })
    })
  })

  it('chooses a different species from living underground beasts and previous kills', () => {
    cy.window().then(win => win.eval(`(() => {
      const reachable=hunterReachableSurfaceTiles()
      const pool=hunterRareTemplates().filter(t=>hunterRareSpawnSites(t,reachable).length)
      huntCheck(pool.length>=3,'fixture has multiple spawnable rare species')
      huntCheck(pool.every(t=>t.ultraRare===true) &&
        !hunterRareTemplates().some(t=>t.ultraRare!==true),
        'only explicitly unique-world creatures are rare hunt candidates')
      const live=huntEnemy(pool[0],'existing-rare',-1)
      const dead=huntEnemy(pool[1],'killed-rare')
      killEnemy(dead)
      const eligible=hunterRareTemplates().map(t=>t.name)
      huntCheck(!eligible.includes(pool[0].name),'underground prefixed beast blocks base species')
      huntCheck(!eligible.includes(pool[1].name) && worldKilledSpecies.has(pool[1].name),'kill blocks base species after corpse removal')
      const before=new Set(enemies.map(e=>e.id))
      const q=generateOldHunterRareQuest()
      huntCheck(q && ![pool[0].name,pool[1].name].includes(q.targetBaseName),'hunt selects a different species')
      huntCheck(enemies.filter(e=>!before.has(e.id)).length===1,'exactly one new quarry')
      huntCheck(enemies.includes(live),'existing beast retained')
    })()`))
  })

  it('preserves trap deaths through save/replay restoration and a new character', () => {
    cy.window().then(win => win.eval(`(() => {
      const tmpl=hunterRareTemplates()[0]
      const e=huntEnemy(tmpl,'trap-rare',-1)
      killEnemy(e,false)
      huntCheck(!player.killsBySpecies[tmpl.name] && worldKilledSpecies.has(tmpl.name),'trap death recorded without player kill credit')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      huntCheck(saved.worldKilledSpecies.includes(tmpl.name),'world history serialized')
      for(const opts of [{},{isReplayInit:true},{isReplayRestore:true}]) {
        worldKilledSpecies.clear()
        loadGameFromObject(saved,opts)
        huntCheck(worldKilledSpecies.has(tmpl.name),'world history restored')
        huntCheck(rngState===saved.rngState,'restoration does not consume RNG')
        huntCheck(!hunterRareTemplates().some(t=>t.name===tmpl.name),'saved species excluded')
      }
      resetForNewCharacter()
      huntCheck(Object.keys(player.killsBySpecies).length===0,'new character forgets Bestiary')
      huntCheck(worldKilledSpecies.has(tmpl.name),'same world remembers killed species')
      huntCheck(!hunterRareTemplates().some(t=>t.name===tmpl.name),'new character cannot receive the killed species')
    })()`))
  })

  it('postpones an exhausted hunt without extra RNG, enemies, or changing the completed quest', () => {
    cy.window().then(win => win.eval(`(() => {
      worldKilledSpecies=new Set(hunterRareTemplates().map(t=>t.name))
      const beforeQuest=JSON.stringify(oldHunterQuest),beforeEnemies=JSON.stringify(enemies)
      const oldRng=rng
      try {
        rng=()=>{throw Error('exhausted hunt consumed RNG')}
        interactOldHunter()
        huntCheck(JSON.stringify(oldHunterQuest)===beforeQuest,'completed first quest retained')
        huntCheck(JSON.stringify(enemies)===beforeEnemies,'no duplicate spawn')
        huntCheck(document.getElementById('logpanel').textContent.includes('no trail rare enough'),'Hunter postpones the hunt')
      } finally {rng=oldRng}
    })()`))
  })

  it('replays selection and world history with identical target, direction, and RNG', () => {
    cy.window().then(win => win.eval(`(async () => {
      const tmpl=hunterRareTemplates()[0]
      killEnemy(huntEnemy(tmpl,'earlier-rare'))
      replayAnimationsDisabled=false;rngState=12345
      startReplayRecording();interactOldHunter()
      huntCheck(oldHunterQuest.type==='rare_hunt','recorded hunt generated')
      const recorded=JSON.parse(JSON.stringify(replayData))
      const state=()=>JSON.stringify({quest:oldHunterQuest,killed:[...worldKilledSpecies],
        quarry:buildSaveObject().enemies.find(e=>e.id===oldHunterQuest.targetEnemyId)})
      const expected=state()
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayPlaying=true;replayRecording=false;replaySimulationMode=true;replayAnimationsDisabled=true
      activeReplay=recorded;replayRngIndex=0
      try {
        for(const action of recorded.actions)await runReplayAction(action)
        huntCheck(state()===expected,'identical quarry and exclusion history')
        huntCheck(replayRngIndex===recorded.rng.length,'identical RNG trace')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

  it('clears killed-species history only when generating a new world', () => {
    cy.window().then(win => win.eval(`(async () => {
      worldKilledSpecies.add('DRUSK')
      WORLD_SEED=246813579;rngState=WORLD_SEED
      await generateNewWorld()
      huntCheck(worldKilledSpecies.size===0,'new world clears prior-world history')
      huntCheck(buildSaveObject().worldKilledSpecies.length===0,'new world saves empty history')
    })()`))
  })
})
