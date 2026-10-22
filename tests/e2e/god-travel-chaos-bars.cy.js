describe('Hidden god travel and Chaos across prison bars', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Depth and Chaos Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
  })

  it('retains coordinates, time and RNG during hidden god-mode depth navigation', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,reason)=>{if(!ok)throw Error(reason)}
      replayRecording=false
      const position={x:player.x,y:player.y},time=turnCount,seed=rngState
      const startingMap=map
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown'}))
      check(currentZ===0,'PageDown has no effect without god mode')
      player.godMode=true
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown'}))
      check(currentZ===-1 && map===undergroundMap && currentCave===-1,'first depth is z:-1')
      check(player.x===position.x && player.y===position.y,'no coordinate search')
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown'}))
      check(currentZ===-2 && map===deepLevels[0].map,'second depth is z:-2')
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp'}))
      window.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp'}))
      check(currentZ===0 && map===startingMap,'PageUp returns to the surface')
      check(turnCount===time && rngState===seed,'navigation spends no turns or RNG')
      const data=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(data,{isReplayInit:true})
      check(currentZ===0 && player.x===position.x && player.y===position.y,'depth change remains save-safe')
    })()`))
  })

  it('records god-mode depth changes as deterministic replay actions', () => {
    cy.window().then(win => {
      cy.stub(win, 'confirm').returns(true)
      return win.eval(`(async () => {
        const check=(ok,reason)=>{if(!ok)throw Error(reason)}
        replayRecording=false
        startReplayRecording()
        const position={x:player.x,y:player.y},startTurn=turnCount,startRng=rngState
        useGodModeKey()
        check(useGodModeTravel(-1) && useGodModeTravel(-1) && useGodModeTravel(1),
          'all depth changes accepted')
        await Promise.resolve()
        const recording=JSON.parse(JSON.stringify(replayData))
        check(recording.actions.length===4 && recording.actions[0].type==='godMode' &&
          recording.actions.slice(1).every(a=>a.type==='godTravel') &&
          recording.actions.slice(1).map(a=>a.direction).join(',')==='-1,-1,1',
          'replay records all three directions after activating god mode')
        check(recording.rng.length===0,'travel and god mode use no gameplay RNG')
        const expectedZ=currentZ
        loadGameFromObject(recording.initialState,{isReplayInit:true})
        replayPlaying=true;replayRecording=false
        try {
          for(const action of recording.actions) await runReplayAction(action)
        } finally {replayPlaying=false}
        check(currentZ===expectedZ && map===undergroundMap && player.godMode,
          'replay arrives at the same level with god mode on')
        check(player.x===position.x && player.y===position.y &&
          turnCount===startTurn && rngState===startRng,
          'replay preserves coordinates, time and RNG')
      })()`)
    })
  })

  it('connects walkable regions through barred tiles but not solid walls', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,reason)=>{if(!ok)throw Error(reason)}
      const oldMap=map,oldX=player.x,oldY=player.y
      const x=34,y=34
      const cells=new Map()
      for(let yy=y-3;yy<=y+3;yy++)for(let xx=x-3;xx<=x+3;xx++){
        cells.set(keyXY(xx,yy),map[yy][xx]);map[yy][xx]='cavewall'
      }
      try {
        player.x=x-1;player.y=y
        map[y][x-1]='marble';map[y][x]='dwarvenprisonbars';map[y][x+1]='marble'
        let reachable=chaosReachable(player,new Map())
        check(reachable.has(keyXY(x+1,y)),'Chaos passes prison bars')
        map[y][x]='dwarvenprisondoorlocked'
        reachable=chaosReachable(player,new Map())
        check(reachable.has(keyXY(x+1,y)),'Chaos passes locked barred door')
        map[y][x]='dwarvenprisondoorclosed'
        reachable=chaosReachable(player,new Map())
        check(reachable.has(keyXY(x+1,y)),'Chaos passes closed barred door')
        for(const barrier of ['dwarvenprisonbars','dwarvenprisondoorlocked','dwarvenprisondoorclosed']){
          map[y][x]=barrier
          player.x=x-1;player.y=y
          applyChaosScroll({radius:0,destinationRadius:3})
          check(player.x===x+1 && player.y===y,'Chaos actually teleports across '+barrier)
        }
        player.x=x-1;player.y=y
        map[y][x]='cavewall'
        reachable=chaosReachable(player,new Map())
        check(!reachable.has(keyXY(x+1,y)),'solid walls block Chaos')
      } finally {
        for(const [position,tile] of cells){const [xx,yy]=position.split(',').map(Number);map[yy][xx]=tile}
        player.x=oldX;player.y=oldY;map=oldMap
      }
    })()`))
  })
})
