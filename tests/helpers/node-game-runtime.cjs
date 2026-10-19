const fs = require('fs'), vm = require('vm'), path = require('path')
// Rule-level runtime only: DOM/canvas methods are inert, so this cannot verify layout.
const root = path.resolve(__dirname, '../..')
const canvasContext = new Proxy({measureText: s => ({width: String(s).length * 8}), getImageData: () => ({data: new Uint8Array(4)})}, {get: (o,k) => o[k] || (() => {})})
const elements = new Map()
function element(id = '') {
  return {id, style: {setProperty(){}}, dataset: {}, value: id === 'worldSizeSelect' ? 'XS' : '', checked: false,
    classList: {add(){},remove(){},toggle(){},contains(){return false}},
    getContext: () => canvasContext, getBoundingClientRect: () => ({left:0,top:0,width:800,height:600}),
    addEventListener(){}, appendChild(){}, remove(){}, setAttribute(){}, removeAttribute(){},
    querySelector: () => element(), querySelectorAll: () => [], focus(){}, click(){},
    width:800,height:600,clientWidth:800,clientHeight:600,innerHTML:'',textContent:''}
}
const document = {getElementById: id => {
  if (!elements.has(id)) elements.set(id, element(id))
  return elements.get(id)
}, querySelector: () => element(), querySelectorAll: () => [], createElement: () => element(),
  documentElement:element(),body:element(),head:element(),addEventListener(){},hidden:false}
const context = {document, console, URL, Blob, Response, DecompressionStream, structuredClone, TextEncoder, TextDecoder,
  performance:{now:()=>0}, innerWidth:1280, innerHeight:800, devicePixelRatio:1,
  navigator:{userAgent:'node rules check',maxTouchPoints:0}, location:{protocol:'http:',hostname:'localhost',search:'',href:'http://localhost/'},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},
  matchMedia:()=>({matches:false,addEventListener(){},addListener(){}}),
  addEventListener(){},getComputedStyle:()=>({getPropertyValue:()=> '0'}),
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},
  Image: class {constructor(){this.complete=false} addEventListener(){}},
  fetch: async url => {
    const file=path.join(root,String(url).split('?')[0]);
    return {ok:fs.existsSync(file),json:async()=>JSON.parse(fs.readFileSync(file,'utf8')),
      arrayBuffer:async()=>{const b=fs.readFileSync(file);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
  },
  alert: msg => {throw Error(msg)}, confirm:()=>true}
context.window=context;context.self=context
vm.createContext(context)
const html=fs.readFileSync(path.join(root,'index.html'),'utf8')
for (const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
  const src=tag[1].match(/src="([^"]+)"/)
  let code=src?fs.readFileSync(path.join(root,src[1]),'utf8'):tag[2]
  code=code.replace(/  loadContent\(\)\.then\(\(\) => init\(\)\)\.catch\(err => \{[\s\S]*?\n  \}\)/,'')
  vm.runInContext(code,context,{filename:src?src[1]:'inline'})
}
const run=code=>vm.runInContext(code,context)
// Disable presentation sinks only; movement, worldgen, saves and replay use game code.
run('render = () => {}; updateHud = () => {}; updateTooltip = () => {}; runAnimationLoop = () => {}')
module.exports = {run, context}
