describe('Flying and ethereal creatures on dungeon pressure plates',()=>{
  it('ignores their floor-trigger entries while preserving ordinary grounded triggers',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__airborneSave=save
        win.eval(`(() => {
          loadGameFromObject(window.__airborneSave,{isReplayInit:true})
          replayRecording=false;replayAnimationsDisabled=true
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const terrain=blankCaveMap(),x=35,y=35
          terrain[y][x]='marble'
          const floor={kind:'dwarvenRuins',dungeonPackage:'dwarvenRuins',map:terrain,
            caves:[{entrances:[{x,y}]}],traps:[{id:'floor-test',type:'spikes',trigger:{x,y}}],
            hazards:[{id:'crusher-test',type:'crusher',state:'idle',step:0,localTurn:0,
              geometry:{triggerTiles:[{x,y}]}}]}
          deepLevels[2]=floor;currentZ=-4;currentCave=-1;map=terrain;groundItems=[];enemies=[]
          const actor=(name,abilities)=>({id:name,name,baseName:name,alive:true,
            level:-4,levelKind:'chain',x,y,atk:1,def:0,spd:1,grace:1,
            hp:100,maxHp:100,tier:1,abilities,equipment:null})
          const seed=rngState
          for(const [name,abilities] of [['Ghost',['ethereal']],['Harpy',['fly']]]){
            const e=actor(name,abilities);enemies=[e]
            DungeonTraps.onEntry(e,x-1,y);DungeonHazards.onActorEntered(e,x-1,y)
            check(e.hp===100 && floor.hazards[0].state==='idle' && rngState===seed,
              name+' must not depress a trigger')
          }
          const grounded=actor('Goblin',[]);enemies=[grounded]
          DungeonTraps.onEntry(grounded,x-1,y);DungeonHazards.onActorEntered(grounded,x-1,y)
          check(grounded.hp<100 && floor.hazards[0].state==='warning',
            'grounded creatures still trigger both hazards')
        })()`)
        delete win.__airborneSave
      })
    })
  })
})
