const {trapFixture}=require('../support/dwarven-trap-checks')

describe('Dwarven wall Crusher',()=>{
  beforeEach(()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>cy.window().then(win=>{
      win.__fixtureSave=save
      win.eval('loadGameFromObject(window.__fixtureSave,{isReplayInit:true})')
      delete win.__fixtureSave
      win.eval(`window.crusherFixture=${trapFixture.toString()}`)
      win.eval(`(()=>{
        const level=crusherFixture()
        currentZ=-5;deepLevels[3]=level;level.dungeonPackage='dwarvenRuins'
        map=level.map;undergroundDiscovered=level.discovered
        const dangerTiles=[],baseTiles=[],jawStages=[],triggerTiles=[]
        for(let y=11;y<=15;y++) for(let x=10;x<=14;x++) {
          const tile=x===12?'dwarvencrusherplate':(x===10||x===14)?'dwarvencrushertrack':'marble'
          level.map[y][x]=tile;dangerTiles.push({x,y});baseTiles.push({x,y,tile})
          if(x===12)triggerTiles.push({x,y})
        }
        for(let offset=0;offset<3;offset++) jawStages.push(
          Array.from({length:5},(_,r)=>[{x:10+offset,y:11+r},{x:14-offset,y:11+r}]).flat()
            .filter((p,i,a)=>a.findIndex(q=>q.x===p.x&&q.y===p.y)===i))
        groundItems.push({x:17,y:15,kind:'chest',level:-5,levelKind:'chain',opened:false,crusherReward:'crusher:-5:test'})
        level.hazards=[{id:'crusher:-5:test',type:'crusher',z:-5,roomId:'test',
          geometry:{triggerTiles,dangerTiles,jawStages,baseTiles,rewardChest:{x:17,y:15}},
          state:'idle',stateEnteredTurn:0,step:0,localTurn:0,lastProcessedTurn:-1,
          exhausted:false}]
        player.x=9;player.y=12;player.hp=player.maxHp=200;player.godMode=false
        turnCount=20;replayAnimationsDisabled=true;enemies=[]
      })()`)
    }))
  })

  it('pushes solid walls inward tile by tile and lets the hero escape the strike lane',()=>{
    cy.window().then(win=>win.eval(`(()=>{
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      check(DungeonHazards.validate(deepLevels[3]),'valid wall jaw geometry')
      check(h.geometry.dangerTiles.length===25 && !playerPathCanTraverse(12,12),'five-by-three area marked')
      player.x=12;DungeonHazards.onActorEntered(player,9,12)
      check(h.state==='warning' && activePlayerStatuses().some(s=>s.id==='crusher'),'pressure warning')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===200 && h.step===0,'triggering action grants reaction time')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(h.step===1 && map[12][10]==='dwarvencrusherjaw' && map[12][14]==='dwarvencrusherjaw',
        'wall jaws move one tile from BOTH sides')
      check(DungeonHazards.validate(deepLevels[3]),'in-progress terrain agrees with hazard')
      player.x=12;player.y=17
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(h.state==='cooldown' && player.hp===200,'retreat escapes all damage')
      check(h.geometry.baseTiles.every(p=>map[p.y][p.x]===p.tile),'walls fully retract')
      return true
    })()`))
  })

  it('crushes monsters and Champions, honors caps, and persists the moving walls',()=>{
    cy.window().then(win=>win.eval(`(()=>{
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      const monster=(id,x,prefix)=>({id,name:'Skeleton',baseName:'Skeleton',prefix,
        alive:true,level:-5,levelKind:'chain',x,y:12,hp:100,maxHp:100,atk:1,def:1,
        spd:1,grace:1,tier:2,abilities:[],equipment:{weapon:null,armor:null,shield:null},immunityUntilTurn:0})
      enemies=[monster('normal',10,null),monster('champion',14,'Champion')]
      player.x=12;player.y=12;DungeonHazards.onActorEntered(player,11,12)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(enemies[0].hp===100 && enemies[1].hp===100,
        'advancing walls push monsters without inflicting premature damage')
      check(h.impactedMonsterIds===undefined && h.step===1,'Crusher has no permanent hit immunity')
      const save=buildSaveObject(),rngBefore=rngState
      loadGameFromObject(save,{isReplayInit:true})
      const restored=deepLevels[3].hazards[0]
      check(restored.step===1 && rngState===rngBefore && DungeonHazards.validate(deepLevels[3]),
        'save restores jaw tiles and timing without hit-ID state')
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      check(player.hp===40 && restored.state==='impact','center eventually crushed for 80%')
      check(enemies[0].hp<=20 && enemies[1].hp<=80,
        'the final pinch damages normal and Champion monsters according to their caps')
      return true
    })()`))
  })
  it('lets ethereal monsters phase through moving walls without consuming a hit',()=>{
    cy.window().then(win=>win.eval(`(()=>{
      const h=deepLevels[3].hazards[0]
      const ghost={id:'ghost-crusher',name:'Ghost',baseName:'Ghost',alive:true,level:-5,levelKind:'chain',
        x:10,y:12,hp:100,maxHp:100,atk:1,def:1,spd:1,grace:1,tier:2,
        abilities:['ethereal'],immunityUntilTurn:0,equipment:{weapon:null,armor:null,shield:null}}
      enemies=[ghost];player.x=12;player.y=12
      DungeonHazards.onActorEntered(player,11,12)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)
      if(ghost.hp!==100 || h.impactedMonsterIds!==undefined)
        throw Error('ethereal monster harmed or marked by Crusher')
    })()`))
  })
  it('allows monsters to activate the plate and damages one that remains between the walls',()=>{
    cy.window().then(win=>win.eval(`(()=>{
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const h=deepLevels[3].hazards[0]
      const e={id:'self-activated',name:'Skeleton',baseName:'Skeleton',prefix:null,
        alive:true,level:-5,levelKind:'chain',x:12,y:12,hp:100,maxHp:100,
        atk:1,def:1,spd:1,grace:1,tier:2,abilities:[],immunityUntilTurn:0,
        equipment:{weapon:null,armor:null,shield:null}}
      enemies=[e];player.x=9;player.y=14
      const messages=[];const originalLog=log;log=(message,...args)=>{messages.push(message);return originalLog(message,...args)}
      const originalVisibility=enemyIsVisibleOnMainView
      enemyIsVisibleOnMainView=()=>true // Verify wording even when the fixture's walls obscure the monster.
      DungeonHazards.onActorEntered(e,11,12)
      check(h.state==='warning','monster activates a real pressure plate')
      for(let i=0;i<3;i++){turnCount++;DungeonHazards.onPlayerTurnConsumed(turnCount)}
      check(e.hp===20 && h.impactedMonsterIds===undefined,'monster hit when closing jaws reach center')
      check(messages.some(message=>message.includes('Crusher squeezes the Skeleton')) &&
        !messages.some(message=>message.includes('Crusher hits the Skeleton')),
        'Crusher damage uses squeezing rather than melee hit wording')
      enemyIsVisibleOnMainView=originalVisibility;log=originalLog
      return true
    })()`))
  })
})
