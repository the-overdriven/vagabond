describe('SPD-scaled pursuit and losing interest', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__speedFixture = save
      win.eval(`loadGameFromObject(window.__speedFixture, {isReplayInit:true});
        delete window.__speedFixture
        replayRecording=false;replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=true
        raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;deathTransition=null
        cameraAnimating=false;attackAnim=null;pendingMove=null
        currentZ=0;map=surfaceMap;spawnPoint={x:140,y:140}
        player.x=60;player.y=60;player.race='human';player.hp=1000;player.maxHp=1000
        player.godMode=false;player.invisibleTurns=0;player.godInvisible=false
        player.speedPotionTurns=0;player.speedPotionBonus=0;player.slowTurns=0;player.gazeTurns=0
        player.curseDebuffs=[];player.poisonTurns=0;player.berryRegenTurns=0
        player.equip={weapon:null,armor:null,shield:null};player.inventory=[]
        enemies=[];npcs=[];groundItems=[];occupied=new Set();beastTracks=new Map()
        for(let y=55;y<=68;y++) for(let x=55;x<=78;x++) {
          map[y][x]='grass';discovered[y][x]=true;grasslandTrees.delete(keyXY(x,y))
        }
        player.baseSpd+=5-playerSpd()
        window.speedCheck=(condition,message)=>{if(!condition)throw Error(message)}
        window.resetPursuitTest=(playerSpeed=5,enemySpeed=6,distance=2,alarmed=true)=>{
          player.baseSpd+=playerSpeed-playerSpd()
          const template=ENEMY_TEMPLATE_BY_NAME['Giant Rat']
          enemies=[];occupied=new Set()
          const e=addEnemy({...template,id:'pursuit-test',name:'Giant Rat',baseName:'Giant Rat',
            x:player.x+distance,y:player.y,homeX:player.x+distance,homeY:player.y,
            homeTileType:'grass',level:0,alive:true,aware:true,alarmed,
            alarmedZ:alarmed?currentZ:null,alarmedLevelKind:alarmed?currentLevelKind():null,
            hp:100,maxHp:100,atk:1,def:0,aggro:9,wander:false,abilities:[],
            sleeping:false,prefix:null,equipment:null})
          e.spd+=enemySpeed-enemySpd(e)
          occupied.add(keyXY(e.x,e.y))
          speedCheck(playerSpd()===playerSpeed && enemySpd(e)===enemySpeed,'effective SPD fixture')
          return e
        }
      `)
    }))
  })

  it('scales both SPD advantages by 5 percentage points and caps them at 50%', () => {
    cy.window().then(win => win.eval(`(() => {
      for(const [difference,expected] of [[-20,0],[-1,0],[0,0],[1,.05],[2,.10],
        [4,.20],[5,.25],[8,.40],[9,.45],[10,.50],[15,.50]]) {
        speedCheck(Math.abs(speedChaseChance(difference)-expected)<1e-10,
          'speed difference '+difference+' has the right chance')
      }
      return true
    })()`)).should('equal',true)
  })

  it('lets a one-SPD advantage move and attack only on a successful 5% pursuit roll', () => {
    cy.window().then(win => win.eval(`(() => {
      const originalRng=rng,originalAttack=enemyAttackPlayer,originalLog=log
      const originalVisible=enemyIsVisibleOnMainView
      let attacks=0,messages=[]
      try {
        enemyAttackPlayer=()=>{attacks++;return false}
        log=(message)=>{messages.push(message)}
        let e=resetPursuitTest(5,6,2)
        rng=()=>0.049
        enemyTurn()
        speedCheck(e.x===61 && attacks===1,'5% success closes distance then attacks once')
        speedCheck(messages.some(m=>m.includes('faster and gaining')),'extra turn is visible in log')
        e=resetPursuitTest(5,6,2);attacks=0;messages=[]
        rng=()=>0.051
        enemyTurn()
        speedCheck(e.x===61 && attacks===0,'5% failure permits just one move')
        speedCheck(!messages.some(m=>m.includes('faster and gaining')),'no false extra-turn log')
        e=resetPursuitTest(5,5,2);attacks=0
        rng=()=>0
        enemyTurn()
        speedCheck(e.x===61 && attacks===0,'equal SPD gives no bonus action even at zero RNG')
        e=resetPursuitTest(5,15,2);attacks=0
        rng=()=>0.49
        enemyTurn()
        speedCheck(e.x===61 && attacks===1,'ten-point advantage reaches 50% cap')
        e=resetPursuitTest(5,20,2);attacks=0
        rng=()=>0.51
        enemyTurn()
        speedCheck(e.x===61 && attacks===0,'even large advantage never exceeds 50%')
        e=resetPursuitTest(5,6,2);attacks=0;messages=[]
        enemyIsVisibleOnMainView=()=>false;rng=()=>0
        enemyTurn()
        speedCheck(e.x===61&&attacks===1,'unseen fast enemy keeps its normal extra action')
        speedCheck(!messages.some(m=>m.includes('faster and gaining')),
          'unseen pursuers do not give away their presence in the log')
      } finally {
        rng=originalRng;enemyAttackPlayer=originalAttack;log=originalLog
        enemyIsVisibleOnMainView=originalVisible
      }
      return true
    })()`)).should('equal',true)
  })

  it('scales speed-based disengagement but never loses adjacent or Alarmed enemies', () => {
    cy.window().then(win => win.eval(`(() => {
      const originalRng=rng,originalAttack=enemyAttackPlayer,originalLog=log
      let messages=[],attacks=0
      try {
        enemyAttackPlayer=()=>{attacks++;return false}
        log=(message)=>{messages.push(message)}
        let e=resetPursuitTest(6,5,2,false)
        rng=()=>0.049
        enemyTurn()
        speedCheck(!e.aware && e.x===62,'one SPD lead allows a 5% disengage')
        speedCheck(messages.some(m=>m.includes('loses interest in the chase')),'disengagement is reported')
        e=resetPursuitTest(6,5,2,false)
        rng=()=>0.051
        enemyTurn()
        speedCheck(e.aware && e.x===61,'one SPD lead cannot disengage above 5%')
        e=resetPursuitTest(15,5,1,false);attacks=0
        rng=()=>0
        enemyTurn()
        speedCheck(e.aware && attacks===1,'adjacent enemy cannot disengage due to SPD')
        e=resetPursuitTest(15,5,2,true)
        rng=()=>0
        enemyTurn()
        speedCheck(e.aware && e.x===61,'Alarmed enemy ignores speed-based disengagement')
        e=resetPursuitTest(15,5,2,false);e.justEvaded=true;messages=[]
        rng=()=>0.49
        enemyTurn()
        speedCheck(!e.aware && messages.some(m=>m.includes('hesitates after its dodge')),
          'dodge feedback uses the same capped 50% roll')
        e=resetPursuitTest(5,5,3,false);e.aggro=3
        rng=()=>0.01
        enemyTurn()
        speedCheck(!e.aware,'existing 30% outer-AGGRO disengage remains independent')
      } finally {rng=originalRng;enemyAttackPlayer=originalAttack;log=originalLog}
      return true
    })()`)).should('equal',true)
  })

  it('preserves haste priority and can restore and repeat the same seeded chase turn', () => {
    cy.window().then(win => win.eval(`(() => {
      const originalHaste=tryEnemyHaste,originalAttack=enemyAttackPlayer
      try {
        const e=resetPursuitTest(5,20,3)
        let hasteCalls=0,attacks=0
        tryEnemyHaste=()=>{hasteCalls++;return true}
        enemyAttackPlayer=()=>{attacks++;return false}
        enemyTurn()
        speedCheck(hasteCalls===1 && attacks===0 && e.x===63,
          'haste replaces the SPD pursuit roll, not an additional attack')
        tryEnemyHaste=originalHaste
        resetPursuitTest(5,8,2,true)
        rngState=246813579
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        const run=()=>{
          enemyTurn()
          return JSON.stringify({rngState,turnCount,enemy:buildSaveObject().enemies.find(x=>x.id==='pursuit-test')})
        }
        const expected=run()
        loadGameFromObject(saved,{isReplayInit:true})
        speedCheck(run()===expected,'same enemy turn, position, awareness and RNG after restoration')
      } finally {tryEnemyHaste=originalHaste;enemyAttackPlayer=originalAttack}
      return true
    })()`)).should('equal',true)
  })
})
