describe('Monster Haste, Champion inspiration and Nymph HealSelf', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Support Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.supportAssert=(ok,message)=>{if(!ok)throw Error(message)}
      replayAnimationsDisabled=true;replayRecording=false;replayPlaying=false
      currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[]
      occupied=new Set();turnCount=0;deathTransition=null
      for(let y=30;y<=50;y++)for(let x=30;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      spawnPoint={x:5,y:5}
      player.x=40;player.y=40;player.hp=5000;player.maxHp=5000
      player.invisibleTurns=0;player.race='human';player.godMode=false
      player.equip={weapon:null,shield:null,armor:null,blackkey:null}
      window.supportSpawn=(name,x,y,prefix=null)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,baseName:name,name,x,y,prefix,hp:t.hp,maxHp:t.hp,
          alive:true,level:0,homeX:x,homeY:y,homeTileType:'grass',equipment:null,aware:true})
        occupied.add(keyXY(x,y));return e
      }
    })()`))
  })

  it('sprints two tiles and displays Haste without granting an attack', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=supportSpawn('White Tiger',37,40),oldChance=chance
      try {
        chance=p=>p===0.20
        turnCount=1
        supportAssert(tryEnemyHaste(e,3),'haste proc')
        supportAssert(e.x===39 && e.y===40,'two tiles toward player')
        supportAssert(player.hp===5000,'no extra attack during sprint')
        supportAssert(e.hasteReadyTurn===7,'cooldown saved')
        const snap=buildSaveObject()
        supportAssert(snap.enemies.find(m=>m.id===e.id).hasteReadyTurn===7,'save')
        updateTooltip()
      } finally {chance=oldChance}
    })()`))
    cy.get('#logpanel').invoke('text').should('contain','unnatural haste')
  })

  it('shows Inspired on allied monster inspection and drops the buff when Champion dies', () => {
    cy.window().then(win => win.eval(`(() => {
      const leader=supportSpawn('Orc',38,40,'Champion')
      const wolf=supportSpawn('Wolf',39,40)
      supportAssert(enemyAtk(wolf)===wolf.atk+2,'+2 atk')
      supportAssert(enemyDef(wolf)===wolf.def+1,'+1 def')
      supportAssert(tileInspectInfo(wolf.x,wolf.y).html.includes('Inspired'),'ally tooltip')
      supportAssert(!tileInspectInfo(leader.x,leader.y).html.includes('Inspired aura'),'no redundant leader aura tooltip')
      leader.hp=0;killEnemy(leader,false)
      supportAssert(enemyAtk(wolf)===wolf.atk,'buff cleared')
      supportAssert(!tileInspectInfo(wolf.x,wolf.y).html.includes('Inspired'),'tooltip updated')
      render()
    })()`))
  })

  it('Nymph heals only once and preserves its spent ability through reload', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=supportSpawn('Nymph',39,40),originalChance=chance
      try {
        e.hp=13;turnCount=1;chance=p=>p===0.25
        supportAssert(tryEnemyHealSelf(e),'self heal triggers')
        supportAssert(e.hp===20 && e.healSelfUsed,'restores seven hp and spends use')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot)
        const restored=enemies.find(m=>m.id===e.id)
        supportAssert(restored.healSelfUsed && restored.healSelfReadyTurn===7,'restored charge')
        restored.hp=1;turnCount=100
        supportAssert(!tryEnemyHealSelf(restored),'does not heal second time')
      } finally {chance=originalChance}
    })()`))
  })
})
