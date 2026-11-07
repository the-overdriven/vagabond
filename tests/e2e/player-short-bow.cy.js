function beginNewGame(name) {
  cy.visit('/')
  cy.get('#raceName').clear().type(name)
  cy.get('#btnBegin').click()
  cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
  cy.get('#raceOverlay').should('not.have.class', 'show')
}

describe('Player Short Bow', () => {
  it('sells bow and separate ten-arrow bundles; auto-recovers shooter arrows and rare bow drops', () => {
    cy.viewport(1440, 900)
    beginNewGame('Bow Merchant Tester')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      const bow=merchantStock.find(i=>i.base==='Short Bow')
      const arrows=merchantStock.find(i=>i.kind==='arrows'&&i.bundleSize===10)
      check(bow?.merchantPrice===300,'Short Bow costs 300 gold')
      check(arrows?.merchantPrice===20,'ten-arrow bundle costs 20 gold')
      check(itemSellValue(bow)===30,'Short Bow resells for 30 gold')
      player.gold=400
      player.inventory=[]
      buyItem(bow)
      check(player.gold===100 && player.inventory.some(i=>i.base==='Short Bow'),'buying bow costs 300')
      check(!player.inventory.some(i=>i.kind==='arrows'),'bow purchase gives no free ammunition')
      buyItem(arrows)
      check(player.gold===80 && player.inventory.find(i=>i.kind==='arrows')?.count===10,
        'one bundle adds exactly ten arrows for 20 gold')
      check(merchantStock.includes(arrows),'arrows remain available for later purchases')

      currentZ=0;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      const template=ENEMY_TEMPLATE_BY_NAME.Kobold
      const shooter=addEnemy({...template,id:'bow-loot-shooter',baseName:'Kobold',name:'Kobold',
        x:player.x+2,y:player.y,level:0,alive:true,hp:1,maxHp:1,
        equipment:null,shooterAbility:'shooterArrows',shotsRemaining:4})
      occupied.add(keyXY(shooter.x,shooter.y))
      const oldChance=chance
      try {
        chance=p=>p===RANGED_CONFIG.shortBowDropChance
        killEnemy(shooter)
      } finally {chance=oldChance}
      check(player.inventory.find(i=>i.kind==='arrows')?.count===14,
        'all four remaining enemy arrows arrive directly in the inventory')
      check(player.inventory.filter(i=>i.base==='Short Bow').length===2,
        'seeded bow drop enters inventory without auto-equipping')
      check([...document.querySelectorAll('#logpanel')].some(el=>el.textContent.includes('4 arrows')),
        'the recovered ammunition appears in the message log')
    })()`))
  })

  it('checks range/obstructions/ammunition and records deterministic shots against enemy IDs', () => {
    cy.viewport(1440, 900)
    beginNewGame('Bow Combat Tester')
    cy.window().then(win => win.eval(`(async () => {
      const check=(ok,msg)=>{if(!ok)throw Error(msg)}
      replayPlaying=false;replayRecording=false;replayAnimationsDisabled=true
      currentZ=0;currentCave=-1;map=surfaceMap;deathTransition=null
      enemies=[];npcs=[];groundItems=[];occupied=new Set();turnCount=0
      for(let y=36;y<=47;y++)for(let x=36;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y))
      }
      player.x=40;player.y=40;player.hp=1000;player.maxHp=1000
      player.rootTurns=0;player.confusionTurns=0;player.berserkTurns=0
      player.godMode=false;player.invisibleTurns=0
      player.equip={weapon:makeShortBowItem(),armor:null,shield:null}
      player.inventory=[createItem('arrows',{count:3})]
      snapCameraToPlayer()
      const t=ENEMY_TEMPLATE_BY_NAME.Goblin
      const enemy=addEnemy({...t,id:'bow-target',name:'Goblin',baseName:'Goblin',x:44,y:40,
        level:0,alive:true,hp:100,maxHp:100,homeX:44,homeY:40,
        homeTileType:'grass',equipment:null,prefix:null,shooterAbility:null,shotsRemaining:0})
      occupied.add(keyXY(enemy.x,enemy.y))
      const oldEnemyTurn=enemyTurn,oldNpcTurn=npcTurn,oldChance=chance,oldDamage=damageRoll
      try {
        enemyTurn=()=>{turnCount++};npcTurn=()=>{}
        chance=()=>false;damageRoll=()=>5
        check(playerBowShotPath(enemy)?.length>1,'visible enemy in range can be shot')
        map[40][42]='mountain'
        check(!shootEnemy(enemy),'mountain blocks arrow')
        check(player.inventory[0].count===3 && turnCount===0,'blocked shot costs no arrows or turn')
        map[40][42]='grass'
        enemy.x=48
        check(!shootEnemy(enemy),'target more than six tiles away cannot be shot')
        enemy.x=44
        player.inventory=[]
        check(!shootEnemy(enemy) && turnCount===0,'no-ammo shot refuses to fire without consuming turn')
        player.inventory=[createItem('arrows',{count:3})]

        startReplayRecording()
        const beforeHp=enemy.hp
        check(shootEnemy(enemy),'legal shot succeeds')
        const afterHp=enemy.hp
        check(afterHp===beforeHp-5,'ranged damage uses fixed five ATK')
        check(enemy.alarmed,'shot immediately alarms its target')
        check(turnCount===1 && player.inventory[0].count===2,'valid shot costs one turn and one arrow')
        const recorded=structuredClone(replayData)
        check(recorded.actions.length===1 && recorded.actions[0].type==='shoot' &&
          recorded.actions[0].targetId==='bow-target','replay tracks the intended enemy identity')
        replayRecording=false
        loadGameFromObject(recorded.initialState,{isReplayInit:true})
        replayPlaying=true;replaySimulationMode=true;replayAnimationsDisabled=true
        const target=enemies.find(e=>e.id==='bow-target')
        check(target?.hp===beforeHp,'replay reset restores target health')
        await runReplayAction(recorded.actions[0])
        check(target.hp===afterHp && player.inventory.find(i=>i.kind==='arrows')?.count===2,
          'replaying the shot preserves damage and ammunition')
      } finally {
        enemyTurn=oldEnemyTurn;npcTurn=oldNpcTurn;chance=oldChance;damageRoll=oldDamage
        replayPlaying=false;replaySimulationMode=false;replayRecording=false
      }
    })()`))
  })
})
