describe('One-time monster theft', () => {
  beforeEach(() => {
    cy.viewport(1440, 900)
    cy.visit('/')
    cy.get('#raceName').clear().type('Thief Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay').should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.theftCheck=(ok,msg)=>{if(!ok) throw new Error(msg)}
      window.resetTheftArena=()=>{
        replayRecording=false; replayPlaying=false; replayData=null; activeReplay=null
        replaySimulationMode=false; replayAnimationsDisabled=true
        currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null;raceOpen=false
        cameraAnimating=false;attackAnim=null;moveAnim=null;mapOpen=false;invOpen=false;tradeOpen=false
        enemies=[];npcs=[];groundItems=[];occupied=new Set();turnCount=0;consecutiveWaitTurns=0
        oldHunterQuest=null;fishermanQuest=null;spawnPoint={x:120,y:120}
        for(let y=20;y<=80;y++) for(let x=20;x<=80;x++) {
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));discovered[y][x]=true
        }
        player.x=40;player.y=40;player.hp=1000;player.maxHp=1000;player.race='human'
        player.baseSpd=3;player.baseDef=0;player.godMode=false;player.invisibleTurns=0
        player.poisonTurns=0;player.berryRegenTurns=0;player.speedPotionTurns=0
        player.freezing={active:false,turns:0};player.curseDebuffs=[]
        player.equip={weapon:null,armor:null,shield:null};player.inventory=[];resetSwimming()
        projectileAnims=[];damageAnims=[];fxAnims=[];soundAnims=[];rngState=246813579
      }
      window.makeThief=(name='Imp',extra={})=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name],x=41,y=40
        const e=addEnemy({...t,name,baseName:name,x,y,homeX:x,homeY:y,homeTileType:'grass',
          hp:100,maxHp:100,alive:true,level:0,levelKind:currentLevelKind(),wander:false,
          prefix:null,equipment:null,aware:true,alarmed:false,...extra})
        occupied.add(keyXY(e.x,e.y));return e
      }
      resetTheftArena()
    })()`))
  })

  it('steals one unit or an exact quest item, once, and immediately escapes without attacking', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldLog=log;const messages=[]
      try {
        chance=()=>true;log=m=>messages.push(m)
        for(const name of ['Imp','Nymph','Tokka','Wretchling']) {
          resetTheftArena();const e=makeThief(name)
          theftCheck(e.abilities.includes('thief') && !e.theftUsed && !e.stolenItem && !e.stolenItemEquipped,'spawn defaults '+name)
          const equipped={kind:'weapon',name:'Equipped Blade',atk:3};player.equip.weapon=equipped
          player.inventory=[equipped,createItem('potion',{count:3,hunterQuestId:'quest-theft'})]
          const hp=player.hp,shots=e.shotsRemaining;enemyTurn()
          theftCheck(e.theftUsed && e.stolenItem.count===1 && e.stolenItem.hunterQuestId==='quest-theft','one quest unit')
          theftCheck(player.inventory[1].count===2 && player.equip.weapon===equipped,'equipped exclusion')
          theftCheck(Math.max(Math.abs(e.x-player.x),Math.abs(e.y-player.y))===2,'guaranteed immediate step')
          theftCheck(player.hp===hp && e.shotsRemaining===shots,'theft replaces attack and shooting')
          theftCheck(messages.includes(name+' has snatched '+e.stolenItem.name+' from you and runs away!'),'theft message')
          const escapeX=e.x,escapeY=e.y
          occupied.delete(keyXY(e.x,e.y));e.x=41;e.y=40;occupied.add(keyXY(e.x,e.y))
          theftCheck(!tryEnemyTheft(e) && player.inventory[1].count===2,'no second success while adjacent')
          occupied.delete(keyXY(e.x,e.y));e.x=escapeX;e.y=escapeY;occupied.add(keyXY(e.x,e.y))
          const before=[e.x,e.y];enemyTurn()
          theftCheck(e.x===before[0] && e.y===before[1] && player.hp===hp,'later hesitation consumes turn')
        }
        resetTheftArena();const e=makeThief()
        const item={kind:'weapon',name:'Lost Blade',tier:2,atk:7,identified:false,
          hunterQuestId:'exact-quest',modifiers:[{key:'vital',value:2}],lore:'Remember me'}
        player.inventory=[item];tryEnemyTheft(e)
        theftCheck(!player.inventory.length && JSON.stringify(e.stolenItem)===JSON.stringify(item),'exact item metadata')
        item.modifiers[0].value=99
        theftCheck(e.stolenItem.modifiers[0].value===2,'independent item snapshot')
      } finally {chance=oldChance;log=oldLog}
    })()`))
  })

  it('equips stolen weapons, shields and armor once, preserves bonuses on load, and returns one copy', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldLog=log;const messages=[]
      try {
        chance=()=>true;log=m=>messages.push(m)
        for(const kind of ['weapon','shield','armor']) {
          resetTheftArena();const e=makeThief()
          const item={kind,name:'Stolen '+kind,base:'Test '+kind,tier:2,grace:5,
            ...(kind==='weapon'?{atk:7,mod:'atk',modAmt:2}:{def:8,mod:'hp',modAmt:4}),
            hunterQuestId:'gear-'+kind,identified:true}
          player.inventory=[item]
          const before={atk:e.atk,def:e.def,spd:e.spd,hp:e.hp,maxHp:e.maxHp},id=e.id
          theftCheck(tryEnemyTheft(e),'steal gear '+kind)
          theftCheck(e.stolenItemEquipped && e.equipment===e.stolenItem,'equip ownership '+kind)
          theftCheck(messages.includes('Imp has equipped '+item.name+'.'),'equipment log '+kind)
          if(kind==='weapon') {
            theftCheck(e.atk===before.atk+9 && combatDelay(e.equipment,false,e)===6/5,'weapon attack and grace')
          } else {
            theftCheck(e.def===before.def+8 && e.spd===Math.max(1,before.spd-1) &&
              e.hp===before.hp+4 && e.maxHp===before.maxHp+4,'defensive gear bonuses and penalty')
          }
          const stats={atk:e.atk,def:e.def,spd:e.spd,hp:e.hp,maxHp:e.maxHp}
          const save=JSON.parse(JSON.stringify(buildSaveObject()))
          theftCheck(save.version===31,'gear save version')
          loadGameFromObject(save,{isReplayInit:true})
          const loaded=enemies.find(v=>v.id===id)
          theftCheck(loaded.stolenItemEquipped && loaded.equipment.kind===kind,'equipped state restored')
          theftCheck(JSON.stringify({atk:loaded.atk,def:loaded.def,spd:loaded.spd,hp:loaded.hp,maxHp:loaded.maxHp})===JSON.stringify(stats),'no repeated stat bonuses on load')
          chance=()=>false;killEnemy(loaded)
          const bags=groundItems.filter(g=>g.kind==='stolenloot')
          theftCheck(bags.length===1 && JSON.stringify(bags[0].item)===JSON.stringify(item),'one exact stolen gear drop')
          theftCheck(!player.inventory.some(i=>i.hunterQuestId===item.hunterQuestId),'no extra normal equipment drop')
          player.x=bags[0].x;player.y=bags[0].y;lootSkeletonOrForage()
          theftCheck(player.inventory.filter(i=>i.hunterQuestId===item.hunterQuestId).length===1,'one recovered gear copy')
          chance=()=>true
        }
        resetTheftArena();const e=makeThief(),original={kind:'shield',name:'Existing shield',def:3}
        applyEnemyEquipment(e,original);const atk=e.atk
        player.inventory=[{kind:'weapon',name:'New blade',atk:9,grace:4}];tryEnemyTheft(e)
        theftCheck(e.equipment===original && !e.stolenItemEquipped && e.atk===atk,'existing gear kept')
        theftCheck(!messages.includes('Imp has equipped New blade.'),'no false equipment log')
        chance=()=>false;killEnemy(e)
        theftCheck(player.inventory.includes(original) && groundItems.some(g=>g.kind==='stolenloot' && g.item.name==='New blade'),'existing gear and stolen loot separate')
        resetTheftArena();chance=()=>true;const killer=makeThief()
        player.inventory=[{kind:'shield',name:'Stolen shield',base:'Shield',def:2,tier:1}]
        tryEnemyTheft(killer)
        player.equip.weapon={kind:'weapon',name:'Death blade',base:'Club',atk:100,grace:4,tier:1}
        player.equip.armor={kind:'armor',name:'Corpse armor',base:'Robe',def:1,tier:4}
        createPermadeathBody(killer)
        theftCheck(!killer.stolenItemEquipped && killer.equipment.name==='Death blade','permadeath replacement relinquishes stolen gear')
        chance=()=>false;killEnemy(killer)
        theftCheck(player.inventory.some(i=>i.name==='Death blade') &&
          groundItems.some(g=>g.kind==='stolenloot' && g.item.name==='Stolen shield'),'replacement drops normally while stolen shield remains recoverable')

      } finally {chance=oldChance;log=oldLog}
    })()`))
  })

  it('replays auto-equipped stolen gear without applying its bonuses twice', () => {
    cy.window().then(win => win.eval(`(async () => {
      const e=makeThief();player.inventory=[{kind:'weapon',name:'Replay Blade',base:'Club',atk:7,grace:4,tier:1}]
      const baseAtk=e.atk;let seed=1
      while(true) {rngState=seed;if(rng()<0.1) break;seed++}
      rngState=seed;startReplayRecording();skipTurn()
      theftCheck(e.stolenItemEquipped && e.atk===baseAtk+7,'recorded gear equipped')
      for(let i=0;i<4;i++) skipTurn()
      const state=()=>({hp:player.hp,turn:turnCount,inventory:player.inventory,enemies:buildSaveObject().enemies})
      const expected=JSON.stringify(state()),recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
      replayPlaying=true;replayRecording=false;replayRngIndex=0
      try {
        for(const action of recorded.actions) await runReplayAction(action)
        theftCheck(replayRngIndex===recorded.rng.length && JSON.stringify(state())===expected,'identical equipped theft replay')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

  it('rolls only on eligible adjacent turns, retries failures, and respects corners and sacred ground', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldRng=rng,oldDamage=damageRoll;let calls=0
      try {
        const e=makeThief();player.inventory=[createItem('potion')]
        rng=()=>{calls++;return 0.1}
        theftCheck(!tryEnemyTheft(e) && calls===1 && !e.theftUsed,'10% boundary fails')
        theftCheck(!tryEnemyTheft(e) && calls===2,'failed roll retries')
        e.x=42;calls=0;theftCheck(!tryEnemyTheft(e) && calls===0,'nonadjacent no roll');e.x=41
        player.invisibleTurns=10;theftCheck(!tryEnemyTheft(e) && calls===0,'invisible no roll');player.invisibleTurns=0
        player.inventory=[];theftCheck(!tryEnemyTheft(e) && calls===0,'empty pack no roll')
        player.inventory=[createItem('potion')]
        for(const [dx,dy] of DIRS8) if(Math.max(Math.abs(e.x+dx-player.x),Math.abs(e.y+dy-player.y))>1) map[e.y+dy][e.x+dx]='mountain'
        theftCheck(!tryEnemyTheft(e) && calls===0,'cornered no roll')
        for(const [dx,dy] of DIRS8) map[e.y+dy][e.x+dx]='grass'
        npcs=[{x:42,y:39},{x:42,y:40},{x:42,y:41}]
        theftCheck(!tryEnemyTheft(e) && calls===0,'NPCs close escape tiles');npcs=[]
        map[player.y][player.x]='temple';rng=()=>0;enemyTurn()
        theftCheck(!e.theftUsed && player.inventory.length===1,'temple prevents theft')
        map[player.y][player.x]='grass';occupied.clear();e.x=41;e.y=41;occupied.add(keyXY(e.x,e.y))
        theftCheck(tryEnemyTheft(e),'diagonal theft')
      } finally {rng=oldRng;damageRoll=oldDamage}
    })()`))
  })

  it('keeps fleeing beyond aggro and while invisible, fights when boxed in, and drops recoverable loot once', () => {
    cy.window().then(win => win.eval(`(() => {
      const oldChance=chance,oldDamage=damageRoll
      try {
        const e=makeThief('Nymph',{shooterAbility:'shooterArrows',shotsRemaining:10})
        player.inventory=[createItem('potion',{count:2,hunterQuestId:'recover-me'})]
        chance=()=>true;tryEnemyTheft(e);chance=()=>false;damageRoll=()=>5
        occupied.delete(keyXY(e.x,e.y));e.x=65;e.y=40;occupied.add(keyXY(e.x,e.y))
        const x=e.x;enemyTurn();theftCheck(e.x===x+1 && e.shotsRemaining===10,'outside aggro retreat')
        player.invisibleTurns=5;const invisibleX=e.x;enemyTurn()
        theftCheck(e.x===invisibleX+1 && e.stolenItem,'invisible retreat');player.invisibleTurns=0
        currentZ=-1;const offX=e.x;enemyTurn();theftCheck(e.x===offX,'off-level pause');currentZ=0
        occupied.clear();e.x=41;e.y=40;occupied.add(keyXY(e.x,e.y))
        for(const [dx,dy] of DIRS8) if(e.x+dx!==player.x || e.y+dy!==player.y) map[e.y+dy][e.x+dx]='mountain'
        const hp=player.hp;enemyTurn()
        theftCheck(player.hp===hp-5 && e.stolenItem && e.shotsRemaining===10,'cornered melee')
        map[40][42]='grass';enemyTurn();theftCheck(e.x===42,'retreat resumes')
        const stolen=JSON.stringify(e.stolenItem),id=e.id
        const save=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(save,{isReplayInit:true})
        const restored=enemies.find(v=>v.id===id)
        theftCheck(restored.theftUsed && JSON.stringify(restored.stolenItem)===stolen,'mid-theft load')
        killEnemy(restored);killEnemy(restored)
        const bags=groundItems.filter(g=>g.kind==='stolenloot')
        theftCheck(bags.length===1 && JSON.stringify(bags[0].item)===stolen,'one exact loot drop')
        const groundSave=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(groundSave,{isReplayInit:true})
        const bag=groundItems.find(g=>g.kind==='stolenloot');player.x=bag.x;player.y=bag.y
        lootSkeletonOrForage()
        theftCheck(!groundItems.some(g=>g.kind==='stolenloot'),'bag collected')
        theftCheck(player.inventory.some(i=>JSON.stringify(i)===stolen),'exact item recovered')
      } finally {chance=oldChance;damageRoll=oldDamage}
    })()`))
  })

  it('replays theft, item choice and subsequent hesitation from seeded actions', () => {
    cy.window().then(win => win.eval(`(async () => {
      const e=makeThief();player.inventory=[createItem('potion',{count:4}),createItem('herb',{count:3})]
      // The first seeded eligibility roll succeeds, without replacing gameplay RNG.
      let seed=1
      while(true) {rngState=seed;if(rng()<0.1) break;seed++}
      rngState=seed;startReplayRecording();skipTurn()
      theftCheck(e.theftUsed,'recorded theft succeeds')
      for(let i=0;i<8;i++) skipTurn()
      const state=()=>({hp:player.hp,turn:turnCount,inventory:player.inventory,enemies:buildSaveObject().enemies})
      const expected=JSON.stringify(state()),recorded=JSON.parse(JSON.stringify(replayData))
      loadGameFromObject(recorded.initialState,{isReplayInit:true})
      replayAnimationsDisabled=true;replaySimulationMode=true;activeReplay=recorded
      replayPlaying=true;replayRecording=false;replayRngIndex=0
      try {
        for(const action of recorded.actions) await runReplayAction(action)
        theftCheck(replayRngIndex===recorded.rng.length,'identical RNG trace')
        theftCheck(JSON.stringify(state())===expected,'identical theft replay outcome')
      } finally {replayPlaying=false;replaySimulationMode=false;activeReplay=null}
    })()`))
  })

  for(const width of [1440,390]) it('shows the stolen bag with bow, skull and fleeing status at '+width+'px', () => {
    cy.viewport(width,900)
    cy.window().then(win => win.eval(`(() => {
      const e=makeThief('Nymph',{shooterAbility:'shooterArrows',shotsRemaining:10,victoryLevel:2})
      theftCheck(!tileInspectInfo(e.x,e.y).html.includes('thief-marker'),'no bag before theft')
      e.stolenItem=createItem('potion');e.theftUsed=true;e.alarmed=true
      for(const images of [false,true]) {
        USE_TILE_IMAGES=images;render()
        const info=tileInspectInfo(e.x,e.y)
        theftCheck(info.html.includes('thief-marker') && info.html.includes('shooter-marker') &&
          info.html.includes('☠') && info.html.includes('Fleeing'),'shared markers and status')
        updateMobileInfoPanel(e.x,e.y)
        const marker=document.querySelector('#mobileInfoPanel .thief-marker')
        theftCheck(marker && getComputedStyle(marker).backgroundColor==='rgb(224, 71, 63)','red bag silhouette')
      }
    })()`))
  })

})
