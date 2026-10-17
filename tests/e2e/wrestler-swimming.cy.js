describe('Wrestler and monster swimming', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Wrestler Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 12345; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.wrestleCheck = (ok, what) => {if (!ok) throw new Error(what)}
      replayRecording=false; replayPlaying=false; replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; deathTransition=null
      enemies=[]; npcs=[]; occupied=new Set(); turnCount=0
      for(let y=30; y<=50; y++) for(let x=30; x<=50; x++) {
        map[y][x]='grass'; grasslandTrees.delete(keyXY(x,y))
      }
      spawnPoint={x:10,y:10}
      player.x=40; player.y=40; player.hp=5000; player.maxHp=5000
      player.race='human'; player.godMode=false; player.invisibleTurns=0
      player.poisonTurns=0; player.equip={weapon:null,armor:null,shield:null}
      player.swimming=0; player.swimmingPractice=0; resetSwimming()
      window.wrestleEnemy=(name,x=39,y=40)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        wrestleCheck(!!t,'template '+name)
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null})
        occupied.add(keyXY(x,y)); return e
      }
    })()`))
  })

  it('assigns Wrestler to the three agreed monsters and swimming only to Murkspawn', () => {
    cy.window().then(win => win.eval(`(() => {
      for(const name of ['Sasquatch','Yeti','Owlbear']) {
        const e=wrestleEnemy(name)
        wrestleCheck(enemyHasAbility(e,'wrestler'),'wrestler template '+name)
        wrestleCheck(e.wrestleReadyTurn===0,'initialized cooldown')
      }
      wrestleCheck(ENEMY_TEMPLATE_BY_NAME.Owlbear.abilities.includes('enrage'),'keep Owlbear enrage')
      const murk=wrestleEnemy('Murkspawn')
      wrestleCheck(enemyHasAbility(murk,'swim'),'Murkspawn swims')
      for(const t of ENEMY_TEMPLATES) if(t.name!=='Murkspawn')
        wrestleCheck(!t.abilities.includes('swim'),'no other new swimmer: '+t.name)
    })()`))
  })

  it('swaps once instead of attacking and observes a five-turn cooldown across save/load', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=wrestleEnemy('Yeti'), oldChance=chance
      try {
        let rolls=0; chance=p=>{wrestleCheck(p===0.25,'swap proc');rolls++;return true}
        turnCount=1; const hp=player.hp, steps=player.steps
        wrestleCheck(tryEnemyWrestle(e),'swap activates')
        wrestleCheck(player.x===39 && e.x===40 && player.y===40 && e.y===40,'actors exchange tiles')
        wrestleCheck(occupied.has('40,40') && !occupied.has('39,40'),'enemy occupancy moved')
        wrestleCheck(player.hp===hp && player.steps===steps,'no attack or walking steps')
        wrestleCheck(e.wrestleReadyTurn===7 && rolls===1,'five intervening turns')
        const data=JSON.parse(JSON.stringify(buildSaveObject()))
        wrestleCheck(data.enemies.find(m=>m.id===e.id).wrestleReadyTurn===7,'save cooldown')
        loadGameFromObject(data)
        const restored=enemies.find(m=>m.id===e.id)
        wrestleCheck(restored.wrestleReadyTurn===7 && enemyHasAbility(restored,'wrestler'),'restored state')
        for(turnCount=2;turnCount<=6;turnCount++)
          wrestleCheck(!tryEnemyWrestle(restored),'cooldown turn '+turnCount)
        wrestleCheck(rolls===1,'cooldown consumes no RNG')
        turnCount=7;wrestleCheck(tryEnemyWrestle(restored),'swaps again after cooldown')
        wrestleCheck(restored.wrestleReadyTurn===13 && rolls===2,'new cooldown')
      } finally {chance=oldChance}
    })()`))
  })

  it('does not roll when invisible, in sanctuary, diagonally blocked, or crossing unsafe terrain', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=wrestleEnemy('Sasquatch'), oldChance=chance
      let rolls=0
      try {
        chance=()=>{rolls++;return false}
        player.invisibleTurns=3
        wrestleCheck(!tryEnemyWrestle(e),'hidden player')
        player.invisibleTurns=0
        spawnPoint={x:40,y:40}
        wrestleCheck(!tryEnemyWrestle(e),'sanctuary')
        spawnPoint={x:10,y:10}
        map[40][39]='water'
        wrestleCheck(!tryEnemyWrestle(e),'cannot wrestle untrained player into deep water')
        map[40][39]='grass'
        player.x=40;player.y=40;e.x=39;e.y=39
        occupied=new Set([keyXY(39,39)])
        map[39][40]='mountain'
        wrestleCheck(!tryEnemyWrestle(e),'blocked diagonal')
        map[39][40]='grass'
        player.x=40;player.y=40;e.x=39;e.y=40
        map[40][40]='water'
        wrestleCheck(!tryEnemyWrestle(e),'non-swimming wrestler cannot enter water')
        map[40][40]='grass'
        wrestleCheck(rolls===0,'no invalid-state RNG')
        wrestleCheck(!tryEnemyWrestle(e) && rolls===1,'valid but failed proc')
      } finally {chance=oldChance}
    })()`))
  })

  it('routes Murkspawn through water and preserves its swimming in save/replay', () => {
    cy.window().then(win => win.eval(`(() => {
      enemies=[];occupied.clear()
      const swimmer=wrestleEnemy('Murkspawn',37,40)
      const nonSwimmer=wrestleEnemy('Owlbear',37,42)
      for(let x=37;x<=42;x++) {
        map[39][x]='mountain';map[41][x]='mountain'
      }
      map[40][38]='water';map[40][39]='water';map[40][40]='water'
      player.x=42;player.y=40
      wrestleCheck(enemyCanTraverse(swimmer,38,40),'swim traversal')
      wrestleCheck(!enemyCanTraverse(nonSwimmer,38,40),'ordinary monster cannot swim')
      wrestleCheck(!enemyCanTraverse(swimmer,38,39),'swimming does not cross mountains')
      wrestleCheck(enemyStepTowardPlayer(swimmer) && swimmer.x===38,'pathfinder enters water')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved)
      wrestleCheck(enemies.find(e=>e.id===swimmer.id).abilities.includes('swim'),'save restores swimmer')
      startReplayRecording()
      wrestleCheck(replayData.initialState.enemies.some(e=>e.id===swimmer.id && e.abilities.includes('swim')),'replay snapshot retains swim')
      replayRecording=false
    })()`))
  })
})
