describe('Carrion instinct, sleeping Wyverns and forest cover', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Instinct Tester')
    cy.get('#btnBegin').click()
    cy.window().then(win => win.eval(`(() => {
      window.check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true
      currentZ=0;map=surfaceMap;enemies=[];groundItems=[];occupied=new Set()
      player.x=40;player.y=50;camX=35;camY=45
      player.maxHp=100;player.hp=100;player.inventory=[];player.curseDebuffs=[]
      player.equip.weapon=null;player.equip.armor=null;player.equip.shield=null
      for(let y=30;y<80;y++)for(let x=20;x<80;x++){map[y][x]='grass';discovered[y][x]=true}
      window.makeEnemy=(name,extra={})=>addEnemy({...ENEMY_TEMPLATE_BY_NAME[name],name,baseName:name,
        x:44,y:50,level:0,alive:true,hp:100,maxHp:100,equipment:null,prefix:null,
        aware:false,alarmed:false,sleeping:false,...extra})
    })()`))
  })
  it('derives carrion bonuses strictly below twenty percent without mutating stats', () => {
    cy.window().then(win=>win.eval(`(() => {
      for(const name of ['Vulture','Hyena','Jackal','Chupacabra']) {
        const e=makeEnemy(name),base=e.atk
        player.hp=playerMaxHp()*.2;const attack=enemyAtk(e),aggro=effectiveAggroRange(e)
        check(!enemyCarrionInstinctActive(e),'threshold inactive')
        player.hp-=.01
        check(enemyCarrionInstinctActive(e),'below threshold active')
        check(enemyAtk(e)===attack*1.25 && effectiveAggroRange(e)===aggro+1,'derived bonuses')
        check(e.atk===base,'base unchanged')
        player.hp=playerMaxHp();check(enemyAtk(e)===attack,'healing removes bonus')
      }
    })()`))
  })
  it('initializes sleep once on safe ground and wakes through spotting or alarm', () => {
    cy.window().then(win=>win.eval(`(() => {
      const originalChance=chance;let calls=0
      try {
        chance=p=>{calls++;check(p===.25,'spawn probability');return true}
        const e=makeEnemy('Wyvern');delete e.sleeping;initializeEnemySleep(e)
        check(e.sleeping&&!enemyHasAbility(e,'fly'),'grounded sleeper')
        const half=effectiveAggroRange(e);initializeEnemySleep(e);check(calls===1,'no reroll')
        const unsafe=makeEnemy('Wyvern');map[unsafe.y][unsafe.x]='water';delete unsafe.sleeping;initializeEnemySleep(unsafe)
        check(!unsafe.sleeping&&calls===1,'unsafe ground cannot sleep');map[e.y][e.x]='grass'
        const raw=enemyAggroRange(e);check(half===Math.max(1,raw*.5+raceAggroMod()+WORLD_GEN_CONFIG.environment.enemyAggroBonus),'half base aggro')
        chance=p=>{calls++;check(p===.01,'wake probability');return false}
        check(sleepingEnemyTurn(e,true,4),'hidden player does not wake sleeper')
        const before=calls;check(sleepingEnemyTurn(e,true,21)&&calls===before,'distant sleepers consume no roll')
        chance=()=>true;check(!sleepingEnemyTurn(e,true,4)&&e.alarmed&&enemyHasAbility(e,'fly'),'spontaneous wake restores flight and alarm')
        const spotted=makeEnemy('Wyvern',{sleeping:true,x:41});check(!sleepingEnemyTurn(spotted,false,1)&&spotted.aware,'adjacent spotting wakes')
        const alarmed=makeEnemy('Wyvern',{sleeping:true});alarmEnemy(alarmed);check(!alarmed.sleeping&&alarmed.alarmed,'combat alarm wakes')
      } finally {chance=originalChance}
      const asleep=makeEnemy('Wyvern',{sleeping:true}),awake=makeEnemy('Wyvern')
      const saved=JSON.parse(JSON.stringify(buildSaveObject())),before=rngState
      loadGameFromObject(saved,{isReplayInit:true})
      check(enemies.find(e=>e.id===asleep.id).sleeping===true,'sleep survives load')
      check(enemies.find(e=>e.id===awake.id).sleeping===false,'wake survives load')
      check(rngState===before,'load consumes no RNG')
    })()`))
  })
  it('repeats sleeping AI turns identically from a saved starting state', () => {
    cy.window().then(win=>win.eval(`(() => {
      const e=makeEnemy('Wyvern',{sleeping:true,x:50});player.invisibleTurns=100;player.godMode=false
      occupied.add(keyXY(e.x,e.y));rngState=12345
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      const run=()=>{for(let i=0;i<12;i++)enemyTurn();return JSON.stringify({rng:rngState,enemies:enemies.map(e=>({id:e.id,x:e.x,y:e.y,sleeping:e.sleeping,alarmed:e.alarmed,aware:e.aware})),hp:player.hp})}
      const first=run();loadGameFromObject(saved,{isReplayInit:true});const second=run()
      check(first===second,'same saved state and turns reproduce AI and RNG')
    })()`))
  })
  it('reports actual per-enemy concealment and chances without rolling and rejects foraged cover', () => {
    cy.window().then(win=>win.eval(`(() => {
      map[player.y][player.x]='forest';foragedTiles.delete(keyXY(player.x,player.y))
      const e=makeEnemy('Hyena');const before=rngState
      let html=playerConcealmentInfo();check(html.includes('Hide chance vs Hyena:')&&!html.includes('Concealed from'),'chance is not claimed concealment')
      e.forestConcealX=player.x;e.forestConcealY=player.y
      html=playerConcealmentInfo();check(html.includes('Concealed from Hyena')&&html.includes('%'),'actual concealment and chance shown')
      check(rngState===before,'tooltip consumes no RNG')
      foragedTiles.add(keyXY(player.x,player.y))
      check(!playerHasForestCover()&&forestHideChance(e,4)===0&&!forestConcealsPlayer(e,4),'foraged forest blocks cached concealment')
      check(playerConcealmentInfo()==='','foraged tooltip has no cover')
    })()`))
  })
  it('excludes unopened and unnamed loot from Hunter delivery candidates', () => {
    cy.window().then(win=>win.eval(`(() => {
      groundItems=[{id:'chest',kind:'chest',level:0,artifactGuaranteed:true,x:42,y:50},
        {id:'unnamed',kind:'stolenloot',level:0,item:{kind:'weapon'},x:43,y:50},
        {id:'named',kind:'stolenloot',level:0,item:{kind:'weapon',name:'Test sword'},x:44,y:50}]
      const candidates=hunterCandidates().filter(q=>q.type==='deliver_item')
      check(candidates.length===1&&candidates[0].targetItemName==='Test sword','only identifiable recoverable item offered')
      check(candidates[0].targetItem===groundItems[2].item,'exact recoverable object retained')
    })()`))
  })
  it('clips water at every depth and mirrors brown tile edges exactly', () => {
    cy.window().then(win=>win.eval(`(async () => {
      const rect=ctx.rect,clip=ctx.clip;let clips=0,heights=[]
      try {
        ctx.rect=(x,y,w,h)=>heights.push(h);ctx.clip=()=>clips++
        map[50][40]='water'
        for(const z of [0,-1,-2,-3]){currentZ=z;drawSwimmingCreature((40-camX)*TILE_PX,(50-camY)*TILE_PX,()=>{})}
        check(clips===4&&heights.every(h=>h===TILE_PX/2),'half sprite clipping at all depths')
        map[50][40]='grass';drawSwimmingCreature((40-camX)*TILE_PX,(50-camY)*TILE_PX,()=>{});check(clips===4,'dry ground unclipped')
      }finally{ctx.rect=rect;ctx.clip=clip;currentZ=0}
      const visual=RENDER_STYLE.terrainTiles.cavefloorBrown
      const image=resolveVisualImage(visual);check(image,'brown image loaded')
      if(!image.complete)await image.decode()
      for(let y=0;y<2;y++)for(let x=0;x<2;x++)drawImageVisual(x*TILE_PX,y*TILE_PX,{...visual,flipX:!!x,flipY:!!y})
      const n=TILE_PX,data=ctx.getImageData(0,0,n*2,n*2).data
      const eq=(x,y,a,b)=>{for(let c=0;c<4;c++)check(data[(y*n*2+x)*4+c]===data[(b*n*2+a)*4+c],'matching mirrored edge pixels')}
      for(let i=0;i<n*2;i++){eq(n-1,i,n,i);eq(i,n-1,i,n)}
    })()`))
  })
})
