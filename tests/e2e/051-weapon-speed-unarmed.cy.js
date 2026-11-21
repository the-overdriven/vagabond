describe('Unarmed enemy weapon-speed follow-up messages',()=>{
  it('names the creature, while armed enemies still name their weapon',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__speedSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__speedSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const old={chance,damageRoll,log,canGetExtraWeaponAttack}
          try {
            replayRecording=false;replayAnimationsDisabled=true
            currentZ=0;currentCave=-1;map=surfaceMap
            map[40][40]='grass';map[40][41]='grass'
            player.x=40;player.y=40;player.hp=500;player.maxHp=500
            player.godMode=false;player.invisibleTurns=0
            player.equip.weapon={kind:'weapon',name:'Mighty Lance',base:'Lance',atk:5,grace:2}
            enemies=[];npcs=[];occupied=new Set()
            const m=ENEMY_TEMPLATE_BY_NAME.Monkey
            const enemy=addEnemy({...m,name:m.name,baseName:m.name,
              x:41,y:40,level:0,levelKind:null,alive:true,aware:true,alarmed:true,
              hp:m.hp,maxHp:m.hp,equipment:null})
            const messages=[]
            chance=()=>false;damageRoll=()=>1;log=msg=>messages.push(msg)
            canGetExtraWeaponAttack=()=>true
            enemyAttackPlayer(enemy)
            check(messages.includes('Monkey outpaces your Mighty Lance, striking again!'),
              'unarmed speed follow-up uses monster name')
            messages.length=0
            enemy.equipment={kind:'weapon',base:'Axe',name:'Axe',atk:1,grace:2,tier:1}
            enemyAttackPlayer(enemy)
            check(messages.includes("Monkey's Axe outpaces your Mighty Lance, striking again!"),
              'armed speed follow-up still names weapon')
          } finally {
            chance=old.chance;damageRoll=old.damageRoll;log=old.log
            canGetExtraWeaponAttack=old.canGetExtraWeaponAttack
          }
        })()`)
        delete win.__speedSave
      })
    })
  })
})
