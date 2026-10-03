function beginRareHuntGame(name = 'Rare Hunt Tester') {
  cy.viewport(1440, 900)
  cy.visit('/')
  cy.get('#raceOverlay .panelbox').should('be.visible')
  cy.window().then(win => win.eval('WORLD_SEED = 246813579; rngState = WORLD_SEED'))
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout: 60000}).should($overlay => {
    expect($overlay.text(), 'world generation status').not.to.include('failed')
    expect($overlay, 'world generation finished').not.to.be.visible
  })
  cy.window().should(win => expect(win.eval('worldGenerating')).to.equal(false))
}

describe('Old Hunter rare Tracking hunt and Echo-Blight Horn', () => {
  beforeEach(() => beginRareHuntGame())

  it('offers the post-Tracking hunt, spawns one qualifying quarry near an edge, and requires that exact beast', () => {
    cy.window().then(win => {
      const result = win.eval(`(() => {
        replayRecording = false; replayPlaying = false; replayAnimationsDisabled = true
        currentZ = 0; map = surfaceMap
        const hunter = npcs.find(n => n.name === 'Old Hunter')
        player.trackingLearned = true
        oldHunterQuest = {id:'hunter_40', type:'investigate_area', state:'completed'}
        oldHunterQuestSerial = 40
        const markerBefore = oldHunterHasNewDialogue()
        interactOldHunter()
        const q = oldHunterQuest
        const target = enemies.find(e => e.id === q.targetEnemyId)
        const tmpl = ENEMY_TEMPLATE_BY_NAME[target.baseName]
        const edgeDistance = Math.min(target.x, target.y, MAP_W - 1 - target.x, MAP_H - 1 - target.y)
        const village = villageCenter || spawnPoint
        const villageDistance = Math.max(Math.abs(target.x - village.x), Math.abs(target.y - village.y))
        const reachable = hunterReachableSurfaceTiles()
        const preferredSites = hunterRareSpawnSites(tmpl, reachable)
        const minPreferredEdge = Math.min(...preferredSites.map(site => site.edgeDistance))
        const decoy = addEnemy({id:'rare-decoy', name:target.baseName, baseName:target.baseName,
          tier:target.tier, level:0, hp:1, maxHp:1, atk:1, def:0, spd:1, aggro:0,
          fly:false, humanoid:false, evades:false, x:hunter.x+5, y:hunter.y+5,
          homeX:hunter.x+5, homeY:hunter.y+5, homeTileType:'grass', alive:true,
          wander:'far', prefix:null, equipment:null})
        occupied.add(keyXY(decoy.x, decoy.y))
        killEnemy(decoy)
        const readyAfterDecoy = oldHunterQuest.state
        target.hp = 1
        killEnemy(target)
        const readyAfterTarget = oldHunterQuest.state
        const markerReady = oldHunterHasNewDialogue()
        const beforeReward = player.totalXpEarned
        const expectedReward = Math.round(400 * xpMultiplier())
        interactOldHunter()
        const horn = player.inventory.find(it => it.kind === 'echoBlightHorn')
        return {
          markerBefore,
          type:q.type,
          qualifies: tmpl.wander === 'far' && tmpl.humanoid === false && Number(tmpl.rarity ?? 1) <= 0.1,
          targetName:target.baseName,
          targetMatches:q.targetName === target.baseName,
          initialDirectionFrozen: hunterDirection(q) === TRACK_DIRECTIONS[q.targetDirection],
          edgeDistance, minPreferredEdge, villageDistance,
          minimumDesiredDistance: Math.max(20, Math.floor(Math.min(MAP_W, MAP_H) * 0.35)),
          spawnInPreferredPool: preferredSites.some(site => site.x === q.spawnX && site.y === q.spawnY),
          readyAfterDecoy, readyAfterTarget, markerReady,
          reward:player.totalXpEarned - beforeReward, expectedReward,
          completed:oldHunterQuest.state,
          markerAfter:oldHunterHasNewDialogue(),
          horn: horn && {name:horn.name, kind:horn.kind},
          hornDefinition:itemDefinition('echoBlightHorn')
        }
      })()`)
      expect(result.markerBefore, 'Hunter ! before receiving rare hunt').to.equal(true)
      expect(result.type).to.equal('rare_hunt')
      expect(result.qualifies).to.equal(true)
      expect(result.targetMatches).to.equal(true)
      expect(result.initialDirectionFrozen).to.equal(true)
      expect(result.spawnInPreferredPool).to.equal(true)
      expect(result.edgeDistance, 'quarry uses closest available edge band').to.be.at.most(result.minPreferredEdge + 3)
      expect(result.villageDistance, 'quarry is deliberately far from village').to.be.at.least(result.minimumDesiredDistance)
      expect(result.readyAfterDecoy, 'same-species decoy must not complete hunt').to.equal('active')
      expect(result.readyAfterTarget).to.equal('ready')
      expect(result.markerReady, 'Hunter ! when quest can be delivered').to.equal(true)
      expect(result.reward).to.equal(result.expectedReward)
      expect(result.completed).to.equal('completed')
      expect(result.markerAfter, 'no ! after rare hunt is fully completed').to.equal(false)
      expect(result.horn).to.deep.equal({name:'Echo-Blight Horn', kind:'echoBlightHorn'})
      expect(result.hornDefinition.actions).to.deep.equal([{label:'Use', handler:'echoBlightHorn'}])
      expect(result.hornDefinition.icon).to.equal('img/icons/echo-blight-horn.svg')
    })
  })

  it('sounds the 3 closest distinct beast directions, enforces XP-gated reuse, persists cooldown, and replays deterministically', () => {
    cy.window().then(win => win.eval(`(async () => {
      replayRecording = false; replayPlaying = false; replayAnimationsDisabled = false
      currentZ = 0; map = surfaceMap
      player.x = spawnPoint.x; player.y = spawnPoint.y
      player.freezing = {active:false, turns:0}; player.curseDebuffs = []
      player.inventory = [createItem('echoBlightHorn')]
      const mk = (id,x,y,humanoid=false,level=0) => ({id,name:id,baseName:id,tier:1,level,alive:true,
        hp:10,maxHp:10,atk:1,def:0,spd:1,aggro:0,fly:false,humanoid,evades:false,
        x,y,homeX:x,homeY:y,homeTileType:'grass',wander:false,prefix:null,equipment:null})
      enemies = [
        mk('east-near', player.x+5, player.y),
        mk('east-far', player.x+20, player.y),
        mk('northwest-beast', player.x-10, player.y-10),
        mk('southwest-beast', player.x-15, player.y+15),
        mk('south-beast', player.x, player.y+25),
        mk('south-humanoid', player.x, player.y+3, true),
        mk('outside-beast', player.x+81, player.y),
        mk('underground-beast', player.x+2, player.y, false, -1)
      ]
      occupied = new Set(enemies.filter(e=>e.level===0).map(e=>keyXY(e.x,e.y)))
      const beforeTurn = turnCount
      useEchoBlightHorn(0)
      const first = {
        turn:turnCount,
        lastUse:player.inventory[0].lastUseTotalXp,
        soundQueued:soundAnims.length > 0,
        log:document.getElementById('logpanel').textContent
      }
      const afterFirstTurn = turnCount
      useEchoBlightHorn(0)
      const blockedTurn = turnCount
      gainXp(1)
      useEchoBlightHorn(0)
      const afterXpTurn = turnCount
      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      const savedLastUse = save.player.inventory.find(it=>it.kind==='echoBlightHorn').lastUseTotalXp
      loadGameFromObject(save)
      const loadedHorn = player.inventory.find(it=>it.kind==='echoBlightHorn')
      const loadedLastUse = loadedHorn.lastUseTotalXp
      const beforeBlockedAfterLoad = turnCount
      useEchoBlightHorn(player.inventory.indexOf(loadedHorn))
      const blockedAfterLoad = turnCount

      // A minimal replay fixture verifies the mutable horn cooldown is restored
      // from initialState and changed by the recorded use action itself. Keep one
      // real NPC so loading the snapshot does not invoke legacy NPC generation.
      enemies=[]
      const npcX=Math.min(MAP_W-2,spawnPoint.x+3), npcY=spawnPoint.y
      npcs=[{name:'Merchant',x:npcX,y:npcY,homeX:npcX,homeY:npcY,talkFreezeTurns:0}]
      occupied=new Set([keyXY(npcX,npcY)]); oldHunterQuest=null
      player.inventory=[createItem('echoBlightHorn')]
      player.totalXpEarned=123; player.xp=10; player.freezing={active:false,turns:0}; player.curseDebuffs=[]
      replayAnimationsDisabled=true; startReplayRecording()
      useEchoBlightHorn(0)
      const recorded=JSON.parse(JSON.stringify(replayData))
      const expected={lastUse:player.inventory[0].lastUseTotalXp,turn:turnCount}
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true; replaySimulationMode=true; activeReplay=recorded
      replayPlaying=true; replayRecording=false; replayRngIndex=0
      try {
        for (const action of recorded.actions) await runReplayAction(action)
      } finally {
        replayPlaying=false; replaySimulationMode=false; activeReplay=null
      }
      const replayed={lastUse:player.inventory[0].lastUseTotalXp,turn:turnCount}
      return {beforeTurn,first,afterFirstTurn,blockedTurn,afterXpTurn,savedLastUse,loadedLastUse,
        beforeBlockedAfterLoad,blockedAfterLoad,expected,replayed}
    })()`)).then(result => {
      expect(result.first.turn).to.equal(result.beforeTurn + 1)
      expect(result.first.soundQueued, 'horn creates immediate visual sound effect').to.equal(true)
      expect(result.first.log).to.include('You hear something answering from east.')
      expect(result.first.log).to.include('You hear something answering from northwest.')
      expect(result.first.log).to.include('You hear something answering from southwest.')
      expect(result.first.log).not.to.include('You hear something answering from south.')
      expect((result.first.log.match(/You hear something answering from east\./g) || []).length,
        'same direction is reported only once').to.equal(1)
      expect((result.first.log.match(/You hear something answering from /g) || []).length,
        'horn reports at most 3 distinct directions').to.equal(3)
      expect(result.first.log).not.to.include('south-humanoid')
      expect(result.blockedTurn, 'reuse without new XP costs no turn').to.equal(result.afterFirstTurn)
      expect(result.afterXpTurn, 'new earned XP unlocks horn again').to.equal(result.afterFirstTurn + 1)
      expect(result.savedLastUse).to.equal(result.loadedLastUse)
      expect(result.blockedAfterLoad, 'cooldown survives save/load').to.equal(result.beforeBlockedAfterLoad)
      expect(result.replayed).to.deep.equal(result.expected)
    })
  })

  for (const width of [1440, 390]) {
    it(`shows the horn icon and Use action in inventory at ${width}px`, () => {
      cy.viewport(width, 900)
      cy.window().then(win => win.eval(`player.inventory=[createItem('echoBlightHorn')]; invTab='all'; toggleInv(true)`))
      cy.get('#invList .invitem').contains('Echo-Blight Horn').parent().as('hornRow')
      cy.get('@hornRow').find('button').should('have.text', 'Use')
      cy.get('@hornRow').find('img').should('have.attr', 'src').and('include', 'echo-blight-horn.svg')
      cy.get('#invList').should($list => {
        expect($list[0].scrollWidth, 'horn row needs no horizontal scrolling').to.be.at.most($list[0].clientWidth)
      })
    })
  }
})
