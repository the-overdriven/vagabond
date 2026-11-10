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
            check(n.lootTable?.[0]?.chance===0.2 && n.lootTable[0].items[0].kind==='herb',
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
              itemDefinition('meat').icon==='img/icons/meat.svg' && !itemDefinition('meat').actions.length,
              'meat exists as a stackable supply with its icon and no food effect')
            check(itemIconKinds().includes('meat') && itemIconHTML({kind:'meat'}).includes('img/icons/meat.svg'),
              'meat resolves its supplied SVG icon')
            check(Object.keys(meatDrops).length===32,'all selected species are covered')
            chance=p=>p===1
            for(const [species,count] of Object.entries(meatDrops)) {
              const t=ENEMY_TEMPLATE_BY_NAME[species]
              check(t && !t.humanoid && t.lootTable?.[0]?.chance===1 &&
                t.lootTable[0].items.length===1 && t.lootTable[0].items[0].kind==='meat' &&
                t.lootTable[0].items[0].weight===1 && t.lootTable[0].items[0].count===count,
                species+' has the requested guaranteed meat count')
              player.inventory=[]
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.length===1 && player.inventory[0].kind==='meat' &&
                player.inventory[0].count===count,
                species+' grants the entire meat stack in one loot roll')
            }
            // Poisonous meat sources also provide a separate, optional gland.
            for (const [species,meatCount] of [['Wyvern',3],['Manticore',2],['Alacran',1]]) {
              const t=ENEMY_TEMPLATE_BY_NAME[species]
              const extra=t.lootTable.slice(1)
              check(extra.length===1 && extra[0].chance===0.55 &&
                extra[0].items.length===1 && extra[0].items[0].kind==='venomGland' &&
                extra[0].items[0].count===1,
                species+' has an independent 55% venom gland drop')
              chance=p=>p===1 || p===0.55
              player.inventory=[]
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.some(i=>i.kind==='meat' && i.count===meatCount) &&
                player.inventory.some(i=>i.kind==='venomGland' && i.count===1),
                species+' can drop guaranteed meat and a venom gland together')
              chance=p=>p===1
              player.inventory=[]
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.length===1 && player.inventory[0].kind==='meat' &&
                player.inventory[0].count===meatCount,
                species+' retains meat when the gland roll fails')
              chance=p=>p===1 || p===0.55
              groundItems=[]
              lootFromEnemy({...t,baseName:species,equipment:null,x:player.x,y:player.y,
                level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave},true)
              check(groundItems.some(g=>g.item?.kind==='meat' && g.item.count===meatCount) &&
                groundItems.some(g=>g.item?.kind==='venomGland' && g.item.count===1),
                species+' leaves both kinds of loot at the death tile')
            }
            for(const t of ENEMY_TEMPLATES) {
              if (!t.humanoid && !(t.name in meatDrops))
                check(!t.lootTable?.some(drop=>drop.items?.some(item=>item.kind==='meat')),
                  t.name+' must not drop meat')
            }
            chance=p=>p===1;player.inventory=[];groundItems=[]
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
            const materialDrops = {
  Snake:['shedSkin',0.50,1],Scarab:['chitin',0.40,1],'Giant Bug':['chitin',0.50,1],
  Witherpod:['blightedRoot',0.50,1],Cobra:['venomGland',0.55,1],
  Scorpion:['venomGland',0.60,1],Dreadling:['blightedRoot',0.45,1],
  'Giant Spider':['spiderSilk',0.70,1],NULK:['rareTrophy',1,1],
  SKELD:['rareTrophy',1,1],DRUSK:['rareTrophy',1,1],GAUR:['rareTrophy',1,1],
  ASHFANG:['rareTrophy',1,1],MIREHOWL:['rareTrophy',1,1],NHALUUN:['rareTrophy',1,1],
  Vrakeber:['amethyst',0.40,1],Bellroach:['chitin',0.65,1],
  Tholosum:['chitin',0.75,2],Xibal:['venomGland',0.60,1]
}
            check(Object.keys(materialDrops).length===19,'nineteen alternative-loot beasts are configured')
            const values={shedSkin:4,chitin:5,blightedRoot:6,venomGland:10,
              spiderSilk:12,rareTrophy:60,amethyst:16}
            for(const [kind,value] of Object.entries(values)) {
              const def=itemDefinition(kind)
              check(def?.stackable===true && def.sellValue===value,
                kind+' exists as a stackable tradeable item')
              if(kind!=='amethyst')
                check(def.icon==='img/icons/'+kind+'.svg' &&
                  itemIconHTML({kind}).includes('img/icons/'+kind+'.svg'),
                  kind+' resolves its supplied SVG icon')
            }
            for(const [species,[kind,probability,count]] of Object.entries(materialDrops)) {
              const t=ENEMY_TEMPLATE_BY_NAME[species]
              check(t && !t.humanoid && t.lootTable?.[0]?.chance===probability &&
                t.lootTable[0].items.length===1 && t.lootTable[0].items[0].kind===kind &&
                t.lootTable[0].items[0].weight===1 && t.lootTable[0].items[0].count===count,
                species+' has the exact material probability and quantity')
              player.inventory=[];chance=p=>p===probability
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.length===1 && player.inventory[0].kind===kind &&
                player.inventory[0].count===count,species+' drops a complete material stack')
              player.inventory=[];chance=()=>false
              lootFromEnemy({...t,baseName:species,equipment:null})
              check(player.inventory.length===0,species+' has no guaranteed drop if its roll fails')
              if(probability<1) {
                chance=p=>rng()<p;rng=()=>probability-0.000001
                player.inventory=[];lootFromEnemy({...t,baseName:species,equipment:null})
                check(player.inventory.some(i=>i.kind===kind),species+' succeeds below chance boundary')
                rng=()=>probability
                player.inventory=[];lootFromEnemy({...t,baseName:species,equipment:null})
                check(!player.inventory.some(i=>i.kind===kind),species+' fails at chance boundary')
              }
            }
            check(!ENEMY_TEMPLATE_BY_NAME.Fungus.lootTable,
              'Fungus still uses guaranteed mushroom drops only')
            check(ENEMY_TEMPLATE_BY_NAME['Giant Spider'].lootTable[1].chance===0.55 &&
              ENEMY_TEMPLATE_BY_NAME['Giant Spider'].lootTable[1].items[0].kind==='venomGland',
              'Giant Spider rolls venom independently from silk')
            chance=()=>false;rng=()=>0;player.inventory=[]
            lootFromEnemy({...ENEMY_TEMPLATE_BY_NAME.Fungus,baseName:'Fungus',equipment:null})
            check(player.inventory.find(i=>i.kind==='mushroom')?.count===1,
              'Fungus still guarantees mushrooms regardless of material loot rolls')
            const tholosum=ENEMY_TEMPLATE_BY_NAME.Tholosum
            chance=p=>p===0.75;player.inventory=[];groundItems=[]
            const corpse={...tholosum,baseName:'Tholosum',x:player.x,y:player.y,
              level:currentZ,levelKind:currentLevelKind(),caveIndex:currentCave,equipment:null}
            lootFromEnemy(corpse,true);lootFromEnemy(corpse,true)
            check(groundItems.filter(g=>g.item?.kind==='chitin').length===1 &&
              groundItems[0].item.count===4,'two Tholosums yield one stack of four chitin')
            const materialSave=buildSaveObject()
            loadGameFromObject(materialSave,{isReplayInit:true})
            check(groundItems.find(g=>g.item?.kind==='chitin')?.item.count===4,
              'chitin ground stack survives save and replay initialization')
            lootSkeletonOrForage()
            check(player.inventory.some(i=>i.kind==='chitin' && i.count===4),
              'the saved chitin stack can be collected in one action')
            check(LOOSE_SCROLL_VARIANTS.chance===0.75 &&
              LOOSE_CONSUMABLE_VARIANTS.chance===0.4,
              'surface scroll redistribution leaves speed-potion tuning unchanged')
            chance=p=>p===0.75
            check([0,0.51,0.75,0.9].map(v=>{
              rng=()=>v;return rollLooseSupplyKind('scrollOfInvisibility')
            }).join(',')==='idscroll,scrollOfFear,scrollOfChaos,scrollOfFireball',
              'all four approved scroll alternatives can spawn')
            check(rollLooseSupplyKind('speedpotion')==='speedpotion',
              'original tactical speed-potion conversion remains independent')
          } finally {chance=oldChance;rng=oldRng;log=oldLog}
        })()`)
        delete win.__lootSave
      })
    })
  })
})
