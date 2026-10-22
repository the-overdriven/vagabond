describe('Wyrdhag consumable healing and individual monster loot', () => {
  it('uses one boosted healing item per lifetime, flees when wounded, and persists its spent charge', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Wyrdhag Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,why)=>{if(!ok)throw Error(why)}
      replayRecording=false;replayAnimationsDisabled=true
      const t=ENEMY_TEMPLATE_BY_NAME.Wyrdhag,origChance=chance,origItems=t.consumableHealing.items
      const x=39,y=40
      currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];occupied=new Set()
      for(let yy=35;yy<=45;yy++)for(let xx=35;xx<=45;xx++)map[yy][xx]='grass'
      player.x=40;player.y=40;player.invisibleTurns=0;player.godMode=false
      spawnPoint={x:4,y:4}
      const e=addEnemy({...t,name:t.name,baseName:t.name,x,y,level:0,levelKind:null,
        caveIndex:-1,hp:30,maxHp:68,alive:true,aware:true,homeX:x,homeY:y})
      occupied.add(keyXY(x,y))
      check(enemyHasAbility(e,'flee') && enemyHasAbility(e,'consumeHealingItem'),'both abilities present')
      try {
        chance=p=>p===0.1
        t.consumableHealing.items=[{kind:'herb',belowHp:0.5,weight:1}]
        const turn=turnCount
        enemyTurn()
        check(e.hp===55 && e.consumableHealUsed,'herb restores 25 HP (20 base × 1.25)')
        check(turnCount===turn+1 && e.x===x && e.y===y,'healing consumed the entire monster action')
        const saved=JSON.parse(JSON.stringify(buildSaveObject()))
        loadGameFromObject(saved,{isReplayInit:true})
        const restored=enemies.find(m=>m.id===e.id)
        check(restored.consumableHealUsed===true,'spent healing persists')
        restored.hp=5
        check(!tryEnemyConsumableHealing(restored),'no second healing item')
        // Other configured food heals without player mushroom poison rolls.
        restored.consumableHealUsed=false;restored.hp=30
        t.consumableHealing.items=[{kind:'mushroom',belowHp:0.5,weight:1}]
        check(tryEnemyConsumableHealing(restored) && restored.hp===51,
          'mushroom always restores 21 HP (17 base × 1.25)')
        restored.consumableHealUsed=false;restored.hp=10
        t.consumableHealing.items=[{kind:'potion',belowHp:0.2,weight:1}]
        check(tryEnemyConsumableHealing(restored) && restored.hp===68,'potion fully heals below 20%')
        restored.consumableHealUsed=false;restored.hp=15
        check(!tryEnemyConsumableHealing(restored),'Life Potion unavailable at 20% or higher')
      } finally {chance=origChance;t.consumableHealing.items=origItems}
    })()`))
  })

  it('has one independent 20% drop roll across equally weighted consumables', () => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Wyrdhag Loot Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout:60000}).should('not.be.visible')
    cy.window().then(win => win.eval(`(() => {
      const check=(ok,why)=>{if(!ok)throw Error(why)}
      const t=ENEMY_TEMPLATE_BY_NAME.Wyrdhag,origChance=chance
      const items=t.lootTable.items
      check(t.lootTable.chance===0.2 && items.length===3 &&
        items.every(it=>it.weight===1) &&
        ['potion','herb','mushroom'].every(k=>items.some(it=>it.kind===k)),
        '20% total chance is split equally')
      const before=player.inventory.reduce((sum,it)=>sum+(['potion','herb','mushroom'].includes(it.kind)?(it.count||1):0),0)
      const enemy={name:'Wyrdhag',baseName:'Wyrdhag',humanoid:false,tier:4}
      try {
        chance=p=>p===0.2
        lootFromEnemy(enemy)
        const after=player.inventory.reduce((sum,it)=>sum+(['potion','herb','mushroom'].includes(it.kind)?(it.count||1):0),0)
        check(after===before+1,'successful monster table produces exactly one item')
        chance=()=>false
        lootFromEnemy(enemy)
        const final=player.inventory.reduce((sum,it)=>sum+(['potion','herb','mushroom'].includes(it.kind)?(it.count||1):0),0)
        check(final===after,'failed roll produces no item')
      } finally {chance=origChance}
    })()`))
  })
})
