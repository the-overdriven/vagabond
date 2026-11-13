describe('Surface encounters and item passives', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('World Rules Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
  })

  it('punishes 70 distinct foraged forest tiles with one recurring Forest Spirit', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0
        player.inventory=[];player.killsBySpecies={};player.gold=0
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        for(let y=20;y<=98;y++)for(let x=20;x<=98;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        foragedTiles=new Set(Array.from({length:69},(_,i)=>keyXY(22+i,22)))
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(!AdaptivePlayerTrolling.serialize().triggerFlags.forest_spirit,
          '69 different forest harvests are not sufficient')
        foragedTiles.add(keyXY(91,24))
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.forest_spirit,
          '70 unique harvested tiles qualify even without loot')
        player.steps=500;AdaptivePlayerTrolling.onPlayerMoved()
        let spirit=enemies.find(e=>e.adaptiveEventId==='forest_spirit')
        check(spirit && spirit.baseName==='Forest Spirit' && spirit.abilities.includes('ethereal') &&
          spirit.hp===90 && !enemyIsVisibleOnMainView(spirit) && map[spirit.y][spirit.x]==='forest',
          'distinct Forest Spirit initially manifests in reachable unseen forest')
        const spiritId=spirit.id
        const hp=spirit.hp=41
        spirit.aware=false;spirit.alarmed=false
        turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        check(spirit.forestSpiritDormant && !onCurrentLevel(spirit) &&
          AdaptivePlayerTrolling.serialize().forestSpiritRestTurns===0,
          'lost trail immediately makes the same spirit dormant')
        let saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        spirit=enemies.find(e=>e.adaptiveEventId==='forest_spirit')
        check(spirit && spirit.id===spiritId && spirit.forestSpiritDormant && spirit.hp===hp,
          'enemy identity, damage and dormancy survive a replay restore')
        for(let i=0;i<99;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(spirit.forestSpiritDormant && AdaptivePlayerTrolling.serialize().forestSpiritRestTurns===99,
          'no resurfacing before 100 surface turns')
        saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        spirit=enemies.find(e=>e.adaptiveEventId==='forest_spirit')
        check(spirit && !spirit.forestSpiritDormant && onCurrentLevel(spirit) &&
          spirit.id===spiritId && spirit.hp===hp &&
          enemies.filter(e=>e.adaptiveEventId==='forest_spirit').length===1 &&
          AdaptivePlayerTrolling.completed('forest_spirit'),
          'same wounded spirit resumes after 100 turns without duplication')
        const index=spirit.id
        spirit.aware=false;spirit.alarmed=false
        turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        const waiting=AdaptivePlayerTrolling.serialize().forestSpiritRestTurns
        currentZ=-1;currentCave=0
        for(let i=0;i<120;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().forestSpiritRestTurns===waiting &&
          spirit.id===index && spirit.forestSpiritDormant,
          'underground turns never shorten the surface-only cooldown')
        currentZ=0;currentCave=-1
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='forest_spirit').length===1,
          'later checkpoints cannot create another spirit')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('counters repeated first-leader kills with a rear Champion and two guards', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0
        player.gold=0;player.inventory=[];player.killsBySpecies={}
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        for(let y=20;y<=100;y++)for(let x=20;x<=100;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        const tmpl=ENEMY_TEMPLATE_BY_NAME.Skink
        const make=(id,x,y,isLeader=false)=>{
          const e={id,baseName:'Skink',name:isLeader?'Champion Skink':'Skink',
            prefix:isLeader?'Champion':null,adaptiveEventId:null,alive:true,
            hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,
            spd:tmpl.spd,grace:tmpl.grace,aggro:tmpl.aggro,
            abilities:[...(tmpl.abilities||[])],x,y,homeX:x,homeY:y,
            level:0,levelKind:'surface',caveIndex:-1,aware:true,alarmed:true}
          addEnemy(e);return e
        }
        const group=(num,x)=>{
          const leader=make('leader-'+num,x,55,true)
          const guards=[make('guard-'+num+'a',x+1,55),
            make('guard-'+num+'b',x,56)]
          leader.hp=0
          AdaptivePlayerTrolling.onEnemyKilled(leader)
          leader.alive=false;enemies=enemies.filter(e=>e!==leader)
          return guards
        }
        const first=group(1,57)
        check(AdaptivePlayerTrolling.serialize().hiddenLeaderKills.length===1,
          'a Champion killed before two living followers credits one group')
        // The same followers cannot qualify a second Champion as another group.
        const duplicate=make('duplicate',57,55,true)
        duplicate.hp=0;AdaptivePlayerTrolling.onEnemyKilled(duplicate)
        duplicate.alive=false;enemies=enemies.filter(e=>e!==duplicate)
        check(AdaptivePlayerTrolling.serialize().hiddenLeaderKills.length===1,
          'overlapping followers cannot count as a separate encounter')
        group(2,64)
        group(3,72)
        check(AdaptivePlayerTrolling.serialize().hiddenLeaderKills.length===3 &&
          AdaptivePlayerTrolling.serialize().triggerFlags.hidden_leader,
          'three distinct groups activate the Hidden Leader response')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().hiddenLeaderKills.length===3,
          'past leader-first kills survive replay restoration')
        player.steps=500;AdaptivePlayerTrolling.onPlayerMoved()
        const pack=enemies.filter(e=>e.adaptiveEventId==='hidden_leader')
        const boss=pack.find(e=>e.hiddenLeaderRole==='leader')
        const guards=pack.filter(e=>e.hiddenLeaderRole==='guard')
        check(pack.length===3 && boss && guards.length===2 &&
          boss.prefix==='Champion' && boss.name.startsWith('Guarded Champion '),
          'one named Champion with two real guards spawned')
        check(guards.every(g=>g.baseName===boss.baseName &&
          g.hiddenLeaderGroupId===boss.id && g.abilities.includes('gangPower')),
          'guards are from the same native gang-capable species')
        const distance=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))
        check(guards.every(g=>distance(g,boss)<=2 &&
          distance(g,player)<distance(boss,player)),
          'guards start in front of and within Inspired range of their leader')
        check(!enemyIsVisibleOnMainView(boss) &&
          guards.every(g=>!enemyIsVisibleOnMainView(g)),
          'group begins outside player vision')
        check(AdaptivePlayerTrolling.takeHiddenLeaderTurn(boss),
          'unharmed Champion waits behind its living guards')
        boss.hp--
        check(!AdaptivePlayerTrolling.takeHiddenLeaderTurn(boss),
          'attacking the Champion breaks its defensive hold')
        boss.hp=boss.maxHp
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        const restored=enemies.filter(e=>e.adaptiveEventId==='hidden_leader')
        const restoredLeader=restored.find(e=>e.hiddenLeaderRole==='leader')
        check(AdaptivePlayerTrolling.completed('hidden_leader') && restored.length===3 &&
          restoredLeader && restored.every(e=>e.hiddenLeaderGroupId===restoredLeader.id) &&
          AdaptivePlayerTrolling.takeHiddenLeaderTurn(restoredLeader) &&
          AdaptivePlayerTrolling.serialize().floorThreats['surface:0:0,0']===1,
          'full formation, defensive AI and one threat slot survive save/replay')
        restored.filter(e=>e!==restoredLeader).forEach(g=>{g.alive=false})
        check(!AdaptivePlayerTrolling.takeHiddenLeaderTurn(restoredLeader),
          'the Champion advances when the bodyguards are dead')
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='hidden_leader').length===3,
          'additional checks do not duplicate the group')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('brings back the same spared enemy after three separate low-HP escapes', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0;player.gold=0
        player.hp=playerMaxHp();player.inventory=[];player.killsBySpecies={}
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        for(let y=20;y<=100;y++)for(let x=20;x<=100;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        chance=()=>false // unrelated ordinary encounter RNG is disabled
        const tmpl=ENEMY_TEMPLATE_BY_NAME.Wolf
        const make=(id,x)=>{
          const e={id,name:'Wolf',baseName:'Wolf',adaptiveEventId:null,prefix:null,
            tier:tmpl.tier,humanoid:false,atk:tmpl.atk,def:tmpl.def,
            spd:tmpl.spd,grace:tmpl.grace,aggro:tmpl.aggro,
            hp:24,maxHp:100,abilities:[...(tmpl.abilities||[])],
            x,y:55,homeX:x,homeY:55,level:0,levelKind:'surface',
            caveIndex:-1,alive:true,aware:true,alarmed:true}
          addEnemy(e)
          return e
        }
        const a=make('spared-a',56), b=make('spared-b',57)
        const c=make('spared-c',58), d=make('spared-d',59)
        // One protracted fight with two wounded enemies counts as one escape.
        turnCount=1000
        AdaptivePlayerTrolling.onCombatAttack(turnCount)
        check(AdaptivePlayerTrolling.onPlayerWoundedEnemy(a,12), 'first wounded enemy tracked')
        check(AdaptivePlayerTrolling.onPlayerWoundedEnemy(b,9), 'second wounded enemy tracked')
        player.x=80;player.y=80;turnCount+=6
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().unfinishedEscapes.length===1,
          'a multi-target fight yields only one escape')
        // Nearby waiting does not count as escaping a fight.
        player.x=55;player.y=55
        turnCount+=1;AdaptivePlayerTrolling.onCombatAttack(turnCount)
        check(AdaptivePlayerTrolling.onPlayerWoundedEnemy(c,10),'third enemy wounded')
        turnCount+=7;AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().unfinishedEscapes.length===1,
          'waiting next to a weakened enemy does not count')
        player.x=80;player.y=80;turnCount+=1
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().unfinishedEscapes.length===2,
          'escape qualifies once the player moves away')
        player.x=55;player.y=55
        turnCount+=1;AdaptivePlayerTrolling.onCombatAttack(turnCount)
        check(AdaptivePlayerTrolling.onPlayerWoundedEnemy(d,12),'fourth enemy wounded')
        player.x=80;player.y=80;turnCount+=6
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().unfinishedEscapes.length===3 &&
          AdaptivePlayerTrolling.serialize().triggerFlags.unfinished_business,
          'three distinct fights qualify the response')
        // A death prevents the first survivor from returning. The other
        // survivors remain real entities, not templates used to spawn copies.
        AdaptivePlayerTrolling.onEnemyKilled(a)
        a.alive=false;enemies=enemies.filter(e=>e!==a)
        b.x=85;c.x=86;d.x=87
        b.y=c.y=d.y=85
        player.x=55;player.y=55;snapCameraToPlayer();rebuildActiveLevelOccupancy()
        const beforeIds=enemies.map(e=>e.id).sort()
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().unfinishedEscapes.length===3,
          'escape identities persist after restoring a replay snapshot')
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        const returned=enemies.filter(e=>e.adaptiveEventId==='unfinished_business')
        check(returned.length===1 && returned[0].id==='spared-c',
          'the original living survivor returns with unchanged ID')
        check(enemies.map(e=>e.id).sort().join(',')===beforeIds.join(','),
          'reappearance does not create or remove another monster')
        check(returned[0].name.endsWith(', the Unfinished Wolf') &&
          returned[0].prefix==='Champion' && returned[0].hp===returned[0].maxHp &&
          returned[0].maxHp>100, 'named return gains Champion strength and full health')
        check(Math.max(Math.abs(returned[0].x-player.x),Math.abs(returned[0].y-player.y))>=12 &&
          returned[0].aware && returned[0].alarmed &&
          returned[0].alarmedZ===0 && returned[0].alarmedLevelKind==='surface',
          'return starts out of sight, alert on the correct map')
        check(AdaptivePlayerTrolling.completed('unfinished_business'),
          'successful return consumes only one optional encounter')
        const after=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(after,{isReplayInit:true})
        check(enemies.filter(e=>e.adaptiveEventId==='unfinished_business' &&
          e.id==='spared-c').length===1,'the same named enemy survives save and replay')
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='unfinished_business').length===1,
          'another scheduled check cannot create a duplicate')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('retaliates against five initiated stronger enemies with one native weaker pack', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0
        player.baseAtk=25;player.baseDef=20;player.baseSpd=15
        player.lvl=10;player.hp=playerMaxHp();player.inventory=[]
        player.killsBySpecies={}
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        for(let y=28;y<=82;y++)for(let x=28;x<=82;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        chance=()=>false // avoid unrelated ordinary-thief rolls
        const target=(i,props={})=>({id:'strong-target-'+i,
          name:'Ogre',baseName:'Ogre',atk:150,def:90,spd:20,grace:10,
          hp:300,maxHp:300,alive:true,alarmed:false,
          x:56,y:56,level:0,levelKind:'surface',caveIndex:-1,...props})
        check(!AdaptivePlayerTrolling.onPlayerInitiatedStrongFight(target(0,{alarmed:true})),
          'already alarmed enemy does not count as a player-initiated fight')
        check(!AdaptivePlayerTrolling.onPlayerInitiatedStrongFight(target(0,{atk:1,def:1,spd:1,grace:1})),
          'weaker enemy does not qualify')
        for(let i=1;i<=4;i++) {
          check(AdaptivePlayerTrolling.onPlayerInitiatedStrongFight(target(i)),
            'distinct stronger target counts')
          check(!AdaptivePlayerTrolling.onPlayerInitiatedStrongFight(target(i)),
            'same enemy cannot be counted twice')
        }
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='strong_enemy_hunter'),
          'four engagements do not qualify')
        check(AdaptivePlayerTrolling.onPlayerInitiatedStrongFight(target(5)),
          'fifth stronger engagement qualifies')
        check(AdaptivePlayerTrolling.serialize().triggerFlags.strong_enemy_hunter,
          'diagnostic flag becomes true')
        const progress=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(progress,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().strongFightsInitiated.length===5,
          'unique enemy history persists across replay restoration')
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        let pack=enemies.filter(e=>e.adaptiveEventId==='strong_enemy_hunter')
        check(pack.length===4,'exactly four native opportunists spawn')
        check(pack.every(e=>e.name.startsWith('Opportunist ') &&
          e.baseName===pack[0].baseName && e.abilities.includes('gangPower') &&
          e.tier<=2),'gang uses native weaker combatants with recognisable names')
        check(AdaptivePlayerTrolling.serialize().completed.includes('strong_enemy_hunter'),
          'event is consumed only after a successful placement')
        const done=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(done,{isReplayInit:true})
        pack=enemies.filter(e=>e.adaptiveEventId==='strong_enemy_hunter')
        check(pack.length===4,'pack persists in restored game')
        player.steps=1500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='strong_enemy_hunter').length===4,
          'later checkpoints never duplicate the retaliation')
      } finally {chance=savedChance;loadGameFromObject(before)}
    })()`))
  })

  it('summons one native beast after 40 beast kills and lets it lose pursuit', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0;player.gold=0
        player.hp=playerMaxHp();player.invisibleTurns=0;player.inventory=[]
        player.killsBySpecies={Wolf:19,Lion:19,Boar:1,Goblin:1}
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        // Forest supports ordinary, non-humanoid living animals.
        for(let y=28;y<=82;y++)for(let x=28;x<=82;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        chance=()=>false // no unrelated ordinary-thief encounter
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='beast_hunter'),
          '39 beast kills do not qualify')
        player.killsBySpecies={Wolf:18,Lion:17,Boar:5,Goblin:15,Kobold:16} // 40 beasts, below 60%
        player.steps=999
        check(!AdaptivePlayerTrolling.onPlayerMoved(),
          'no scheduled check before milestone')
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='beast_hunter'),
          '40 kills below 60 percent do not qualify')
        player.killsBySpecies={Wolf:15,Lion:14,Boar:12,Goblin:12,Kobold:12} // 63 percent beast kills
        player.steps=1500
        check(AdaptivePlayerTrolling.onPlayerMoved(),
          'threshold and surface checkpoint summon beast hunter')
        let hunter=enemies.find(e=>e.adaptiveEventId==='beast_hunter')
        check(!!hunter && hunter.prefix==='Hunting' &&
          hunter.family==='living' && !hunter.humanoid &&
          hunter.maxHp===ENEMY_TEMPLATE_BY_NAME[hunter.baseName].hp &&
          hunter.atk===ENEMY_TEMPLATE_BY_NAME[hunter.baseName].atk,
          'native beast has visible identity and normal strength')
        check(Math.max(Math.abs(hunter.x-player.x),Math.abs(hunter.y-player.y))>=12 &&
          hunter.aware && hunter.alarmed,
          'off-screen hunter starts an actual long-range pursuit')
        check(['Spineback','Manticore'].includes(hunter.baseName) &&
          !hunter.abilities.includes('carrionInstinct'),
          'hunter comes from the strong uncommon beast pool without Carrion bonuses')
        const savedRng = rng
        try {
          rng=()=>0.2
          const initialPosition=[hunter.x,hunter.y]
          check(AdaptivePlayerTrolling.takeBeastHunterTurn(hunter) &&
            hunter.x===initialPosition[0] && hunter.y===initialPosition[1],
            'far wandering hunter pauses instead of chasing every turn')
        } finally {rng=savedRng}
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        hunter=enemies.find(e=>e.adaptiveEventId==='beast_hunter')
        check(!!hunter && AdaptivePlayerTrolling.serialize().completed.includes('beast_hunter'),
          'hunter identity, pursuit, and one-shot completion survive replay restore')
        const originalSpd=hunter.spd
        hunter.spd=1 // simulate an enemy slower than the player
        hunter.aware=true;hunter.alarmed=true
        chance=()=>true
        check(!AdaptivePlayerTrolling.takeBeastHunterTurn(hunter) &&
          !hunter.aware && !hunter.alarmed,
          'ordinary speed-based disengagement can end the long-range chase')
        hunter.spd=originalSpd
        player.steps=2000
        AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='beast_hunter').length===1,
          'a subsequent checkpoint cannot create a second hunter')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('ambushes only after a qualifying cave visit and preserves cave progress across save/replay', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        player.x=55;player.y=55;player.steps=0;player.gold=0
        player.hp=playerMaxHp();player.inventory=[{kind:'scrollOfInvisibility',count:2}]
        player.killsBySpecies={};enemies=[];groundItems=[];npcs=[];occupied=new Set()
        // Three known exits exercise the 40% rule; the game preserves this
        // cave geometry in saves and must not reroll when stairs are used.
        caves=[{crypt:false,entrances:[{x:55,y:55},{x:57,y:55},{x:59,y:55}]}]
        AdaptivePlayerTrolling.reset()
        turnCount=2000;currentZ=-1;currentCave=0;map=undergroundMap
        AdaptivePlayerTrolling.onFloorChanged({fromZ:0,fromKind:'surface',fromCave:-1})
        AdaptivePlayerTrolling.onEnemyKilled({baseName:'Goblin'})
        for(let i=0;i<50;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().caveVisit.turns===50 &&
          AdaptivePlayerTrolling.serialize().caveVisit.kills.Goblin===1,
          '50 cave turns and player-credited Goblin kill are counted once')
        const mid=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(mid,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().caveVisit.turns===50 &&
          AdaptivePlayerTrolling.serialize().caveVisit.kills.Goblin===1,
          'visit identity, turn count and species kills persist in replay snapshot')
        for(let i=0;i<50;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().caveVisit.turns===100 &&
          AdaptivePlayerTrolling.serialize().triggerFlags.unused_scroll_ambush,
          'the exact 100-turn threshold qualifies without an RNG roll')
        // Leaving on the surface is the ONLY time the chance is evaluated.
        currentZ=0;currentCave=-1;map=surfaceMap
        for(let y=40;y<=70;y++)for(let x=40;x<=70;x++)map[y][x]='forest'
        player.x=55;player.y=55;snapCameraToPlayer();rebuildActiveLevelOccupancy()
        let seenRoll=null
        chance=p=>{if(p===0.2||p===0.4)seenRoll=p;return true}
        check(AdaptivePlayerTrolling.onFloorChanged({fromZ:-1,fromKind:'chain',fromCave:0}),
          'a successful cave-exit roll places the ambush')
        check(seenRoll===0.4,'more than two cave exits use 40%')
        let ambushers=enemies.filter(e=>e.adaptiveEventId==='unused_scroll_ambush')
        check(ambushers.length===3 && ambushers.every(e=>e.baseName==='Goblin' && e.aware),
          'three alert Goblins share one special encounter')
        check(AdaptivePlayerTrolling.completed('unused_scroll_ambush') &&
          AdaptivePlayerTrolling.serialize().caveVisit===null &&
          Object.values(AdaptivePlayerTrolling.serialize().floorThreats).reduce((a,b)=>a+b,0)===1,
          'ambush uses one threat slot and clears the cave visit')
        const spawned=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(spawned,{isReplayInit:true})
        check(enemies.filter(e=>e.adaptiveEventId==='unused_scroll_ambush').length===3 &&
          AdaptivePlayerTrolling.completed('unused_scroll_ambush'),
          'the group and one-time completion survive replay restore')
        AdaptivePlayerTrolling.onFloorChanged({fromZ:-1,fromKind:'chain',fromCave:0})
        check(enemies.filter(e=>e.adaptiveEventId==='unused_scroll_ambush').length===3,
          'stair hopping cannot duplicate the encounter')

        // A previous reading permanently disqualifies the player, even if
        // more scrolls are found after that reading.
        AdaptivePlayerTrolling.reset();enemies=[];occupied=new Set()
        currentZ=-1;currentCave=0;map=undergroundMap
        AdaptivePlayerTrolling.onFloorChanged({fromZ:0,fromKind:'surface',fromCave:-1})
        AdaptivePlayerTrolling.onEnemyKilled({baseName:'Kobold'})
        for(let i=0;i<100;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        AdaptivePlayerTrolling.onScrollUsed()
        currentZ=0;currentCave=-1;map=surfaceMap
        seenRoll=null
        check(!AdaptivePlayerTrolling.onFloorChanged({fromZ:-1,fromKind:'chain',fromCave:0}) &&
          seenRoll===null && !AdaptivePlayerTrolling.completed('unused_scroll_ambush'),
          'reading any scroll blocks future ambush rolls')
        // Skink kills must qualify as well. If Skink is the only species
        // killed in that visit, the retaliation is made of three Skinks.
        AdaptivePlayerTrolling.reset();enemies=[];occupied=new Set()
        currentZ=-1;currentCave=0;map=undergroundMap
        AdaptivePlayerTrolling.onFloorChanged({fromZ:0,fromKind:'surface',fromCave:-1})
        AdaptivePlayerTrolling.onEnemyKilled({baseName:'Skink'})
        check(AdaptivePlayerTrolling.serialize().caveVisit.kills.Skink===1,
          'a player-credited Skink kill counts in the current cave visit')
        for(let i=0;i<100;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().triggerFlags.unused_scroll_ambush,
          'a Skink kill satisfies the species condition')
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;rebuildActiveLevelOccupancy()
        check(AdaptivePlayerTrolling.onFloorChanged({fromZ:-1,fromKind:'chain',fromCave:0}),
          'Skink-based cave retaliation spawns near the cave exit')
        check(enemies.filter(e=>e.adaptiveEventId==='unused_scroll_ambush').length===3 &&
          enemies.filter(e=>e.adaptiveEventId==='unused_scroll_ambush').every(e=>e.baseName==='Skink'),
          'three Skinks use their own species template and gangPower')
      } finally {chance=originalChance;loadGameFromObject(before)}
    })()`))
  })

  it('uses Bestiary species kills for a native Last Survivor revenge band', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0;player.gold=0
        player.hp=playerMaxHp();player.inventory=[];player.killsBySpecies={Goblin:19,Cobra:1}
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        for(let y=26;y<=84;y++)for(let x=26;x<=84;x++)map[y][x]='forest'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(!AdaptivePlayerTrolling.serialize().triggerFlags.last_survivor,
          '19 species kills are insufficient')
        player.killsBySpecies={Goblin:20,Cobra:21,Skink:5}
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.last_survivor,
          'reads the 20 kills and 20 percent threshold directly from the Bestiary')
        player.steps=499
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='last_survivor'),
          'qualification alone does not spawn an encounter between checkpoints')
        player.steps=500
        check(AdaptivePlayerTrolling.onPlayerMoved(),
          'the scheduled check can place a Last Survivor group in a native habitat')
        let group=enemies.filter(e=>e.adaptiveEventId==='last_survivor')
        check(group.length===3 && group.every(e=>e.baseName==='Goblin'),
          'the forest chooses Goblin, not the more-killed but sand-native Cobra')
        const leader=group.find(e=>e.prefix==='Champion')
        const leaderName=leader?.name
        check(!!leader && /^[A-Za-z'-]+, Last Survivor$/.test(leader.name) &&
          leader.maxHp>ENEMY_TEMPLATE_BY_NAME.Goblin.hp &&
          group.filter(e=>e.prefix===null).length===2,
          'one named Champion leader and two ordinary allies')
        check(group.every(e=>!(e.x>=camX && e.x<camX+VIEW_W &&
          e.y>=camY && e.y<camY+VIEW_H)) &&
          group.every(e=>Math.max(Math.abs(e.x-leader.x),Math.abs(e.y-leader.y))<=2),
          'the off-screen band is kept together')
        const state=AdaptivePlayerTrolling.serialize()
        check(state.completed.includes('last_survivor') &&
          Object.values(state.floorThreats).reduce((n,c)=>n+c,0)===1,
          'the entire band consumes only one persistent special threat')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        group=enemies.filter(e=>e.adaptiveEventId==='last_survivor')
        check(group.length===3 && group.some(e=>e.name===leaderName && e.baseName==='Goblin' && e.prefix==='Champion') &&
          player.killsBySpecies.Cobra===21 &&
          AdaptivePlayerTrolling.completed('last_survivor'),
          'Bestiary history, band identities and completion survive save/replay')
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='last_survivor').length===3,
          'a second milestone does not duplicate the revenge band')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.reset()
        player.steps=1500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!AdaptivePlayerTrolling.serialize().triggerFlags.last_survivor,
          'a normal world cannot activate the adaptive retaliation')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('persists trigger flags while reading debug logging from JSON configuration', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        let state=AdaptivePlayerTrolling.serialize()
        check(Object.keys(state.triggerFlags).length===39 &&
          Object.values(state.triggerFlags).every(v=>v===false) &&
          AdaptivePlayerTrolling.debugTrollingEnabled()===true &&
          !Object.hasOwn(state,'debugTrolling'),
          'all 39 flags start false and debug logging comes from JSON, not save state')
        check(AdaptivePlayerTrolling.setDebugTrolling(true),'debug switch is available')
        const debugMessages=[...document.querySelectorAll('#logpanel > div.trolling-debug')]
        check(debugMessages.length>0 &&
          getComputedStyle(debugMessages.at(-1)).color==='rgb(255, 255, 255)' &&
          Number(getComputedStyle(debugMessages.at(-1)).fontWeight)>=700,
          'tester log entries are bold white, distinct from ordinary information')
        player.killsBySpecies={Wolf:42,Goblin:20}
        player.gold=2001
        AdaptivePlayerTrolling.syncTriggerFlags()
        state=AdaptivePlayerTrolling.serialize()
        check(AdaptivePlayerTrolling.debugTrollingEnabled() && state.triggerFlags.beast_hunter &&
          state.triggerFlags.gold_imp && !state.triggerFlags.relieved_thief &&
          !state.completed.includes('beast_hunter'),
          'ready means threshold observed; it does not spawn or complete events')
        player.killsBySpecies={Wolf:0,Goblin:0}
        player.gold=0
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.beast_hunter,
          'trigger flags record historical qualification, even after threshold lost')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        state=AdaptivePlayerTrolling.serialize()
        check(AdaptivePlayerTrolling.debugTrollingEnabled() && state.triggerFlags.beast_hunter &&
          state.triggerFlags.gold_imp && !state.completed.includes('beast_hunter'),
          'flags survive save and replay while diagnostics use JSON configuration')
        check(AdaptivePlayerTrolling.setDebugTrolling(false) &&
          !AdaptivePlayerTrolling.debugTrollingEnabled(),
          'tester can temporarily disable debug logging')
        const countBeforeQuiet=document.querySelectorAll('#logpanel > div.trolling-debug').length
        player.killsBySpecies={Goblin:40}
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.humanoid_hunter &&
          document.querySelectorAll('#logpanel > div.trolling-debug').length===countBeforeQuiet,
          'disabled logging still tracks triggers without adding debug messages')
        const quietSnapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        check(!Object.hasOwn(quietSnapshot.adaptivePlayerTrolling,'debugTrolling'),
          'console debug overrides never enter save or replay snapshots')
        loadGameFromObject(quietSnapshot,{isReplayInit:true})
        check(AdaptivePlayerTrolling.debugTrollingEnabled(),
          'loading a replay restores the JSON debug default rather than a saved override')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.reset()
        const inactiveState=JSON.stringify(AdaptivePlayerTrolling.serialize())
        const logCount=document.querySelectorAll('#logpanel > div.trolling-debug').length
        const eater={adaptiveEventId:'venom_eater',alive:true,hp:10,maxHp:100}
        const warden={adaptiveEventId:'undead_shield_hunter',alive:true,
          shieldGuardHits:0,shieldGuardBroken:false}
        AdaptivePlayerTrolling.onWorldTurn()
        AdaptivePlayerTrolling.onPlayerMoved()
        AdaptivePlayerTrolling.onFloorChanged()
        AdaptivePlayerTrolling.onEnemyKilled({id:'inactive-test',alive:false})
        check(AdaptivePlayerTrolling.onVenomAttempt(eater)===null && eater.hp===10,
          'disabled trolling cannot heal an existing Venom Eater')
        const arrow=AdaptivePlayerTrolling.shieldHunterArrowHit(warden,20)
        check(arrow.damage===20 && !arrow.absorbed && warden.shieldGuardHits===0,
          'disabled trolling cannot protect an existing Warden or advance its shield')
        check(!AdaptivePlayerTrolling.onEnemyTurn(eater,turnCount) &&
          AdaptivePlayerTrolling.pendingDebtCollector()===null &&
          AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1)===0,
          'ordinary worlds have no adaptive AI, demands or encounter budget')
        AdaptivePlayerTrolling.setDebugTrolling(true)
        check(JSON.stringify(AdaptivePlayerTrolling.serialize())===inactiveState &&
          document.querySelectorAll('#logpanel > div.trolling-debug').length===logCount,
          'ordinary-world hooks neither mutate adaptive state nor emit debug messages')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('uses a single native beast for the Carrion hunt and a durable Graceful rival after five low-HP fights', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const original=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.steps=0;player.gold=0;player.invisibleTurns=0
        player.inventory=[];player.hp=playerMaxHp()
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        for(let y=28;y<=82;y++)for(let x=28;x<=82;x++)map[y][x]='hill'
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        AdaptivePlayerTrolling.reset()
        chance=()=>false // suppress unrelated ordinary-thief checks
        player.hp=Math.max(1,Math.floor(playerMaxHp()*0.19))
        for(let i=0;i<29;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(AdaptivePlayerTrolling.serialize().lowHpTurns===29,'29 low-HP turns do not qualify')
        player.steps=500
        check(!AdaptivePlayerTrolling.onPlayerMoved(),'29 turns do not produce carrion hunter')
        turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        player.steps=1000
        check(AdaptivePlayerTrolling.onPlayerMoved(),'30 turns allow a Carrion hunter')
        let hunter=enemies.find(e=>e.adaptiveEventId==='low_hp_carrion')
        check(!!hunter && hunter.prefix==='Carrion' && hunter.tier>=4,'special native strong beast')
        check(hunter.abilities.includes('carrionInstinct') &&
          !ENEMY_TEMPLATE_BY_NAME[hunter.baseName].abilities.includes('carrionInstinct'),
          'only chosen individual gains carrion instinct')
        check(Math.max(Math.abs(hunter.x-player.x),Math.abs(hunter.y-player.y))>=12,
          'spawns away from the player')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        hunter=enemies.find(e=>e.adaptiveEventId==='low_hp_carrion')
        check(!!hunter && hunter.abilities.includes('carrionInstinct'),
          'individual ability and identity survive replay restoration')
        // The second special hunter cannot start during an active chase.
        const pending=AdaptivePlayerTrolling.serialize()
        pending.recklessLowHpFights=5
        AdaptivePlayerTrolling.restore(pending)
        player.steps=1500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='reckless_fighter'),
          'two special hunts cannot overlap')
        // Finish the first hunt and verify the precise timing of five fights.
        hunter.alive=false;hunter.hp=0
        AdaptivePlayerTrolling.reset();player.steps=0;player.inventory=[createItem('potion')]
        for(let fight=1;fight<=5;fight++){
          player.hp=Math.max(1,Math.floor(playerMaxHp()*0.05))
          AdaptivePlayerTrolling.onCombatAttack(turnCount)
          for(let step=0;step<5;step++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
          check(AdaptivePlayerTrolling.serialize().recklessLowHpFights===fight-1,
            'five complete attack-free turns must pass')
          turnCount++;AdaptivePlayerTrolling.onWorldTurn()
          check(AdaptivePlayerTrolling.serialize().recklessLowHpFights===fight,
            'one credit per finished low-HP fight')
          player.hp=playerMaxHp();turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        }
        player.steps=500
        check(AdaptivePlayerTrolling.onPlayerMoved(),'five fights spawn a Graceful rival')
        let graceful=enemies.find(e=>e.adaptiveEventId==='reckless_fighter')
        check(!!graceful && graceful.prefix==='Graceful' &&
          graceful.grace>playerGrace() && graceful.spd===ENEMY_TEMPLATE_BY_NAME[graceful.baseName].spd,
          'higher GRACE and no extra speed')
        check(graceful.maxHp>=Math.round(ENEMY_TEMPLATE_BY_NAME[graceful.baseName].hp*1.8),
          'strong enough for a longer fight')
        const gracefulSave=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(gracefulSave,{isReplayInit:true})
        graceful=enemies.find(e=>e.adaptiveEventId==='reckless_fighter')
        check(!!graceful && graceful.prefix==='Graceful' && graceful.grace>playerGrace(),
          'Graceful name, stats and prefix survive save/replay')
      } finally {chance=savedChance;loadGameFromObject(original,{isReplayInit:true})}
    })()`))
  })

  it('spawns a gold imp, steals capped coins once and returns the exact amount through a bag', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=55;player.y=55;player.gold=1999;player.invisibleTurns=0
        player.inventory=[]
        for(let y=30;y<=80;y++)for(let x=30;x<=80;x++)map[y][x]='hill'
        enemies=enemies.filter(e=>e.level!==0)
        groundItems=groundItems.filter(g=>(g.level||0)!==0)
        npcs=npcs.filter(n=>n.x<30||n.x>80||n.y<30||n.y>80)
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        check(!AdaptivePlayerTrolling.onFloorChanged(),'1999 gold does not attract the Imp')
        player.gold=3600
        player.steps=500
        check(AdaptivePlayerTrolling.onPlayerMoved(),'500th step creates Gold Imp in native hill habitat')
        let imp=enemies.find(e=>e.adaptiveEventId==='gold_imp')
        check(!!imp && imp.baseName==='Imp' && imp.name==='Gold Imp', 'uses ordinary Imp species and name')
        check(Math.max(Math.abs(imp.x-player.x),Math.abs(imp.y-player.y))>=10,
          'Gold Imp is spawned away from the player')
        const count=AdaptivePlayerTrolling.serialize().floorThreats[
          AdaptivePlayerTrolling.surfaceRegion(player.x,player.y).key]
        check(count===1 && AdaptivePlayerTrolling.completed('gold_imp'),
          'one threat reservation and once-per-character event')
        check(!AdaptivePlayerTrolling.onFloorChanged(),'cannot spawn a second Gold Imp')
        chance=()=>true
        occupied.delete(keyXY(imp.x,imp.y))
        player.x=60;player.y=60;imp.x=59;imp.y=60
        rebuildActiveLevelOccupancy()
        check(tryEnemyTheft(imp),'adjacent Gold Imp steals when a normal thief would succeed')
        check(player.gold===3300 && imp.stolenGold===300 && imp.theftUsed && !imp.stolenItem,
          'steals 10% capped at 300, no backpack item and exactly once')
        check(!tryEnemyTheft(imp),'same Imp cannot steal twice')
        const afterTheft=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(afterTheft,{isReplayInit:true})
        imp=enemies.find(e=>e.adaptiveEventId==='gold_imp')
        check(imp && imp.stolenGold===300 && player.gold===3300,
          'theft gold survives save and replay restoration')
        const id=imp.id,px=imp.x,py=imp.y
        killEnemy(imp,true,'melee')
        const bag=groundItems.find(g=>g.kind==='stolenloot' && g.x===px && g.y===py)
        check(bag?.gold===300 && !bag.item,'killing the thief drops the exact stolen gold')
        const bagSave=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(bagSave,{isReplayInit:true})
        check(!enemies.some(e=>e.id===id),'dead thief stays dead after reload')
        player.x=px;player.y=py;rebuildActiveLevelOccupancy()
        lootSkeletonOrForage()
        check(player.gold===3600 && !groundItems.some(g=>g.kind==='stolenloot' && g.x===px && g.y===py),
          'foraging gold bag refunds exactly once after reload')
      } finally {
        chance=originalChance
        loadGameFromObject(before)
      }
    })()`))
  })

  it('checks ordinary native thief encounters once per new surface region at 10% or 30%', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedChance=chance
      const calls=[]
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=40;player.y=40
        enemies=[];occupied=new Set();npcs=[];groundItems=[]
        for(let y=17;y<=64;y++)for(let x=17;x<=64;x++){
          map[y][x]='forest';grasslandTrees.delete(keyXY(x,y))
        }
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        player.inventory=[]
        chance=p=>{calls.push(p);return false}
        check(!AdaptivePlayerTrolling.onPlayerMoved(),'ordinary thief probability can fail')
        check(calls.length===1 && calls[0]===0.10,'10% baseline for fewer than 15 spare items')
        const area=AdaptivePlayerTrolling.surfaceRegion(player.x,player.y).key
        check(AdaptivePlayerTrolling.serialize().ordinaryThiefChecks.includes(area),'failed roll recorded')
        check(!AdaptivePlayerTrolling.onPlayerMoved() && calls.length===1,'cannot farm a failed roll by moving')

        AdaptivePlayerTrolling.reset()
        player.inventory=Array.from({length:15},()=>makeWeaponItem(1))
        const threatSlots=AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1)
        chance=p=>{calls.push(p);return true}
        const oldEnemyCount=enemies.length
        check(AdaptivePlayerTrolling.onPlayerMoved(),'a successful 30% roll spawns an ordinary thief')
        const thief=enemies.find(e=>e.adaptiveEventId==='unsold_equipment')
        check(calls[calls.length-1]===0.30,'15 spare weapons trigger 30%')
        check(enemies.length===oldEnemyCount+1 && thief?.abilities?.includes('thief'),
          'exactly one species with ordinary thief ability')
        check(enemyBiomes(ENEMY_TEMPLATE_BY_NAME[thief.baseName]).includes(map[thief.y][thief.x]),
          'species is native to the surface tile')
        check(AdaptivePlayerTrolling.surfaceRegion(thief.x,thief.y).key===area,
          'spawn stays inside the visited surface region')
        check(Math.max(Math.abs(thief.x-player.x),Math.abs(thief.y-player.y))>=10 &&
          sanctuaryDistance(thief.x,thief.y)>FLEE_DISTANCE,
          'not on top of player or inside sanctuary')
        check(AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1)===threatSlots,
          'ordinary thief costs no special-threat slots')
        const thiefId=thief.id
        const mid=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(mid,{isReplayInit:true})
        check(enemies.some(e=>e.id===thiefId && e.adaptiveEventId==='unsold_equipment'),
          'new thief survives save/replay restoration')
        const beforeRepeat=calls.length
        check(!AdaptivePlayerTrolling.onPlayerMoved() && calls.length===beforeRepeat,
          'save/replay does not grant a second roll')
        // A second first-visit region is a separate opportunity.
        player.x=112;player.y=40
        for(let y=17;y<=64;y++)for(let x=92;x<=140;x++){
          map[y][x]='forest';grasslandTrees.delete(keyXY(x,y))
        }
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        const another=AdaptivePlayerTrolling.surfaceRegion(player.x,player.y).key
        check(another!==area,'player moved into a distinct surface region')
        check(AdaptivePlayerTrolling.onPlayerMoved(), 'fresh region gets independent roll')
        check(AdaptivePlayerTrolling.serialize().ordinaryThiefChecks.includes(another),
          'second region is recorded separately')
        const count=enemies.filter(e=>e.adaptiveEventId==='unsold_equipment').length
        check(count===2,'one additional ordinary thief per successful region roll')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.reset()
        const total=enemies.length, priorRng=rngState
        check(!AdaptivePlayerTrolling.onPlayerMoved(),'regular world cannot trigger thieves')
        check(enemies.length===total && AdaptivePlayerTrolling.serialize().ordinaryThiefChecks.length===0 &&
          rngState===priorRng,'normal world changes neither spawn nor RNG')
      } finally {
        chance=savedChance
        loadGameFromObject(before,{isReplayInit:true})
      }
    })()`))
  })

  it('spawns a hungry hunter from raw meat, hunts the player and consumes a dropped piece', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.inventory=[createItem('meat',{count:25})]
        player.x=55;player.y=55
        for(let y=30;y<=80;y++)for(let x=30;x<=80;x++)map[y][x]='grass'
        enemies=enemies.filter(e=>e.level!==0)
        groundItems=groundItems.filter(g=>(g.level||0)!==0)
        npcs=npcs.filter(n=>n.x<30||n.x>80||n.y<30||n.y>80)
        snapCameraToPlayer();rebuildActiveLevelOccupancy()
        player.steps=500
        check(AdaptivePlayerTrolling.onPlayerMoved(),'hungry monster spawns at the first scheduled check')
        const monster=enemies.find(e=>e.adaptiveEventId==='hungry_monster')
        check(!!monster && monster.baseName==='Ogre','Ogre native to grassland selected')
        check(monster.hp===86 && monster.maxHp===86 && monster.atk===19 && monster.def===5,
          'HP/DEF reduced and ATK boosted from natural stats')
        check(Math.max(Math.abs(monster.x-player.x),Math.abs(monster.y-player.y))>=10,
          'no adjacent surprise spawns')
        check(AdaptivePlayerTrolling.completed('hungry_monster') &&
          AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1)===1,
          'one lifetime surface region threat reserved')
        check(!AdaptivePlayerTrolling.onFloorChanged(), 'one-time event does not duplicate')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        const hunter=enemies.find(e=>e.id===monster.id)
        check(hunter && hunter.adaptiveEventId==='hungry_monster' && hunter.hp===86,
          'hunter and its altered stats survive save/load')
        occupied.delete(keyXY(hunter.x,hunter.y))
        hunter.x=60;hunter.y=60;hunter.homeX=60;hunter.homeY=60
        player.x=72;player.y=72;player.invisibleTurns=0
        rebuildActiveLevelOccupancy()
        let beforeDistance=Math.max(Math.abs(hunter.x-player.x),Math.abs(hunter.y-player.y))
        turnCount=50
        check(AdaptivePlayerTrolling.takeHungryMonsterTurn(hunter),'pursues beyond normal aggro')
        check(Math.max(Math.abs(hunter.x-player.x),Math.abs(hunter.y-player.y))<beforeDistance,
          'hungry monster pathfinds toward player')
        // Position a dropped pile away from the hero on connected terrain.
        occupied.delete(keyXY(hunter.x,hunter.y));hunter.x=60;hunter.y=60
        rebuildActiveLevelOccupancy()
        const pile={x:62,y:60,level:0,kind:'droppeditem',item:createItem('meat',{count:3}),playerDropped:true}
        groundItems.push(pile)
        turnCount=51
        check(AdaptivePlayerTrolling.takeHungryMonsterTurn(hunter) && !!hunter.hungryTargetMeat,
          'new dropped meat distracts the hunter')
        const distracted=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(distracted,{isReplayInit:true})
        const restored=enemies.find(e=>e.id===hunter.id)
        check(restored.hungryTargetMeat==='0:62,60', 'meat target restored with save')
        const food=groundItems.find(g=>g.kind==='droppeditem' && g.x===62 && g.y===60)
        for(let i=0;i<3 && (restored.x!==62||restored.y!==60);i++) {
          turnCount++
          AdaptivePlayerTrolling.takeHungryMonsterTurn(restored)
        }
        check(restored.x===62&&restored.y===60,'monster reached dropped meat')
        turnCount++
        check(AdaptivePlayerTrolling.takeHungryMonsterTurn(restored),'eating consumes its turn')
        check(food.item.count===2 && restored.hungryIgnoredMeatKeys.includes('0:62,60'),
          'exactly one piece eaten and same pile cannot loop')
        turnCount++
        AdaptivePlayerTrolling.takeHungryMonsterTurn(restored)
        check(food.item.count===2,'leftover stack not eaten again')
        const afterMeal=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(afterMeal,{isReplayInit:true})
        check(enemies.find(e=>e.id===hunter.id).hungryIgnoredMeatKeys.includes('0:62,60'),
          'eaten pile remembered across replay restore')
        const meat2={x:65,y:61,level:0,kind:'droppeditem',item:createItem('meat',{count:1}),playerDropped:true}
        groundItems.push(meat2)
        const loaded=enemies.find(e=>e.id===hunter.id)
        turnCount+=2
        check(AdaptivePlayerTrolling.takeHungryMonsterTurn(loaded) && !!loaded.hungryTargetMeat,
          'fresh meat pile can distract the hunter again')
        AdaptivePlayerTrolling.onHungryMonsterAttacked(loaded)
        check(loaded.hungryIgnoredMeatKeys.includes('0:65,61') && loaded.hungryAngryThroughTurn===turnCount+1,
          'an attack abandons the specific food pile')
        turnCount++
        AdaptivePlayerTrolling.takeHungryMonsterTurn(loaded)
        check(loaded.hungryTargetMeat===null && meat2.item.count===1,
          'attack resumes pursuit without consuming the interrupted lure')
        // Separate character: the same encounter is possible with roasted meat.
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        enemies=[];groundItems=[];occupied=new Set()
        player.inventory=[createItem('roastedMeat',{count:25})]
        player.x=55;player.y=55;player.steps=500
        rebuildActiveLevelOccupancy()
        check(AdaptivePlayerTrolling.onPlayerMoved(),
          '25 roasted meat alone qualifies a hungry hunter')
        check(enemies.some(e=>e.adaptiveEventId==='hungry_monster'),
          'roasted meat produces the same persistent hungry enemy')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('counts distinct ignored Herbalist Services visits and scatters six ground mushrooms on a new floor', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const herb=npcs.find(n=>n.name==='Herbalist')
        check(!!herb,'herbalist exists')
        currentZ=0;currentCave=-1;map=surfaceMap
        player.inventory=[createItem('mushroom',{count:5})]
        player.gold=100
        player.x=herb.x;player.y=herb.y-1
        tryOpenTrade(herb) // The normal replay-recorded service-opening path.
        check(AdaptivePlayerTrolling.serialize().herbalistVisit!==null,'Herbalist visit started')
        tryOpenTrade(herb)
        player.x=herb.x+3
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().herbalistIgnoredVisits===1,
          'reopening Services while adjacent does not duplicate a visit')
        player.x=herb.x;player.y=herb.y-1
        tryOpenTrade(herb)
        purifyMushrooms() // A successful actual service use disqualifies visit.
        player.x=herb.x+3
        AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().herbalistIgnoredVisits===1,
          'purifying mushrooms prevents a second ignored visit')
        player.inventory=[createItem('mushroom',{count:5})]
        for (let visit=2;visit<=3;visit++) {
          player.x=herb.x;player.y=herb.y-1
          tryOpenTrade(herb)
          player.x=herb.x+3
          AdaptivePlayerTrolling.onWorldTurn()
          check(AdaptivePlayerTrolling.serialize().herbalistIgnoredVisits===visit,
            'independent untreated visit '+visit)
        }
        const progress=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(progress)
        check(AdaptivePlayerTrolling.serialize().herbalistIgnoredVisits===3,
          'ignored visit counter persists')
        currentZ=-1;currentCave=0;map=undergroundMap
        undergroundDiscovered=undergroundDiscoveredL1
        player.x=22;player.y=26
        for(let y=23;y<=39;y++)for(let x=20;x<=55;x++)map[y][x]='cavefloor'
        enemies=enemies.filter(e=>(e.level??0)!==-1)
        groundItems=groundItems.filter(g=>(g.level??0)!==-1)
        caveDecorations=caveDecorations.filter(d=>d.level!==-1)
        rebuildActiveLevelOccupancy()
        check(AdaptivePlayerTrolling.onFloorChanged(),'first suitable untouched floor spawns cluster')
        const mushrooms=groundItems.filter(g=>g.adaptiveEventId==='ignored_mushroom_cleaning')
        check(mushrooms.length===6 && mushrooms.every(g=>g.kind==='droppeditem'),
          'six real ground pickups, not a chest')
        check(mushrooms.filter(g=>g.item.kind==='mushroom').length===5 &&
          mushrooms.filter(g=>g.item.kind==='ediblemushroom').length===1,
          'mostly untreated mushroom reward')
        check(new Set(mushrooms.map(g=>keyXY(g.x,g.y))).size===6,
          'six separate, unoccupied floor cells')
        check(!AdaptivePlayerTrolling.onFloorChanged(), 'reentry does not duplicate cluster')
        const spawned=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(spawned)
        check(AdaptivePlayerTrolling.completed('ignored_mushroom_cleaning') &&
          groundItems.filter(g=>g.adaptiveEventId==='ignored_mushroom_cleaning').length===6,
          'items and completion survive save/load')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('spawns a fungus-bound Mushroom Prophet after 30 mushrooms and grants a real warning turn', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=-1;currentCave=-1;map=undergroundMap
        undergroundDiscovered=undergroundDiscoveredL1
        player.x=20;player.y=28;player.hp=player.maxHp
        player.poisonTurns=0;player.invisibleTurns=0
        // Isolate one reachable natural fungus patch from variable worldgen,
        // without requiring particular seeded cave layouts.
        for(let y=25;y<=31;y++)for(let x=18;x<=60;x++)map[y][x]='cavefloor'
        enemies=enemies.filter(e=>(e.level??0)!==-1)
        groundItems=groundItems.filter(g=>(g.level??0)!==-1)
        caveDecorations=caveDecorations.filter(d=>d.level!==-1)
        caves=[{entrances:[{x:20,y:28}]}]
        caveDecorations.push({x:44,y:28,kind:'mushrooms',level:-1,levelKind:'chain',caveIndex:-1})
        rebuildActiveLevelOccupancy()

        for(let i=0;i<29;i++) AdaptivePlayerTrolling.onMushroomsCollected(1)
        check(AdaptivePlayerTrolling.serialize().mushroomsCollected===29,
          '29 acquired mushrooms do not qualify')
        check(!AdaptivePlayerTrolling.onFloorChanged(),
          'no prophet before the threshold')
        addMushroom() // The ordinary world acquisition hook, not a test-only counter.
        check(AdaptivePlayerTrolling.serialize().mushroomsCollected===30,
          'world mushroom acquisition reaches 30')
        const pre=AdaptivePlayerTrolling.serialize()
        caveDecorations=caveDecorations.filter(d=>d.kind!=='mushrooms'||d.level!==-1)
        player.steps=500
        check(!AdaptivePlayerTrolling.onPlayerMoved() && !AdaptivePlayerTrolling.completed('mushroom_prophet'),
          'no natural fungi postpones the event')
        caveDecorations.push({x:44,y:28,kind:'mushrooms',level:-1,levelKind:'chain',caveIndex:-1})
        player.steps=1000
        check(AdaptivePlayerTrolling.onPlayerMoved(),
          'next scheduled check near natural fungi spawns a prophet')
        let prophet=enemies.find(e=>e.adaptiveEventId==='mushroom_prophet')
        check(!!prophet && prophet.baseName==='Mushroom Prophet' &&
          prophet.maxHp===100 && prophet.atk===14 && prophet.def===4 && prophet.spd===4 &&
          prophet.tier===3, 'approved melee Prophet stats')
        check(!undergroundTileVisible(prophet.x,prophet.y) &&
          Math.max(Math.abs(prophet.x-44),Math.abs(prophet.y-28))<=3,
          'Prophet spawns unseen near the fungus patch')
        check(AdaptivePlayerTrolling.serialize().floorThreats['chain:-1:-1']===1 &&
          AdaptivePlayerTrolling.completed('mushroom_prophet'),
          'event uses one persistent cave threat slot')
        check(!AdaptivePlayerTrolling.onFloorChanged(), 'repeat floor entry cannot duplicate it')
        player.x=prophet.x-1;player.y=prophet.y
        rebuildActiveLevelOccupancy()
        const hpBefore=player.hp
        enemyTurn()
        check(prophet.prophetWarnedAtTurn===turnCount && player.hp===hpBefore,
          'first encounter announces a warning without attack or movement')
        const mid=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(mid)
        prophet=enemies.find(e=>e.adaptiveEventId==='mushroom_prophet')
        check(!!prophet && Number.isInteger(prophet.prophetWarnedAtTurn) &&
          AdaptivePlayerTrolling.serialize().mushroomsCollected===30,
          'warning turn and mushroom count survive save/load')
        check(AdaptivePlayerTrolling.onEnemyTurn(prophet,turnCount+1)===false,
          'warning is once-only; next turn uses ordinary hostile AI')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('summons exactly one double-strength Champion Scarab on the 36th different sand dig', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const old={enemyTurn,npcTurn,updateHud,render,runAnimationLoop,chance,randInt}
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        // A deterministic sand patch far outside the Temple sanctuary
        // provides a reachable, uncongested emergence site.
        let origin=null
        for(let y=14;y<MAP_H-14&&!origin;y++)for(let x=14;x<MAP_W-14;x++)
          if(sanctuaryDistance(x,y)>FLEE_DISTANCE+15){origin={x,y};break}
        check(!!origin,'test world provides an outdoor sand region')
        for(let y=origin.y-9;y<=origin.y+9;y++)
          for(let x=origin.x-9;x<=origin.x+9;x++)map[y][x]='sand'
        player.x=origin.x;player.y=origin.y;player.hp=player.maxHp
        dugSandTiles=new Set()
        enemies=enemies.filter(e=>e.level!==0 ||
          Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))>10)
        rebuildActiveLevelOccupancy()
        enemyTurn=()=>{};npcTurn=()=>{};updateHud=()=>{};render=()=>{};runAnimationLoop=()=>{}
        chance=()=>false;randInt=()=>100
        for(let i=0;i<35;i++) check(!AdaptivePlayerTrolling.onNewSandDig(),'early dig does not spawn special monster')
        check(AdaptivePlayerTrolling.serialize().dugSandCount===35,'35 digs are counted')
        const mid=AdaptivePlayerTrolling.serialize()
        AdaptivePlayerTrolling.reset()
        AdaptivePlayerTrolling.restore(mid)
        const count=enemies.length
        tryDig({recordReplay:false})
        const scarabs=enemies.filter(e=>e.adaptiveEventId==='ancient_scarab')
        check(scarabs.length===1 && enemies.length===count+1,'36th real dig wakes one scarab')
        const scarab=scarabs[0]
        check(scarab.name==='Champion Scarab' && scarab.prefix==='Champion' &&
          scarab.baseName==='Scarab' && scarab.maxHp===38 && scarab.hp===38 &&
          scarab.atk===8 && scarab.def===12 && scarab.spd===12,
          'Champion modifier is followed by doubling its core combat stats')
        const range=Math.abs(scarab.x-player.x)+Math.abs(scarab.y-player.y)
        check(range>=4 && range<=8 && map[scarab.y][scarab.x]==='sand',
          'monster emerges at a safe, reachable sand position')
        check(AdaptivePlayerTrolling.serialize().floorThreats[AdaptivePlayerTrolling.surfaceRegion(player.x,player.y).key]===1,
          'special scarab counts toward the surface special-threat limit')
        tryDig({recordReplay:false})
        check(enemies.filter(e=>e.adaptiveEventId==='ancient_scarab').length===1 &&
          AdaptivePlayerTrolling.serialize().dugSandCount===36,
          'repeated digging cannot count again or resummon the monster')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        check(enemies.some(e=>e.adaptiveEventId==='ancient_scarab' && e.maxHp===38),
          'Champion Scarab survives save/replay state restoration')
        check(AdaptivePlayerTrolling.serialize().completed.includes('ancient_scarab'),
          'completion and count survive the save')
      } finally {
        enemyTurn=old.enemyTurn;npcTurn=old.npcTurn;updateHud=old.updateHud
        render=old.render;runAnimationLoop=old.runAnimationLoop
        chance=old.chance;randInt=old.randInt
        loadGameFromObject(before)
      }
    })()`))
  })

  it('reserves two special threats per world-sized surface region, not globally', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const cfg=JSON.parse(JSON.stringify(AdaptivePlayerTrolling.serialize()))
        const size=MAP_W
        // Every supported world size uses similarly sized geographic regions.
        const spec=[[184,2],[210,3],[235,3],[260,3],[290,4],[320,4]]
        const originalW=MAP_W,originalH=MAP_H
        try {
          for(const [width,regions] of spec){
            MAP_W=width;MAP_H=width
            const last=AdaptivePlayerTrolling.surfaceRegion(width-1,width-1)
            check(last.cols===regions && last.rows===regions &&
              last.col===regions-1 && last.row===regions-1,
              'surface region count follows world size '+width)
          }
        } finally {MAP_W=originalW;MAP_H=originalH}
        const a=AdaptivePlayerTrolling.surfaceRegion(10,10)
        const b=AdaptivePlayerTrolling.surfaceRegion(Math.floor(MAP_W*0.75),10)
        check(a.key!==b.key,'distant parts of surface have independent regions')
        check(AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1,10,10)===2,
          'two slots initially available within a region')
        check(AdaptivePlayerTrolling.recordThreat('test-region-1','surface',0,-1,1,10,10),
          'first regional threat reserves a place')
        check(AdaptivePlayerTrolling.recordThreat('test-region-2','surface',0,-1,1,11,11),
          'second threat in the same region reserves the last place')
        check(!AdaptivePlayerTrolling.recordThreat('test-region-3','surface',0,-1,1,12,12),
          'third threat in the same region is refused')
        check(AdaptivePlayerTrolling.recordThreat('test-region-4','surface',0,-1,1,Math.floor(MAP_W*0.75),10),
          'another surface region still accepts its own threats')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot)
        check(AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1,10,10)===0 &&
          AdaptivePlayerTrolling.availableThreatSlots('surface',0,-1,Math.floor(MAP_W*0.75),10)===1,
          'save/load restores both regional budgets separately')
        check(AdaptivePlayerTrolling.serialize().floorThreats[a.key]===2 &&
          AdaptivePlayerTrolling.serialize().floorThreats[b.key]===1,
          'region keys remain stable across saves and replay snapshots')
      } finally {loadGameFromObject(before)}
    })()`))
  })

  it('uses the lowered Wyvern defense, flat Blind XP, and eight-neighbor lake ice rule', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      check(ENEMY_TEMPLATE_BY_NAME.Wyvern.def===2,'Wyvern defense is two')
      check(MONSTER_XP_WEIGHTS.abilityBonuses.blind===15,'Blind adds fifteen XP')
      const ordinary={maxHp:30,atk:7,def:3,spd:4,grace:0,abilities:[]}
      const blind={...ordinary,abilities:['blind']}
      check(xpForEnemy(blind)-xpForEnemy(ordinary)===15,'Blind increases the actual award by fifteen')
      map=surfaceMap;currentZ=0
      const x=28,y=28
      for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)map[yy][xx]='water'
      map[y][x]='ice';map[y-1][x-1]='grass'
      meltSurroundedLakeIce()
      check(map[y][x]==='ice','seven water neighbors do not melt ice')
      map[y-1][x-1]='water';meltSurroundedLakeIce()
      check(map[y][x]==='water','eight water neighbors melt ice')
      map[y][x]='crackingice';map[y-1][x-1]='ice';meltSurroundedLakeIce()
      check(map[y][x]==='crackingice','cracked ice also requires eight water neighbors')
      map[y-1][x-1]='water';meltSurroundedLakeIce()
      check(map[y][x]==='water','isolated cracked ice melts')
    })()`))
  })

  it('adds low-tier surface packs on top of the normal spawn population', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const cfg=WORLD_GEN_CONFIG.surfaceEnemies
      const oldWeights=cfg.tierWeights,oldChance=cfg.groupChanceByTier,oldSize=cfg.groupSizeRange
      const oldEnemies=enemies,oldOccupied=occupied,oldRng=rngState
      try {
        currentZ=0;map=surfaceMap
        cfg.tierWeights=[1,0,0,0,0];cfg.groupSizeRange=[3,3]
        cfg.groupChanceByTier={'1':0,'2':0}
        enemies=[];occupied=new Set();rngState=62123
        spawnEnemies()
        const normal=enemies.filter(e=>e.ordinarySurface).length
        cfg.groupChanceByTier={'1':1,'2':0}
        enemies=[];occupied=new Set();rngState=62123
        spawnEnemies()
        const packed=enemies.filter(e=>e.ordinarySurface)
        check(normal>0&&packed.length>normal*1.5,
          'groups are extra monsters, not replacements for the normal budget')
        check(new Set(packed.map(e=>keyXY(e.x,e.y))).size===packed.length,
          'every extra group member occupies its own tile')
      } finally {
        cfg.tierWeights=oldWeights;cfg.groupChanceByTier=oldChance;cfg.groupSizeRange=oldSize
        enemies=oldEnemies;occupied=oldOccupied;rngState=oldRng
      }
    })()`))
  })

  it('initializes Lich tombstone inscriptions and never repeats one per world', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      check(tombstonesRemaining===TOMBSTONE_INSCRIPTIONS.length && tombstonesRemaining>0,'full initial pool')
      const originalChance=chance, before=rngState
      try {
        chance=()=>true
        const lich={name:'Lich',baseName:'Lich'}
        const uncredited={name:'Skeleton',baseName:'Skeleton'}
        check(!maybeDropTombstone(uncredited),'non-Liches cannot drop an inscription')
        for(let i=0;i<TOMBSTONE_INSCRIPTIONS.length;i++) check(maybeDropTombstone(lich),'Lich inscription '+i)
        const inscriptions=player.inventory.filter(i=>i.kind==='tombstone').map(i=>i.inscription)
        check(new Set(inscriptions).size===TOMBSTONE_INSCRIPTIONS.length,'unique inscriptions')
        check(tombstonesRemaining===0 && !maybeDropTombstone(lich),'exhausted pool')
        check(rngState===before,'forced drop and inventory updates do not alter gameplay RNG')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(tombstonesRemaining===0 && !maybeDropTombstone(lich),'depleted pool survives save/replay')
      } finally {chance=originalChance}
    })()`))
  })

  it('hides inactive Carrion Instinct and shows it below 20% HP', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      const e={...ENEMY_TEMPLATE_BY_NAME.Hyena,baseName:'Hyena',name:'Hyena',level:0,
        x:player.x+3,y:player.y,alive:true,hp:30,maxHp:30,equipment:null,alarmed:false}
      enemies=[e]; player.maxHp=100;player.hp=100
      let info=tileInspectInfo(e.x,e.y)
      check(info?.enemy===e && !info.html.includes('Carrion Instinct'),'inactive ability hidden')
      player.hp=19
      info=tileInspectInfo(e.x,e.y)
      check(info.html.includes('Carrion Instinct · active'),'active ability shown')
      player.hp=20
      check(!tileInspectInfo(e.x,e.y).html.includes('Carrion Instinct'),'exact threshold hidden')
    })()`))
  })

  it('suppresses ambushes inside Temple sanctuary without consuming RNG', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      currentZ=0;map=surfaceMap;player.race='human';player.invisibleTurns=0;player.godInvisible=false;player.godMode=false
      const x=spawnPoint.x+FLEE_DISTANCE,y=spawnPoint.y
      map[y][x]='forest'
      const originalChance=chance
      let called=0
      try {
        chance=()=>{called++;return true}
        const rngBefore=rngState, count=enemies.length
        maybeSpawnForestAmbush(x,y)
        check(called===0 && rngBefore===rngState && enemies.length===count,'protected forest tile has no ambush roll')
        // Just outside the protected boundary, an ambush roll is allowed, but
        // it must never place an attacker one tile inside the retreat zone.
        const edge=spawnPoint.x+FLEE_DISTANCE+1
        for (const [dx,dy] of DIRS8) map[y+dy][edge+dx]='grass'
        map[y][edge]='forest'
        map[y][edge-1]='forest'
        maybeSpawnForestAmbush(edge,y)
        check(called===1 && enemies.length===count,'protected spawn candidate rejected on sanctuary boundary')
      } finally {chance=originalChance}
    })()`))
  })

  it('keeps cursed weapon gear inert in backpack but ticks when worn', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      const gear={kind:'artifact',artifactSlot:'weapon',name:'Cursed Blade',identified:true,
        curse:{types:['gold'],everyTurns:1},curseTimer:0,bonuses:{atk:10}}
      player.inventory=[gear];player.equip.weapon=null;player.gold=100
      const before=rngState
      for(let i=0;i<10;i++)tickArtifactCurses()
      check(gear.curseTimer===0 && player.gold===100 && rngState===before,'backpack gear has no curse effect or roll')
      player.equip.weapon=gear
      tickArtifactCurses()
      check(player.gold<100,'equipped gear curse triggers')
      player.equip.weapon=null
      const gold=player.gold, rng=rngState
      for(let i=0;i<10;i++)tickArtifactCurses()
      check(player.gold===gold && rngState===rng,'unequipped curse suspends')
      const trinket={kind:'artifact',artifactSlot:'trinket',name:'Cursed Charm',identified:true,
        curse:{types:['gold'],everyTurns:1},curseTimer:0}
      player.inventory=[gear,trinket]
      tickArtifactCurses()
      check(player.gold<gold,'carried trinket curse remains active')
    })()`))
  })

  it('places at most two cosmetic webs at distance 2–3 from each spider spawn', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,message)=>{if(!ok)throw new Error(message)}
      const spider={...enemies.find(e=>e.level===0),baseName:'Giant Spider',name:'Giant Spider',
        x:100,y:100,level:0,alive:true}
      enemies=[spider];npcs=[];groundItems=[]
      for(let y=96;y<=104;y++)for(let x=96;x<=104;x++)surfaceMap[y][x]='grass'
      const rngBefore=rngState
      spawnCaveDecorations()
      const webs=caveDecorations.filter(p=>p.level===0 && p.levelKind==='surface' && p.kind==='web')
      check(webs.length>0 && webs.length<=2,'up to two webs generated')
      check(webs.every(p=>p.kind==='web' && p.levelKind==='surface' &&
        Math.max(Math.abs(p.x-100),Math.abs(p.y-100))>=2 &&
        Math.max(Math.abs(p.x-100),Math.abs(p.y-100))<=3),'all webs 2–3 tiles from original spider position')
      check(new Set(webs.map(p=>keyXY(p.x,p.y))).size===webs.length,'unique tile per web')
      const first=JSON.stringify(caveDecorations)
      spawnCaveDecorations()
      check(JSON.stringify(caveDecorations)===first && rngState===rngBefore,'hash-based decoration deterministic')
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      loadGameFromObject(saved,{isReplayInit:true})
      check(JSON.stringify(caveDecorations)===first,'webs survive save and replay restoration')
    })()`))
  })

  it('reveals an Uninvited Guest after nine campfire lightings, preserving both outcomes', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        let center=null
        for(let y=20;y<MAP_H-20&&!center;y++)for(let x=20;x<MAP_W-20;x++)
          if(sanctuaryDistance(x,y)>FLEE_DISTANCE+25){center={x,y};break}
        check(!!center,'surface has a safe campfire region')
        for(let y=center.y-9;y<=center.y+9;y++)for(let x=center.x-9;x<=center.x+9;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        player.x=center.x;player.y=center.y
        player.hp=playerMaxHp();player.poisonTurns=0;player.invisibleTurns=0
        enemies=[];npcs=[];groundItems=[];occupied=new Set()
        const fire={kind:'campfire',x:center.x+1,y:center.y,level:0,
          levelKind:'surface',caveIndex:-1,burnUntil:0}
        groundItems.push(fire)
        player.inventory=[createItem('flint'),createItem('brushwood',{count:12})]
        for(let i=0;i<8;i++){
          fire.burnUntil=0
          check(Campfires.perform(fire,'light',null),'completed ignition '+(i+1))
          check(!AdaptivePlayerTrolling.completed('uninvited_guest'),'no early guest')
        }
        check(AdaptivePlayerTrolling.serialize().campfireLightings===8,'eight distinct lightings counted')
        check(!AdaptivePlayerTrolling.onCampfireLit({kind:'dwarvenstove',level:0,levelKind:'surface'}),
          'stoves cannot qualify')
        check(AdaptivePlayerTrolling.serialize().campfireLightings===8,'stoves do not add to trigger')

        chance=()=>true // Force friendly outcome, without changing geometry or pickup RNG.
        fire.burnUntil=0
        const hpBefore=player.hp
        check(Campfires.perform(fire,'light',null),'ninth lighting triggers visitor')
        let guest=enemies.find(e=>e.adaptiveEventId==='uninvited_guest')
        check(!!guest && guest.guestDisposition==='friendly' &&
          guest.maxHp===80 && guest.atk===14 && guest.def===4 && guest.spd===6 && guest.tier===3,
          'friendly guest has approved melee stats')
        check(player.hp===hpBefore && guest.aggro===0,'friendly guest does not attack')
        check(!campOpen && AdaptivePlayerTrolling.completed('uninvited_guest'),
          'camping panel closes for the encounter and event completes once')
        check(AdaptivePlayerTrolling.serialize().floorThreats[
          AdaptivePlayerTrolling.surfaceRegion(fire.x,fire.y).key]===1,
          'guest uses a regional threat slot')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        guest=enemies.find(e=>e.adaptiveEventId==='uninvited_guest')
        check(guest?.guestDisposition==='friendly' && !!guest.guestMealKind,
          'meal choice and friendly state survive save/load')
        player.x=guest.x-1;player.y=guest.y
        map[player.y][player.x]='sand' // Accepting food, not shovel-digging, wins F priority.
        player.inventory.push(createItem('shovel'))
        rebuildActiveLevelOccupancy()
        lootSkeletonOrForage()
        check(!enemies.some(e=>e.adaptiveEventId==='uninvited_guest' && e.alive),
          'accepting the offered meal removes the guest')
        check(groundItems.some(g=>g.kind==='droppeditem' && g.adaptiveEventId==='uninvited_guest' &&
          ['roastedMeat','bakedPotato','cookedFish'].includes(g.item.kind)),
          'the visitor leaves real cooked food on the ground for pickup')
        check(!AdaptivePlayerTrolling.onCampfireLit(fire),'event never repeats')

        // Rebuild an independent character to test the hostile branch.
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        enemies=[];npcs=[];groundItems=[fire];occupied=new Set()
        player.x=center.x;player.y=center.y;player.hp=playerMaxHp()
        player.inventory=[createItem('flint'),createItem('brushwood',{count:12})]
        chance=()=>false
        for(let i=0;i<9;i++){
          fire.burnUntil=0
          check(Campfires.perform(fire,'light',null),'hostile branch lighting '+(i+1))
        }
        guest=enemies.find(e=>e.adaptiveEventId==='uninvited_guest')
        check(!!guest && guest.guestDisposition==='warning' && guest.aggro===0,
          'hostile intent is revealed without an immediate enemy attack')
        check(guest.summonedTurn===turnCount && guest.guestHostileAtTurn===turnCount+1,
          'hostile arrival skips the summoning enemy turn')
        check(AdaptivePlayerTrolling.onEnemyTurn(guest,turnCount)===true,
          'guest cannot attack in the warning turn')
        const hostileSave=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(hostileSave)
        guest=enemies.find(e=>e.adaptiveEventId==='uninvited_guest')
        check(!!guest && guest.guestDisposition==='warning' &&
          guest.guestHostileAtTurn===turnCount+1,'warning survives save/load')
        check(AdaptivePlayerTrolling.onEnemyTurn(guest,turnCount+1)===false &&
          guest.guestDisposition==='hostile' && guest.aggro===4,
          'guest activates ordinary combat only after the next player action')
      } finally {
        chance=savedChance
        loadGameFromObject(before)
      }
    })()`))
  })

  it('places unused-healing remains only underground at a scheduled checkpoint', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const savedChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        chance=()=>false
        const setUnderground=()=>{
          currentZ=-1;currentCave=-1;map=undergroundMap
          player.x=40;player.y=40
          for(let y=24;y<=68;y++)for(let x=24;x<=68;x++)map[y][x]='cavefloor'
          enemies=[];groundItems=[];occupied=new Set()
          rebuildActiveLevelOccupancy()
          invalidateUndergroundFov()
        }
        player.inventory=[createItem('potion',{count:1})]
        AdaptivePlayerTrolling.onPlayerDied(null)
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===0,
          'only one potion on death does not count')
        player.inventory=[createItem('potion',{count:2})]
        AdaptivePlayerTrolling.onPlayerDied(null)
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===1,
          'environmental death with two potions counts')
        setUnderground();player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!groundItems.some(g=>g.adaptiveEventId==='unused_healing'),
          'one death never spawns the reward')
        AdaptivePlayerTrolling.onPlayerDied({baseName:'Giant Rat'})
        check(AdaptivePlayerTrolling.serialize().unusedHealingDeaths===2,
          'enemy death with two potions finishes qualification')
        currentZ=0;currentCave=-1;map=surfaceMap
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!groundItems.some(g=>g.adaptiveEventId==='unused_healing'),
          'a surface checkpoint never creates healing remains')
        setUnderground();player.steps=1500
        check(AdaptivePlayerTrolling.onPlayerMoved(),
          'next underground checkpoint places the reward')
        const bodies=groundItems.filter(g=>g.adaptiveEventId==='unused_healing')
        check(bodies.length===1 && bodies[0].kind==='deadbody' &&
          bodies[0].gear?.kind==='potion' && bodies[0].gear?.count===2 && bodies[0].level===-1,
          'one searchable corpse carries two Life Potions underground')
        check(Math.max(Math.abs(bodies[0].x-player.x),Math.abs(bodies[0].y-player.y))>=10 &&
          !undergroundTileVisible(bodies[0].x,bodies[0].y),
          'the remains are out of sight and away from player')
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('unused_healing') &&
          groundItems.filter(g=>g.adaptiveEventId==='unused_healing').length===1,
          'completion and corpse survive replay/load')
        player.x=bodies[0].x;player.y=bodies[0].y
        rebuildActiveLevelOccupancy()
        const potions=player.inventory.reduce((n,i)=>n+(i.kind==='potion'?(i.count||1):0),0)
        lootSkeletonOrForage()
        check(player.inventory.reduce((n,i)=>n+(i.kind==='potion'?(i.count||1):0),0)===potions+2,
          'searching the remains recovers both potions')
        player.steps=2000;AdaptivePlayerTrolling.onPlayerMoved()
        check(groundItems.filter(g=>g.adaptiveEventId==='unused_healing').length===1,
          'later checkpoints never duplicate the remains')
      } finally {
        chance=savedChance
        loadGameFromObject(before,{isReplayInit:true})
      }
    })()`))
  })


  it('makes ordinary beasts less eager to initiate combat after mainly humanoid kills', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const beast={...ENEMY_TEMPLATE_BY_NAME.Wolf,baseName:'Wolf',x:-20,y:-20,
          aware:false,alarmed:false,alive:true}
        player.killsBySpecies={'Goblin':29,'Wolf':10}
        check(!AdaptivePlayerTrolling.humanoidHunterActive(),'29 humanoid kills insufficient')
        player.killsBySpecies.Goblin++
        AdaptivePlayerTrolling.onEnemyKilled({id:'credited-goblin',baseName:'Goblin',alive:false})
        check(AdaptivePlayerTrolling.humanoidHunterActive(),
          'a credited kill invalidates derived totals even when the Bestiary object is unchanged')
        player.killsBySpecies={'Goblin':30,'Wolf':12}
        check(AdaptivePlayerTrolling.humanoidHunterActive(),'30 humanoid kills at 71% qualify')
        const rolls=[]
        chance=p=>{rolls.push(p);return false}
        check(!AdaptivePlayerTrolling.beastMayInitiateCombat(beast) && rolls[0]===0.75,
          'qualifying ordinary beast has 75% initiation chance')
        beast.aware=true
        check(AdaptivePlayerTrolling.beastMayInitiateCombat(beast) && rolls.length===1,
          'an already engaged beast never hesitates')
        beast.aware=false;beast.alarmed=true
        check(AdaptivePlayerTrolling.beastMayInitiateCombat(beast) && rolls.length===1,
          'alarmed beasts retaliate normally')
        beast.alarmed=false
        const ghost={...ENEMY_TEMPLATE_BY_NAME.Ghost,baseName:'Ghost',aware:false,alarmed:false}
        check(AdaptivePlayerTrolling.beastMayInitiateCombat(ghost) && rolls.length===1,
          'undead are unaffected')
        player.killsBySpecies={'Goblin':30,'Wolf':13}
        check(!AdaptivePlayerTrolling.humanoidHunterActive() &&
          AdaptivePlayerTrolling.beastMayInitiateCombat(beast),'falling below 70% disables modifier')
        activeWorldTraits=[]
        check(AdaptivePlayerTrolling.beastMayInitiateCombat(beast),'ordinary world unchanged')
      } finally {
        chance=oldChance
        loadGameFromObject(before,{isReplayInit:true})
      }
    })()`))
  })

  it('leaves an unidentified green potion on the ground after twenty drinks', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const oldChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        player.inventory=[];player.killsBySpecies={}
        currentZ=-1;currentCave=-1;map=undergroundMap
        player.x=40;player.y=40
        for(let y=24;y<=68;y++)for(let x=24;x<=68;x++)map[y][x]='cavefloor'
        enemies=[];groundItems=[];occupied=new Set()
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        for(let i=0;i<19;i++)AdaptivePlayerTrolling.onPotionDrunk()
        check(AdaptivePlayerTrolling.serialize().potionsDrunk===19,'count real drinks')
        check(!AdaptivePlayerTrolling.completed('strange_green_potion'),'19 insufficient')
        AdaptivePlayerTrolling.onPotionDrunk()
        player.steps=500
        check(AdaptivePlayerTrolling.onPlayerMoved(),'scheduled check places potion')
        const drops=groundItems.filter(g=>g.adaptiveEventId==='strange_green_potion')
        check(drops.length===1 && drops[0].kind==='droppeditem' &&
          drops[0].item?.kind==='strangeGreenPotion','potion lies on the ground, not inside a chest')
        check(!undergroundTileVisible(drops[0].x,drops[0].y),'spawn outside view')
        check(itemDefinition('strangeGreenPotion').icon==='img/tiles/strange-green-potion.png',
          'uses its own green potion sprite, not a borrowed item image')
        check(groundGlyph(drops[0]).ch==='!' && groundGlyph(drops[0]).color==='#61d478',
          'ASCII mode keeps its green exclamation mark')
        const potionSprite='img/tiles/strange-green-potion.png'
        const alreadyLoaded=preloadedImages.has(potionSprite)
        if (!alreadyLoaded) preloadedImages.set(potionSprite,{})
        try {
          check(droppedInventoryVisual(drops[0].item)?.image===potionSprite,
            'tile mode renders the dedicated sprite from the ground')
        } finally {
          if (!alreadyLoaded) preloadedImages.delete(potionSprite)
        }
        const snapshot=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(snapshot,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().potionsDrunk===20 &&
          AdaptivePlayerTrolling.completed('strange_green_potion'),'progress and completion survive save')
        player.x=drops[0].x;player.y=drops[0].y
        lootSkeletonOrForage()
        check(player.inventory.some(i=>i.kind==='strangeGreenPotion'),
          'requires ordinary manual pickup')
        check(!itemDefinition('strangeGreenPotion').actions.some(a=>a.handler==='identify'),
          'cannot be identified')
        chance=()=>true
        const idx=player.inventory.findIndex(i=>i.kind==='strangeGreenPotion')
        useStrangeGreenPotion(idx)
        check(player.confusionTurns>0 && player.confusionSourceId==null,
          'confusion outcome reuses standard status')
        check(!player.inventory.some(i=>i.kind==='strangeGreenPotion'),
          'drinking consumes the potion')
        check(AdaptivePlayerTrolling.serialize().potionsDrunk===21,
          'special potion counts as a drink but does not repeat the event')
        player.steps=1000;AdaptivePlayerTrolling.onPlayerMoved()
        check(groundItems.filter(g=>g.adaptiveEventId==='strange_green_potion').length===0,
          'potion is never duplicated')
      } finally {
        chance=oldChance
        loadGameFromObject(before,{isReplayInit:true})
      }
    })()`))
  })

  it('requires two damaging crossings and places water bait across a safe land detour', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=57;player.y=58;player.steps=0
        for(let y=46;y<=78;y++)for(let x=45;x<=80;x++)map[y][x]='grass'
        for(let y=52;y<=65;y++)for(let x=60;x<=64;x++)map[y][x]='water'
        enemies=enemies.filter(e=>e.level!==0)
        groundItems=groundItems.filter(g=>(g.level||0)!==0)
        npcs=npcs.filter(n=>n.x<45||n.x>80||n.y<46||n.y>78)
        occupied=new Set();rebuildActiveLevelOccupancy()
        // A brief dip and an unhurt crossing are not drowning journeys.
        AdaptivePlayerTrolling.onWaterEntered({x:57,y:58})
        AdaptivePlayerTrolling.onWaterMoved()
        AdaptivePlayerTrolling.onWaterExited({x:57,y:58})
        check(AdaptivePlayerTrolling.serialize().drowningCrossings===0,'dipping does not count')
        AdaptivePlayerTrolling.onWaterEntered({x:57,y:58})
        AdaptivePlayerTrolling.onWaterMoved();AdaptivePlayerTrolling.onWaterMoved()
        AdaptivePlayerTrolling.onWaterExited({x:65,y:58})
        check(AdaptivePlayerTrolling.serialize().drowningCrossings===0,
          'a crossing without drowning damage does not count')
        for(let i=0;i<2;i++){
          AdaptivePlayerTrolling.onWaterEntered({x:57,y:58+i})
          AdaptivePlayerTrolling.onWaterMoved();AdaptivePlayerTrolling.onWaterMoved()
          AdaptivePlayerTrolling.onDrowningDamage()
          if(i===0){
            const mid=AdaptivePlayerTrolling.serialize()
            check(mid.waterCrossing?.damaged && mid.waterCrossing.steps===2,
              'in-progress crossing preserves its drowning injury')
            AdaptivePlayerTrolling.restore(mid)
          }
          AdaptivePlayerTrolling.onWaterExited({x:65,y:58+i})
        }
        check(AdaptivePlayerTrolling.serialize().drowningCrossings===2,
          'separate damaging crossings meet the threshold')
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        const drops=groundItems.filter(g=>g.adaptiveEventId==='drowning_lure')
        check(drops.length===1 && drops[0].kind==='droppeditem' &&
          drops[0].item?.kind==='homecomingscroll' && drops[0].x===65,
          'Homecoming scroll spawns on far dry shore')
        const save=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(save,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('drowning_lure') &&
          AdaptivePlayerTrolling.serialize().drowningCrossings===2 &&
          groundItems.filter(g=>g.adaptiveEventId==='drowning_lure').length===1,
          'no duplicates after restoring saved/replay state')
        activeWorldTraits=[]
        AdaptivePlayerTrolling.onWaterEntered({x:57,y:58})
        check(AdaptivePlayerTrolling.serialize().waterCrossing===null,
          'normal worlds never track adaptive drowning crossings')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })


  it('sends one Undead Warden against trained archers and keeps shield damage across saves', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=-5;currentCave=-1
        deepLevels[3].dungeonPackage='dwarvenRuins'
        deepLevels[3].dungeonFloor=3;deepLevels[3].floorCount=3
        map=deepLevels[3].map
        for(let y=24;y<=70;y++)for(let x=24;x<=70;x++)map[y][x]='cavefloor'
        player.x=45;player.y=45;player.steps=499
        player.combatSkills.marksmanship=29
        player.inventory=[];player.killsBySpecies={};player.gold=0
        enemies=[];groundItems=[];occupied=new Set();npcs=[]
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        chance=()=>true
        player.steps=500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(!enemies.some(e=>e.adaptiveEventId==='undead_shield_hunter'),
          'below proficiency threshold no hunter appears')
        player.combatSkills.marksmanship=30
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.undead_shield_hunter,
          'reaching Marksmanship threshold flags the response')
        player.steps=1000
        AdaptivePlayerTrolling.onPlayerMoved()
        let shield=enemies.find(e=>e.adaptiveEventId==='undead_shield_hunter')
        check(!!shield && shield.family==='undead' && shield.baseName==='Skeleton' &&
          shield.name==='Undead Warden' && shield.hp===84 && shield.atk===13 &&
          shield.shieldGuardHits===0 && !shield.shieldGuardBroken,
          'one formidable shielded undead appears outside sight')
        check(!undergroundTileVisible(shield.x,shield.y) &&
          Math.max(Math.abs(shield.x-player.x),Math.abs(shield.y-player.y))>=10,
          'spawn stays out of sight and clear of the entrance')
        for(let i=1;i<=2;i++) {
          const impact=AdaptivePlayerTrolling.shieldHunterArrowHit(shield,20)
          check(impact.absorbed && impact.damage===5 && !impact.broken &&
            shield.shieldGuardHits===i && !shield.shieldGuardBroken &&
            AdaptivePlayerTrolling.shieldHunterRemaining(shield)===3-i,
            'landed arrows are reduced and wear down shield')
        }
        const midway=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(midway,{isReplayInit:true})
        shield=enemies.find(e=>e.adaptiveEventId==='undead_shield_hunter')
        check(!!shield && shield.shieldGuardHits===2 && !shield.shieldGuardBroken,
          'shield durability restored with enemy entity')
        const third=AdaptivePlayerTrolling.shieldHunterArrowHit(shield,20)
        check(third.damage===5 && third.broken && shield.shieldGuardBroken,
          'third hit remains reduced and breaks the shield')
        check(AdaptivePlayerTrolling.shieldHunterArrowHit(shield,20).damage===20,
          'subsequent arrows deal full damage')
        check(AdaptivePlayerTrolling.shieldHunterArrowHit(shield,0).damage===0,
          'zero damage is not artificially increased')
        const final=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(final,{isReplayInit:true})
        shield=enemies.find(e=>e.adaptiveEventId==='undead_shield_hunter')
        check(!!shield && shield.shieldGuardBroken &&
          AdaptivePlayerTrolling.shieldHunterArrowHit(shield,20).damage===20,
          'broken shield stays broken through replay restoration')
        player.steps=1500
        AdaptivePlayerTrolling.onPlayerMoved()
        check(enemies.filter(e=>e.adaptiveEventId==='undead_shield_hunter').length===1 &&
          AdaptivePlayerTrolling.completed('undead_shield_hunter'),
          'encounter occupies one threat slot and cannot respawn')
      } finally {chance=originalChance;loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('places exactly one opposite-style artifact with no other gear reward', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=-5;currentCave=-1
        deepLevels[3].dungeonPackage='dwarvenRuins'
        deepLevels[3].dungeonFloor=3;deepLevels[3].floorCount=3
        map=deepLevels[3].map
        for(let y=24;y<=70;y++)for(let x=24;x<=70;x++)map[y][x]='cavefloor'
        player.x=45;player.y=45;player.combatSkills.oneHanded=60
        player.combatSkills.twoHanded=9;player.combatSkills.shielding=0
        enemies=[];groundItems=[];occupied=new Set();npcs=[]
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.opposite_weapon,
          'specialization threshold remembered')
        check(AdaptivePlayerTrolling.tryNeglectedCombatGear(),
          'unfamiliar two-handed artifact placed on valid ruin floor')
        const rewards=groundItems.filter(g=>g.adaptiveEventId==='opposite_weapon')
        check(rewards.length===1 && rewards[0].kind==='droppeditem' &&
          rewards[0].item?.kind==='artifact' && rewards[0].item.artifactSlot==='weapon' &&
          rewards[0].item.twoHanded && !rewards[0].item.identified &&
          rewards[0].item.effectId==='blessed_relic' &&
          ['Giant Sword','Crescent Blades','Titan Warpick'].includes(rewards[0].item.base),
          'one-handed specialist receives two-handed artifact from native gear catalog')
        check(!undergroundTileVisible(rewards[0].x,rewards[0].y) &&
          Math.max(Math.abs(rewards[0].x-player.x),Math.abs(rewards[0].y-player.y))>=10,
          'loot is safe and initially off-screen')
        check(!AdaptivePlayerTrolling.tryNeglectedCombatGear() &&
          !AdaptivePlayerTrolling.completed('neglected_shield'),
          'mutually exclusive unique reward cannot duplicate')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('opposite_weapon') &&
          groundItems.filter(g=>g.adaptiveEventId==='opposite_weapon').length===1,
          'save and replay restore single artifact with history')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('counts completed shieldless battles and rewards the existing Royal Shield artifact', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=-5;currentCave=-1
        deepLevels[3].dungeonPackage='dwarvenRuins'
        deepLevels[3].dungeonFloor=3;deepLevels[3].floorCount=3
        map=deepLevels[3].map
        for(let y=24;y<=70;y++)for(let x=24;x<=70;x++)map[y][x]='cavefloor'
        player.x=45;player.y=45;player.combatSkills.oneHanded=0
        player.combatSkills.twoHanded=0;player.combatSkills.shielding=0
        player.equip.shield=null;player.equip.weapon=null
        player.inventory=[{kind:'shield',base:'Round Shield',name:'Round Shield',tier:2,def:5}]
        player.baseDef=9
        enemies=[];groundItems=[];occupied=new Set();npcs=[]
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        // A battle conducted with a two-handed weapon cannot count.
        turnCount+=1;AdaptivePlayerTrolling.onCombatAttack(turnCount)
        player.equip.weapon={kind:'weapon',base:'Giant Sword',twoHanded:true}
        turnCount+=6;AdaptivePlayerTrolling.onWorldTurn()
        player.equip.weapon=null
        check(AdaptivePlayerTrolling.serialize().shieldlessFights===0,
          'equipping incompatible gear invalidates the whole encounter')
        for(let i=0;i<14;i++) {
          turnCount+=1;AdaptivePlayerTrolling.onCombatAttack(turnCount)
          turnCount+=6;AdaptivePlayerTrolling.onWorldTurn()
        }
        check(AdaptivePlayerTrolling.serialize().shieldlessFights===14,
          'only fully finished shieldless fights count')
        turnCount+=1;AdaptivePlayerTrolling.onCombatAttack(turnCount)
        let midway=AdaptivePlayerTrolling.serialize()
        check(midway.shieldlessFightLastAttackTurn===turnCount &&
          midway.shieldlessFightEligible,'unfinished battle is stored')
        AdaptivePlayerTrolling.restore(midway)
        turnCount+=6;AdaptivePlayerTrolling.onWorldTurn()
        check(AdaptivePlayerTrolling.serialize().shieldlessFights===15,
          'save and restore cannot lose or double unfinished battle')
        AdaptivePlayerTrolling.syncTriggerFlags()
        check(AdaptivePlayerTrolling.serialize().triggerFlags.neglected_shield,
          'qualifying behavior marked in debugger')
        check(AdaptivePlayerTrolling.tryNeglectedCombatGear(),
          'reward placed when entering final two ruin floors')
        const item=groundItems.find(g=>g.adaptiveEventId==='neglected_shield')?.item
        check(!!item && item.kind==='artifact' && item.artifactSlot==='shield' &&
          item.base==='Royal Shield' && item.def===9 &&
          item.effectId==='blessed_relic' && item.adaptiveAttunement==='def' &&
          item.bonuses.def>=4 && !item.identified,
          'Royal Shield uses its existing icon base and defense-focused variant')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('neglected_shield') &&
          groundItems.filter(g=>g.adaptiveEventId==='neglected_shield').length===1 &&
          !AdaptivePlayerTrolling.tryNeglectedCombatGear(),
          'shield artifact survives replay and never duplicates')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

  it('reinforces explored ruins galleries once with a Champion and two archers', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      const originalChance=chance
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        player.godMode=false
        // A synthetic, entirely walkable surface makes the reachable share
        // and opposing-edge distinction deterministic across world seeds.
        currentZ=0;currentCave=-1
        surfaceMap=Array.from({length:MAP_H},()=>Array(MAP_W).fill('forest'))
        discovered=Array.from({length:MAP_H},()=>Array(MAP_W).fill(false))
        map=surfaceMap;npcs=[]
        const bandX=Math.floor(MAP_W*.08),bandY=Math.floor(MAP_H*.08)
        for(let y=bandY;y<MAP_H-bandY;y++)for(let x=bandX;x<MAP_W-bandX;x++)
          discovered[y][x]=true
        // Interior discovery is already over 50%, but not at opposite edges.
        const progress=AdaptivePlayerTrolling.explorerExploration()
        check(progress.seen/progress.total>=.5 && !progress.ready,
          'half the accessible terrain is insufficient without opposing edges')
        worldEdgesReached.north=true;worldEdgesReached.west=true
        check(!AdaptivePlayerTrolling.explorerExploration().ready,
          'two adjacent edge visits do not count as distant ends')
        worldEdgesReached.east=true
        check(AdaptivePlayerTrolling.explorerExploration().ready,
          'two opposing edge visits and 50% explored qualify')
        player.godMode=true
        check(!AdaptivePlayerTrolling.explorerExploration().ready,
          'god mode cannot qualify through artificial exploration')
        player.godMode=false
        // A synthetic gallery tests the adaptive layer independently of the
        // procedural world's specific gallery rotation and coordinates.
        const floor=deepLevels[3]
        floor.dungeonPackage='dwarvenRuins';floor.dungeonFloor=2;floor.floorCount=4
        const id='dwarven-room:-5:999'
        const bays=[[],[]]
        for(let x=20;x<25;x++) {
          bays[0].push({x,y:20});bays[1].push({x,y:26})
        }
        floor.rooms=floor.rooms||[]
        floor.rooms.push({id,gallery:{bays,fireTargets:[{x:22,y:23}],alarmTiles:[]}})
        for(let y=18;y<29;y++)for(let x=18;x<27;x++)floor.map[y][x]='marble'
        currentZ=-5;map=floor.map;currentCave=-1
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        const template=ENEMY_TEMPLATE_BY_NAME.Goblin
        const ability=shooterAbilityForTemplate(template)
        check(!!ability,'the original gallery guard species can shoot')
        for(let side=0;side<2;side++)for(let n=0;n<2;n++) {
          const spot=bays[side][n]
          const enemy={name:'Goblin',baseName:'Goblin',level:-5,levelKind:'chain',
            caveIndex:-1,alive:true,abilities:[...template.abilities],
            hp:20,maxHp:20,atk:template.atk,def:template.def,spd:template.spd,
            grace:template.grace,tier:template.tier,aggro:template.aggro,
            x:spot.x,y:spot.y,homeX:spot.x,homeY:spot.y,homeTileType:'marble',
            shooterAbility:ability,shotsRemaining:RANGED_CONFIG.startingShots,
            dungeonRoomId:id,dungeonRole:'gallery'+side}
          addEnemy(enemy);occupied.add(keyXY(spot.x,spot.y))
        }
        const originalGuard=enemies[0]
        originalGuard.hp=5
        // Control only the gallery's 85% gate, preserving normal RNG for
        // created guards' equipment and any other random effects.
        chance=p=>p===.85?true:originalChance(p)
        check(AdaptivePlayerTrolling.tryExplorerGalleries(),
          'qualified gallery reinforces during a visit')
        chance=originalChance
        check(enemies.length===6 && originalGuard.prefix==='Champion' &&
          originalGuard.hp>0 && originalGuard.hp<originalGuard.maxHp,
          'existing damaged guard is promoted, not replaced or healed')
        const recruits=enemies.filter(e=>e.adaptiveEventId==='explorer_galleries')
        check(recruits.length===2 && recruits.every(e=>enemyIsShooter(e)) &&
          new Set(recruits.map(e=>e.dungeonRole)).size===2,
          'two additional archers are divided between the bays')
        const rolls=AdaptivePlayerTrolling.serialize().explorerGalleryRolls
        check(rolls['chain:-5:'+id]===true,'successful roll is saved')
        check(!AdaptivePlayerTrolling.tryExplorerGalleries() && enemies.length===6,
          'returning to the gallery cannot reroll or duplicate guards')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        check(AdaptivePlayerTrolling.serialize().explorerGalleryRolls['chain:-5:'+id] &&
          enemies.filter(e=>e.adaptiveEventId==='explorer_galleries').length===2 &&
          !AdaptivePlayerTrolling.tryExplorerGalleries(),
          'save and replay retain the reinforcement without duplicating it')
      } finally {
        chance=originalChance
        loadGameFromObject(before,{isReplayInit:true})
      }
    })()`))
  })



  it('haunts a particular cursed artifact after 300 equipped turns and stops when removed', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test curse',effects:[]}]
        AdaptivePlayerTrolling.reset()
        const floor=deepLevels[3]
        floor.dungeonPackage='dwarvenRuins';floor.dungeonFloor=3;floor.floorCount=4
        currentZ=-5;currentCave=-1;map=floor.map
        for(let y=30;y<=75;y++)for(let x=30;x<=75;x++)map[y][x]='marble'
        player.x=50;player.y=50;player.inventory=[]
        player.equip.weapon=null;player.equip.shield=null;player.equip.armor=null
        enemies=[];groundItems=[];npcs=[];occupied=new Set()
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        const cursed={kind:'artifact',artifactSlot:'weapon',name:'Cursed Spear',noun:'Spear',
          base:'Spear',atk:7,grace:2,identified:true,bonuses:{},curse:{everyTurns:10,types:['hp']}}
        player.equip.weapon=cursed
        // Repeated checks on the *same* turn never grant extra wear progress.
        turnCount+=1;AdaptivePlayerTrolling.onWorldTurn();AdaptivePlayerTrolling.onWorldTurn()
        check(cursed.previousOwnerWearTurns===1,'duplicate turn hook cannot double count wear')
        player.equip.weapon=null
        for(let i=0;i<12;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(cursed.previousOwnerWearTurns===1,'cursed gear in backpack does not advance')
        player.equip.weapon=cursed
        for(let i=0;i<298;i++){turnCount++;AdaptivePlayerTrolling.onWorldTurn()}
        check(!AdaptivePlayerTrolling.serialize().triggerFlags.previous_owner,
          '299 equipped turns are not enough')
        turnCount++;AdaptivePlayerTrolling.onWorldTurn()
        check(cursed.previousOwnerWearTurns===300 &&
          AdaptivePlayerTrolling.serialize().triggerFlags.previous_owner,
          '300th equipped turn records trigger without RNG')
        const options=AdaptivePlayerTrolling.previousOwnerSpawnOptions(floor)
        check(!!options && !!options.sites.length,'connected off-screen site exists on deep ruin floor')
        check(AdaptivePlayerTrolling.spawnPreviousOwner(options),'a named Ghost is created')
        let ghost=enemies.find(e=>e.adaptiveEventId==='previous_owner')
        check(ghost && ghost.name && ARTIFACT_NAMES_DWARF.includes(ghost.name) &&
          ghost.baseName==='Ghost' && !ghost.previousOwnerRecognized &&
          cursed.previousOwnerHauntedBy===ghost.name,'individual relic is bound to named owner')
        check(AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) && !ghost.aware,
          'owner waits before seeing the relic')
        let saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        ghost=enemies.find(e=>e.adaptiveEventId==='previous_owner')
        check(ghost && ghost.name===player.equip.weapon.previousOwnerHauntedBy &&
          player.equip.weapon.previousOwnerWearTurns===300 &&
          !ghost.previousOwnerRecognized,'owner and cursed item link survive load')
        player.x=ghost.x+1;player.y=ghost.y
        check(!AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) &&
          ghost.previousOwnerRecognized && ghost.aware,
          'seeing relic once initiates ordinary ghost pursuit')
        player.inventory.push(player.equip.weapon);player.equip.weapon=null
        check(AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) && !ghost.aware &&
          ghost.aggro===0,'unequipping exactly the haunted relic pauses pursuit')
        saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        ghost=enemies.find(e=>e.adaptiveEventId==='previous_owner')
        check(ghost && ghost.previousOwnerRecognized && !ghost.previousOwnerProvoked &&
          AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount),
          'paused haunting remains paused after reloading')
        player.equip.weapon=player.inventory.pop()
        check(!AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) && ghost.aware,
          're-equipping the same item resumes chase')
        ghost.hp=ghost.maxHp-1
        check(!AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) && ghost.previousOwnerProvoked,
          'wounding owner provokes him permanently')
        player.equip.weapon=null
        check(!AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount),
          'removing cursed item cannot pacify an attacked ghost')
        saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        ghost=enemies.find(e=>e.adaptiveEventId==='previous_owner')
        check(ghost && ghost.previousOwnerProvoked &&
          !AdaptivePlayerTrolling.onEnemyTurn(ghost,turnCount) &&
          AdaptivePlayerTrolling.completed('previous_owner') &&
          enemies.filter(e=>e.adaptiveEventId==='previous_owner').length===1,
          'provocation, uniqueness and ghost identity survive replay restore')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })



  it('offers one merchant fort commission before visiting the fort and pays only for the recovered ledger', () => {
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const before=JSON.parse(JSON.stringify(buildSaveObject()))
      try {
        activeWorldTraits=[{name:'test cursed world',effects:[]}]
        AdaptivePlayerTrolling.reset()
        currentZ=0;currentCave=-1;map=surfaceMap
        player.inventory=[];player.lvl=9;player.gold=25
        check(AdaptivePlayerTrolling.fortQuestOption()===null,'level 9 cannot accept quest')
        player.lvl=10
        check(AdaptivePlayerTrolling.fortQuestOption()==='offer','level 10 offers quest before fort entry')
        const merchant=npcs.find(n=>n.name==='Merchant')
        check(merchant && npcMenuOptions(merchant).some(o=>o.id==='fortQuest'),
          'merchant has quest dialogue alongside his ordinary choices')
        player.x=merchant.x;player.y=merchant.y+1
        check(interactNpcTopic(merchant,'fortQuest',false),'accept the commission through NPC dialogue')
        check(AdaptivePlayerTrolling.fortQuestOption()==='active' &&
          AdaptivePlayerTrolling.serialize().triggerFlags.fort_quest &&
          AdaptivePlayerTrolling.serialize().fortQuestAccepted,'acceptance is saved and flagged')
        const rngAfterOffer=rngState
        check(interactNpcTopic(merchant,'fortQuest',false) && rngState===rngAfterOffer,
          'asking again does not restart the quest or draw RNG')
        const accepted=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(accepted,{isReplayInit:true})
        check(AdaptivePlayerTrolling.fortQuestOption()==='active','accepted quest survives load')
        // Prepare deterministic, reachable ruined corridors without depending
        // on a particular generated layout or a new world-generation test.
        const floor=deepLevels[3]
        floor.dungeonPackage='dwarvenRuins';floor.dungeonFloor=2;floor.floorCount=4
        currentZ=-3;currentCave=-1;map=floor.map
        check(!AdaptivePlayerTrolling.tryPlaceFortQuestLedger(),
          'ledger cannot appear in the entrance fort')
        currentZ=-4
        check(!AdaptivePlayerTrolling.tryPlaceFortQuestLedger(),
          'ledger cannot appear on the first ruins floor')
        currentZ=-5
        const x=Math.floor(map[0].length/2),y=Math.floor(map.length/2)
        for(let yy=Math.max(1,y-20);yy<Math.min(map.length-1,y+21);yy++)
          for(let xx=Math.max(1,x-20);xx<Math.min(map[0].length-1,x+21);xx++)
            map[yy][xx]='marble'
        player.x=x;player.y=y
        enemies=[];groundItems=[];occupied=new Set()
        rebuildActiveLevelOccupancy();invalidateUndergroundFov()
        check(AdaptivePlayerTrolling.tryPlaceFortQuestLedger(),
          'quest ledger is placed on a traversable ruins tile')
        let ledgers=groundItems.filter(g=>g.kind==='droppeditem' &&
          g.item?.kind==='dwarvenTradeLedger')
        check(ledgers.length===1 && ledgers[0].level===-5 &&
          Math.abs(ledgers[0].x-x)+Math.abs(ledgers[0].y-y)>=8,
          'item is a physical pickup away from the stairs')
        check(!AdaptivePlayerTrolling.tryPlaceFortQuestLedger() &&
          groundItems.filter(g=>g.item?.kind==='dwarvenTradeLedger').length===1,
          'floor revisit cannot duplicate quest item')
        const placed=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(placed,{isReplayInit:true})
        ledgers=groundItems.filter(g=>g.item?.kind==='dwarvenTradeLedger')
        check(ledgers.length===1,'placed object survives save/replay restoration')
        // This is the same inventory item moved by ordinary F pickup.
        player.inventory.push(ledgers[0].item)
        groundItems.splice(groundItems.indexOf(ledgers[0]),1)
        currentZ=0;currentCave=-1;map=surfaceMap
        player.x=merchant.x;player.y=merchant.y+1
        check(AdaptivePlayerTrolling.fortQuestOption()==='turnin','carrying ledger enables return')
        const priorGold=player.gold
        check(interactNpcTopic(npcs.find(n=>n.name==='Merchant'),'fortQuest',false),
          'merchant accepts the physical ledger')
        check(player.gold===priorGold+350 &&
          !player.inventory.some(i=>i.kind==='dwarvenTradeLedger') &&
          AdaptivePlayerTrolling.completed('fort_quest') &&
          AdaptivePlayerTrolling.fortQuestOption()===null,'350 gold is paid exactly once')
        const paid=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(paid,{isReplayInit:true})
        check(AdaptivePlayerTrolling.completed('fort_quest') &&
          AdaptivePlayerTrolling.fortQuestOption()===null,'completed state survives replay')
        AdaptivePlayerTrolling.reset();player.lvl=10
        const visited=AdaptivePlayerTrolling.serialize();visited.fortQuestVisited=true
        AdaptivePlayerTrolling.restore(visited)
        check(AdaptivePlayerTrolling.fortQuestOption()===null,
          'already visited fort permanently disqualifies unaccepted quest')
      } finally {loadGameFromObject(before,{isReplayInit:true})}
    })()`))
  })

})
