describe('Critical melee knockback', () => {
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

  it('pushes on Ogre/Cyclops criticals and stops extra attacks outside melee range', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll,oldExtra=canGetExtraWeaponAttack
      let critical=true,calls=0,attacks=0
      try {
        chance=()=>{calls++;return critical && calls%2===0}
        damageRoll=()=>{attacks++;return 5}
        canGetExtraWeaponAttack=()=>{throw new Error('extra attack after successful push')}
        for(const name of ['Ogre','Cyclops']) {
          enemies=[];occupied.clear();player.x=40;player.y=40
          const e=rushEnemy(name,39,40),hp=player.hp;calls=0;attacks=0
          rushCheck(e.abilities.includes('knockback'),'template ability '+name)
          enemyAttackPlayer(e)
          rushCheck(player.x===41 && player.hp===hp-10 && attacks===1,'critical push '+name)
          player.x=40;calls=0;critical=false;canGetExtraWeaponAttack=()=>false
          enemyAttackPlayer(e,true)
          rushCheck(player.x===40,'ordinary hit no push')
          critical=true
        }
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save)
        rushCheck(enemies.every(e=>e.abilities.includes('knockback')),'ability restored')
        startReplayRecording()
        rushCheck(replayData.initialState.enemies.every(e=>e.abilities.includes('knockback')),'replay snapshot ability')
        replayRecording=false
      } finally {chance=oldChance;damageRoll=oldDamage;canGetExtraWeaponAttack=oldExtra}
    })()`))
  })

  it('respects terrain and occupied destinations, allows diagonal pushes and deep water', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll;let calls=0
      try {
        chance=()=>++calls%2===0;damageRoll=()=>5
        const e=rushEnemy('Ogre',39,40)
        for(const tile of ['mountain','boulder']) {
          map[40][41]=tile;calls=0;enemyAttackPlayer(e,true)
          rushCheck(player.x===40,'blocked '+tile)
        }
        map[40][41]='grass';npcs=[{x:41,y:40}];calls=0;enemyAttackPlayer(e,true)
        rushCheck(player.x===40,'NPC blocks push');npcs=[]
        const blocker=rushEnemy('Rat',41,40);calls=0;enemyAttackPlayer(e,true)
        rushCheck(player.x===40,'enemy blocks push');blocker.alive=false
        grasslandTrees.add('41,40');calls=0;enemyAttackPlayer(e,true)
        rushCheck(player.x===40,'tree blocks push');grasslandTrees.delete('41,40')
        e.x=39;e.y=39;calls=0;enemyAttackPlayer(e,true)
        rushCheck(player.x===41 && player.y===41,'diagonal push')
        player.x=40;player.y=40;e.y=40;map[40][41]='water';calls=0
        const hp=player.hp,steps=player.steps;enemyAttackPlayer(e,true)
        rushCheck(player.x===41 && player.drowning && player.hp<hp-10,'unknown swimmer knocked into water')
        rushCheck(player.steps===steps && player.swimmingPractice===0,'forced movement no progress')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('does not push on a miss, glance, zero damage, or a lethal strike', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll,oldArmor=equippedArmor,oldDie=die
      try {
        const e=rushEnemy('Cyclops',39,40)
        chance=()=>true;damageRoll=()=>5;enemyAttackPlayer(e,true)
        rushCheck(player.x===40,'miss no push')
        let calls=0;chance=()=>++calls>1;equippedArmor=()=>({name:'armor'})
        enemyAttackPlayer(e,true);rushCheck(player.x===40,'glance no push')
        equippedArmor=()=>null;calls=0;chance=()=>++calls%2===0;damageRoll=()=>0
        enemyAttackPlayer(e,true);rushCheck(player.x===40,'zero damage no push')
        player.hp=1;damageRoll=()=>5;calls=0;let died=false;die=()=>{died=true}
        enemyAttackPlayer(e,true);rushCheck(died && player.x===40,'lethal hit resolves death before push')
      } finally {chance=oldChance;damageRoll=oldDamage;equippedArmor=oldArmor;die=oldDie}
    })()`))
  })
  it('replays critical displacement and combat deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      rushEnemy('Ogre',39,40)
      player.freezing={active:false,turns:0};player.curseDebuffs=[]
      player.berryRegenTurns=0;player.speedPotionTurns=0
      consecutiveWaitTurns=0;rngState=917
      const oldCritical=enemyCriticalHitChance
      try {
        enemyCriticalHitChance=()=>1
        startReplayRecording()
        for(let i=0;i<3;i++) skipTurn()
        rushCheck(player.x>40,'recorded critical displacement')
        const state=()=>({hp:player.hp,x:player.x,y:player.y,turn:turnCount,enemies:buildSaveObject().enemies})
        const expected=JSON.parse(JSON.stringify(state())),recorded=JSON.parse(JSON.stringify(replayData))
        loadGameFromObject(recorded.initialState,{isReplayInit:true})
        replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
        replayPlaying=true;replayRecording=false;replayRngIndex=0
        for(const action of recorded.actions) await runReplayAction(action)
        rushCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
        rushCheck(JSON.stringify(state())===JSON.stringify(expected),'same critical push outcome')
      } finally {
        enemyCriticalHitChance=oldCritical;replayPlaying=false;replaySimulationMode=false;activeReplay=null
      }
    })()`))
  })

})
