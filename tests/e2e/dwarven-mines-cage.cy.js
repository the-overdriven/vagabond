describe('Dwarven Mines haulage cage', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Mine Cage Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class','show')
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
  })

  it('connects z:-9 to the last mine, unlocks below and survives replay in tile and ASCII modes', () => {
    cy.viewport(1280,800)
    cy.window().then(win => win.eval(`(async()=>{
      const check=(ok,message)=>{if(!ok)throw Error(message)}
      replayRecording=false;replayPlaying=false;replayData=null;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap
      applyWorldTraits([])
      WORLD_GEN_CONFIG.dungeons.dwarvenRuins.levelCountRange=[5,5]
      WORLD_SEED=554433;rngState=WORLD_SEED
      await generateNewWorld()

      const mine=dungeonPackageLevels('dwarvenMines')
      const cage=dwarvenMinesCageShortcut()
      check(cage && cage.upper.z===-9 && cage.lower.z===mine.at(-1).z,'fixed upper and generated lower endpoints')
      check(dungeonPackageLevels('dwarvenRuins').at(-1).z===-8,'five Ruins floors transition directly into z:-9')
      check(!cage.unlocked && mine.length>=3 && mine.length<=4,'cage starts locked')
      check(mine[0].level.map[cage.upper.y][cage.upper.x]==='minecageupperoff','top sprite is locked')
      check(mine.at(-1).level.map[cage.lower.y][cage.lower.x]==='minecageloweroff','bottom sprite is locked')
      check(cage.upper.x===cage.lower.x && cage.upper.y===cage.lower.y,
        'shaft stays at same map coordinates through the mine')
      for(let i=0;i<mine.length;i++){
        const level=mine[i].level,p=level.mineCagePad
        check(p.x===cage.upper.x && p.y===cage.upper.y,'every floor shares the shaft position')
        check(level.map[p.y][p.x]===
          (i===0?'minecageupperoff':i===mine.length-1?'minecageloweroff':'mineshaftrope'),
          'only endpoints contain a cage')
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
          if(dx||dy)check(TILE[level.map[p.y+dy][p.x+dx]].walk,
            'shaft is surrounded by walkable landing space')
        check(dungeonWalkDistances(level.map,level.mineUpstairs).has(keyXY(p.x+1,p.y)),
          'each landing is connected to the main mine passages')
      }
      check(!TILE.mineshaftrope.walk && !!RENDER_STYLE.terrainTiles.mineshaftrope.image,
        'intermediate shaft cannot be crossed but has tile artwork')

      enemies=[];npcs=[];occupied=new Set();player.hp=playerMaxHp()
      const placeAt=p=>{
        currentZ=p.z;currentCave=-1
        const layer=deepLevels[chainDepthForZ(p.z)-2]
        map=layer.map;undergroundDiscovered=layer.discovered
        player.x=p.x;player.y=p.y
        snapCameraToPlayer();render()
      }
      placeAt(cage.upper)
      const turnBefore=turnCount
      inspect()
      check(turnCount===turnBefore&&!cage.unlocked,'locked top cannot travel or unlock')

      placeAt(cage.lower)
      turnCount=0
      startReplayRecording()
      inspect()
      check(cage.unlocked && turnCount===1 && currentZ===cage.lower.z,'bottom unlock costs one turn without travel')
      check(map[player.y][player.x]==='minecageloweron','unlocked lower tile changes')
      check(depthUndergroundMap(9)[cage.upper.y][cage.upper.x]==='minecageupperon','unlocked upper tile changes')
      check(RENDER_STYLE.terrainTiles.minecageupperon.image==='img/tiles/haulage-cage-upper.png' &&
        RENDER_STYLE.terrainTiles.minecageloweron.image==='img/tiles/haulage-cage-lower.png',
        'unlocked positions show different supplied graphics')

      const recorded=JSON.parse(JSON.stringify(replayData))
      check(recorded.actions.length===1 && recorded.actions[0].type==='inspect',
        'unlock is recorded as a single inspect action')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      check(dwarvenMinesCageShortcut().unlocked && map[player.y][player.x]==='minecageloweron',
        'current save restores shared unlocked flag and endpoint art')
      check(dungeonPackageLevels('dwarvenMines').slice(1,-1).every(({level})=>
        level.map[cage.upper.y][cage.upper.x]==='mineshaftrope'),
        'rope shaft tiles remain aligned after restoring the saved world')
      const beforeTravel=turnCount
      inspect()
      check(currentZ===-9 && turnCount===beforeTravel,'lower cage skips all intermediate mine floors')
      inspect()
      check(currentZ===cage.lower.z,'upper cage returns directly to final floor')

      // Rendering is pure: switching the same unlocked endpoint into ASCII
      // and back must not change the RNG stream or gameplay state.
      const rngBefore=rngState
      USE_TILE_IMAGES=false;render()
      check(TILE.minecageloweron.ch==='⇑','ASCII shows the upward trip')
      USE_TILE_IMAGES=true;render()
      check(rngState===rngBefore,'tile and ASCII drawing are RNG-free')

      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true
      activeReplay=recorded;replayPlaying=true;replayRecording=false;replayRngIndex=0
      try{
        for(const action of recorded.actions)await runReplayAction(action)
        check(dwarvenMinesCageShortcut().unlocked && turnCount===1,
          'replay unlocks the same shared state in exactly one turn')
        check(replayRngIndex===recorded.rng.length,'replay matches recorded gameplay RNG')
      }finally{
        replayPlaying=false;replaySimulationMode=false;activeReplay=null
      }
    })()`))
    cy.viewport(390,844)
    cy.window().then(win => win.eval('render();updateHud();true'))
  })
})
