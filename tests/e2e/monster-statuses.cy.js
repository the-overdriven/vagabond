describe('Monster combat statuses and berserk frenzy', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Status Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.statusCheck = (ok, explanation) => { if (!ok) throw new Error(explanation) }
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false
      currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      spawnPoint={x:5,y:5};turnCount=0;deathTransition=null;pendingMove=null
      for(let y=30;y<=50;y++) for(let x=30;x<=50;x++) {
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=5000;player.maxHp=5000;player.race='human'
      player.godMode=false;player.godInvisible=false;player.invisibleTurns=0
      player.rootTurns=0;player.gazeTurns=0;player.mummyCurseTurns=0
      player.confusionTurns=0;player.confusionSourceId=null;player.berserkTurns=0
      player.equip={weapon:null,shield:null,armor:null,blackkey:null}
      window.statusMonster = (name,x=39,y=40) => {
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        statusCheck(!!t,'template exists: '+name)
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null})
        occupied.add(keyXY(x,y));return e
      }
    })()`))
  })

  it('roots the player for three turns and preserves an attack instead of walking', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=statusMonster('Dreadling'),oldChance=chance
      try {
        chance=p=>p===0.25;turnCount=1;applyEnemyContactStatuses(e)
        statusCheck(player.rootTurns===3,'root lasts three turns')
        statusCheck(e.rootReadyTurn===7,'five-turn cooldown')
        updatePlayerStatuses()
      } finally {chance=oldChance}
    })()`))
    cy.get('#playerStatusList').contains('Rooted').should('be.visible')
    cy.window().then(async win => {
      const y=win.eval('player.y')
      await win.eval('tryMove(0,1)')
      expect(win.eval('player.y')).to.eq(y)
      expect(win.eval('player.rootTurns')).to.eq(2)
      expect(win.eval('player.x')).to.eq(40)
    })
  })

  it('shows Gaze and Curse penalties as independent badges', () => {
    cy.window().then(win => win.eval(`(() => {
      const g=statusMonster('Gorgon',38,40),m=statusMonster('Mummy',39,39)
      const priorChance=chance
      try {
        chance=p=>p===0.25;turnCount=1
        statusCheck(tryEnemyGazeOrWail(g),'Gorgon casts')
        applyEnemyContactStatuses(m)
        statusCheck(player.gazeTurns===3 && player.mummyCurseTurns===4,'two statuses')
        statusCheck(playerAtk()===playerAtk(true)-2,'curse reduces ATK')
        updatePlayerStatuses()
      } finally {chance=priorChance}
    })()`))
    cy.get('#playerStatusList').contains('Petrified').should('be.visible')
    cy.get('#playerStatusList').contains('Cursed').should('be.visible')
  })

  it('redirects movement while confused, then clears when the same Banshee dies', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=statusMonster('Banshee',38,40)
      const priorChance=chance
      try {
        chance=p=>p===0.25;turnCount=1
        statusCheck(tryEnemyGazeOrWail(e),'Banshee wails')
        statusCheck(player.confusionTurns===5,'five-turn confusion')
        updatePlayerStatuses()
        const save=JSON.parse(JSON.stringify(buildSaveObject()))
        statusCheck(save.player.confusionSourceId===e.id,'source ID saved')
      } finally {chance=priorChance}
    })()`))
    cy.get('#playerStatusList').contains('Confused').should('be.visible')
    cy.window().then(win => win.eval(`(() => {
      const e=enemies.find(m=>m.baseName==='Banshee')
      e.hp=0;killEnemy(e);updatePlayerStatuses()
      statusCheck(player.confusionTurns===0 && player.confusionSourceId===null,'caster death clears')
    })()`))
    cy.get('#playerStatusList').contains('Confused').should('not.exist')
  })

  it('uses one turn and no inventory when frenzy interrupts an item', () => {
    cy.window().then(async win => {
      await win.eval(`(async () => {
        const e=statusMonster('Dreadling'),oldChance=chance,oldPick=pick
        try {
          player.berserkTurns=10;player.berserkBonus=5
          player.inventory=[createItem('herb')]
          const items=player.inventory.length
          chance=()=>true;pick=items=>items[0]
          await ITEM_ACTION_HANDLERS.herb(0)
          statusCheck(player.inventory.length===items,'interrupted item is not consumed')
          statusCheck(turnCount===1,'exactly one turn')
        } finally {chance=oldChance;pick=oldPick}
      })()`)
    })
  })
})
