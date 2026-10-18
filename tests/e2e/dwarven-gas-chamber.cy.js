const {trapFixture} = require('../support/dwarven-trap-checks')

describe('Sealed Dwarven gas chambers', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save => cy.window().then(win => {
      win.__gasBootstrap = save
      win.eval('loadGameFromObject(window.__gasBootstrap,{isReplayInit:true})')
      delete win.__gasBootstrap
      win.eval(`window.gasRoomFixture=${trapFixture.toString()}`)
      win.eval(`(() => {
        const level=gasRoomFixture()
        currentZ=-5;deepLevels[3]=level;level.dungeonPackage='dwarvenRuins'
        map=level.map;undergroundDiscovered=level.discovered
        const id='dwarven-gas:-5:test'
        const doors=[{x:10,y:9},{x:11,y:9}],valve={x:16,y:13},chest={x:13,y:13}
        const room={x:8,y:10,w:11,h:8}
        for(let y=10;y<18;y++) for(let x=8;x<19;x++) map[y][x]='marble'
        for(const d of doors) map[d.y][d.x]='dwarvendoorclosed'
        map[valve.y][valve.x]='dwarvengasvalve'
        map[11][16]='dwarvengasvent'
        level.hazards=[{id,type:'gas',z:-5,roomId:'test',
          geometry:{room,doors,valve,chest,vents:[{x:16,y:11}]},
          state:'dormant',localTurn:0,stateEnteredTurn:0,lastProcessedTurn:-1,
          remainingTurns:15,successfulHits:0,valveProgress:0,exhausted:false}]
        groundItems=[{x:13,y:13,kind:'chest',tier:3,opened:false,
          level:-5,levelKind:'chain',caveIndex:-1,gasChamberId:id}]
        enemies=[];player.x=12;player.y=13;player.hp=playerMaxHp();player.godMode=false
        turnCount=20;replayAnimationsDisabled=true
      })()`)
    }))
  })

  it('starts on the chest-opening action, then accepts an actual valve movement on desktop/mobile', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0],hp=player.hp
      check(DungeonHazards.validate(deepLevels[3]),'gas fixture is valid')
      check(map[13][16]==='dwarvengasvalve' && map[11][16]==='dwarvengasvent','visible warnings')
      await tryMove(1,0)
      check(h.state==='active' && player.hp===hp,'opening action has no damage')
      check(h.geometry.doors.every(p=>map[p.y][p.x]==='dwarvendoorlocked'),'both leaves seal')
      check(!groundItems.some(g=>g.gasChamberId),'loot chest does not duplicate')
      check(activePlayerStatuses().some(s=>s.id==='gas'),'visible gas countdown')
      await tryMove(1,0)
      check(player.hp===hp-Math.max(1,Math.ceil(hp*.08)),'subsequent spent action deals damage')
      player.x=15;player.y=13
      await tryMove(1,0)
      check(h.valveProgress===1 && h.state==='active','valve turn 1')
      const saved=buildSaveObject(),rng=rngState
      loadGameFromObject(saved,{isReplayInit:true})
      check(rngState===rng && deepLevels[3].hazards[0].valveProgress===1,'save resumes valve progress')
      await tryMove(1,0)
      check(deepLevels[3].hazards[0].state==='vented','valve fully vents')
      check(deepLevels[3].hazards[0].geometry.doors.every(p=>map[p.y][p.x]==='dwarvendooropen'),'both leaves open')
      return true
    })()`))
  })

  it('damages physical monsters but never ethereal creatures', () => {
    cy.window().then(win=>win.eval(`(()=>{
      const h=deepLevels[3].hazards[0]
      const template={name:'Ghost',baseName:'Ghost',alive:true,level:-5,levelKind:'chain',
        x:13,y:13,hp:100,maxHp:100,atk:1,def:1,spd:1,grace:1,tier:2,
        immunityUntilTurn:0,equipment:{weapon:null,armor:null,shield:null}}
      enemies=[{...template,id:'gas-ghost',abilities:['ethereal']},
        {...template,id:'gas-physical',name:'Goblin',baseName:'Goblin',abilities:[]}]
      player.x=1;player.y=1
      h.state='active';h.stateEnteredTurn=0;h.localTurn=2
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      if(enemies[0].hp!==100 || enemies[1].hp>=100)
        throw Error('ethereal gas immunity or physical gas damage broken')
    })()`))
  })
  it('shares two-hit seal progress, handles occupied leaves and expires after 15 turns', () => {
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0],doors=h.geometry.doors
      const occupant={id:'gas-occupant',name:'Skeleton',baseName:'Skeleton',
        x:doors[0].x,y:doors[0].y,level:-5,levelKind:'chain',alive:true,
        hp:100,maxHp:100,atk:1,def:1,spd:1,grace:1,tier:2,abilities:[]}
      enemies=[occupant]
      groundItems.push({x:doors[1].x,y:doors[1].y,kind:'skeleton',looted:false,
        level:-5,levelKind:'chain',caveIndex:-1})
      check(DungeonHazards.onChestOpened({gasChamberId:h.id}),'activation cannot be disabled by occupancy')
      check(occupant.x===doors[0].x && map[doors[0].y][doors[0].x]==='dwarvendoorlocked',
        'occupied leaf seals without killing or teleporting the monster')
      check(groundItems.some(g=>g.kind==='skeleton'&&g.x===doors[1].x),'items on doors remain')
      // Keep the actor outside the hazard while testing the emergency mechanism.
      player.x=doors[0].x;player.y=doors[0].y-1
      const oldChance=chance
      chance=()=>true
      try {
        check(DungeonHazards.onDoorInteraction(doors[0].x,doors[0].y,false),'unarmed message')
        check(h.successfulHits===0,'no bare-fist breach')
        DungeonHazards.onDoorInteraction(doors[0].x,doors[0].y,true)
        check(h.successfulHits===1,'first successful strike')
        DungeonHazards.onDoorInteraction(doors[1].x,doors[1].y,true)
        check(h.successfulHits===2 && doors.every(p=>map[p.y][p.x]==='dwarvendoorbreached'),
          'second shared strike opens BOTH leaves')
        check(h.state==='active','breaching does not vent gas itself')
      } finally {chance=oldChance}
      for(let n=0;n<16;n++){turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)}
      check(h.state==='vented' && h.remainingTurns===0,'15 action expiry does not softlock')
      check(DungeonHazards.validate(deepLevels[3]),'valid final geometry')
      return true
    })()`))
  })
})
