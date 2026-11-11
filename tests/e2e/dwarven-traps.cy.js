const {trapCornerChecks,trapFixture,trapRuleChecks,trapPersistenceChecks,trapGenerationChecks} = require('../support/dwarven-trap-checks')

describe('Dwarven Ruins reusable traps', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    // These tests replace the active Ruins floor immediately. Loading the
    // checked-in current-format save gives them a deterministic initialized
    // world without paying for an unrelated random world-generation pass in
    // every beforeEach. The seeded generation cases below still generate the
    // worlds they actually verify.
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__dwarvenTrapBootstrapSave = save
        win.eval(`loadGameFromObject(window.__dwarvenTrapBootstrapSave, {isReplayInit:true})`)
        delete win.__dwarvenTrapBootstrapSave
        win.eval(`raceOpen=false; document.getElementById('raceOverlay').classList.remove('show')`)
        win.eval(trapFixture.toString())
      })
    })
  })

  it('rejects corners and dead ends while preserving corridor bends and door routes', () => {
    cy.window().then(win => win.eval(`(${trapCornerChecks.toString()})()`))
  })

  it('resolves movement, blocking, safe paths, and uncredited deaths', () => {
    cy.window().then(win => win.eval(`(${trapRuleChecks.toString()})()`))
  })

  it('ignores numerical DEF without suppressing normal trap damage rolls', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const level=trapFixture()
      // Keep the player out of the arrow's path: otherwise the first hit
      // lands on the player, not on the DEF comparison target.
      player.x=10; player.y=14
      const originalRng=rng
      rng=()=>0.5
      try {
        const template={id:'def-test',name:'Enemy',baseName:'Enemy',alive:true,level:-4,
          x:11,y:12,spd:4,grace:4,tier:2,def:0,atk:1,hp:1000,maxHp:1000,
          abilities:[],equipment:{weapon:null,armor:null,shield:null},wander:false}
        const damage=(type,def)=>{
          const actor={...template,def}
          enemies=[actor]
          level.traps=[{id:'def',type,trigger:{x:11,y:12},emitter:{x:9,y:12},
            direction:{dx:1,dy:0},range:12}]
          DungeonTraps.onEntry(actor,10,12)
          return 1000-actor.hp
        }
        for (const type of ['spikes','projectile']) {
          const unarmored=damage(type,0), protectedTarget=damage(type,100)
          check(unarmored>0 && unarmored===protectedTarget,type+' must ignore numeric DEF')
        }
      } finally {rng=originalRng}
    })()`))
  })

  it('shows raised spikes only while a living creature occupies the trap', () => {
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, msg) => { if (!ok) throw Error(msg) }
      const level = trapFixture()
      level.traps = [{id:'spike', type:'spikes', trigger:{x:11,y:12}}]
      map[12][11] = 'dwarvenspikes'
      const idle = 'img/tiles/dwarven-floor-trap-0.png'
      const raised = 'img/tiles/dwarven-floor-trap-1.png'
      const config = RENDER_STYLE.terrainTiles.dwarvenspikes
      check(config.image === idle && config.activeImage === raised && !config.sourceRect,
        'spike art uses the two full-frame tile assets, not the old atlas')
      const visualImage = () => terrainVisual('dwarvenspikes', 11, 12).image
      const drawnImages = []
      const oldDraw = drawImageVisual
      const oldImages = USE_TILE_IMAGES
      const paint = () => {
        drawnImages.length = 0
        render()
        return drawnImages[drawnImages.length - 1]
      }
      drawImageVisual = (px, py, visual, alpha) => {
        if (visual?.image === idle || visual?.image === raised) drawnImages.push(visual.image)
        return oldDraw(px, py, visual, alpha)
      }
      try {
        USE_TILE_IMAGES = true
        check(visualImage() === idle && paint() === idle, 'empty trap is recessed')
        player.x = 11
        check(visualImage() === raised && paint() === raised, 'player raises the spikes')
        player.x = 10
        check(visualImage() === idle && paint() === idle, 'spikes retract when player leaves')

        const monster = {x:11,y:12,level:-4,levelKind:'chain',alive:true}
        enemies = [monster]
        check(visualImage() === raised, 'living monster also raises the spikes')
        monster.alive = false
        check(visualImage() === idle, 'dead monster does not hold spikes raised')
        monster.alive = true
        monster.level = -3
        check(visualImage() === idle, 'monster on another floor does not activate the image')
        enemies = []

        USE_TILE_IMAGES = false
        paint()
        check(drawnImages.length === 0 && TILE.dwarvenspikes.ch === '^',
          'ASCII mode retains the existing spike glyph instead of drawing either image')
        check(map[12][11] === 'dwarvenspikes' && level.traps.length === 1,
          'image changes do not mutate the mechanism or its terrain')
      } finally {
        drawImageVisual = oldDraw
        USE_TILE_IMAGES = oldImages
      }
      return true
    })()`))
  })

  it('hides wall arrow triggers as ordinary marble in tile and ASCII modes', () => {
    cy.window().then(win => win.eval(`(() => {
      trapFixture()
      const x = 12, y = 12
      map[y][x] = 'dwarvenpressureplate'
      const marble = terrainVisual('marble', x, y).image
      const hidden = terrainVisual('dwarvenpressureplate', x, y).image
      const check = (condition, label) => { if (!condition) throw Error(label) }
      check(hidden === marble, 'hidden plate matches the current marble variant')
      check(['img/tiles/marble-floor.png','img/tiles/marble-floor-cracked.png'].includes(hidden),
        'runtime tile has only ordinary floor art')
      check(TILE.dwarvenpressureplate.ch === TILE.marble.ch, 'base ASCII glyph matches marble')
      check(TILE_CODE.dwarvenpressureplate !== TILE_CODE.marble && CODE_TILE[TILE_CODE.dwarvenpressureplate] === 'dwarvenpressureplate', 'unique save/replay terrain code retained')
      check(map[y][x] === 'dwarvenpressureplate', 'gameplay terrain still identifies the trigger')
      check(DungeonTraps.isTrigger('dwarvenpressureplate'), 'auto-travel still recognizes the trigger')
      return true
    })()`))
  })

  it('keeps wandering monsters off trap triggers without preventing deliberate pursuit', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const oldChance=chance,oldRandInt=randInt
      chance=()=>true;randInt=(a,b)=>b
      const makeEnemy=(wander='roam',level=-4)=>({id:'wander-test',name:'Tough Grivel',
        baseName:'Grivel',x:20,y:12,level,levelKind:'chain',alive:true,aware:false,
        hp:100,maxHp:100,atk:4,def:2,spd:4,grace:2,tier:2,abilities:[],
        wander,homeX:18,homeY:12,homeRadius:1})
      try {
        for(const tile of ['dwarvenspikes','dwarvenpressureplate']) {
          const floor=trapFixture(),e=makeEnemy()
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
            if(dx||dy)map[e.y+dy][e.x+dx]='dwarvenwall'
          map[11][19]='marble';map[13][21]=tile
          floor.traps=[{id:'wandering',type:tile==='dwarvenspikes'?'spikes':'projectile',
            trigger:{x:21,y:13},emitter:{x:25,y:13},direction:{dx:-1,dy:0},range:12}]
          enemies=[e]
          check(enemyWander(e)&&e.x===19&&e.y===11&&e.hp===100,
            'roaming Grivel avoids '+tile+' instead of entering the trap')
          e.x=20;e.y=12;occupied.clear();occupied.add(keyXY(e.x,e.y))
          map[11][19]='dwarvenwall'
          check(!enemyWander(e)&&e.x===20&&e.y===12,
            'monster waits when its only exit is a trap')
          e.abilities=['fly']
          check(enemyWander(e)&&e.x===21&&e.y===13&&e.hp===100,
            'flying monsters may cross harmless floor triggers')
          if(tile==='dwarvenspikes') {
            e.abilities=[]
            const hp=e.hp
            DungeonTraps.onEntry(e,20,12)
            check(e.hp<hp,'a grounded monster entering during pursuit still takes spike damage')
          }
        }

        const floor=trapFixture(),returner=makeEnemy('homeReturn')
        map[12][19]='dwarvenspikes'
        floor.traps=[{id:'home-spike',type:'spikes',trigger:{x:19,y:12}}]
        enemies=[returner]
        check(enemyWander(returner) && !(returner.x===19&&returner.y===12) &&
          Math.max(Math.abs(returner.x-18),Math.abs(returner.y-12))===1,
          'homeReturn finds a safe detour around spikes')

        trapFixture()
        const adjacent=blankCaveMap(),offFloor=makeEnemy('roam',-5)
        for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
          adjacent[offFloor.y+dy][offFloor.x+dx]='dwarvenwall'
        adjacent[11][19]='marble';adjacent[13][21]='dwarvenspikes'
        deepLevels[3]={map:adjacent,kind:'dwarvenRuins',dungeonPackage:'dwarvenRuins',traps:[]}
        enemies=[offFloor]
        wanderAdjacentLevelEnemies()
        check(offFloor.x===19&&offFloor.y===11,
          'off-floor wandering reads its own terrain and avoids its own spike trap')
      } finally {chance=oldChance;randInt=oldRandInt}
    })()`))
  })

  it('restores mechanisms and replays both trap types with the same RNG tape', () => {
    cy.window().then(win => win.eval(`(${trapPersistenceChecks.toString()})()`))
  })

  for (const [seed,count,traits] of [[12345,3,[]],[24680,4,['hollow_world','grand_delving']],[67890,5,['grand_delving']]]) {
    it(`preserves safe routes and seeded generation across ${count} floors`, () => {
      cy.window().then({timeout:120000}, win => win.eval(`(${trapGenerationChecks.toString()})(${seed},${count},${JSON.stringify(traits)})`))
    })
  }
})
