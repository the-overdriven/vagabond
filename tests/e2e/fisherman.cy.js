function begin() {
  cy.visit('/')
  cy.get('#raceName').clear().type('Fisherman Tester')
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay').should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Fisherman and swimming', () => {
  it('uses the shared NPC template and PNG artwork before and after loading', () => {
    begin()
    cy.window().then(async win => {
      const result = await win.eval(`(async () => {
        const template = NPC_TEMPLATES.find(t => t.name === FISHERMAN_NAME)
        const matches = () => {
          const found = npcs.filter(n => n.name === FISHERMAN_NAME)
          return found.length === 1 && found[0].portrait === template.portrait &&
            found[0].static === template.static && found[0].free === template.free &&
            JSON.stringify(found[0].lines) === JSON.stringify(linesForNpcTemplate(template))
        }
        const generated = matches()
        const saved = JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved, {isReplayInit: true})
        await preloadImages()
        const path = RENDER_STYLE.npc.characters[FISHERMAN_NAME].image
        const tile = preloadedImages.get(path)
        return {generated, restored: matches(), shoreline: template.placement === 'shoreline',
          portrait: preloadedImages.has('img/npc/' + template.portrait + '.jpg'),
          png: path === 'img/tiles/npc-fisherman.png' && !!tile && tile.naturalWidth > 0}
      })()`)
      for (const [key, value] of Object.entries(result)) expect(value, key).to.equal(true)
    })
  })

  it('rejects banks with no eligible distant target and uses the same deterministic target at activation', () => {
    begin()
    cy.window().then(win => {
      const result=win.eval(`(() => {
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        spawnPoint={x:30,y:30};villageCenter={x:30,y:30}
        surfaceMap=Array.from({length:MAP_H},()=>Array(MAP_W).fill('grass'))
        for(let y=20;y<25;y++) for(let x=20;x<25;x++) surfaceMap[y][x]='water'
        map=surfaceMap.map(row=>row.slice())
        const rejected=!placeFisherman()
        for(let y=20;y<25;y++) for(let x=70;x<75;x++) surfaceMap[y][x]='water'
        const nearOnly=!placeFisherman()
        for(let y=20;y<25;y++) for(let x=120;x<125;x++) surfaceMap[y][x]='water'
        map=surfaceMap.map(row=>row.slice())
        const placed=placeFisherman()
        const n=npcs.find(n=>n.name===FISHERMAN_NAME)
        const water=fishermanWaterRegions()
        const banks=fishermanBanks(fishermanFootReachable(),water)
        const first=fishermanTargetCandidates(n,banks,water)[0]
        const repeated=fishermanTargetCandidates(n,banks,water)[0]
        const activated=activateFishermanQuest(n)
        const target=enemies.find(e=>e.id===fishermanQuest.targetId)
        return {rejected,nearOnly,placed,activated,
          deterministic:JSON.stringify(first)===JSON.stringify(repeated),
          same:target.x===first.x && target.y===first.y,
          terrain:FISHERMAN_LAND.has(surfaceMap[target.y][target.x]),
          distant:bankDistance(target,spawnPoint)>20 && bankDistance(target,n)>=25,
          stamp:map!==surfaceMap && map[fishermanHut.y][fishermanHut.x]==='fishermanhut' &&
            surfaceMap[fishermanHut.y][fishermanHut.x]==='fishermanhut'}
      })()`)
      for(const [key,value] of Object.entries(result)) expect(value,key).to.equal(true)
    })
  })

  it('offers completed-world lessons and Merling thanks once per character across resets and saves', () => {
    begin()
    cy.window().then(win => {
      const result=win.eval(`(() => {
        replayAnimationsDisabled=true
        const approach=()=>{const n=npcs.find(n=>n.name===FISHERMAN_NAME);player.x=n.x;player.y=n.y+1}
        approach();player.race='human'
        fishermanQuest={type:'fish_predator',state:'ready',targetId:'already-dead'}
        interactFisherman()
        const first=player.swimming===5 && player.fishermanRewardClaimed && !fishermanHasNewDialogue()
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        player.swimming=8;interactFisherman()
        const persisted=player.fishermanRewardClaimed && player.swimming===8 && !fishermanHasNewDialogue()
        resetForNewCharacter();player.race='human';approach()
        const marker=fishermanHasNewDialogue() && player.swimming===0
        const count=enemies.length
        interactFisherman()
        const fresh=player.swimming===5 && player.fishermanRewardClaimed && !fishermanHasNewDialogue()
        resetForNewCharacter();player.race='merling';approach()
        const merlingMarker=fishermanHasNewDialogue()
        interactFisherman()
        const xp=player.totalXpEarned
        const merlingSave=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(merlingSave,{isReplayInit:true})
        interactFisherman()
        const once=xp===100 && player.totalXpEarned===100 && player.swimming===0 && !fishermanHasNewDialogue()
        return {first,persisted,marker,fresh,merlingMarker,once,
          completed:fishermanQuest.state==='completed' && fishermanQuest.targetId==='already-dead',
          noRespawn:enemies.length===count}
      })()`)
      for(const [key,value] of Object.entries(result)) expect(value,key).to.equal(true)
    })
  })

  it('relocates only ordinary enemies to deterministic reachable species terrain outside safety zones', () => {
    begin()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        const reachable=new Set()
        const site={x:60,y:60},hut={x:61,y:60}
        for(let y=40;y<=80;y++) for(let x=40;x<=80;x++) {
          map[y][x]='grass';reachable.add(keyXY(x,y))
        }
        const enemy={name:'ordinary-test',x:60,y:60,aggro:3,ordinarySurface:true}
        const first=fishermanRelocation(enemy,site,hut,reachable,new Set())
        const second=fishermanRelocation(enemy,site,hut,reachable,new Set())
        const special=fishermanRelocation({...enemy,ordinarySurface:false},site,hut,reachable,new Set())
        return {valid:!!first && map[first.y][first.x]==='grass' &&
          reachable.has(keyXY(first.x,first.y)) && bankDistance(first,site)>12 &&
          bankDistance(first,spawnPoint)>20 && bankDistance(first,villageCenter||spawnPoint)>20,
          deterministic:JSON.stringify(first)===JSON.stringify(second),special:special===null}
      })()`)
      expect(result).to.deep.equal({valid:true,deterministic:true,special:true})
    })
  })

  it('generates repeatable accessible banks on a fixed seed set without moving special encounters', () => {
    begin()
    cy.window().then(async win => {
      const result = await win.eval(`(async () => {
        const outcomes=[]
        for (const seed of [1200,1201,1202]) {
          const snapshots=[]
          for(let repeat=0;repeat<2;repeat++) {
            WORLD_SEED=seed; rngState=seed; nextEnemyId=1
            await generateNewWorld()
            const n=npcs.find(n=>n.name===FISHERMAN_NAME)
            if(!n) throw new Error('No fisherman for seed '+seed)
            snapshots.push(JSON.stringify({x:n.x,y:n.y,hut:fishermanHut}))
            outcomes.push(fishermanFootReachable().has(keyXY(n.x,n.y)) &&
              !['snow','taiga'].includes(map[n.y][n.x]) &&
              !enemies.some(e=>e.alive && !e.level && bankDistance(e,n)<=Math.max(8,(e.aggro||0)+3)))
          }
          outcomes.push(snapshots[0]===snapshots[1])
        }
        return outcomes
      })()`)
      expect(result.every(Boolean)).to.equal(true)
    })
  })

  it('places a safe reachable fisherman, activates one identified predator, and rewards only once', () => {
    begin()
    cy.window().then(win => {
      const result = win.eval(`(() => {
        const npc = npcs.find(n => n.name === FISHERMAN_NAME)
        if (!npc) throw new Error('Missing fisherman')
        const placement = {
          reachable: fishermanFootReachable().has(keyXY(npc.x,npc.y)),
          water: DIRS8.some(([dx,dy]) => surfaceMap[npc.y+dy]?.[npc.x+dx] === 'water'),
          safe: !enemies.some(e => e.alive && !e.level && bankDistance(e,npc) <= Math.max(8,(e.aggro||0)+3)),
          hut: surfaceMap[fishermanHut.y][fishermanHut.x],
          activeHut: map[fishermanHut.y][fishermanHut.x],
          noQuest: fishermanQuest === null,
          marker: fishermanHasNewDialogue()
        }
        player.x=npc.x; player.y=npc.y+1
        player.race='human'
        interactFisherman()
        const target=enemies.find(e => e.id === fishermanQuest.targetId)
        const active = {
          name:target.name, wander:target.wander, distance:bankDistance(npc,target),
          reachable:fishermanFootReachable().has(keyXY(target.x,target.y)),
          adjacent:DIRS8.some(([dx,dy]) => surfaceMap[target.y+dy]?.[target.x+dx] === 'water'),
          marker:fishermanHasNewDialogue()
        }
        const id=target.id
        interactFisherman()
        const unique=enemies.filter(e=>e.id===id).length
        const other=addEnemy({...target,id:null,x:target.x+1})
        killEnemy(other)
        const unrelated=fishermanQuest.state
        killEnemy(target)
        const ready=fishermanHasNewDialogue()
        interactFisherman()
        const skill=player.swimming
        interactFisherman()
        return {placement,active,unique,unrelated,ready,skill,
          completed:fishermanQuest.state,marker:fishermanHasNewDialogue(),
          fish:player.inventory.some(i=>i.kind==='fish')}
      })()`)
      expect(result.placement).to.deep.equal({reachable:true,water:true,safe:true,hut:'fishermanhut',activeHut:'fishermanhut',noQuest:true,marker:true})
      expect(result.active).to.include({name:'Fat Slurper',wander:false,reachable:true,adjacent:true,marker:false})
      expect(result.active.distance).to.be.at.least(25)
      expect(result).to.include({unique:1,unrelated:'active',ready:true,skill:5,completed:'completed',marker:false,fish:true})
    })
  })

  it('uses movement and waits, learns before drowning, persists counters, and excludes rivers and ice', () => {
    begin()
    cy.window().then(async win => {
      const result = await win.eval(`(async () => {
        replayAnimationsDisabled=true
        enemies=[]; npcs=[]; occupied=new Set()
        currentZ=0; map=surfaceMap
        player.race='human'; player.godMode=false; player.maxHp=100; player.hp=100
        player.x=40; player.y=40; resetSwimming()
        for(let y=38;y<44;y++) for(let x=38;x<65;x++) map[y][x]='grass'
        for(let x=41;x<62;x++) map[40][x]='water'
        const before=turnCount
        await tryMove(1,0)
        const blocked=player.x===40 && turnCount===before
        player.swimming=5
        for(let i=0;i<5;i++) await tryMove(1,0)
        const safe=player.hp===100 && player.swimTurns===5 && player.swimmingPractice===5
        await tryMove(1,0)
        const damage=player.hp===95 && isDrowning()
        skipTurn()
        const wait=player.hp===90 && player.swimTurns===7 && player.swimmingPractice===6
        player.swimTurns=5; player.swimmingPractice=99; player.hp=100
        await tryMove(1,0)
        const improve=player.swimming===6 && player.swimmingPractice===0 && player.hp===100 && !isDrowning()
        const saved=buildSaveObject()
        const persisted=saved.player.swimTurns===6 && saved.player.swimming===6 && saved.player.swimmingPractice===0
        await tryMove(0,1)
        const ashore=player.swimTurns===0 && !player.drowning
        map[player.y][player.x+1]='river'
        await tryMove(1,0)
        map[player.y][player.x+1]='frozenriver'
        await tryMove(1,0)
        const excluded=player.swimTurns===0 && player.swimmingPractice===0
        player.race='merling'; player.swimming=0; player.swimmingPractice=0
        map[player.y][player.x+1]='water'
        await tryMove(1,0)
        for(let i=0;i<10;i++) advanceSwimming(false)
        const merling=player.hp===100 && player.swimming===0 && player.swimmingPractice===0 && !isDrowning()
        player.race='human'; player.godMode=true
        const god=isWalkableForPlayer(player.x+1,40)
        player.godMode=false
        const normal=!isWalkableForPlayer(player.x+1,40)
        return {blocked,safe,damage,wait,improve,persisted,ashore,excluded,merling,god,normal}
      })()`)
      for (const [key,value] of Object.entries(result)) expect(value,key).to.equal(true)
    })
  })

  it('gives Merlings XP instead of lessons and shares berry effects with fish including Troll immunity', () => {
    begin()
    cy.window().then(win => {
      const result=win.eval(`(() => {
        const n=npcs.find(n=>n.name===FISHERMAN_NAME)
        player.x=n.x;player.y=n.y+1;player.race='merling'
        fishermanQuest={type:'fish_predator',state:'ready',targetId:'test'}
        const xp=player.totalXpEarned
        interactFisherman()
        const reward=player.totalXpEarned-xp
        interactFisherman()
        const once=player.totalXpEarned-xp
        player.berryRegenTurns=0
        applyBerryRegeneration('fish')
        const fish=player.berryRegenTurns
        applyBerryRegeneration('berries')
        const berries=player.berryRegenTurns
        player.race='troll'
        applyBerryRegeneration('fish')
        return {reward,once,skill:player.swimming,practice:player.swimmingPractice,fish,berries,troll:player.berryRegenTurns}
      })()`)
      expect(result).to.deep.equal({reward:100,once:100,skill:0,practice:0,fish:100,berries:200,troll:200})
    })
  })

    it('preserves quest identity and swimming through load, and resolves lethal drowning on shore', () => {
      begin()
      cy.window().then(win => {
        const result=win.eval(`(() => {
          replayAnimationsDisabled=true
          const n=npcs.find(n=>n.name===FISHERMAN_NAME)
          player.x=n.x;player.y=n.y+1
          interactFisherman()
          const id=fishermanQuest.targetId
          player.swimming=5;player.swimmingPractice=37;player.swimTurns=7
          player.x=50;player.y=50;surfaceMap[50][50]='water'
          player.swimPosition={x:50,y:50,z:0};player.drowning=true
          const saved=JSON.parse(JSON.stringify(buildSaveObject()))
          loadGameFromObject(saved,{isReplayInit:true})
          const identity=enemies.filter(e=>e.id===id).length===1 && fishermanQuest.targetId===id
          const persisted=player.swimming===5 && player.swimmingPractice===37 && player.swimTurns===7 && isDrowning()
          const staticNpc=npcs.find(n=>n.name===FISHERMAN_NAME).static
          enemies=[];npcs=[];occupied=new Set()
          for(let y=48;y<53;y++) for(let x=48;x<53;x++) map[y][x]='water'
          map[49][50]='grass'
          const shore=drowningShore()
          const closest=shore.x===50 && shore.y===49
          player.maxHp=1;player.hp=1;player.swimTurns=5;player.permadeath=false
          replayAnimationsDisabled=true
          const deaths=player.deaths
          advanceSwimming(false)
          const lethal=player.deaths===deaths+1 && player.x===spawnPoint.x && player.y===spawnPoint.y
          const reset=player.swimTurns===0 && !player.drowning && player.swimmingPractice===37
          player.swimming=5;player.godMode=true
          useGodModeKey(true)
          const toggle=!player.godMode && player.swimming===5
          return {identity,persisted,staticNpc,closest,lethal,reset,toggle}
        })()`)
        for(const [key,value] of Object.entries(result)) expect(value,key).to.equal(true)
      })
    })

    it('replays quest activation and swimming actions with identical state and no extra random decisions', () => {
      begin()
      cy.window().then(async win => {
        const result=await win.eval(`(async () => {
          replayAnimationsDisabled=true
          const n=npcs.find(n=>n.name===FISHERMAN_NAME)
          player.x=n.x;player.y=n.y+1
          enemies=[];occupied=new Set(npcs.map(n=>keyXY(n.x,n.y)))
          const initial=JSON.parse(JSON.stringify(buildSaveObject()))
          interactFisherman()
          const first=JSON.stringify(fishermanQuest)
          const target=enemies.find(e=>e.id===fishermanQuest.targetId)
          const firstTarget=JSON.stringify({id:target.id,x:target.x,y:target.y})
          loadGameFromObject(initial,{isReplayInit:true})
          await runReplayAction({type:'talk',npc:FISHERMAN_NAME})
          const second=JSON.stringify(fishermanQuest)
          const secondTarget=enemies.find(e=>e.id===fishermanQuest.targetId)
          const quest=first===second && firstTarget===JSON.stringify({id:secondTarget.id,x:secondTarget.x,y:secondTarget.y})
          enemies=[];npcs=[];occupied=new Set()
          player.x=40;player.y=40;player.swimming=5;resetSwimming()
          for(let x=40;x<49;x++) surfaceMap[40][x]=x===40?'grass':'water'
          const before=JSON.parse(JSON.stringify(buildSaveObject()))
          replayAnimationsDisabled=true
          const actions=Array.from({length:6},()=>({type:'move',dx:1,dy:0}))
          for(const a of actions) await runReplayAction(a)
          if(player.swimTurns!==6) throw new Error('Replay fixture did not perform six swimming steps')
          const expected=JSON.stringify({hp:player.hp,swim:player.swimTurns,practice:player.swimmingPractice})
          loadGameFromObject(before,{isReplayInit:true})
          replayAnimationsDisabled=true
          for(const a of actions) await runReplayAction(a)
          return {quest,swim:expected===JSON.stringify({hp:player.hp,swim:player.swimTurns,practice:player.swimmingPractice})}
        })()`)
        expect(result).to.deep.equal({quest:true,swim:true})
      })
  })
})
