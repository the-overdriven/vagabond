describe('Blind monster feedback and concealed mine ambushers',()=>{
  it('names blind sensing, shows only Blind, and hides Trogloraptors before revelation',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__mineFeedbackSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__mineFeedbackSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          replayRecording=false;currentZ=0;currentCave=-1;map=surfaceMap
          player.x=40;player.y=40;player.invisibleTurns=0
          enemies=[];occupied=new Set();groundItems=[]
          for(let y=36;y<=44;y++)for(let x=36;x<=44;x++)map[y][x]='grass'
          const a=ENEMY_TEMPLATE_BY_NAME.Adelocosa
          const blind=addEnemy({...a,name:'Adelocosa',baseName:'Adelocosa',
            x:43,y:40,level:0,levelKind:null,alive:true,aware:true,
            hp:a.hp,maxHp:a.hp,homeX:43,homeY:40,homeTileType:'grass',equipment:null})
          const messages=[],oldLog=log,oldChance=chance,oldStep=enemyFindStep
          const oldVisible=enemyIsVisibleOnMainView
          try {
            log=message=>messages.push(message)
            enemyIsVisibleOnMainView=()=>true
            enemyFindStep=()=>({x:42,y:40});chance=()=>true
            logEnemySpotting(blind)
            check(messages[0]==='The blind Adelocosa has sensed you!',
              'blind spotting uses sensory message')
            check(blindPursuitHesitates(blind,3),'blind hesitation procs')
            check(messages[1]==='The blind Adelocosa senses you, but is reluctant about the direction.',
              'blind hesitation names monster and ends with punctuation')
            check(tileInspectInfo(blind.x,blind.y).html.includes('<div class="pfx">Blind</div>'),
              'Blind appears as a concise label in enemy inspection')
            // Both actors must have at most two walkable neighbors. Keep a
            // legal pursuit step and leave their own tiles walkable.
            for(let y=39;y<=41;y++)for(let x=39;x<=44;x++)map[y][x]='dwarvenwall'
            for(let x=39;x<=44;x++)map[40][x]='grass'
            const openings=(x,y)=>DIRS8.filter(([dx,dy])=>isWalkable(x+dx,y+dy)).length
            check(openings(blind.x,blind.y)===2&&openings(player.x,player.y)===2,
              'both blind monster and player have exactly two openings')
            let hesitationRolls=0
            chance=()=>{hesitationRolls++;return true}
            check(!blindPursuitHesitates(blind,3)&&hesitationRolls===0,
              'blind pursuit does not hesitate or consume RNG in a two-opening passage')
            // The monster in open space still hesitates even if the player is confined.
            map[39][43]='grass'
            check(openings(player.x,player.y)===2&&openings(blind.x,blind.y)===3,
              'only the blind monster has an additional opening')
            check(blindPursuitHesitates(blind,3)&&hesitationRolls===1,
              'open monster position overrides the narrow-player exception')
            chance=()=>true
            for(let y=36;y<=44;y++)for(let x=36;x<=44;x++)map[y][x]='grass'
            const t=ENEMY_TEMPLATE_BY_NAME.Trogloraptor
            const hidden=addEnemy({...t,name:t.name,baseName:t.name,
              x:42,y:40,level:0,levelKind:null,alive:true,aware:false,
              hp:t.hp,maxHp:t.hp,homeX:42,homeY:40,homeTileType:'grass',equipment:null,
              wallAmbushHidden:true,wallAmbushSpent:false})
            check(!enemyCanBeSeen(hidden),'concealed ambusher is not drawn')
            check(!tileInspectInfo(hidden.x,hidden.y)?.enemy,'cannot inspect concealed ambusher')
            revealEnemyWallAmbush(hidden)
            check(enemyCanBeSeen(hidden),'reveal exposes the ambusher')
            check(tileInspectInfo(hidden.x,hidden.y)?.enemy===hidden,'revealed ambusher is inspectable')
          } finally {
            log=oldLog;chance=oldChance;enemyFindStep=oldStep
            enemyIsVisibleOnMainView=oldVisible
          }
        })()`)
        delete win.__mineFeedbackSave
      })
    })
  })
})
