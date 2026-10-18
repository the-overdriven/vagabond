const {crateLootDistributionChecks, crateConsumablesPersistenceChecks} = require('../helpers/crate-consumables-checks.js')

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
      check(map[100][101]==='dwarvencratepieces' && isWalkable(101,100),'empty crate leaves walkable debris')
      check(!TILE.dwarvencratepieces.projectileBlock && !TILE.dwarvencratepieces.blocksSight &&
        playerPathCanTraverse(101,100),'debris does not block shots, sight or automatic travel')
      check(CODE_TILE[TILE_CODE.dwarvencratepieces]==='dwarvencratepieces','debris has its own save code')
      check(!groundItems.some(g=>g.x===101&&g.y===100),'empty crate drops nothing')
      const emptySave=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(emptySave,{isReplayInit:true})
      replayAnimationsDisabled=true
      check(map[100][101]==='dwarvencratepieces'&&!deepLevels[2].crates.some(c=>c.x===101&&c.y===100),
        'destroyed crate never respawns')
    })()`))
  })
  it('alerts nearby monsters and sometimes a farther one on every weapon strike, even while invisible', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const config=WORLD_GEN_CONFIG.dungeons.dwarvenRuins.crates
      check(config.alarmNearbyRadius===5 && config.alarmDistantChance===0.25,
        'crate noise parameters come from world-generation JSON')
      function noiseEnemy(id,x,y,props={}) {
        return {id,name:id,baseName:'Goblin',alive:true,hp:100,maxHp:100,atk:0,def:0,
          spd:1,grace:1,tier:1,aggro:5,abilities:[],humanoid:false,
          level:currentZ,levelKind:'chain',caveIndex:-1,x,y,homeX:x,homeY:y,
          aware:false,alarmed:false,wander:false,...props}
      }
      player.invisibleTurns=100
      enemies=[noiseEnemy('near-a',101,95),noiseEnemy('near-b',106,105),
        noiseEnemy('far-a',107,100),noiseEnemy('far-b',110,100),
        noiseEnemy('passive',103,100,{aggro:0}),
        noiseEnemy('other-floor',102,100,{level:chainZForDepth(3)})]
      occupied=new Set(enemies.filter(e=>onCurrentLevel(e)).map(e=>keyXY(e.x,e.y)))
      config.alarmDistantChance=0
      await tryMove(1,0)
      check(enemies[0].alarmed && enemies[1].alarmed, 'all monsters within five tiles Alarm immediately')
      check(!enemies[2].alarmed && !enemies[3].alarmed, 'outside the noise radius are initially safe')
      check(!enemies[4].alarmed && !enemies[5].alarmed, 'passive and other-level monsters unaffected')
      check(player.invisibleTurns>0 && !enemies[0].aware, 'noise does not reveal invisible player')
      check(deepLevels[2].crates[0].hp>0, 'noise occurs even before crate breaks')
      config.alarmDistantChance=1
      await tryMove(1,0)
      check(enemies[2].alarmed && !enemies[3].alarmed, 'nearest distant monster alarms first')
      await tryMove(1,0)
      check(enemies[3].alarmed, 'next blow can alarm another distant monster')
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
      check(map[100][101]==='dwarvencratepieces','crate was smashed')
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
        check(map[100][101]==='dwarvencratepieces' && groundItems.some(g=>g.x===101&&g.y===100&&g.kind==='potion'),
          'replay recreates the same crate destruction and potion')
        check(replayRngIndex===actions.rng.length,'crate playback consumes identical RNG')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
      await tryMove(1,0)
      check(player.x===101 && !groundItems.some(g=>g.x===101&&g.y===100), 'loot is picked up normally')
      check(player.inventory.some(i=>i.kind==='potion'),'loot goes into inventory')
      check(map[100][101]==='dwarvencratepieces','debris remains after loot pickup')
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
  it('uses the configured chances for empty crates and every consumable, with one generation roll per crate', () => {
    cy.window().then(win => win.eval('(' + crateLootDistributionChecks.toString() + ')()'))
  })
  it('preserves all five new crate drops through intact/drop saves, pickup and deterministic replay', () => {
    cy.window().then(win => win.eval('(' + crateConsumablesPersistenceChecks.toString() + ')()'))
  })
  for (const tileGraphics of [true, false]) {
    it(`shows debris immediately without a crate death effect in ${tileGraphics ? 'tile' : 'ASCII'} mode`, () => {
      cy.window().then(win => win.eval(`(async () => {
        const check=(ok,msg)=>{if(!ok)throw Error(msg)}
        replayAnimationsDisabled=false;replaySimulationMode=false;USE_TILE_IMAGES=${tileGraphics};
        deepLevels[2].crates[0].hp=1
        deepLevels[2].crates[0].lootKind='potion'
        fxAnims=[]
        await tryMove(1,0)
        check(map[100][101]==='dwarvencratepieces','debris replaces crate immediately')
        check(groundItems.filter(g=>g.kind==='potion'&&g.x===101).length===1,
          'loot appears immediately and only once')
        check(attackAnim && attackAnim.duration===220,'player attack lunge remains')
        check(fxAnims.length===0,'no crate death effect queued')
        const rngBeforeRender=rngState
        render(attackAnim.start+1)
        check(rngState===rngBeforeRender,'rendering does not roll RNG')
        check(map[100][101]==='dwarvencratepieces','rendering retains debris during the lunge')
      })()`))
    })
  }
})
