describe('Gear balance, racial growth, death shields and sanctuary', () => {
  beforeEach(() => {
    cy.visit('/');cy.get('#raceName').clear().type('Balance Tester');cy.get('#btnBegin').click()
    cy.window().then(win=>win.eval(`(() => {
      window.check=(ok,msg)=>{if(!ok)throw new Error(msg)}
      replayRecording=false;replayPlaying=false;replayAnimationsDisabled=true;deathTransition=null
      currentZ=0;map=surfaceMap;enemies=[];npcs=[{name:'Merchant',x:120,y:120,homeX:120,homeY:120,talkFreezeTurns:0}];groundItems=[];occupied=new Set();oldHunterQuest=null
      player.x=40;player.y=50;player.hp=1000;player.maxHp=1000;player.race='human';player.lvl=1
      player.inventory=[];player.equip={weapon:null,shield:null,armor:null};player.curseDebuffs=[]
      player.godMode=false;player.invisibleTurns=0;player.poisonTurns=0;resetSwimming()
      spawnPoint={x:120,y:120};camX=35;camY=45
      for(let y=25;y<80;y++)for(let x=20;x<90;x++){map[y][x]='grass';discovered[y][x]=true;grasslandTrees.delete(keyXY(x,y))}
      window.makeBalanceEnemy=(name,extra={})=>{const t=ENEMY_TEMPLATE_BY_NAME[name];const e=addEnemy({...t,name,baseName:name,x:41,y:50,level:0,
        alive:true,hp:100,maxHp:100,equipment:null,prefix:null,aware:false,alarmed:false,sleeping:false,...extra});occupied.add(keyXY(e.x,e.y));return e}
    })()`))
  })
  it('scales positive gear stats, keeps penalties and loot intact, and persists the multiplier', () => {
    cy.window().then(win=>win.eval(`(() => {
      const e=makeBalanceEnemy('Goblin'),factor=e.gearScale
      check(factor>=.5&&factor<=.7,'factor in range')
      const item={kind:'weapon',name:'Test sword',atk:10,grace:5,mod:'spd',modAmt:2,tier:2}
      const original=JSON.stringify(item),atk=e.atk,spd=e.spd
      applyEnemyEquipment(e,item)
      check(Math.abs(e.atk-atk-10*factor)<1e-9&&Math.abs(e.spd-spd-2*factor)<1e-9,'all positive weapon stats scaled')
      check(Math.abs(combatDelay(item,false,e)-6/(5*factor))<1e-9,'weapon grace scaled')
      check(JSON.stringify(item)===original,'loot stats intact')
      const saved=JSON.parse(JSON.stringify(buildSaveObject())),rngBefore=rngState
      loadGameFromObject(saved,{isReplayInit:true});const loaded=enemies.find(x=>x.id===e.id)
      check(loaded.gearScale===factor&&loaded.atk===e.atk&&(rngState|0)===(rngBefore|0),'load does not reapply or reroll '+JSON.stringify({factor,loadedFactor:loaded.gearScale,atk:e.atk,loadedAtk:loaded.atk,rngBefore,rngState}))
      applyEnemyEquipment(loaded,{kind:'armor',name:'Armor',def:10,mod:'hp',modAmt:10})
      check(Math.abs(loaded.atk-atk)<1e-9&&Math.abs(loaded.spd-Math.max(1,spd-1))<1e-9,'replacement removes previous stats and preserves penalty')
      check(loaded.hp===100+Math.round(10*factor),'rounded hp gain')
    })()`))
  })
  it('adds the racial stat at every fifth level and announces combined level gains', () => {
    cy.window().then(win=>win.eval(`(() => {
      const originalPopup=showLevelUpPopup;let shown
      showLevelUpPopup=g=>shown=g
      try {for(const [race,stat] of [['orc','atk'],['dwarf','def'],['catling','spd']]){
        player.race=race;player.lvl=4;player.xp=0
        check(raceBonus(stat)===3,'old initial racial bonus')
        gainXp(xpToNext(4));check(player.lvl===5&&raceBonus(stat)===4&&shown[stat]===1,'fifth-level bonus and notification')
        const before=raceBonus(stat);player.lvl=10;check(raceBonus(stat)===before+1,'tenth-level bonus')
      }}finally{showLevelUpPopup=originalPopup}
    })()`))
  })
  it('survives one lethal hit, persists the spent shield and dies on the next strike', () => {
    cy.window().then(win=>win.eval(`(async () => {
      const e=makeBalanceEnemy('Gargoyle');player.baseAtk=10000;player.baseSpd=100
      const originalChance=chance;chance=()=>false
      try {
        check(tileInspectInfo(e.x,e.y).html.includes('Death Shield · ready'),'ready tooltip')
        const kills=player.kills;await playerAttackEnemy(e,true)
        check(e.alive&&e.hp===1&&e.deathShieldUsed&&player.kills===kills,'first fatal hit does not award kill')
        check(tileInspectInfo(e.x,e.y).html.includes('Death Shield · spent'),'spent tooltip')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()));loadGameFromObject(saved,{isReplayInit:true})
        const loaded=enemies.find(x=>x.id===e.id);check(loaded.deathShieldUsed&&loaded.hp===1,'spent persists')
        await playerAttackEnemy(loaded,true);check(!loaded.alive&&player.kills===kills+1,'second strike kills exactly once')
      }finally{chance=originalChance}
    })()`))
  })
  it('repeats shield consumption from a saved start and permits a fatal extra strike', () => {
    cy.window().then(win=>win.eval(`(async () => {
      const e=makeBalanceEnemy('Gargoyle');player.baseAtk=10000;player.baseSpd=100
      player.equip.weapon={kind:'weapon',name:'Test blade',base:'Club',atk:1,grace:5,tier:1}
      const saved=JSON.parse(JSON.stringify(buildSaveObject()))
      const run=async()=>{await playerAttackEnemy(enemies.find(x=>x.id===e.id),true);return JSON.stringify({hp:enemies.find(x=>x.id===e.id).hp,spent:enemies.find(x=>x.id===e.id).deathShieldUsed,rng:rngState})}
      const first=await run();loadGameFromObject(saved,{isReplayInit:true});check(await run()===first,'shield combat replay is deterministic')
      loadGameFromObject(saved,{isReplayInit:true});const original=canGetExtraWeaponAttack
      canGetExtraWeaponAttack=()=>true
      try {await playerAttackEnemy(enemies.find(x=>x.id===e.id));check(!enemies.some(x=>x.id===e.id),'extra strike kills after shield in same action')}
      finally{canGetExtraWeaponAttack=original}
    })()`))
  })
  it('retreats from the temple while the player is elsewhere or invisible, without attacks', () => {
    cy.window().then(win=>win.eval(`(() => {
      spawnPoint={x:50,y:50};player.x=80;player.y=50;player.invisibleTurns=20
      const e=makeBalanceEnemy('Goblin',{x:60,y:50,aware:true,shooterAbility:'stones',shotsRemaining:10})
      const hp=player.hp,rngBefore=rngState
      check(!enemyAttackPlayer(e)&&!enemyRangedAttackPlayer(e),'immediate melee and ranged attacks suppressed')
      check(player.hp===hp&&e.shotsRemaining===10&&rngState===rngBefore,'blocked attacks cost no ammo or RNG')
      enemyTurn();check(e.x===62&&!e.aware&&e.fleeingHoly,'retreats away from temple not toward player')
      enemyTurn();enemyTurn();check(Math.max(Math.abs(e.x-50),Math.abs(e.y-50))>=15,'reaches sanctuary boundary')
      currentZ=-1;e.level=-1;e.x=50;e.y=50;check(!enemyInsideSanctuary(e),'underground is not sanctuary')
    })()`))
  })
  it('colours each equipment name, including equal names with different tiers', () => {
    cy.window().then(win=>win.eval(`(() => {
      const oldLog=log;let entry
      log=(message,cls,highlights)=>entry={message,highlights}
      try {
        player.equip.weapon={kind:'weapon',name:'Sword',tier:1,atk:1,grace:3}
        player.inventory=[{kind:'weapon',name:'Sword',tier:3,atk:4,grace:3}]
        equipItem(0)
        check(entry.message.includes('unequip the Sword and equip the Sword'),'swap message')
        const div=document.createElement('div');decorateLogMessage(div,entry.message,entry.highlights)
        check(div.querySelector('.tier1')?.textContent==='Sword'&&div.querySelector('.tier3')?.textContent==='Sword','both tiers coloured independently')
        unequipItem('weapon');check(entry.highlights[0].tier===3,'unequip colour')
      }finally{log=oldLog}
    })()`))
  })
})
