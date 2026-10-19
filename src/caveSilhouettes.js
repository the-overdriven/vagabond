// Decode lossless PNG alpha directly: no canvas, color conversion or image resizing.
// The source catalog is ordered; preparation never consumes gameplay RNG.
const CaveSilhouettes = (() => {
  const pending = new Map()

  async function decodeAlpha(buffer) {
    const bytes = new Uint8Array(buffer), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const signature = [137,80,78,71,13,10,26,10]
    if (bytes.length < 33 || !signature.every((v,i) => bytes[i] === v)) throw new Error('Invalid silhouette PNG')
    let width = 0, height = 0, header = false, ended = false
    const parts = []
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset), end = offset + 12 + size
      if (end > bytes.length) throw new Error('Truncated silhouette PNG')
      const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8))
      if (type === 'IHDR') {
        if (size !== 13 || header) throw new Error('Invalid silhouette PNG header')
        width = view.getUint32(offset + 8); height = view.getUint32(offset + 12)
        if (!width || !height || width * height > 16777216 || bytes[offset + 16] !== 8 ||
            bytes[offset + 17] !== 6 || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0)
          throw new Error('Silhouettes require non-interlaced 8-bit RGBA PNGs')
        header = true
      } else if (type === 'IDAT') parts.push(bytes.subarray(offset + 8, offset + 8 + size))
      else if (type === 'IEND') { ended = true; break }
      offset = end
    }
    if (!header || !ended || !parts.length) throw new Error('Incomplete silhouette PNG')
    const stream = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate'))
    const packed = new Uint8Array(await new Response(stream).arrayBuffer())
    const stride = width * 4
    if (packed.length !== (stride + 1) * height) throw new Error('Invalid silhouette pixel data')
    const previous = new Uint8Array(stride), row = new Uint8Array(stride), alpha = new Uint8Array(width * height)
    const paeth = (a,b,c) => {
      const p=a+b-c, da=Math.abs(p-a), db=Math.abs(p-b), dc=Math.abs(p-c)
      return da<=db && da<=dc ? a : db<=dc ? b : c
    }
    for (let y = 0; y < height; y++) {
      const start = y * (stride + 1), filter = packed[start]
      if (filter > 4) throw new Error('Invalid silhouette PNG filter')
      for (let x = 0; x < stride; x++) {
        const left = x >= 4 ? row[x - 4] : 0, up = previous[x], upperLeft = x >= 4 ? previous[x - 4] : 0
        const prediction = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up :
          filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft)
        row[x] = (packed[start + 1 + x] + prediction) & 255
        if (x % 4 === 3) alpha[y * width + (x - 3) / 4] = row[x]
      }
      previous.set(row)
    }
    return {width, height, alpha}
  }

  function extract({width, height, alpha}) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || alpha.length !== width * height)
      throw new Error('Invalid silhouette dimensions')
    let x1=width, y1=height, x2=-1, y2=-1, transparent=false
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      if (alpha[y*width+x] < 128) { transparent=true; continue }
      x1=Math.min(x1,x); y1=Math.min(y1,y); x2=Math.max(x2,x); y2=Math.max(y2,y)
    }
    if (x2 < x1 || !transparent) throw new Error('Silhouette must contain a visible shape and transparent background')
    const cw=x2-x1+1, ch=y2-y1+1, longest=Math.max(cw,ch)
    const w=Math.max(1,Math.floor((48*cw+Math.floor(longest/2))/longest))
    const h=Math.max(1,Math.floor((48*ch+Math.floor(longest/2))/longest))
    const rows=[]
    for (let y=0; y<h; y++) {
      let line=''
      const top=y1+Math.floor(y*ch/h), bottom=y1+Math.max(Math.floor(y*ch/h)+1,Math.floor((y+1)*ch/h))
      for (let x=0; x<w; x++) {
        const left=x1+Math.floor(x*cw/w), right=x1+Math.max(Math.floor(x*cw/w)+1,Math.floor((x+1)*cw/w))
        let solid=0
        for(let sy=top;sy<bottom;sy++)for(let sx=left;sx<right;sx++) if(alpha[sy*width+sx]>=128)solid++
        line += solid*4 >= (right-left)*(bottom-top) ? '1' : '0'
      }
      rows.push(line)
    }
    return rows
  }

  function sourceForSeed(seed, sources) {
    if (!sources.length) throw new Error('No cave silhouette sources configured')
    let value = Number(seed) >>> 0
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
    return sources[((value ^ (value >>> 16)) >>> 0) % sources.length]
  }

  async function load(source) {
    const url = source.source + '?v=' + self.VAGABOND_GAME_VERSION
    if (!pending.has(url)) {
      const task = (async () => {
        const response = await fetch(url)
        if (!response.ok) throw new Error('Failed to load cave silhouette: ' + source.source)
        return {...source, rows:extract(await decodeAlpha(await response.arrayBuffer()))}
      })()
      pending.set(url, task)
      task.catch(() => { if (pending.get(url) === task) pending.delete(url) })
    }
    return pending.get(url)
  }

  function pairForSeed(seed, sources) {
    if (sources.length < 2) throw new Error('At least two cave silhouette sources are required')
    const first=sourceForSeed(seed,sources)
    const others=sources.filter(s=>s.id!==first.id)
    return [first,sourceForSeed((Number(seed) ^ 0x6d2b79f5) >>> 0,others)]
  }

  function blend(first, second, seed) {
    const turns=1+((Number(seed)>>>3)%3), mirror=!!((Number(seed)>>>6)&1)
    const points=(rows,rotate,flip)=>{
      const cells=[],h=rows.length,w=rows[0].length
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(rows[y][x]==='1') {
        let px=(flip?w-1-x:x)-Math.floor(w/2),py=y-Math.floor(h/2)
        for(let n=0;n<rotate;n++) [px,py]=[-py,px]
        cells.push({x:px,y:py})
      }
      return cells
    }
    const a=points(first.rows,0,false),b=points(second.rows,turns,mirror)
    const occupied=new Set(a.map(p=>p.x+','+p.y))
    const candidates=[]
    for(let dy=-24;dy<=24;dy+=4)for(let dx=-24;dx<=24;dx+=4)candidates.push({dx,dy})
    // A seeded starting offset varies orientation while retaining a stable search order.
    const start=(Number(seed)>>>8)%candidates.length
    let best=null
    for(let n=0;n<candidates.length;n++) {
      const {dx,dy}=candidates[(start+n)%candidates.length]
      const overlap=b.reduce((sum,p)=>sum+Number(occupied.has((p.x+dx)+','+(p.y+dy))),0)
      if(overlap<Math.max(1,Math.ceil(Math.min(a.length,b.length)*.05)))continue
      const uniqueA=a.length-overlap,uniqueB=b.length-overlap
      const score=Math.min(uniqueA/a.length,uniqueB/b.length)
      if(!best||score>best.score)best={dx,dy,overlap,uniqueA,uniqueB,score}
      if(score>=.25)break
    }
    if(!best || best.score<.1)throw new Error('Silhouette pair cannot form a useful overlap')
    const combined=[...a,...b.map(p=>({x:p.x+best.dx,y:p.y+best.dy}))]
    const x1=Math.min(...combined.map(p=>p.x)),y1=Math.min(...combined.map(p=>p.y))
    const width=Math.max(...combined.map(p=>p.x))-x1+1,height=Math.max(...combined.map(p=>p.y))-y1+1
    const grid=Array.from({length:height},()=>Array(width).fill('0'))
    for(const p of combined)grid[p.y-y1][p.x-x1]='1'
    return {id:first.id+'+'+second.id,sourceIds:[first.id,second.id],rows:grid.map(r=>r.join('')),
      mix:{quarterTurns:turns,mirror,dx:best.dx,dy:best.dy,overlap:best.overlap,
        uniqueA:best.uniqueA,uniqueB:best.uniqueB,countA:a.length,countB:b.length}}
  }

  async function prepare(seed) {
    const sources = pairForSeed(seed, CAVE_SILHOUETTE_SOURCES)
    // Promise.all preserves source order regardless of download/decompression timing.
    const [first,second] = await Promise.all(sources.map(load))
    const prototype = blend(first,second,seed)
    CAVE_SILHOUETTES = [prototype]
    return prototype
  }
  return {decodeAlpha, extract, sourceForSeed, pairForSeed, blend, load, prepare,
    idForSeed:seed=>pairForSeed(seed,CAVE_SILHOUETTE_SOURCES).map(s=>s.id).join('+')}
})()
