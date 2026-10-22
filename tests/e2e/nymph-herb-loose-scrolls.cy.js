describe('Nymph herbs and surface scroll variety',()=>{
  it('uses the independent herb drop table and replaces most loose invisibility scrolls',()=>{
    cy.visit('/')
    cy.get('#loadingOverlay',{timeout:60000}).should('not.be.visible')
    cy.readFile('tests/saves/Tester_start.json').then(save=>{
      cy.window().then(win=>{
        win.__lootSave=save
        win.eval(`(()=>{
          loadGameFromObject(window.__lootSave,{isReplayInit:true})
          const check=(ok,msg)=>{if(!ok)throw Error(msg)}
          const oldChance=chance,oldRng=rng,oldLog=log
          try {
            log=()=>{};player.inventory=[]
            const n=ENEMY_TEMPLATE_BY_NAME.Nymph
            check(n.lootTable?.chance===0.2 && n.lootTable.items[0].kind==='herb',
              'nymph has a 20% independent herb drop chance')
            chance=p=>p===0.2
            lootFromEnemy({...n,baseName:'Nymph',equipment:null})
            check(player.inventory.filter(i=>i.kind==='herb').length===1,
              'a successful drop gives exactly one herb')
            player.inventory=[];chance=()=>false
            lootFromEnemy({...n,baseName:'Nymph',equipment:null})
            check(!player.inventory.length,'failed roll leaves no herb')
            check(LOOSE_SCROLL_VARIANTS.chance===0.75 &&
              LOOSE_CONSUMABLE_VARIANTS.chance===0.4,
              'surface scroll redistribution leaves speed-potion tuning unchanged')
            chance=p=>p===0.75
            check([0,0.51,0.9].map(v=>{
              rng=()=>v;return rollLooseSupplyKind('scrollOfInvisibility')
            }).join(',')==='idscroll,scrollOfFear,scrollOfChaos',
              'all three approved scroll alternatives can spawn')
            check(rollLooseSupplyKind('speedpotion')==='speedpotion',
              'original tactical speed-potion conversion remains independent')
          } finally {chance=oldChance;rng=oldRng;log=oldLog}
        })()`)
        delete win.__lootSave
      })
    })
  })
})
