describe('Same-species gang power', () => {
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

  it('counts only living same-species allies in effective range without changing base ATK or RNG', () => {
    cy.window().then(win => win.eval(`(() => {
      for(const name of ['Goblin','Skink','Kobold']) {
        enemies=[];occupied.clear();const e=rushEnemy(name,39,40),base=e.atk
        rushCheck(e.abilities.includes('gangPower'),'template ability '+name)
        rushCheck(enemyGangPower(e)===0 && enemyAtk(e)===base,'alone has no bonus')
        const ally=rushEnemy(name,38,40);ally.name='Fierce '+name
        rushEnemy(name==='Skink'?'Goblin':'Skink',40,41)
        const distant=rushEnemy(name,39+effectiveAggroRange(e)+1,40)
        const dead=rushEnemy(name,39,41);dead.alive=false
        const otherLevel=rushEnemy(name,39,42);otherLevel.level=-1
        const state=rngState
        rushCheck(enemyGangPower(e)===1 && enemyAtk(e)===base+1,'species prefix range death and level filters')
        rushCheck(rngState===state && e.atk===base,'pure derived bonus')
        e.alarmed=true
        rushCheck(enemyGangPower(e)===2,'Alarmed extends ally counting range')
        distant.levelKind='crypt2'
        rushCheck(enemyGangPower(e)===1,'different level kind excluded')
        ally.hp=0;rushCheck(enemyGangPower(e)===0,'zero HP ally excluded')
        ally.hp=1;ally.x=30;rushCheck(enemyGangPower(e)===0,'moving away removes bonus')
      }
    })()`))
  })

  it('uses the bonus in melee and inspection, preserves it through saves, and adds no gang log', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=rushEnemy('Goblin',39,40);rushEnemy('Goblin',38,40);rushEnemy('Goblin',39,41)
      const oldDamage=damageRoll,oldChance=chance,oldLog=log;let atk=null;const messages=[]
      try {
        chance=()=>false;damageRoll=a=>{atk=a;return 2};log=m=>messages.push(m)
        enemyAttackPlayer(e,true)
        rushCheck(atk===e.atk+2,'effective attack before defense')
        rushCheck(tileInspectInfo(e.x,e.y).html.includes('gang power (+2 ATK)'),'inspection status')
        rushCheck(!messages.some(m=>m.toLowerCase().includes('gang power')),'no gang logs')
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save)
        const restored=enemies.find(other=>other.id===e.id)
        rushCheck(enemyGangPower(restored)===2 && restored.atk===e.atk,'restored derived bonus without stacking')
        startReplayRecording()
        rushCheck(replayData.initialState.enemies.find(other=>other.id===e.id).abilities.includes('gangPower'),'replay initial ability')
        replayRecording=false
      } finally {damageRoll=oldDamage;chance=oldChance;log=oldLog}
    })()`))
  })

  it('replays pack movement and changing melee bonuses deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      rushEnemy('Goblin',39,40);rushEnemy('Goblin',38,40);rushEnemy('Skink',40,42)
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
        rushCheck(JSON.stringify(state())===JSON.stringify(expected),'same gang combat outcome')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })
})
