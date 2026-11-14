'use strict'

// This dungeon is carved into the two existing global underground grids. The
// sparse, global-coordinate patches are the save/load source for its geometry;
// they are never separate playable maps.
let towerMaze = null
const TowerMaze = (() => {
  const DIRECTIONS = Object.freeze([
    {name:'east', dx:1, dy:0}, {name:'west', dx:-1, dy:0},
    {name:'north', dx:0, dy:-1}, {name:'south', dx:0, dy:1}
  ])
  const SIZES = [31, 32, 33, 34, 35, 36, 37]
  const MAZE_MINE_BIOMES = new Set(['z-10', 'z-11', 'z-12'])
  const stepDirs = [[0,-1],[1,0],[0,1],[-1,0]]
  const key = (x,y) => `${x},${y}`
  const inside = (rect,x,y,pad=0) => !!rect && x >= rect.x-pad && y >= rect.y-pad &&
    x < rect.x+rect.w+pad && y < rect.y+rect.h+pad
  const levelMap = z => z===-1 ? undergroundMap : z===-2 ? deepLevels[0]?.map : null
  const centerAt = (x,y) => ({x:x+7,y:y+3})

  function footprint(x,y,size,side) {
    const center = centerAt(x,y)
    const count = Math.floor((size-4)/3)+1
    const middle = Math.floor(count/2)
    const index = 2+3*middle
    const lastIndex = 2+3*(count-1)
    let rect, root
    if(side.name==='east') {
      rect={x:center.x+6,y:center.y-index,w:size,h:size}
      root={x:rect.x+2,y:center.y}
    } else if(side.name==='west') {
      root={x:center.x-8,y:center.y}
      rect={x:root.x-lastIndex,y:center.y-index,w:size,h:size}
    } else if(side.name==='south') {
      rect={x:center.x-index,y:center.y+6,w:size,h:size}
      root={x:center.x,y:rect.y+2}
    } else {
      root={x:center.x,y:center.y-8}
      rect={x:center.x-index,y:root.y-lastIndex,w:size,h:size}
    }
    const basement={x:center.x-3,y:center.y-3,w:7,h:7}
    const corridor=[]
    for(let d=3;d<=7;d++) corridor.push({x:center.x+side.dx*d,y:center.y+side.dy*d})
    const gate={x:center.x+side.dx*5,y:center.y+side.dy*5}
    return {rect,root,center,basement,corridor,gate,side:side.name,size}
  }

  // Two-dimensional prefix sums make the footprint and one-cell isolation ring
  // inexpensive to check even on the smallest world and large cave maps.
  function blockers(grid,z) {
    const w=MAP_W+1, sums=new Int32Array(w*(MAP_H+1))
    const occupiedHere=new Set()
    for(const actor of [...enemies.filter(e=>e.alive), ...groundItems]) {
      if((actor.level??0)!==z || (actor.levelKind && actor.levelKind!=='chain'))continue
      occupiedHere.add(key(actor.x,actor.y))
    }
    for(let y=0;y<MAP_H;y++) for(let x=0;x<MAP_W;x++) {
      const blocked=(grid?.[y]?.[x]!=='cavewall' || occupiedHere.has(key(x,y)))?1:0
      sums[(y+1)*w+x+1]=blocked+sums[y*w+x+1]+sums[(y+1)*w+x]-sums[y*w+x]
    }
    return rect => {
      const x1=rect.x-1,y1=rect.y-1,x2=rect.x+rect.w,y2=rect.y+rect.h
      if(x1<1 || y1<1 || x2>=MAP_W-1 || y2>=MAP_H-1)return false
      const a=y1*w+x1,b=y1*w+x2+1,c=(y2+1)*w+x1,d=(y2+1)*w+x2+1
      return sums[d]-sums[b]-sums[c]+sums[a]===0
    }
  }

  function candidateScanner() {
    const clear1=blockers(undergroundMap,-1)
    const clear2=blockers(deepLevels[0]?.map,-2)
    // The separate legacy Crypt Level 2 must also stay outside the new global
    // footprint even though its older architecture differs.
    const cryptClear=cryptLevel2?.map ? blockers(cryptLevel2.map,-2) : ()=>true
    return (x,y) => {
      const options=[]
      for(const side of DIRECTIONS) for(const size of SIZES) {
        const p=footprint(x,y,size,side)
        const xs=p.corridor.map(c=>c.x),ys=p.corridor.map(c=>c.y)
        const corridor={x:Math.min(...xs),y:Math.min(...ys),
          w:Math.max(...xs)-Math.min(...xs)+1,h:Math.max(...ys)-Math.min(...ys)+1}
        if(!clear1(p.basement)||!clear1(corridor)||!clear1(p.rect)||
           !clear2(p.rect)||!cryptClear(p.rect)) continue
        options.push(p)
      }
      return options
    }
  }

  function mazeCells(rect) {
    const n=Math.floor((rect.w-4)/3)+1
    return {n,count:n*n, point: i => ({x:rect.x+2+3*(i%n),y:rect.y+2+3*Math.floor(i/n)}),
      index: (x,y) => {
        const dx=x-rect.x-2,dy=y-rect.y-2
        return dx%3===0 && dy%3===0 && dx>=0 && dy>=0 && dx/3<n && dy/3<n
          ? dy/3*n+dx/3 : -1
      }}
  }

  // Growing Tree: mostly newest with a random active-cell choice to shorten
  // uninterrupted runs. Edges are orthogonal on a three-tile lattice, leaving
  // thick enough walls that diagonals cannot bridge unrelated passages.
  function growingTree(rect,root,monsterCount) {
    const cells=mazeCells(rect),rootIndex=cells.index(root.x,root.y)
    if(rootIndex<0)return null
    for(let attempt=0;attempt<48;attempt++) {
      const visited=new Set([rootIndex]),active=[rootIndex],links=[],adj=Array.from({length:cells.count},()=>[])
      while(active.length) {
        const at=chance(0.55)?active.length-1:randInt(0,active.length-1)
        const node=active[at],cx=node%cells.n,cy=Math.floor(node/cells.n),next=[]
        for(const [dx,dy] of stepDirs) {
          const nx=cx+dx,ny=cy+dy
          if(nx>=0&&ny>=0&&nx<cells.n&&ny<cells.n&&!visited.has(ny*cells.n+nx))next.push(ny*cells.n+nx)
        }
        if(!next.length){active.splice(at,1);continue}
        const other=pick(next)
        visited.add(other);active.push(other);links.push([node,other])
        adj[node].push(other);adj[other].push(node)
      }
      // A single optional extra corridor is the maximum topology cycle.
      if(chance(0.3)) {
        const possibles=[]
        for(let i=0;i<cells.count;i++)for(const [dx,dy] of [[1,0],[0,1]]) {
          const x=i%cells.n+dx,y=Math.floor(i/cells.n)+dy
          if(x>=cells.n||y>=cells.n)continue
          const j=y*cells.n+x
          if(adj[i].includes(j))continue
          // Reject short circles that only nibble a dead end.
          const q=[i],distance=new Map([[i,0]])
          for(let p=0;p<q.length;p++)for(const k of adj[q[p]])if(!distance.has(k)){
            distance.set(k,distance.get(q[p])+1);q.push(k)
          }
          if(distance.get(j)>=10)possibles.push([i,j])
        }
        if(possibles.length) {
          const [a,b]=pick(possibles)
          links.push([a,b]);adj[a].push(b);adj[b].push(a)
        }
      }
      const floor=new Map()
      for(let i=0;i<cells.count;i++){
        const p=cells.point(i);floor.set(key(p.x,p.y),{...p,tile:'cavefloor2'})
      }
      for(const [a,b] of links){
        const p=cells.point(a),to=cells.point(b),dx=Math.sign(to.x-p.x),dy=Math.sign(to.y-p.y)
        floor.set(key(p.x+dx,p.y+dy),{x:p.x+dx,y:p.y+dy,tile:'cavefloor2'})
        floor.set(key(p.x+dx*2,p.y+dy*2),{x:p.x+dx*2,y:p.y+dy*2,tile:'cavefloor2'})
      }
      // Actual Vagabond movement permits all eight neighbors, including a
      // diagonal around a right-angle bend. Select the farthest leaf by BFS
      // on *floor tiles*, not by the Growing Tree lattice-edge count.
      const dirs=[[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]]
      const queue=[root],distance=new Map([[key(root.x,root.y),0]])
      for(let head=0;head<queue.length;head++){
        const p=queue[head],depth=distance.get(key(p.x,p.y))
        for(const [dx,dy] of dirs){
          const k=key(p.x+dx,p.y+dy)
          if(!floor.has(k)||distance.has(k))continue
          distance.set(k,depth+1);queue.push({x:p.x+dx,y:p.y+dy})
        }
      }
      if(distance.size!==floor.size)continue
      let goal=null,routeTiles=-1
      for(let i=0;i<cells.count;i++){
        if(i===rootIndex||adj[i].length!==1)continue
        const p=cells.point(i),steps=distance.get(key(p.x,p.y))
        if(steps>routeTiles){goal=p;routeTiles=steps}
      }
      if(!goal)continue
      // Any tile on ANY shortest route is excluded from initial monster
      // placement, even with a maze loop or equally short diagonal choices.
      const shortest=new Set([key(goal.x,goal.y)]),reversed=[goal]
      for(let head=0;head<reversed.length;head++){
        const p=reversed[head],d=distance.get(key(p.x,p.y))
        for(const [dx,dy] of dirs){
          const x=p.x+dx,y=p.y+dy,k=key(x,y)
          if(distance.get(k)!==d-1||shortest.has(k))continue
          shortest.add(k);reversed.push({x,y})
        }
      }
      const routeCells=new Set()
      for(let i=0;i<cells.count;i++){
        const p=cells.point(i)
        if(shortest.has(key(p.x,p.y)))routeCells.add(i)
      }
      const sideEnds=[]
      for(let i=0;i<cells.count;i++){
        if(adj[i].length!==1||routeCells.has(i))continue
        const seen=new Set([i]),q=[{id:i,d:0}]
        let branchLength=0
        for(let head=0;head<q.length;head++){
          const p=q[head]
          if(routeCells.has(p.id)){branchLength=p.d;break}
          for(const j of adj[p.id])if(!seen.has(j)){
            seen.add(j);q.push({id:j,d:p.d+1})
          }
        }
        if(branchLength>=3)sideEnds.push({i,length:branchLength})
      }
      if(sideEnds.length<=monsterCount||sideEnds.length>=monsterCount*2)continue
      const endings=sideEnds.slice(),chosen=[]
      for(let i=0;i<monsterCount;i++){
        const at=randInt(0,endings.length-1)
        chosen.push(endings.splice(at,1)[0])
      }
      // Water only caps optional dead ends. There are never enemies beyond it.
      const water=[]
      const waterCount=Math.min(endings.length,chance(0.6)?randInt(1,2):0)
      for(let i=0;i<waterCount;i++){
        const p=endings.splice(randInt(0,endings.length-1),1)[0]
        const pt=cells.point(p.i)
        floor.set(key(pt.x,pt.y),{...pt,tile:'water'})
        water.push(pt)
      }
      return {tiles:[...floor.values()], entrance:root, exit:goal,
        enemySpots:chosen.map(p=>cells.point(p.i)), water, metrics:{
          width:rect.w,height:rect.h,routeCells:Math.ceil(routeTiles/3),routeTiles,
          branchEnds:sideEnds.length,spawnBranches:monsterCount,
          emptyEnds:sideEnds.length-monsterCount,
          loopCount:links.length-cells.count+1,openTiles:floor.size
        }}

    }
    return null
  }

  function addPatch(list,x,y,tile){list.push({x,y,tile})}
  function patchTile(level,p,tile) {
    const old=level.patches.find(v=>v.x===p.x&&v.y===p.y)
    if(old)old.tile=tile
    else level.patches.push({...p,tile})
    const dest=levelMap(level.z)
    if(dest?.[p.y]?.[p.x]!==undefined)dest[p.y][p.x]=tile
  }
  function stamp() {
    for(const level of towerMaze.levels) {
      const dest=levelMap(level.z)
      if(!dest)throw new Error('Missing shared underground layer for tower maze')
      for(const p of level.patches){
        if(dest[p.y]?.[p.x]===undefined)throw new Error('Maze patch exceeds shared world bounds')
        dest[p.y][p.x]=p.tile
      }
    }
  }

  function generate(layout) {
    const count1=randInt(8,15),count2=randInt(8,15)
    const first=growingTree(layout.rect,layout.root,count1)
    if(!first)return false
    const second=growingTree(layout.rect,first.exit,count2)
    if(!second)return false
    const l1={z:-1,patches:first.tiles.map(p=>({...p,tile:p.tile==='water'?'water':'cavefloor'})),
      enemySpots:first.enemySpots, water:first.water, metrics:first.metrics}
    const l2={z:-2,patches:second.tiles.map(p=>({...p})),enemySpots:second.enemySpots,
      water:second.water,metrics:second.metrics}
    for(let y=layout.basement.y+1;y<layout.basement.y+layout.basement.h-1;y++)
      for(let x=layout.basement.x+1;x<layout.basement.x+layout.basement.w-1;x++)
        patchTile(l1,{x,y},'cavefloor')
    for(const p of layout.corridor)patchTile(l1,p,'cavefloor')
    patchTile(l1,layout.center,'mazestairsup')
    patchTile(l1,layout.gate,'mazegatesealed')
    patchTile(l1,first.exit,'cavedown')
    patchTile(l2,first.exit,'caveup')
    towerMaze={rect:layout.rect,basement:layout.basement,corridor:layout.corridor,
      gate:layout.gate,center:layout.center,side:layout.side,size:layout.size,
      down: first.exit,treasure:second.exit, lever:towerPoint(7,2),
      active:false,levels:[l1,l2]}
    // The separate basement stair is in the ground floor's eastern chamber,
    // beyond the existing internal door. The level +3 lever is not a chest.
    surfaceMap[layout.center.y][layout.center.x]='mazestairsdown'
    towerLevels[2].map[towerMaze.lever.y][towerMaze.lever.x]='dwarvenlever'
    stamp()
    return true
  }

  function restore(saved) {
    towerMaze=saved ? structuredClone(saved) : null
    if(!towerMaze)return
    stamp()
    if(towerMaze.active)surfaceMap[tower.entrance.y][tower.entrance.x]='towerentrancesealed'
    surfaceMap[towerMaze.center.y][towerMaze.center.x]='mazestairsdown'
    towerLevels[2].map[towerMaze.lever.y][towerMaze.lever.x]=towerMaze.active?'dwarvenleverpulled':'dwarvenlever'
  }

  function inRegion(z,x,y) {
    if(!towerMaze || (z!==-1&&z!==-2))return false
    if(inside(towerMaze.rect,x,y,1))return true
    return z===-1 && (inside(towerMaze.basement,x,y,1) ||
      towerMaze.corridor.some(p=>Math.max(Math.abs(p.x-x),Math.abs(p.y-y))<=1))
  }
  function isProtectedWall(z,x,y) {
    return map === levelMap(z) && inRegion(z,x,y) && map?.[y]?.[x]==='cavewall'
  }
  function isMazeActor(actor) {
    return actor?.levelKind==='chain' && inRegion(actor.level,actor.x,actor.y)
  }

  function enemyPool(tier) {
    return ENEMY_TEMPLATES.filter(t=>t.tier===tier && t.rarity>0 && !t.adaptiveOnly &&
      !t.abilities?.includes('fly') && !t.abilities?.includes('ethereal') &&
      !enemyBiomes(t).some(b=>MAZE_MINE_BIOMES.has(b)) &&
      !enemyBiomes(t).includes('adaptive-only') && naturalSpawnEligible(t))
  }

  // Only a genuinely weaker natural spawn may turn into a Minotaur. Keep
  // higher-tier creatures and monsters with more HP or stronger base combat
  // stats untouched; prefixes and equipment are rolled after substitution.
  function weakerThanMinotaur(template) {
    const minotaur=ENEMY_TEMPLATE_BY_NAME.Minotaur
    return !!minotaur && template.name!==minotaur.name &&
      template.tier<=minotaur.tier && template.hp<=minotaur.hp &&
      monsterStrength(template)<monsterStrength(minotaur)
  }

  function sampleMazeEnemy(tier) {
    const sampled=pickWeighted(enemyPool(tier),t=>t.rarity)
    return weakerThanMinotaur(sampled) && chance(0.30)
      ? ENEMY_TEMPLATE_BY_NAME.Minotaur : sampled
  }

  function populate() {
    if(!towerMaze)return
    for(const level of towerMaze.levels) {
      const weights=level.z===-1?[{tier:2,weight:50},{tier:3,weight:50}]:
        [{tier:2,weight:10},{tier:3,weight:25},{tier:4,weight:65}]
      for(const entry of weights)if(!enemyPool(entry.tier).length)
        throw new Error('Tower maze has no eligible creatures for tier '+entry.tier)
      for(const p of level.enemySpots) {
        const tier=pickWeighted(weights,e=>e.weight).tier
        const tmpl=sampleMazeEnemy(tier)
        const e={...tmpl,name:tmpl.name,baseName:tmpl.name,abilities:[...tmpl.abilities],
          level:level.z,levelKind:'chain',caveIndex:-1,
          x:p.x,y:p.y,homeX:p.x,homeY:p.y,homeTileType:level.z===-1?'cavefloor':'cavefloor2',
          hp:tmpl.hp,maxHp:tmpl.hp,atk:tmpl.atk,def:tmpl.def,spd:tmpl.spd,
          aggro:tmpl.aggro??AGGRO_RANGE,alive:true,prefix:null,equipment:null,
          towerMazeResident:true}
        const prefixNames=Object.keys(ENEMY_PREFIXES)
        if(prefixNames.length && chance(WORLD_GEN_CONFIG.cavePopulation.deepPrefixChance)) {
          const prefix=pick(prefixNames)
          e.prefix=prefix;e.prefixBase=prefixBaseStats(e);applyEnemyPrefix(e,prefix)
          e.name=prefix+' '+e.name
        }
        prepareEnemyEquipment(e)
        addEnemy(e)
        occupied.add(key(p.x,p.y))
      }
    }
    groundItems.push({x:towerMaze.treasure.x,y:towerMaze.treasure.y,
      kind:'chest',tier:4,level:-2,levelKind:'chain',caveIndex:-1,
      towerMazeTreasure:true,opened:false})
  }

  function switchOccupant(z,spot,closing) {
    if(!closing)return {actor:null,at:null}
    const actor=enemies.find(e=>e.alive&&e.level===z &&
      (!e.levelKind || e.levelKind===(z===0?'surface':'chain'))&&
      e.x===spot.x&&e.y===spot.y) || (z===0?npcs.find(n=>n.x===spot.x&&n.y===spot.y):null)
    if(!actor)return {actor:null,at:null}
    const terrain=z===0?surfaceMap:levelMap(z)
    const blocked=new Set(enemies.filter(e=>e.alive&&e!==actor&&e.level===z &&
      (!e.levelKind||e.levelKind===(z===0?'surface':'chain'))).map(e=>key(e.x,e.y)))
    if(z===0)for(const npc of npcs)if(npc!==actor)blocked.add(key(npc.x,npc.y))
    const queue=[{...spot,steps:0}],seen=new Set([key(spot.x,spot.y)])
    for(let i=0;i<queue.length;i++){
      const p=queue[i]
      if(p.steps>=3)continue
      for(const [dx,dy] of stepDirs){
        const x=p.x+dx,y=p.y+dy,k=key(x,y),t=terrain[y]?.[x]
        if(seen.has(k)||!TILE[t]?.walk || t==='water')continue
        seen.add(k)
        if(!blocked.has(k) && !(currentZ===z&&player.x===x&&player.y===y) &&
          !groundItems.some(g=>g.x===x&&g.y===y&&g.level===z&&g.kind==='dwarvenstove'))
          return {actor,at:{x,y}}
        queue.push({x,y,steps:p.steps+1})
      }
    }
    return null
  }

  function atLever(x,y) {
    return !!towerMaze && currentZ===3 && x===towerMaze.lever.x && y===towerMaze.lever.y
  }
  function toggle(x,y) {
    if(!atLever(x,y))return false
    const next=!towerMaze.active
    const changes=[
      {z:0,spot:tower.entrance,closing:next},
      {z:-1,spot:towerMaze.gate,closing:!next}
    ]
    const moves=[]
    for(const c of changes){
      const occupant=switchOccupant(c.z,c.spot,c.closing)
      if(!occupant){log('The mechanism strains against something blocking a distant gate.','info');return true}
      if(groundItems.some(g=>g.x===c.spot.x&&g.y===c.spot.y&&g.level===c.z&&
        g.kind!=='chest')){log('The mechanism cannot move while objects block its gates.','info');return true}
      if(occupant.actor)moves.push(occupant)
    }
    for(const {actor,at} of moves){actor.x=at.x;actor.y=at.y;actor.homeX=at.x;actor.homeY=at.y;
      actor.animStart=undefined;actor.attackStart=undefined;actor.farPath=null}
    towerMaze.active=next
    towerLevels[2].map[towerMaze.lever.y][towerMaze.lever.x]=next?'dwarvenleverpulled':'dwarvenlever'
    surfaceMap[tower.entrance.y][tower.entrance.x]=next?'towerentrancesealed':'dwarvendooropen'
    patchTile(towerMaze.levels[0],towerMaze.gate,next?'mazegateopen':'mazegatesealed')
    clearAutoPath();consecutiveWaitTurns=0;rebuildActiveLevelOccupancy()
    invalidateUndergroundFov();minimapDirty=true
    log('From far below comes a heavy clang sound.','info')
    enemyTurn();npcTurn();updateHud();render();runAnimationLoop();updateTooltip();flushPendingMove()
    return true
  }

  function switchStairs() {
    if(!towerMaze)return false
    const tile=map[player.y]?.[player.x],from=currentZ
    let target=null
    if(from===0 && tile==='mazestairsdown')target=-1
    else if(from===-1 && tile==='mazestairsup' && map===undergroundMap)target=0
    else if(from===-1 && map===undergroundMap && tile==='cavedown' &&
      player.x===towerMaze.down.x && player.y===towerMaze.down.y)target=-2
    else if(from===-2 && map===deepLevels[0]?.map && tile==='caveup' &&
      player.x===towerMaze.down.x && player.y===towerMaze.down.y)target=-1
    if(target===null)return false
    const terrain=target===0?surfaceMap:levelMap(target)
    if(!TILE[terrain?.[player.y]?.[player.x]]?.walk){
      log('The stair landing is blocked.','info');return true
    }
    // Occupied landing: move a monster one traversable step out of the way
    // (never relocate the player or change their X/Y). The choice of neighbor
    // is a fixed graph search, entirely independent of animation timing.
    const occupant=enemies.find(e=>e.alive&&e.level===target&&e.x===player.x&&e.y===player.y &&
      (!e.levelKind || e.levelKind===(target===0?'surface':'chain'))) ||
      (target===0?npcs.find(n=>n.x===player.x&&n.y===player.y):null)
    if(occupant){
      const blocked=new Set(enemies.filter(e=>e.alive&&e!==occupant&&e.level===target)
        .map(e=>key(e.x,e.y)))
      if(target===0)for(const n of npcs)if(n!==occupant)blocked.add(key(n.x,n.y))
      const queue=[{x:player.x,y:player.y}],seen=new Set([key(player.x,player.y)])
      let free=null
      for(let h=0;h<queue.length && !free;h++)for(const [dx,dy] of stepDirs){
        const x=queue[h].x+dx,y=queue[h].y+dy,k=key(x,y),t=terrain[y]?.[x]
        if(seen.has(k)||!TILE[t]?.walk || t==='water' || t==='river')continue
        seen.add(k)
        if(!blocked.has(k) && !groundItems.some(g=>g.kind==='dwarvenstove'&&
          g.level===target&&g.x===x&&g.y===y)) {free={x,y};break}
        queue.push({x,y})
      }
      if(!free){log('Something blocks the staircase landing.','info');return true}
      occupant.x=free.x;occupant.y=free.y
      occupant.homeX=free.x;occupant.homeY=free.y
      occupant.animStart=undefined;occupant.attackStart=undefined;occupant.farPath=null
    }
    currentZ=target;currentCave=-1;map=terrain
    undergroundDiscovered=target===0?undergroundDiscoveredL1:
      target===-1?undergroundDiscoveredL1:deepLevels[0].discovered
    resetSwimming();clearAutoPath();pendingMove=null;hoveredEnemy=null;stopCameraAnimation()
    rebuildActiveLevelOccupancy();invalidateUndergroundFov();minimapDirty=true
    log(target===0?'You climb into the tower.':target===-1&&from===0?
      'You descend into the silent tower basement.':target===-2?
      'You descend deeper into the labyrinth.':'You return to the upper labyrinth.','info')
    render();updateHud()
    return true
  }

  function chaosTarget(origin,reserved) {
    if(!tower || currentZ!==0 || towerContains(origin.x,origin.y))return null
    let alongside=false
    for(const [dx,dy] of DIRS8){
      const x=origin.x+dx,y=origin.y+dy,tile=surfaceMap[y]?.[x]
      if(towerContains(x,y)&&['dwarvenwall','towerwindow','towerentrancesealed',
        'dwarvendoorclosed','dwarvendooropen'].includes(tile)){alongside=true;break}
    }
    if(!alongside)return null
    const open=[],swap=[]
    for(let y=tower.y+1;y<tower.y+tower.size-1;y++)for(let x=tower.x+1;x<tower.x+tower.size-1;x++){
      if(Math.max(Math.abs(x-origin.x),Math.abs(y-origin.y))>8||!towerInterior(x,y))continue
      if(surfaceMap[y]?.[x]!=='marble' ||
        groundItems.some(g=>g.kind==='dwarvenstove'&&g.level===0&&g.x===x&&g.y===y) ||
        npcs.some(n=>n.x===x&&n.y===y))continue
      const target=enemies.find(e=>e.alive&&e.level===0&&e.x===x&&e.y===y)
      if(target)swap.push({x,y,actor:target})
      else if(!reserved.has(key(x,y)))open.push({x,y})
    }
    if(open.length)return {...pick(open),actor:null}
    if(swap.length)return pick(swap)
    // A valid Tower has marble floor; a landable square must exist. Refuse
    // silently changing the Tower geometry rather than cheating through Z.
    throw new Error('Tower Chaos has no safe interior landing')
  }

  function guaranteeChaosScroll() {
    if(!towerMaze)return
    const reachable=surfaceReachableFromTemple(),candidates=[]
    // A locked-away, submerged or unreachable existing scroll does not satisfy
    // the guaranteed *loose accessible* surface scroll.
    if(groundItems.some(g=>g.kind==='scrollOfChaos'&&(g.level??0)===0 &&
      reachable.has(key(g.x,g.y)) && !towerContains(g.x,g.y) &&
      TILE[surfaceMap[g.y]?.[g.x]]?.walk &&
      !['water','river','ice','frozenriver'].includes(surfaceMap[g.y][g.x])))return
    for(let y=2;y<MAP_H-2;y++)for(let x=2;x<MAP_W-2;x++){
      if(!reachable.has(key(x,y)) || !TILE[surfaceMap[y]?.[x]]?.walk ||
        towerFootprintDistance(x,y,tower.x,tower.y)<5 ||
        ['water','river','ice','frozenriver'].includes(surfaceMap[y][x]) ||
        groundItems.some(g=>(g.level??0)===0&&g.x===x&&g.y===y) ||
        npcs.some(n=>n.x===x&&n.y===y) ||
        enemies.some(e=>e.alive&&(e.level??0)===0&&e.x===x&&e.y===y))continue
      candidates.push({x,y})
    }
    if(!candidates.length)throw new Error('No safe, reachable loose Chaos scroll spawn')
    const p=pick(candidates)
    groundItems.push({...p,kind:'scrollOfChaos'})
  }

  function populationMetrics() {
    if(!towerMaze)return null
    return towerMaze.levels.map(l=>({z:l.z,...l.metrics,monsters:l.enemySpots.length}))
  }
  return {candidateScanner,generate,restore,inRegion,isProtectedWall,isMazeActor,populate,
    sampleMazeEnemy,weakerThanMinotaur,
    atLever,toggle,switchStairs,chaosTarget,guaranteeChaosScroll,populationMetrics}
})()
