const {trapFixture} = require('../support/dwarven-trap-checks')

describe('Dwarven Crusher', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__crusherBootstrap = save
      win.eval('loadGameFromObject(window.__crusherBootstrap,{isReplayInit:true})')
      delete win.__crusherBootstrap
      win.eval(`window.crusherFixture = ${trapFixture.toString()}`)
      win.eval(`(() => {
        const level=crusherFixture()
        currentZ=-5;deepLevels[3]=level;level.dungeonPackage='dwarvenRuins'
        map=level.map;undergroundDiscovered=level.discovered
        level.hazards=[{id:'crusher:-5:test',type:'crusher',z:-5,roomId:'test',
          geometry:{triggerTiles:[{x:11,y:12}],dangerTiles:[{x:10,y:12},{x:11,y:12},{x:12,y:12}]},
          state:'idle',stateEnteredTurn:0,localTurn:0,lastProcessedTurn:-1,impactedMonsterIds:[],exhausted:false}]
        map[12][11]='dwarvencrusherplate'
        map[12][10]=map[12][12]='dwarvencrushertrack'
        player.x=9;player.y=12;player.hp=player.maxHp=200
        turnCount=20;replayAnimationsDisabled=true;enemies=[]
      })()`)
    }))
  })

  it('shows the physical warning and offers one consumed action to escape', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      check(DungeonHazards.validate(deepLevels[3]),'crusher geometry and state valid')
      check(DungeonHazards.knownDanger(10,12) && !playerPathCanTraverse(11,12) &&
        !playerPathCanTraverse(12,12),'autopath excludes all threatened tiles')
      player.x=11;DungeonHazards.onActorEntered(player,9,12)
      check(h.state==='warning' && DungeonHazards.activeCrusherStatus()===h,'plate arms')
      check(activePlayerStatuses().some(s=>s.id==='crusher'),'warning in status strip')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===200 && h.state==='warning','triggering action does not cause damage')
      player.x=11;player.y=13
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===200 && h.state==='cooldown','a sidestep escapes impact')
      for(let i=0;i<3;i++){turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)}
      check(h.state==='idle','mechanism rearms after three actions')
      player.x=11;player.y=12;DungeonHazards.onActorEntered(player,11,13)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===40,'80% max HP impact ignores armor and DEF')
      return true
    })()`))
  })

  it('caps monster and Champion damage once each, persisting hit IDs through save', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      player.x=9;player.y=12
      const creature=(id,x,prefix)=>({id,name:'Skeleton',baseName:'Skeleton',alive:true,
        level:-5,levelKind:'chain',x,y:12,hp:100,maxHp:100,atk:1,def:1,spd:1,
        grace:1,tier:2,abilities:[],prefix:prefix||null,immunityUntilTurn:0})
      const normal=creature('normal',10),champion=creature('champion',12,'Champion')
      enemies=[normal,champion]
      h.state='warning';h.stateEnteredTurn=h.localTurn
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(normal.hp===50 && champion.hp===80,'50% ordinary and 20% Champion caps')
      check(h.impactedMonsterIds.length===2,'both affected IDs recorded')
      const saved=buildSaveObject(),hp=[normal.hp,champion.hp],ids=[...h.impactedMonsterIds]
      loadGameFromObject(saved,{isReplayInit:true})
      const restored=deepLevels[3].hazards[0]
      check(JSON.stringify(restored.impactedMonsterIds)===JSON.stringify(ids),'hit IDs restored')
      restored.state='warning';restored.stateEnteredTurn=restored.localTurn
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      const actors=enemies.filter(e=>ids.includes(e.id))
      check(actors.every(e=>e.hp===hp[ids.indexOf(e.id)]),'repeat impact cannot farm Champion HP')
      return true
    })()`))
  })

  it('keeps warning and cooldown state across restore, without a load-time hit', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      player.x=11;DungeonHazards.onActorEntered(player,9,12)
      const rngBefore=rngState,save=buildSaveObject()
      loadGameFromObject(save,{isReplayInit:true})
      check(player.hp===200 && rngState===rngBefore && deepLevels[3].hazards[0].state==='warning',
        'restore warning without advancing state or RNG')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===200,'first action completes warning')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===40,'next action deals damage once')
      return true
    })()`))
  })
})
