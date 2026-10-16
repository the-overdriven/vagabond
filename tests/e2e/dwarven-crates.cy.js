describe('Dwarven crate destruction, loot and persistence', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => {
      cy.window().then(win => {
        win.__crateSave = save
        win.eval(`loadGameFromObject(window.__crateSave,{isReplayInit:true});delete window.__crateSave;
          raceOpen=false;mapOpen=false;invOpen=false;tradeOpen=false;deathTransition=null;
          replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;replaySimulationMode=false;
          currentZ=chainZForDepth(4);currentCave=-1;
          var crateLevel=deepLevels[2];map=crateLevel.map;undergroundDiscovered=crateLevel.discovered;
          player.x=100;player.y=100;player.hp=1000;player.maxHp=1000;
          player.baseAtk=1;player.baseSpd=3;player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3};
          player.invisibleTurns=0;player.poisonTurns=0;player.berryRegenTurns=0;player.curseDebuffs=[];
          enemies=[];npcs=[];occupied=new Set();groundItems=[];
          for(let y=96;y<105;y++)for(let x=97;x<107;x++)map[y][x]='marble';
          map[100][101]='dwarvencrate';crateLevel.crates=[{x:101,y:100,hp:8,lootKind:null}];
          turnCount=0;consecutiveWaitTurns=0;`)
      })
    })
  })
  it('uses configured damage, blocks fists, and preserves partial damage plus empty destruction', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const level=deepLevels[2], damage=Math.max(1,playerAtk())
      check(WORLD_GEN_CONFIG.dungeons.dwarvenRuins.crates.hp===8,'HP sourced from JSON')
      check(!isWalkable(101,100) && TILE.dwarvencrate.projectileBlock,'intact crate blocks movement and shots')
      const turn=turnCount
      player.equip.weapon=null
      await tryMove(1,0)
      check(turnCount===turn && level.crates[0].hp===8,'fists cannot break crate or spend turn')
      player.equip.weapon={kind:'weapon',name:'Test Pick',atk:1,grace:3}
      await tryMove(1,0)
      check(level.crates[0].hp===8-damage && turnCount===turn+1,'weapon applies fixed ATK damage once')
      const saved=JSON.parse(JSON.stringify(buildSaveObject())), rng=rngState
      loadGameFromObject(saved,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(deepLevels[2].crates[0].hp===8-damage && rngState===rng,'partial crate HP survives save/load')
      for(let i=0;i<8&&map[100][101]==='dwarvencrate';i++)await tryMove(1,0)
      check(map[100][101]==='marble' && isWalkable(101,100),'empty crate becomes walkable marble')
      check(!groundItems.some(g=>g.x===101&&g.y===100),'empty crate drops nothing')
      const emptySave=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(emptySave,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(map[100][101]==='marble'&&!deepLevels[2].crates.some(c=>c.x===101&&c.y===100),
        'destroyed crate never respawns')
    })()`))
  })
  it('uses pre-rolled loot and replays breaking and picking up a full crate exactly', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      deepLevels[2].crates[0].lootKind='potion'
      deepLevels[2].crates[0].hp=1
      const originalRng=rngState
      startReplayRecording()
      await tryMove(1,0)
      check(map[100][101]==='marble','crate was smashed')
      check(groundItems.filter(g=>g.x===101&&g.y===100&&g.kind==='potion').length===1,
        'pre-rolled potion drops exactly once')
      const dropped=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(dropped,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(groundItems.filter(g=>g.x===101&&g.y===100&&g.kind==='potion').length===1,
        'potion stays on ground after loading')
      const actions=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(actions.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=actions;replayPlaying=true;
      replayRecording=false;replayRngIndex=0
      try {
        for(const action of actions.actions)await runReplayAction(action)
        check(map[100][101]==='marble' && groundItems.some(g=>g.x===101&&g.y===100&&g.kind==='potion'),
          'replay recreates the same crate destruction and potion')
        check(replayRngIndex===actions.rng.length,'crate playback consumes identical RNG')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      await tryMove(1,0)
      check(player.x===101 && !groundItems.some(g=>g.x===101&&g.y===100), 'loot is picked up normally')
      check(player.inventory.some(i=>i.kind==='potion'),'loot goes into inventory')
    })()`))
  })
  it('respects scroll loot and persists lock inspection without an attack turn', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      deepLevels[2].crates[0].lootKind='scrollOfInvisibility'
      deepLevels[2].crates[0].hp=1
      await tryMove(1,0)
      check(groundItems.some(g=>g.kind==='scrollOfInvisibility'&&g.x===101),'scroll loot drops')
      map[100][101]='dwarvendoorlocked'
      groundItems=[]
      const originalTurn=turnCount
      await tryMove(1,0)
      check(turnCount===originalTurn && map[100][101]==='dwarvendoorlocked','first door bump warns without a turn')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      const id=dungeonLockIdAt(101,100)
      check(inspectedDungeonLocks.has(id),'inspected lock stored')
      loadGameFromObject(saved,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(inspectedDungeonLocks.has(id),'inspected lock restored')
      player.baseAtk=100
      await tryMove(1,0)
      check(map[100][101]==='dwarvendoorbreached' && turnCount===originalTurn+1,
        'second bump breaches with lunge and spends one turn')
    })()`))
  })
  for (const tileGraphics of [true, false]) {
    it(`finishes the player lunge before the crate death effect in ${tileGraphics ? 'tile' : 'ASCII'} mode`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg)}
        replayAnimationsDisabled=false;replaySimulationMode=false;USE_TILE_IMAGES=${tileGraphics};
        deepLevels[2].crates[0].hp=1
        deepLevels[2].crates[0].lootKind='potion'
        const rngBefore=rngState
        await tryMove(1,0)
        const effect=fxAnims.find(p=>p.tileKey==='dwarvencrate'&&p.x===101&&p.y===100)
        check(map[100][101]==='marble','gameplay resolves before animation')
        check(groundItems.filter(g=>g.kind==='potion'&&g.x===101).length===1,
          'loot generated immediately and only once')
        check(effect&&attackAnim,'crate effect queued during player lunge')
        check(effect.start===attackAnim.start+attackAnim.duration,
          'crate holds until attack animation finishes')
        check(effect.duration===FX_ANIM_MS&&effect.dir===1,
          'crate uses monster sinking/fading effect')
        check(effect.level===currentZ,'death effect belongs to current floor')
        check(rngState===rngBefore,'visual timing does not roll RNG')
        check(!Object.hasOwn(buildSaveObject(),'fxAnims'),
          'save does not contain transient effects')
        render(effect.start-1)
        check(fxAnims.includes(effect),'crate remains rendered while lunge runs')
      })()`))
      cy.wait(700)
      cy.window().then(win => win.eval(`(() => {
        render(performance.now())
        if (fxAnims.some(p=>p.tileKey==='dwarvencrate')) throw Error('crate death effect did not finish')
        if (map[100][101]!=='marble') throw Error('crate did not remain destroyed')
        if (groundItems.filter(g=>g.kind==='potion'&&g.x===101).length!==1)
          throw Error('crate drop changed during animation')
      })()`))
    })
  }
})
