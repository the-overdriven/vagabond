describe('Ethereal Ghosts and Oculus true sight', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Ghost Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class','show')
    cy.window().then(win => win.eval(`(() => {
      window.senseCheck = (ok,msg) => {if (!ok) throw new Error(msg)}
      senseCheck(enemies.filter(e=>(e.baseName || e.name)==='Ghost').every(e=>e.abilities.includes('ethereal')),'all generated Ghost paths')
      replayRecording=false; replayPlaying=false; replaySimulationMode=false; activeReplay=null
      replayData=null; replayAnimationsDisabled=true
      currentZ=0; currentCave=-1; map=surfaceMap; raceOpen=false
      mapOpen=false; invOpen=false; tradeOpen=false; deathTransition=null
      cameraAnimating=false; attackAnim=null; pendingMove=null
      for(let y=30;y<=55;y++) for(let x=30;x<=55;x++) {
        map[y][x]='grass'; discovered[y][x]=true; grasslandTrees.delete(keyXY(x,y))
      }
      enemies=[]; groundItems=[]; occupied=new Set(); turnCount=0; consecutiveWaitTurns=0
      player.x=40; player.y=40; player.hp=1000; player.maxHp=1000; player.race='human'
      player.godMode=false; player.invisibleTurns=0; player.poisonTurns=0
      player.freezing={active:false,turns:0}; player.curseDebuffs=[]; player.berryRegenTurns=0
      player.speedPotionTurns=0; player.equip={weapon:null,armor:null,shield:null}; player.inventory=[]
      window.makeSenseEnemy=(name,x,y)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name]
        const e=addEnemy({...t,baseName:name,x,y,homeX:x,homeY:y,homeTileType:'grass',
          hp:100,maxHp:100,alive:true,level:currentZ,levelKind:currentZ<0?'chain':null,
          prefix:null,equipment:null})
        occupied.add(keyXY(x,y));return e
      }
    })()`))
  })

  it('blocks mundane/unarmed attacks without combat RNG and permits any magical modifier', () => {
    cy.window().then(win => win.eval(`(async () => {
      const ghost=makeSenseEnemy('Ghost',41,40)
      for(const weapon of [null,{kind:'weapon',name:'sword',atk:30}]) {
        player.equip.weapon=weapon
        const state=rngState
        senseCheck(await playerAttackEnemy(ghost)===false && ghost.hp===100,'immune to mundane attacks')
        senseCheck(rngState===state,'immune attempt uses no combat RNG')
      }
      player.equip.weapon={kind:'weapon',name:'Lucky sword',base:'sword',atk:5,mod:'mf',modAmt:1,grace:3}
      const previousChance=chance
      try {chance=()=>false; await playerAttackEnemy(ghost)} finally {chance=previousChance}
      senseCheck(ghost.hp<100,'non-ATK magical prefix damages Ghost')
    })()`))
    cy.get('#logpanel').should('contain','Only a magical weapon can harm it.')
  })

  it('phases through terrain and remains attackable while standing on a wall', () => {
    cy.window().then(win => win.eval(`(async () => {
      const ghost=makeSenseEnemy('Ghost',41,40)
      for(const tile of ['cavewall','dwarvenwall','mountain','water','lava','boulder']) {
        map[40][41]=tile
        senseCheck(enemyCanTraverse(ghost,41,40),'ethereal terrain: '+tile)
      }
      senseCheck(!enemyCanTraverse(ghost,-1,40) && !enemyCanTraverse(ghost,MAP_W,40),'map bounds')
      map[40][41]='cavewall'
      player.equip.weapon={kind:'weapon',name:'Strong sword',base:'sword',atk:5,mod:'atk',modAmt:1,grace:3}
      const previousChance=chance
      try {chance=()=>false; await tryMove(1,0)} finally {chance=previousChance}
      senseCheck(ghost.hp<100 && player.x===40,'attack target before wall movement validation')
    })()`))
  })

  it('suppresses spotting messages behind an underground FOV blocker', () => {
    cy.window().then(win => win.eval(`(() => {
      currentZ=-1; currentCave=0
      map=blankCaveMap()
      for(let y=30;y<=55;y++) for(let x=30;x<=55;x++) map[y][x]='cavefloor'
      for(let y=30;y<=55;y++) map[y][42]='cavewall'
      undergroundMap=map; undergroundFovCache=null
      undergroundDiscovered=undergroundDiscoveredL1
      const ghost=makeSenseEnemy('Ghost',44,40), previousLog=log, messages=[]
      try {
        log=message=>messages.push(message)
        senseCheck(!undergroundTileVisible(ghost.x,ghost.y),'Ghost hidden behind wall')
        logEnemySpotting(ghost); logEnemySpotting(ghost,true)
        senseCheck(messages.length===0,'no hidden spotting messages')
        ghost.x=41
        logEnemySpotting(ghost)
        senseCheck(messages.length===1 && messages[0].includes('has spotted you'),'visible spotting retained')
      } finally {log=previousLog}
    })()`))
  })

  it('lets only Oculus ignore invisibility and preserves both abilities in saves/replay', () => {
    cy.window().then(win => win.eval(`(() => {
      const oculus=makeSenseEnemy('Oculus',41,40), wolf=makeSenseEnemy('Wolf',40,41)
      const ghost=makeSenseEnemy('Ghost',50,50)
      player.invisibleTurns=10
      senseCheck(!playerHiddenFromEnemy(oculus) && playerHiddenFromEnemy(wolf),'observer-specific invisibility')
      const previousChance=chance
      try {chance=()=>false; enemyTurn()} finally {chance=previousChance}
      senseCheck(player.hp<1000 && oculus.aware && !wolf.aware,'Oculus attacks; Wolf cannot acquire')
      const previousLog=log, previousRng=rngState
      try {log=()=>{throw new Error('true-sight target must not panic')}; reactToInvisibleAttack(oculus,5)}
      finally {log=previousLog}
      senseCheck(rngState===previousRng,'no invisible panic RNG for Oculus')
      const save=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(save,{isReplayInit:true})
      senseCheck(enemies.find(e=>e.id===oculus.id).abilities.includes('trueSight'),'true sight restored')
      senseCheck(enemies.find(e=>e.id===ghost.id).abilities.includes('ethereal'),'ethereal restored')
      startReplayRecording()
      senseCheck(replayData.initialState.enemies.find(e=>e.id===oculus.id).abilities.includes('trueSight'),'replay true sight')
      senseCheck(replayData.initialState.enemies.find(e=>e.id===ghost.id).abilities.includes('ethereal'),'replay ethereal')
      replayRecording=false
    })()`))
  })

  it('replays invisible combat against Oculus deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      makeSenseEnemy('Oculus',41,40)
      makeSenseEnemy('Wolf',40,41)
      makeSenseEnemy('Ghost',50,50)
      player.invisibleTurns=10; rngState=917
      startReplayRecording()
      for(let i=0;i<3;i++) skipTurn()
      const state=()=>({hp:player.hp,invisible:player.invisibleTurns,turn:turnCount,enemies:buildSaveObject().enemies})
      const expected=JSON.parse(JSON.stringify(state())), recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true; activeReplay=recorded
      replayPlaying=true; replayRecording=false; replayRngIndex=0
      try {for(const action of recorded.actions) await runReplayAction(action)}
      finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      senseCheck(replayRngIndex===recorded.rng.length,'same RNG trace')
      senseCheck(JSON.stringify(state())===JSON.stringify(expected),'same invisible combat outcome')
    })()`))
  })

})
