describe('Temple sanctuary boundary, immunity and pursuit', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__sanctuarySave = save
        win.eval(`loadGameFromObject(window.__sanctuarySave, {isReplayInit:true}); delete window.__sanctuarySave;
          replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false;
          raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;deathTransition=null;
          currentZ=0;map=surfaceMap;spawnPoint={x:50,y:50};player.x=60;player.y=50;
          snapCameraToPlayer();
          player.hp=1000;player.maxHp=1000;player.equip.weapon={kind:'weapon',name:'Test Club',atk:1,grace:3};
          player.invisibleTurns=0;player.godInvisible=false;player.godMode=false;player.poisonTurns=0;
          player.berryRegenTurns=0;player.curseDebuffs=[];npcs=[];groundItems=[];
          for(let y=42;y<68;y++)for(let x=42;x<75;x++){map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))}
          enemies=[{id:'holy-test',name:'Goblin',baseName:'Goblin',tier:1,level:0,
            x:61,y:50,homeX:61,homeY:50,alive:true,hp:100,maxHp:100,atk:5,def:0,spd:2,
            aggro:8,abilities:[],humanoid:false,aware:true,alarmed:false,sleeping:false,wander:false}];
          occupied=new Set(['61,50']);`)
      })
    })
  })

  it('protects the inclusive border from melee, ranged fire and safe hit-and-retreat attacks', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const enemy=enemies[0], before=turnCount, hp=player.hp, random=rngState
      check(FLEE_DISTANCE===10 && playerInsideSanctuary(),'10-tile boundary is protected')
      check(!enemyInsideSanctuary(enemy),'enemy at 11 tiles is outside')
      check(!enemyCanPathThrough(enemy,60,50),'enemy cannot path into protected tile')
      check(!enemyAttackPlayer(enemy) && !enemyRangedAttackPlayer(enemy),'attacks from outside are blocked')
      check(player.hp===hp && rngState===random,'blocked attacks cost no RNG')
      await tryMove(1,0)
      check(turnCount===before && enemy.hp===100,'player cannot freely hit outside enemy from border')
      const messages=[]
      const originalLog=log
      log=(message,...rest)=>{messages.push(message);originalLog(message,...rest)}
      enemyTurn()
      check(Math.max(Math.abs(enemy.x-player.x),Math.abs(enemy.y-player.y))>=2,
        'adjacent monster withdraws two tiles away if possible')
      check(messages.filter(m=>m.includes('retreats from the sacred ground')).length===1,
        'visible sanctuary-border retreat announces itself once')
      const position=keyXY(enemy.x,enemy.y)
      for(let i=0;i<12;i++){enemyTurn();check(keyXY(enemy.x,enemy.y)===position,'enemy holds rather than oscillating')}
      check(messages.filter(m=>m.includes('retreats from the sacred ground')).length===1,
        'the retreat message is not repeated on idle turns')
      log=originalLog
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      // Compare the persisted gameplay record; live objects also contain
      // animation timestamps and omitted/default fields reconstructed on load.
      const persistentState=()=>JSON.stringify({enemy:buildSaveObject().enemies[0],rng:rngState|0,turn:turnCount})
      const final=persistentState()
      loadGameFromObject(saved,{isReplayInit:true})
      check(persistentState()===final,
        'enemy position, awareness and all persisted fields restore with identical RNG and turn')
    })()`))
  })

  it('keeps retreating residents outside the boundary and removes underground protection', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const e=enemies[0]
      occupied.clear();e.x=50;e.y=50;occupied.add(keyXY(50,50))
      check(enemyInsideSanctuary(e),'resident begins within refuge')
      for(let i=0;i<7;i++)enemyTurn()
      check(!enemyInsideSanctuary(e),'resident flees to tile 11 or beyond')
      check(!e.fleeingHoly || sanctuaryDistance(e.x,e.y)>10,'fleeing respects updated radius')
      currentZ=-1;e.level=-1
      check(!playerInsideSanctuary()&&!enemyInsideSanctuary(e), 'no sacred-ground immunity underground')
    })()`))
  })

  it('lets invisible-to-enemies sanctuary players coexist with normal roaming and homeReturn', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const e=enemies[0]
      ENEMY_WANDER_CHANCE=1
      e.x=65;e.y=50;e.homeX=65;e.homeY=50;e.wander='roam';e.abilities=['trueSight'];
      occupied=new Set([keyXY(e.x,e.y)])
      check(playerHiddenFromEnemy(e),'true sight cannot target protected player')
      const visited=new Set([keyXY(e.x,e.y)])
      for(let t=0;t<18;t++){
        enemyTurn()
        visited.add(keyXY(e.x,e.y))
        check(!enemyInsideSanctuary(e),'roaming enemy cannot enter sanctuary')
        check(Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))>=2,
          'roaming enemy cannot step into melee range')
      }
      check(visited.size>3 && !e.aware,'nearby enemy wanders rather than freezing or pursuing')
      occupied.clear();e.x=68;e.y=50;e.homeX=64;e.homeY=50;e.homeRadius=1;
      e.wander='homeReturn';e.aware=true;occupied.add(keyXY(e.x,e.y))
      for(let t=0;t<6;t++) enemyTurn()
      check(Math.max(Math.abs(e.x-e.homeX),Math.abs(e.y-e.homeY))<=1,
        'homeReturn enemy resumes going home when player is protected')
      check(e.homeX===64 && !e.aware,'original home persists without ongoing chase')
    })()`))
  })

  it('preserves protected wandering in deterministic save/replay restoration', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const e=enemies[0]
      ENEMY_WANDER_CHANCE=1
      occupied.clear();e.x=63;e.y=50;e.homeX=63;e.homeY=50;
      e.wander='roam';e.aware=true;occupied.add(keyXY(e.x,e.y))
      const start=JSON.parse(JSON.stringify(buildSaveObject()))
      const simulate=()=>{
        const positions=[]
        for(let t=0;t<16;t++){
          enemyTurn()
          positions.push(keyXY(enemies[0].x,enemies[0].y))
          check(!enemyInsideSanctuary(enemies[0]) &&
            Math.max(Math.abs(enemies[0].x-player.x),Math.abs(enemies[0].y-player.y))>=2,
            'wandering retains sanctuary safety')
        }
        return JSON.stringify({positions,rng:rngState,turn:turnCount,aware:enemies[0].aware})
      }
      const first=simulate()
      loadGameFromObject(start,{isReplayInit:true})
      ENEMY_WANDER_CHANCE=1
      const restored=simulate()
      check(restored===first,'save/replay state yields identical wandering, awareness and RNG')
    })()`))
  })
})
