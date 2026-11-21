describe('Mine Burrow collision and shove',()=>{
  it('attacks an occupied marker or secret destination, then shoves only on a hit',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__burrowCollisionSave=save
        win.eval(`(()=>{
          loadGameFromObject(window.__burrowCollisionSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const oldChance=chance,oldHidden=playerHiddenFromEnemy
          const oldSanctuary=playerInsideSanctuary,oldEnemySanctuary=enemyInsideSanctuary
          const oldLog=log
          try {
            replayRecording=false;currentZ=0;currentCave=-1;map=surfaceMap
            enemies=[];occupied=new Set();turnCount=70
            player.x=40;player.y=40;player.invisibleTurns=0
            player.hp=1000;player.maxHp=1000
            for(let y=36;y<=45;y++)for(let x=36;x<=45;x++)map[y][x]='grass'
            playerHiddenFromEnemy=()=>false
            playerInsideSanctuary=()=>false;enemyInsideSanctuary=()=>false
            log=()=>{}
            const t=ENEMY_TEMPLATE_BY_NAME.Marsutal
            const enemy=addEnemy({...t,name:t.name,baseName:t.name,x:42,y:40,
              homeX:42,homeY:40,level:0,alive:true,hp:t.hp,maxHp:t.hp,equipment:null})
            occupied.add(keyXY(42,40))
            chance=()=>true
            check(tryPrepareEnemyBurrow(enemy),'Burrow prepares')
            player.x=42;player.y=40 // The only marked tile is the origin.
            const marked=JSON.parse(JSON.stringify(buildSaveObject()))
            const resolve=miss=>{
              loadGameFromObject(marked,{isReplayInit:true})
              const m=enemies.find(e=>e.baseName==='Marsutal')
              let accuracyRolls=0
              chance=p=>{if(Math.abs(p-0.1)<0.001)accuracyRolls++;return !!miss}
              turnCount=73
              resolveEnemyTelegraphIfPending(m)
              return {hp:player.hp,position:[player.x,player.y],
                monster:[m.x,m.y],pending:m.pendingAbility,accuracyRolls,rngState}
            }
            const hit=resolve(false)
            check(hit.hp<1000,'a collision hit uses real melee damage')
            check(hit.position[0]!==42 || hit.position[1]!==40,
              'the player is pushed from the marked tile')
            check(hit.monster[0]===42 && hit.monster[1]===40,
              'monster emerges where the player was standing')
            check(hit.accuracyRolls===1 && hit.pending===null,
              'exactly one fixed 90% accuracy roll is used')
            const replayedHit=resolve(false)
            check(JSON.stringify(hit)===JSON.stringify(replayedHit),
              'restoring the same state reproduces shove and RNG exactly')
            const miss=resolve(true)
            check(miss.hp===1000 && miss.position[0]===42 && miss.position[1]===40,
              'a missed collision does not shove the player')
            check(miss.accuracyRolls===1 && miss.pending===null,
              'miss uses its single attack and returns to a free fallback')
            check(miss.monster[0]!==42 || miss.monster[1]!==40,
              'miss never overlaps the player')
            loadGameFromObject(marked,{isReplayInit:true})
            const blocked=enemies.find(e=>e.baseName==='Marsutal')
            for(const [dx,dy] of DIRS8)map[40+dy][42+dx]='cavewall'
            const beforeHp=player.hp
            chance=()=>false;turnCount=73
            resolveEnemyTelegraphIfPending(blocked)
            check(blocked.x===-1 && blocked.pendingAbility?.type==='burrow',
              'no available shove tile leaves the monster underground')
            check(player.hp===beforeHp,'blocked shove never damages the player')
          } finally {
            chance=oldChance;playerHiddenFromEnemy=oldHidden
            playerInsideSanctuary=oldSanctuary;enemyInsideSanctuary=oldEnemySanctuary
            log=oldLog
          }
        })()`)
        delete win.__burrowCollisionSave
      })
    })
  })
})
