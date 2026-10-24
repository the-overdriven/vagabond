const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const {createCanvas} = require('@napi-rs/canvas')

// Exercise the real canvas lighting functions with a simple corridor. Game
// visibility stays deterministic; this checks the resulting pixel transitions.
const root = path.resolve(__dirname, '..')
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
const begin = html.indexOf('  function mineSightDarknessAt(')
const end = html.indexOf('  function renderScene(', begin)
assert(begin > 0 && end > begin, 'mine lighting renderer is present')
const canvas = createCanvas(840, 520)
const ctx = canvas.getContext('2d')
const TILE_PX = 40
const map = Array.from({length:13}, () => Array(21).fill('cavefloor2'))
const visible = new Set()
for (let x = 3; x <= 13; x++) visible.add(`${x},5`)
const source = {x:10, y:5, radius:3, opacity:1, color:'#6ecfff', pulse:false}
const env = {
  canvas, ctx, TILE_PX, map, camX:0, camY:0, USE_TILE_IMAGES:true,
  player:{x:5,y:5}, currentZ:-9,
  MINING_CONFIG:JSON.parse(fs.readFileSync(path.join(root,'content/mining_config.json'))),
  undergroundDiscovered:Array.from({length:13},()=>Array(21).fill(false)),
  preloadedImages:new Map(),RENDER_STYLE:{groundItems:{}},
  resolveVisualImage:visual=>env.preloadedImages.get(visual?.image),
  outlinedVisualCanvas:image=>image,
  Mining:{activeLevel:()=>({}),lightSources:()=>[],lightInfo:s=>s,
    lightCanReach:(_map,sx,sy,x,y)=>y===sy || (x===sx && Math.abs(y-sy)<1)},
  UndergroundFov:{canSee:(_map,px,py,x,y)=>true},
  document:{createElement:()=>createCanvas(1,1)},
  keyXY:(x,y)=>`${x},${y}`,
  performance:{now:()=>0}, console
}
vm.createContext(env)
vm.runInContext(html.slice(begin,end),env)
const run = expression => vm.runInContext(expression, env)
const alpha = (layer,x,y) => layer.getContext('2d').getImageData(
  Math.floor(x*TILE_PX),Math.floor(y*TILE_PX),1,1).data[3]

run('drawMineSightDarkness(new Set('+JSON.stringify([...visible])+'),0,0,21,13)')
const shadow = run('mineDarknessLayer')
assert(alpha(shadow,5.5,5.5)<8,'the player remains fully lit in a narrow passage')
assert(Math.abs(alpha(shadow,8.5,5.5)-alpha(shadow,5.5,8.5))<3,
  'the radial shade illuminates known and unknown corners equally nearby')

const lightMask = run('mineCrystalMask('+JSON.stringify(source)+','+
  '3,new Set('+JSON.stringify([...visible])+'),0,0,21,13)')
assert(alpha(lightMask,10.5,5.5)>240,'a narrow passage retains bright central crystal light')
assert(alpha(lightMask,10.5,5.94)>alpha(lightMask,10.5,6.05),
  'crystal light fades over the edge of a one-tile corridor')
assert(alpha(lightMask,10.5,6.05)>alpha(lightMask,10.5,6.4),
  'crystal light leaves a soft glow outside the reachable corridor')

// The new mask is exclusive to Mines: cave exits and dropped lights elsewhere
// must continue through the original per-cell visibility clip.
env.Mining.lightSources=()=>[source]
const originalRect=ctx.rect
let clippedCells=0
ctx.rect=function(...args) {clippedCells++;return originalRect.apply(this,args)}
run('drawCrystalGlow(0,new Set('+JSON.stringify([...visible])+'),0,0,21,13)')
assert.equal(clippedCells,0,'tile-mode mine glows have no grid clipping')
env.Mining.activeLevel=()=>null
env.currentZ=-1
const crystalCtx = run("mineLightingCanvas('crystalGlow').getContext('2d')")
const originalCrystalRect=crystalCtx.rect
crystalCtx.rect=function(...args) {clippedCells++;return originalCrystalRect.apply(this,args)}
run('drawCrystalGlow(0,new Set('+JSON.stringify([...visible])+'),0,0,21,13)')
assert(clippedCells>0,'ordinary cave lighting retains its original wall-aware clipping')
ctx.rect=originalRect
crystalCtx.rect=originalCrystalRect
env.Mining.activeLevel=()=>({})
env.currentZ=-9

