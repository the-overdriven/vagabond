describe('Tracking and beast evidence', () => {
  beforeEach(() => {
    cy.viewport(1440, 900)
    cy.visit('/')
    cy.get('#raceOverlay .panelbox').should('be.visible')
    // Tracking uses its own scenario below; keep startup independent of the clock.
    cy.window().then(win => win.eval('WORLD_SEED = 123456789; rngState = WORLD_SEED'))
    cy.get('#raceName').clear().type('Tracking Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should($overlay => {
      expect($overlay.text(), 'startup status for seed 123456789').not.to.include('failed')
      expect($overlay, 'world generation finished').not.to.be.visible
    })
    cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      replayAnimationsDisabled = true
      replayRecording = false; replayPlaying = false
      currentZ = 0; map = surfaceMap; raceOpen = false
      deathTransition = null; cameraAnimating = false; attackAnim = null
      mapOpen = false; invOpen = false; tradeOpen = false
      for (let y = 20; y <= 70; y++) for (let x = 20; x <= 70; x++) {
        map[y][x] = 'grass'; discovered[y][x] = true
      }
      spawnPoint = {x: 120, y: 120}
      player.x = 25; player.y = 25; player.hp = 50; player.maxHp = 50
      player.godMode = false; player.invisibleTurns = 0; player.permadeath = false
      player.trackingLearned = false; player.killsBySpecies = {}; player.kills = 0
      player.freezing = {active: false, turns: 0}; player.curseDebuffs = []
      beastTracks.clear(); enemies = []; npcs = []; groundItems = []; occupied = new Set()
      oldHunterQuest = null; turnCount = 17; consecutiveWaitTurns = 0
      window.trackAssert = (condition, message) => { if (!condition) throw new Error(message) }
      window.trackEnemy = (extra = {}) => ({id: 'track-test', name: 'Wolf', baseName: 'Wolf',
        x: 40, y: 40, level: 0, alive: true, wander: 'far', abilities: [], humanoid: false,
        hp: 20, maxHp: 20, atk: 1, def: 0, spd: 1, tier: 1, aggro: 1,
        farTargetX: 40, farTargetY: 25, ...extra})
    })()`))
  })

  it('quantizes all eight directions and preserves destination bearings during detours', () => {
    cy.window().then(win => win.eval(`(() => {
      const vectors = [[0,-9],[9,-9],[9,0],[9,9],[0,9],[-9,9],[-9,0],[-9,-9]]
      vectors.forEach(([x,y], i) => trackAssert(trackDirection(x,y) === i, 'direction '+i))
      trackAssert(trackDirection(1,-9) === 0 && trackDirection(9,-1) === 2, 'nearest octant')
      const original = rng
      try {
        const e = trackEnemy({farPath:[{x:41,y:40},{x:41,y:39}]})
        enemies = [e]; occupied = new Set([keyXY(40,40)])
        let values = [.9, 0]; rng = () => { trackAssert(values.length > 0, 'unexpected RNG'); return values.shift() }
        trackAssert(enemyFarWander(e), 'destination movement')
        trackAssert(e.x === 41 && e.y === 40, 'east detour')
        trackAssert(beastTrackAt(40,40).direction === 0, 'track must point north')
        trackAssert(values.length === 0, 'exactly one track roll')
        beastTracks.clear(); e.x = 40; e.y = 40; occupied = new Set([keyXY(40,40)])
        values = [.5, 0, 0]
        trackAssert(enemyFarWander(e) && beastTracks.size === 1, 'random branch leaves tracks')
        trackAssert(beastTrackAt(40,40).direction === 0 && values.length === 0, 'random detour bearing/RNG')
        values = [.1]; beastTracks.clear()
        trackAssert(!enemyFarWander(e) && !beastTracks.size && !values.length, 'waiting makes no track roll')
        for (const [dx,dy] of DIRS8) map[e.y+dy][e.x+dx] = 'mountain'
        values = [.5]
        trackAssert(!enemyFarWander(e) && !beastTracks.size && !values.length, 'blocked move makes no roll')
      } finally { rng = original }
    })()`))
  })

  it('excludes other wander modes, humanoids, flyers, invalid targets and non-steps', () => {
    cy.window().then(win => win.eval(`(() => {
      const original = rng; let calls = 0
      try {
        rng = () => { calls++; return 0 }
        for (const extra of [{humanoid:true},{abilities:['fly']},{wander:'roam'},{wander:'homeReturn'},
          {wander:'homeReanchored'},{wander:false},{farTargetX:null},{farTargetX:9999}]) {
          leaveBeastTrack(trackEnemy({x:41,...extra}),40,40)
        }
        leaveBeastTrack(trackEnemy(),40,40)
        leaveBeastTrack(trackEnemy({x:43}),40,40)
        trackAssert(calls === 0 && beastTracks.size === 0, 'ineligible movement consumes no RNG')
        leaveBeastTrack(trackEnemy({x:41}),40,40)
        trackAssert(calls === 1 && beastTracks.size === 1, 'eligible roll')
        leaveBeastTrack(trackEnemy({x:41,farTargetY:60}),40,40)
        trackAssert(beastTracks.size === 1 && beastTrackAt(40,40).direction === 4, 'replace same tile')
        rng = () => .03; beastTracks.clear(); leaveBeastTrack(trackEnemy({x:41}),40,40)
        trackAssert(beastTracks.size === 0, '3 percent boundary excluded')
      } finally { rng = original }
    })()`))
  })

  it('keeps hover generic and reveals freshness/species only to a trained tracker', () => {
    cy.window().then(win => win.eval(`(() => {
      const t = {x:40,y:40,direction:1,species:'Wolf',age:0}
      beastTracks.set(keyXY(40,40),t)
      trackAssert(tileInspectInfo(40,40).html.includes('foot tracks?'), 'generic hover')
      trackAssert(inspectBeastTrack(t) === 'You notice something that looks like foot tracks, but cannot make sense of them.', 'untrained')
      player.trackingLearned = true
      const original = rng
      try {
        rng = () => { throw new Error('inspection consumed RNG') }
        trackAssert(inspectBeastTrack(t) === "Fresh tracks lead northeast. You've never seen paw prints like these before.", 'unknown species')
        player.killsBySpecies.Wolf = 1
        for (const [age,start] of [[0,'Fresh'],[49,'Fresh'],[50,'The'],[149,'The'],[150,'Fading'],[199,'Fading']]) {
          t.age = age; trackAssert(inspectBeastTrack(t) === start+' wolf tracks lead northeast.', 'freshness '+age)
        }
        trackAssert(tileInspectInfo(40,40).html.includes('foot tracks?'), 'trained hover still generic')
        groundItems.push({kind:'campfire',x:40,y:40,level:0})
        trackAssert(tileInspectInfo(40,40).html.includes('campfire'), 'ground object priority')
        groundItems = []; discovered[40][40] = false
        trackAssert(tileInspectInfo(40,40) === null, 'undiscovered track hidden')
      } finally { rng = original }
    })()`))
  })

  it('counts base species once and grants the Hunter lesson once', () => {
    cy.window().then(win => win.eval(`(() => {
      const e = trackEnemy({name:'Tough Wolf',prefix:'tough'})
      enemies = [e]; killEnemy(e); killEnemy(e)
      trackAssert(player.kills === 1 && player.killsBySpecies.Wolf === 1 && !player.killsBySpecies['Tough Wolf'], 'base-species counter')
      oldHunterQuest = {id:'hunter_9',type:'investigate',state:'ready'}
      const before = player.totalXpEarned
      interactOldHunter(); const rewarded = player.totalXpEarned
      trackAssert(player.trackingLearned && oldHunterQuest.state === 'completed', 'lesson completion')
      trackAssert(oldHunterHasNewDialogue(), 'rare hunt offer marker after Tracking lesson')
      interactOldHunter()
      trackAssert(oldHunterQuest.type === 'rare_hunt' && oldHunterQuest.state === 'active', 'post-Tracking rare hunt starts')
      trackAssert(rewarded > before && player.totalXpEarned === rewarded, 'single existing reward')
      player.permadeath = false; die()
      trackAssert(player.trackingLearned && player.killsBySpecies.Wolf === 1, 'normal death preserves knowledge')
      player.permadeath = true; die()
      trackAssert(!player.trackingLearned && !Object.keys(player.killsBySpecies).length && oldHunterQuest === null, 'permadeath resets progression')
    })()`))
  })

  it('preserves tracks, counters and lesson across save/load and expires tracks on turn 200', () => {
    cy.window().then(win => win.eval(`(() => {
      beastTracks.set(keyXY(40,40), {x:40,y:40,direction:7,species:'Wolf',age:149})
      oldHunterQuest = {id:'hunter_12',type:'investigate',state:'ready'}; oldHunterQuestSerial = 12
      const before = JSON.parse(JSON.stringify(buildSaveObject()))
      interactOldHunter(); player.killsBySpecies.Wolf = 3
      const after = JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(before)
      trackAssert(!player.trackingLearned && oldHunterQuest.state === 'ready', 'before turn-in')
      interactOldHunter()
      loadGameFromObject(after)
      trackAssert(player.trackingLearned && player.killsBySpecies.Wolf === 3 && oldHunterQuestSerial === 12 && turnCount === 17, 'saved progression and counters')
      trackAssert(JSON.stringify([...beastTracks.values()]) === JSON.stringify(after.beastTracks), 'saved evidence')
      const xp = player.totalXpEarned; interactOldHunter()
      trackAssert(player.totalXpEarned === xp, 'load cannot repeat first quest reward')
      trackAssert(oldHunterQuest.type === 'rare_hunt' && oldHunterQuest.state === 'active', 'loaded completed quest exposes rare hunt')
      currentZ = -1
      for (let i=0;i<50;i++) ageBeastTracks()
      trackAssert([...beastTracks.values()][0].age === 199, 'age while underground')
      ageBeastTracks(); trackAssert(beastTracks.size === 0, 'expires at 200')
      currentZ = 0
    })()`))
  })

  it('replays real far wandering, tracks, inspection and the Hunter reward without RNG drift', () => {
    cy.window().then(win => win.eval(`(async () => {
      // Fixed seed and several travelers provide reliable track rolls without changing the 3% rule.
      enemies = Array.from({length:12}, (_,i) => trackEnemy({id:'tracking-'+i,x:40+i,y:40+i,
        farTargetX:40+i,farTargetY:25,farPath:null}))
      enemies.push(trackEnemy({id:'tracking-combat',x:26,y:25,hp:1,maxHp:1,spd:0,wander:false}))
      player.baseAtk = 100; player.baseSpd = 100
      occupied = new Set(enemies.map(e=>keyXY(e.x,e.y)))
      oldHunterQuest = {id:'hunter_20',type:'investigate',state:'ready'}; oldHunterQuestSerial=20
      rngState = 8128; startReplayRecording()
      interactOldHunter()
      for(let i=0;i<5 && enemies.some(e=>e.id === 'tracking-combat');i++) await tryMove(1,0)
      trackAssert(player.killsBySpecies.Wolf === 1, 'recorded combat learns species')
      for(let i=0;i<5;i++) skipTurn()
      loadGameFromObject(JSON.parse(JSON.stringify(buildSaveObject())))
      for(let i=0;i<5;i++) skipTurn()
      inspect()
      const recorded = JSON.parse(JSON.stringify(replayData))
      const expected = JSON.stringify({tracks:[...beastTracks.values()], learned:player.trackingLearned,
        kills:player.killsBySpecies,turn:turnCount,enemies:enemies.map(e=>[e.x,e.y,e.farTargetX,e.farTargetY])})
      trackAssert(beastTracks.size > 0, 'fixture must create tracks')
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true
      activeReplay=recorded; replayPlaying=true; replayRecording=false; replayRngIndex=0
      try {
        for (const action of recorded.actions) {
          trackAssert(replayRngIndex === action._rngStart, 'action RNG boundary')
          await runReplayAction(action)
        }
        trackAssert(replayRngIndex === recorded.rng.length, 'all recorded RNG consumed')
        trackAssert(JSON.stringify({tracks:[...beastTracks.values()], learned:player.trackingLearned,
          kills:player.killsBySpecies,turn:turnCount,enemies:enemies.map(e=>[e.x,e.y,e.farTargetX,e.farTargetY])}) === expected, 'identical replay state')
      } finally { replayPlaying=false; replaySimulationMode=false; activeReplay=null }
    })()`))
  })
  it('rotates tile tracks clockwise and keeps all eight ASCII bearings without consuming RNG', () => {
    cy.window().then(win => win.eval(`(() => {
      const originalRng = rng, originalDraw = drawImageVisual, originalRotate = ctx.rotate, originalFill = ctx.fillText
      const angles = [], glyphs = []
      const oldCamX = camX, oldCamY = camY
      try {
        camX = 35; camY = 35
        rng = () => { throw new Error('render consumed RNG') }
        drawImageVisual = () => true
        ctx.rotate = angle => angles.push(angle)
        for (let direction=0;direction<8;direction++) {
          beastTracks.set(keyXY(40,40), {x:40,y:40,direction,species:'Wolf',age:0})
          drawBeastTracks()
        }
        angles.forEach((a,i)=>trackAssert(a === i*Math.PI/4, 'rotation '+i))
        trackAssert(angles.length === 8 && angles[0] === 0 && angles[4] === Math.PI, 'north up / south down')
        drawImageVisual = () => false
        ctx.fillText = text => glyphs.push(text)
        for (let direction=0;direction<8;direction++) {
          beastTracks.get(keyXY(40,40)).direction = direction; drawBeastTracks()
        }
        trackAssert(glyphs.join('') === '↑↗→↘↓↙←↖', 'ASCII bearings')
        discovered[40][40] = false; drawBeastTracks()
        trackAssert(glyphs.length === 8, 'hidden tracks do not render')
      } finally {
        rng=originalRng; drawImageVisual=originalDraw; ctx.rotate=originalRotate; ctx.fillText=originalFill
        camX=oldCamX; camY=oldCamY
      }
    })()`))
  })

})
