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
            const meatDrops = {
  'Giant Rat':1,'Giant Bat':1,Boar:2,Wolf:1,Hogwyrm:2,Jackal:1,Hyena:1,Vulture:1,'Giant Toad':1,
  'Giant Crab':2,Murkspawn:1,Owlbear:3,Serpent:2,Lion:2,Chupacabra:1,Harpy:1,'White Tiger':2,
  'Bog Spitter':1,Thornmaw:1,Glaber:1,Tmusapod:1,Adelocosa:1,Barolg:1,Alacran:1,Amplyg:1,
  Wyvern:3,Manticore:2,Spineback:1,Marsutal:1,Trogloraptor:1,Sifulian:1,Akravis:1
}
            check(itemDefinition('meat')?.stackable===true &&
              itemDefinition('meat').icon===null && !itemDefinition('meat').actions.length,
              'meat exists as a stackable supply without an icon or food effect')
            check(!itemIconKinds().includes('meat') && itemIconHTML({kind:'meat'})==='',
              'missing meat artwork does not request a broken icon')
            check(Object.keys(meatDrops).length===32,'all selected species are covered')
            chance=p=>p===1
            for(const [species,count] of Object.entries(meatDrops)) {
              const t=ENEMY_TEMPLATE_BY_NAME[species]
              check(t && !t.humanoid && t.lootTable?.chance===1 &&
                t.lootTable.items.length===1 && t.lootTable.items[0].kind==='meat' &&
                t.lootTable.items[0].weight===1 && t.lootTable.items[0].count===count,
                species+' has the requested guaranteed meat count')
              player.inventory=[]
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.length===1 && player.inventory[0].kind==='meat' &&
                player.inventory[0].count===count,
                species+' grants the entire meat stack in one loot roll')
            }
            for(const t of ENEMY_TEMPLATES) {
              if (!t.humanoid && !(t.name in meatDrops))
                check(!t.lootTable?.items?.some(item=>item.kind==='meat'),
                  t.name+' must not drop meat')
            }
            player.inventory=[];groundItems=[]
            const wyvern=ENEMY_TEMPLATE_BY_NAME.Wyvern
            const deathTile={...wyvern,baseName:'Wyvern',x:player.x,y:player.y,
              level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,equipment:null}
            lootFromEnemy(deathTile,true)
            check(groundItems.length===1 && groundItems[0].kind==='droppeditem' &&
              groundItems[0].item.kind==='meat' && groundItems[0].item.count===3,
              'distant Wyvern kill produces one stacked ground drop')
            const snapshot=buildSaveObject()
            loadGameFromObject(snapshot,{isReplayInit:true})
            check(groundItems.some(g=>g.kind==='droppeditem' &&
              g.item?.kind==='meat' && g.item.count===3),
              'a three-meat drop retains its quantity after saving and loading')
            lootSkeletonOrForage()
            check(player.inventory.some(it=>it.kind==='meat' && it.count===3) &&
              !groundItems.some(g=>g.item?.kind==='meat'),
              'foraging recovers the full ground stack')
            player.inventory=[];chance=()=>false
            lootFromEnemy({name:'Scarab',baseName:'Scarab',tier:1,humanoid:false})
            check(!player.inventory.some(it=>it.kind==='meat'),
              'unselected non-humanoids do not drop meat')
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