// The glow is mostly neutral, and the sprite's opaque pixels receive none of
// its overlaid color. The light still reaches the surrounding stone.
const crystalSprite=createCanvas(40,40)
const spriteCtx=crystalSprite.getContext('2d')
spriteCtx.fillStyle='#f8e4dc'
spriteCtx.fillRect(13,7,14,26)
env.preloadedImages.set('img/tiles/mineral-ruby-exposed.png',crystalSprite)
const exposedSource={...source,kind:'exposed',mineral:'ruby',color:'#f24b75'}
env.Mining.lightSources=()=>[exposedSource]
const crystalVisible=new Set([...visible,'10,5','11,5'])
run('drawCrystalGlow(0,new Set('+JSON.stringify([...crystalVisible])+'),0,0,21,13)')
const glowLayer=run("mineLightingCanvas('crystalGlow')")
const glowPixel=(x,y)=>glowLayer.getContext('2d').getImageData(
  Math.floor(x*TILE_PX),Math.floor(y*TILE_PX),1,1).data
assert.equal(glowPixel(10.5,5.5)[3],0,'transparent artwork cutout protects the crystal image')
const stoneLight=glowPixel(10.95,5.5)
assert(stoneLight[3]>0&&stoneLight[3]<35,
  'nearby mine stone retains a restrained glow without a bright colored haze')
assert(Math.max(...stoneLight.slice(0,3))-Math.min(...stoneLight.slice(0,3))<35,
  'crystal light stays nearly neutral even for saturated red minerals')
assert.equal(env.MINING_CONFIG.lighting.tileTintStrength,0.16,
  'the mineral tint remains a small fraction of the otherwise neutral light')
env.Mining.lightSources=()=>[exposedSource,{...exposedSource,x:11}]
run('drawCrystalGlow(0,new Set('+JSON.stringify([...crystalVisible])+'),0,0,21,13)')
assert.equal(glowPixel(10.5,5.5)[3],0,
  'a neighboring crystal does not overlay another crystal sprite')
assert.equal(glowPixel(11.5,5.5)[3],0,
  'both overlapping crystal light sources keep their own artwork untouched')
env.RENDER_STYLE.groundItems.ruby={image:'img/tiles/mineral-ruby-exposed.png',scale:1}
env.Mining.lightSources=()=>[{...exposedSource,kind:'dropped'}]
run('drawCrystalGlow(0,new Set('+JSON.stringify([...crystalVisible])+'),0,0,21,13)')
assert.equal(glowPixel(10.5,5.5)[3],0,
  'portable crystals likewise keep the overlaid light off their sprite')
// Ordinary z:-1 daylight stays stronger, and crystal cutouts continue to work
// at a portrait tile viewport without affecting the tile-based ASCII path.
env.currentZ=-1
env.Mining.activeLevel=()=>null
env.Mining.lightSources=()=>[{...source,kind:'surfaceExit',color:'#ffe1a3'}]
ctx.clearRect(0,0,canvas.width,canvas.height)
run('drawCrystalGlow(0,new Set('+JSON.stringify([...crystalVisible])+'),0,0,21,13)')
assert(ctx.getImageData(10.5*TILE_PX,5.5*TILE_PX,1,1).data[3]>70,
  'cave-exit sunlight keeps its original stronger halo')
env.Mining.activeLevel=()=>({})
env.currentZ=-9
env.Mining.lightSources=()=>[source]

// The appearance of nearby terrain must not depend on whether its cells
// were visited, and wall/corridor corners must use the same radial falloff.
const radialVisible = new Set(['5,5'])
env.Mining.lightSources=()=>[]
const initialDiscovery = JSON.stringify(env.undergroundDiscovered)
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert(Math.abs(alpha(shadow,8.5,5.5)-alpha(shadow,5.5,8.5))<3,
  'an unexplored southern corridor stays as wide and bright as the northern one')
assert(Math.abs(alpha(shadow,8.5,5.5)-alpha(shadow,8.5,4.5))<40,
  'radial terrain light does not pinch tightly around discovered cell edges')
const fadeXs=[10.5,11,11.5,12,12.5]
const fadeOpacities=fadeXs.map(x=>alpha(shadow,x,5.5))
assert(fadeOpacities.every((value,i)=>i===0||value>=fadeOpacities[i-1]),
  'black fog begins beyond the sight radius with no brighter strip')
assert(fadeOpacities[0]<fadeOpacities[1]&&fadeOpacities[1]<fadeOpacities[3],
  'undiscovered terrain reaches black through a continuous radial gradient')
assert.equal(alpha(shadow,13.5,5.5),255,
  'distant, unexplored mine tiles are completely covered in black fog')
env.undergroundDiscovered[5][13]=true
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert(alpha(shadow,13.5,5.5)<245&&alpha(shadow,13.5,5.5)>205,
  'remembered ground remains dimly drawn beyond the radial light')
env.undergroundDiscovered[5][13]=false
assert.equal(JSON.stringify(env.undergroundDiscovered),initialDiscovery,
  'visual lighting cannot discover new map cells')

// One wall must illuminate its near face without leaking into never-seen
// terrain behind it, even if that terrain is inside the radial sight circle.
for(let y=0;y<13;y++)map[y][7]='cavewall'
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert(alpha(shadow,7.5,5.5)<180,'the near face of an opaque wall remains lit')
assert.equal(alpha(shadow,8.5,5.5),255,
  'an opaque wall blocks radial terrain light completely behind it')
