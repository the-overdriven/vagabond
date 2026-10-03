describe('Wounded enemy flight', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Rush Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.rushCheck=(ok,msg)=>{if(!ok) throw new Error(msg)}
      replayRecording=false; replayPlaying=false; replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; deathTransition=null
      enemies=[]; npcs=[]; occupied=new Set(); turnCount=0
      for(let y=30;y<=50;y++) for(let x=30;x<=50;x++) {
        map[y][x]='grass'; grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40; player.y=40; player.hp=1000; player.maxHp=1000; player.race='human'
      player.godMode=false; player.invisibleTurns=0; player.poisonTurns=0
      player.equip={weapon:null,armor:null,shield:null}; resetSwimming()
      player.swimming=0; player.swimmingPractice=0
      window.rushEnemy=(name,x=38,y=40)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,baseName:name,x,y,hp:t.hp,maxHp:t.hp,alive:true,
          level:0,homeX:x,homeY:y,homeTileType:'grass',prefix:null,equipment:null})
        occupied.add(keyXY(x,y)); return e
      }
    })()`))
  })

  it('logs once at the strict threshold and restores flight from saves/replay', () => {
    cy.window().then(win => win.eval(`(async () => {
      const oldChance=chance,oldDamage=damageRoll,oldLog=log;const messages=[]
      try {
        chance=()=>false;damageRoll=()=>2;log=m=>messages.push(m)
        for(const name of ['Grivkin','Goblin','Monkey']) {
          enemies=[];occupied.clear();const e=rushEnemy(name,39,40)
          e.maxHp=100;e.hp=11
          rushCheck(e.abilities.includes('flee'),'template flight '+name)
          await playerAttackEnemy(e,true)
          rushCheck(enemyIsFleeing(e) && messages.includes('Wounded '+name+' retreats!'),'crossing log')
          const count=messages.length;await playerAttackEnemy(e,true)
          rushCheck(!messages.slice(count).some(m=>m.startsWith('Wounded ')),'no duplicate retreat')
          e.hp=10;rushCheck(!enemyIsFleeing(e),'exact threshold not fleeing')
          e.hp=1;const before=messages.length;await playerAttackEnemy(e,true)
          rushCheck(!messages.slice(before).some(m=>m.startsWith('Wounded ')),'fatal hit no retreat')
        }
        enemies=[];occupied.clear();const e=rushEnemy('Goblin',39,40);e.hp=1
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save)
        rushCheck(enemyIsFleeing(enemies.find(other=>other.id===e.id)),'saved flight derived')
        startReplayRecording()
        rushCheck(enemyIsFleeing(replayData.initialState.enemies.find(other=>other.id===e.id)),'replay snapshot flight')
        replayRecording=false
      } finally {chance=oldChance;damageRoll=oldDamage;log=oldLog}
    })()`))
  })

  it('replaces shooting with one retreat or hesitation, and cornered monsters fight back', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll
      try {
        player.freezing={active:false,turns:0};player.curseDebuffs=[]
        player.berryRegenTurns=0;player.speedPotionTurns=0
        const e=rushEnemy('Goblin',38,40);e.hp=1;e.shotsRemaining=10
        let probabilities=[];chance=p=>{probabilities.push(p);return false}
        const hp=player.hp;enemyTurn()
        rushCheck(Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))===3,'one retreat tile')
        rushCheck(player.hp===hp && e.shotsRemaining===10 && probabilities.length===1 && probabilities[0]===.10,'no shot or extra action')
        occupied.clear();e.x=39;e.y=40;occupied.add('39,40')
        probabilities=[];chance=p=>{probabilities.push(p);return true}
        enemyTurn();rushCheck(e.x===39 && e.y===40 && player.hp===hp,'hesitation consumes turn')
        rushCheck(probabilities.length===1 && probabilities[0]===.10,'one hesitation roll')
        for(const [dx,dy] of DIRS8) {
          const x=e.x+dx,y=e.y+dy
          if(x!==player.x || y!==player.y) map[y][x]='mountain'
        }
        chance=()=>false;damageRoll=()=>5
        enemyTurn();rushCheck(player.hp===hp-5 && e.shotsRemaining===10,'cornered melee attack')
        e.hp=e.maxHp*.10;rushCheck(!enemyIsFleeing(e),'healing ends flight')
        e.hp=0;rushCheck(!enemyIsFleeing(e),'dead monster no flight')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('replays retreat movement and hesitation deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      const e=rushEnemy('Goblin',39,40);e.hp=1
      player.freezing={active:false,turns:0};player.curseDebuffs=[]
      player.berryRegenTurns=0;player.speedPotionTurns=0
      consecutiveWaitTurns=0;rngState=917
      startReplayRecording()
      for(let i=0;i<3;i++) skipTurn()
      const state=()=>({hp:player.hp,turn:turnCount,enemies:buildSaveObject().enemies})
      const expected=JSON.parse(JSON.stringify(state())),recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
      replayPlaying=true;replayRecording=false;replayRngIndex=0
      try {
        for(const action of recorded.actions) await runReplayAction(action)
        rushCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
        rushCheck(JSON.stringify(state())===JSON.stringify(expected),'same wounded flight outcome')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })
})
