describe('Monster poison', () => {
  it('coats a melee weapon, preserves it on misses and glances, and poisons only living enemies', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Venom Melee Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldChance=chance,oldDamage=damageRoll
      try {
        replayAnimationsDisabled=true;player.berserkTurns=0;player.godMode=false
        currentZ=0;map=surfaceMap;enemies=[];occupied=new Set();npcs=[]
        player.x=40;player.y=40;player.equip.weapon=null
        player.inventory=[createItem('venomGland',{count:3})];turnCount=0
        enemyTurn=()=>{turnCount++};npcTurn=()=>{};damageRoll=()=>2
        useVenomGland(0)
        check(player.inventory[0].count===3 && turnCount===0,'unarmed use consumes nothing')
        const club={kind:'weapon',base:'Club',name:'Club',atk:3,grace:2,tier:1}
        player.equip.weapon=club
        useVenomGland(0)
        check(club.venomCoated===true && player.inventory[0].count===2 && turnCount===1,
          'coating spends one gland and one turn')
        useVenomGland(0)
        check(player.inventory[0].count===2 && turnCount===1,'coating an already prepared weapon is refused')
        renderInventory()
        check(!!document.querySelector('#slotWeapon .venom-marker'),'green weapon marker is visible')
        check(ENEMY_TEMPLATES.every(t=>typeof t.family==='string') &&
          ENEMY_TEMPLATE_BY_NAME.Skeleton.family==='undead' &&
          ENEMY_TEMPLATE_BY_NAME.Gargoyle.family==='construct','all templates declare families')
        const goblin=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'venom-goblin',x:41,y:40,
          hp:100,maxHp:100,level:0,homeX:41,homeY:40,alive:true,equipment:null})
        occupied.add(keyXY(goblin.x,goblin.y))
        chance=()=>true
        await playerAttackEnemy(goblin)
        check(club.venomCoated===true && goblin.poisonTurns===0,'miss preserves coating')
        goblin.equipment={kind:'armor',base:'Tunic',name:'Tunic',def:2}
        let rolls=0;chance=()=>(++rolls===2)
        await playerAttackEnemy(goblin)
        check(club.venomCoated===true && goblin.poisonTurns===0,'glancing hit preserves coating')
        chance=()=>false
        await playerAttackEnemy(goblin)
        check(!club.venomCoated && goblin.poisonTurns>0,'non-glancing hit poisons and spends coating')
        check(goblin.poisonDamageRemaining===20 && goblin.poisonDamagePerTurn===2 && goblin.poisonTurns===10,
          '100 HP target gets 20 damage budget over ten 2-damage ticks')
        const duration=goblin.poisonTurns,hp=goblin.hp
        turnCount=goblin.poisonAppliedTurn+1;tickEnemyPoison()
        check(goblin.hp===hp && goblin.poisonTurns===duration,'no immediate poison tick')
        turnCount++;tickEnemyPoison()
        check(goblin.hp===hp-2 && goblin.poisonTurns===duration-1 && goblin.poisonDamageRemaining===18,
          'next turn loses two HP ignoring DEF and spends exactly two damage budget')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        replayAnimationsDisabled=true
        const restored=enemies.find(e=>e.id==='venom-goblin')
        check(restored.poisonTurns===duration-1 && restored.poisonDamageRemaining===18 &&
          restored.poisonDamagePerTurn===2,'enemy poison budget and tick damage persist through save and load')
        const oneOff=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'venom-budget-target',
          x:43,y:40,hp:125,maxHp:125,level:0,alive:true,equipment:null})
        applyPlayerVenomToEnemy(oneOff)
        check(oneOff.poisonDamageRemaining===25 && oneOff.poisonDamagePerTurn===2 && oneOff.poisonTurns===13,
          '125 HP target gets exact 25 damage over 13 ticks')
        turnCount=oneOff.poisonAppliedTurn+2
        for(let i=0;i<12;i++){tickEnemyPoison();turnCount++}
        check(oneOff.hp===101 && oneOff.poisonDamageRemaining===1 && oneOff.poisonTurns===1,
          'the first twelve poison ticks consume 24 of 25 budget')
        tickEnemyPoison()
        check(oneOff.hp===100 && oneOff.poisonDamageRemaining===0 && oneOff.poisonTurns===0,
          'last tick deals only the one remaining HP')
        applyPlayerVenomToEnemy(oneOff)
        check(oneOff.poisonDamageRemaining===25 && oneOff.poisonTurns===13,
          'a new coating refreshes the budget instead of stacking')
        for(const [maxHp,budget,damage] of [[14,20,2],[43,20,2],[108,21,2],[132,26,2],[200,40,3],[300,60,4]]) {
          const target=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'venom-scale-'+maxHp,
            x:45,y:40,hp:maxHp,maxHp,level:0,alive:true,equipment:null})
          applyPlayerVenomToEnemy(target)
          check(target.poisonDamageRemaining===budget && target.poisonDamagePerTurn===damage &&
            target.poisonTurns===Math.ceil(budget/damage),'monster poison scales for '+maxHp+' HP')
        }
        player.equip.weapon.venomCoated=true
        const skeleton=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Skeleton,id:'venom-skeleton',
          x:41,y:40,hp:50,maxHp:50,level:0,alive:true,equipment:null})
        applyPlayerVenomToEnemy(skeleton)
        check(skeleton.poisonTurns===0,'undead are immune based on family')
        const gargoyle=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Gargoyle,id:'venom-gargoyle',
          x:42,y:40,hp:50,maxHp:50,level:0,alive:true,equipment:null})
        applyPlayerVenomToEnemy(gargoyle)
        check(gargoyle.poisonTurns===0,'constructs are immune based on family')
      } finally {
        enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;chance=oldChance;damageRoll=oldDamage
      }
    })()`))
  })

  it('prepares one bow arrow, keeps it through melee, and loses it on a missed shot', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Venom Bow Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldChance=chance,oldDamage=damageRoll
      try {
        replayAnimationsDisabled=true;player.berserkTurns=0;player.godMode=false
        currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
        for(let y=37;y<=45;y++)for(let x=37;x<=48;x++){
          map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
        }
        player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
        player.equip={weapon:makeShortBowItem(),shield:null,armor:null}
        player.inventory=[createItem('venomGland',{count:2})]
        enemyTurn=()=>{turnCount++};npcTurn=()=>{};damageRoll=()=>2
        useVenomGland(0)
        check(player.inventory[0].count===2 && !player.equip.weapon.venomCoated,
          'cannot prepare without arrows')
        player.inventory.push(createItem('arrows',{count:3}))
        useVenomGland(0)
        const bow=player.equip.weapon
        check(bow.venomCoated && player.inventory[0].count===1,'one arrow prepared')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved)
        replayAnimationsDisabled=true
        check(player.equip.weapon.venomCoated,'prepared arrow survives saving and loading')
        const enemy=addEnemy({...ENEMY_TEMPLATE_BY_NAME.Goblin,id:'venom-archery-target',
          x:43,y:40,homeX:43,homeY:40,level:0,alive:true,hp:100,maxHp:100,
          equipment:null,shooterAbility:null,shotsRemaining:0})
        occupied.add(keyXY(enemy.x,enemy.y))
        chance=()=>false
        await playerAttackEnemy(enemy)
        check(player.equip.weapon.venomCoated && enemy.poisonTurns===0,
          'hitting with bow in melee does not use prepared arrow')
        snapCameraToPlayer()
        chance=()=>true
        check(shootEnemy(enemy),'valid bow shot')
        check(!player.equip.weapon.venomCoated && enemy.poisonTurns===0,
          'miss loses arrow coating without poisoning')
        player.equip.weapon.venomCoated=true
        enemy.equipment={kind:'armor',base:'Tunic',name:'Tunic',def:2}
        let rolls=0;chance=()=>++rolls===2
        check(shootEnemy(enemy) && !player.equip.weapon.venomCoated && enemy.poisonTurns===0,
          'glancing arrow also loses its coating')
        enemy.equipment=null
        startReplayRecording()
        useVenomGland(player.inventory.findIndex(i=>i.kind==='venomGland'))
        chance=()=>false
        check(shootEnemy(enemy) && enemy.poisonTurns>0 && !player.equip.weapon.venomCoated,
          'successful shot poisons and spends arrow coating')
        const expectedTurns=enemy.poisonTurns
        const expectedDamage=enemy.poisonDamageRemaining
        const expectedRate=enemy.poisonDamagePerTurn
        const poisoned=JSON.parse(JSON.stringify(buildSaveObject()))
        const savedTarget=poisoned.enemies.find(e=>e.id==='venom-archery-target')
        check(savedTarget.poisonTurns>0 && savedTarget.poisonDamageRemaining===expectedDamage &&
          savedTarget.poisonDamagePerTurn===expectedRate,'poisoned target budget is serialized')
        const recording=structuredClone(replayData)
        check(recording.actions.length===2 && recording.actions[0].action==='venomGland' &&
          recording.actions[1].type==='shoot','venom and shot recorded as ordered actions')
        replayRecording=false
        loadGameFromObject(recording.initialState,{isReplayInit:true})
        replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
        activeReplay=recording;replayRngIndex=0
        for(const action of recording.actions) await runReplayAction(action)
        const replayTarget=enemies.find(e=>e.id==='venom-archery-target')
        check(replayTarget.poisonTurns===expectedTurns && replayTarget.poisonDamageRemaining===expectedDamage &&
          replayTarget.poisonDamagePerTurn===expectedRate && !player.equip.weapon.venomCoated &&
          replayRngIndex===recording.rng.length,'replay reproduces poison duration and charge use')
      } finally {
        enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;chance=oldChance;damageRoll=oldDamage
        replayPlaying=false;replayRecording=false;replaySimulationMode=false
      }
    })()`))
  })

  it('refreshes without stacking, persists, ticks, and is cured at full HP', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Poison Tester')
    cy.get('#btnBegin').click()
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      const check = (ok, message) => {if (!ok) throw new Error(message)}
      const oldChance = chance, oldRng = rng
      enemies = []; player.hp = playerMaxHp(); player.poisonTurns = 0
      try {
        chance = () => true; rng = () => 0.5
        applyEnemyPoison({name:'Scorpion',abilities:['poison']})
        const duration = Math.max(1, Math.min(40, Math.floor(playerMaxHp()*0.20)))
        check(player.poisonTurns === duration, 'base duration')
        player.poisonTurns = 1
        applyEnemyPoison({name:'Scorpion',abilities:['poison']})
        check(player.poisonTurns === duration, 'refresh replaces duration')
      } finally {chance = oldChance; rng = oldRng}
      const hp = player.hp
      const save = JSON.parse(JSON.stringify(buildSaveObject()))
      check(save.player.poisonTurns === player.poisonTurns, 'serialized poison')
      loadGameFromObject(save)
      check(player.poisonTurns === save.player.poisonTurns, 'restored poison')
      tickPlayerPoison()
      check(player.hp === hp-1 && player.poisonTurns === save.player.poisonTurns-1, 'one damage and one tick')
      player.lvl = 2; player.totalXpEarned = player.lastTempleHealXp
      player.hp = playerMaxHp(); player.poisonTurns = 5
      const earned = player.lastTempleHealXp
      tryTempleHeal()
      check(player.poisonTurns === 0 && player.lastTempleHealXp === earned, 'temple cures at full HP without spending blessing')
      player.hp = 1; player.poisonTurns = 5
      tryTempleHeal()
      check(player.poisonTurns === 0 && player.hp === 1, 'temple cures without XP but keeps HP restriction')
      for (const kind of ['herb','potion']) {
        player.hp = playerMaxHp(); player.poisonTurns = 5
        player.inventory.push({kind,count:1})
        const idx = player.inventory.length-1
        if (kind === 'herb') useHerb(idx); else usePotion(idx)
        check(player.poisonTurns === 0, 'cure at full HP: '+kind)
      }
    })()`))
  })

  for (const width of [1440, 390]) {
    it('shows poison in the active-status strip at '+width+'px', () => {
      cy.viewport(width, 900)
      cy.visit('/')
      cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
      cy.get('#raceOverlay').should('be.visible')
      if (width <= 720) {
        cy.get('#raceOverlay .panelbox').should($panel => {
          const panelTop = $panel[0].getBoundingClientRect().top
          const hudBottom = $panel[0].ownerDocument.getElementById('hud').getBoundingClientRect().bottom
          expect(panelTop, 'character form below HUD').to.be.at.least(hudBottom)
        })
      }
      cy.get('#raceName').clear().type('Poison UI')
      cy.get('#btnBegin').click()
      cy.get('#raceOverlay').should('not.have.class','show')
      cy.window().then(win => win.eval('player.poisonTurns=20; updateHud()'))
      cy.get('[data-status="poison"]').should('be.visible').and('contain','Poisoned').and('contain','20t')
      cy.window().then(win => win.eval('curePlayerPoison(); updateHud()'))
      cy.get('[data-status="poison"]').should('not.exist')
    })
  }
})