map[5][8]='cavewall';map[5][9]='cavewall'
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert.equal(alpha(shadow,8.5,5.5),255,
  'the second layer of solid rock cannot glow through the first wall')
assert.equal(alpha(shadow,9.5,5.5),255,
  'deeper solid rock remains completely hidden')
assert.equal(alpha(shadow,10.5,5.5),255,
  'a hidden corridor beyond thick rock remains black even within the light radius')
assert(Math.abs(alpha(shadow,7.5,4.5)-alpha(shadow,7.5,6.5))<4,
  'the first rock face receives smooth, symmetric lighting along a corridor')
map[5][8]='cavefloor2';map[5][9]='cavefloor2'
env.undergroundDiscovered[5][8]=true
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert(alpha(shadow,8.5,5.5)>205&&alpha(shadow,8.5,5.5)<250,
  'remembered terrain behind the wall stays at explored darkness')
env.undergroundDiscovered[5][8]=false
for(let y=0;y<13;y++)map[y][7]='cavefloor2'

map[5][6]='cavewall';map[6][5]='cavewall'
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert.equal(alpha(shadow,6.5,6.5),255,
  'light cannot pass between two touching diagonal walls')
map[6][5]='cavefloor2'
run('drawMineSightDarkness(new Set(["5,5"]),0,0,21,13)')
assert(alpha(shadow,6.5,6.5)<255,
  'an open side of a diagonal corner admits some softened light')
map[5][6]='cavefloor2'

// Reuse the expensive wall-ray mask across visual animation frames, but
// discard it on the next gameplay turn (including mining a blocking wall).
env.reusedVisibility=new Set(['5,5'])
env.turnCount=600
run('drawMineSightDarkness(reusedVisibility,0,0,21,13)')
const cachedFog=run('mineWallFogCache')
run('drawMineSightDarkness(reusedVisibility,0,0,21,13)')
assert.equal(run('mineWallFogCache'),cachedFog,
  'unchanged animation frames reuse their completed wall-aware fog mask')
env.turnCount=601
run('drawMineSightDarkness(reusedVisibility,0,0,21,13)')
assert.notEqual(run('mineWallFogCache'),cachedFog,
  'a new mining or movement turn recomputes shadows after terrain changes')

// Pixel-check the same radial treatment on a narrow, portrait viewport.
canvas.width=240;canvas.height=480
env.camX=3;env.camY=0;env.player={x:6,y:6}
env.Mining.lightSources=()=>[]
env.undergroundDiscovered=Array.from({length:13},()=>Array(21).fill(false))
for(let y=2;y<=10;y++) {
  map[y][6]='cavefloor2';map[y][5]='cavewall';map[y][7]='cavewall'
  if(y<=6)for(let x=5;x<=7;x++)env.undergroundDiscovered[y][x]=true
}
const narrowVisible=new Set(['6,6'])
const portraitDiscovery=JSON.stringify(env.undergroundDiscovered)
run('drawMineSightDarkness(new Set(["6,6"]),3,0,6,12)')
env.Mining.lightSources=()=>[{...exposedSource,x:6,y:6}]
run('drawCrystalGlow(0,new Set(["6,6"]),3,0,6,12)')
const portraitGlow=run("mineLightingCanvas('crystalGlow')").getContext('2d')
assert.equal(portraitGlow.getImageData(3.5*TILE_PX,6.5*TILE_PX,1,1).data[3],0,
  'mobile tile graphics also keep the crystal artwork free of glow overlay')
assert(portraitGlow.getImageData(3.95*TILE_PX,6.5*TILE_PX,1,1).data[3]>0,
  'mobile tile graphics still illuminate stone immediately beside a crystal')
env.Mining.lightSources=()=>[]
const portrait=run('mineDarknessLayer')
const worldAlpha=(x,y)=>alpha(portrait,x-env.camX,y-env.camY)
assert(Math.abs(worldAlpha(6.5,3.5)-worldAlpha(6.5,9.5))<4,
  'narrow mobile viewport has symmetric northern and southern radial lighting')
assert(Math.abs(worldAlpha(5.5,8.5)-worldAlpha(7.5,8.5))<8,
  'unknown rock receives nearly symmetric light on both sides of a southern corridor')
assert.equal(JSON.stringify(env.undergroundDiscovered),
  portraitDiscovery,
  'rendering leaves exploration state untouched')

// Switching to ASCII must bypass the radial overlay and preserve its old path.
const priorShade=worldAlpha(6.5,9.5)
env.USE_TILE_IMAGES=false
run('drawMineSightDarkness(new Set(["6,6"]),3,0,6,12)')
assert.equal(worldAlpha(6.5,9.5),priorShade,
  'ASCII mode never uses the visual radial fog layer')
console.log('Mine tile-mode radial terrain, black fog seams, crystal shadows and ASCII isolation passed')
