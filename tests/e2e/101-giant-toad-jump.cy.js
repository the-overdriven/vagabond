describe('Giant Toad generic Jump',()=>{
  it('prepares and completes a positioning leap without adding a floor marker',()=>{
    cy.visit('/')
    cy.get('#raceName').clear().type('Toad Jump Tester')
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.window().then(win=>win.eval(`(()=>{
      const check=(condition,message)=>{if(!condition)throw Error(message)}
      const template=ENEMY_TEMPLATE_BY_NAME['Giant Toad']
      check(template.rarity===0.15,'Giant Toad rarity weight is 0.15')
      check(template.abilities.includes('jump'),'Giant Toad has generic Jump')
      enemies=[];occupied=new Set();currentZ=0;currentCave=-1;map=surfaceMap
      player.x=40;player.y=40;player.invisibleTurns=0;player.godInvisible=false
      for(let y=35;y<=45;y++)for(let x=35;x<=45;x++)map[y][x]='grass'
      const toad=addEnemy({...template,baseName:template.name,x:44,y:40,
        level:0,levelKind:null,hp:template.hp,maxHp:template.hp,
        homeX:44,homeY:40,homeTileType:'grass',alive:true,sleeping:false,
        equipment:null,aware:true})
      const firstX=toad.x
      check(tryPrepareEnemyJump(toad),'Giant Toad can prepare a legal leap')
      check(toad.pendingAbility?.type==='jump','prepared Jump uses normal saved state')
      const landing={...toad.pendingAbility.destination}
      check(landing.x<firstX,'leap closes distance to the player')
      check(!RENDER_STYLE.overlays.jumpWarningImage,'Jump remains marker-free')
      const hp=player.hp
      turnCount++
      resolveEnemyTelegraphIfPending(toad)
      check(toad.x===landing.x && toad.y===landing.y,'Jump lands at prepared coordinates')
      check(player.hp===hp,'landing cannot deal immediate melee damage')
      check(enemyAbilityCooldown(toad,'jump')===4,'ordinary Jump cooldown applies')
    })()`))
  })
})
