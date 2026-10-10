describe('Surface encounters and item passives', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('World Rules Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
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
      const x=spawnPoint.x+FLEE_DISTANCE-1,y=spawnPoint.y
      map[y][x]='forest'
      const originalChance=chance
      let called=0
      try {
        chance=()=>{called++;return true}
        const rngBefore=rngState, count=enemies.length
        maybeSpawnForestAmbush(x,y)
        check(called===0 && rngBefore===rngState && enemies.length===count,'protected forest tile has no ambush roll')
        // At the exact sanctuary boundary, an ambush roll is allowed, but
        // it must never place an attacker one tile inside the retreat zone.
        const edge=spawnPoint.x+FLEE_DISTANCE
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
      const webs=caveDecorations.filter(p=>p.level===0)
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
})
