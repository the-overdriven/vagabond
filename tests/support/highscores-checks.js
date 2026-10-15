// These checks execute in the game's global scope via eval, so they exercise
// the real level-up/save/replay hooks rather than a duplicate implementation.
function installOnlineMock(win, options = {}) {
  win.__VAGABOND_TEST_GRAVEYARD__ = true
  Object.defineProperty(win.navigator,'onLine',{configurable:true,value:!options.offline})
  const online = win.__highscoresOnline = {clients:0,reads:[],posts:[],pendingReads:[]}
  win.supabase = {createClient:()=>{
    online.clients++
    return {
      rpc(name,args) {
        online.reads.push({name,args})
        if(options.deferred) return new Promise(resolve=>online.pendingReads.push({args,resolve}))
        if(options.pending) return new Promise(()=>{})
        const data = options.rows ? options.rows[String(args.p_permadeath)] : options.fullPermadeath && args.p_permadeath
          ? Array.from({length:10},(_,i)=>({id:`board-${i}`,character_id:`board-${i}`,
            character_name:'Other',race:'human',permadeath:true,level:50,strength:100,
            created_at:'2026-10-15T12:00:00+00:00'})) : []
        return Promise.resolve({data,error:options.failReads?{message:'Unavailable'}:null})
      },
      from:table=>({insert:record=>{
        online.posts.push({table,record:JSON.parse(JSON.stringify(record))})
        return Promise.resolve({error:null})
      },select:()=>({order(){return this},limit(){return this},eq(){return this},
        then(resolve){resolve({data:[],error:null})}})})
    }
  }}
}

async function levelUpChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  await tick()
  const online=window.__highscoresOnline
  check(online.clients===1&&online.reads.length===2,'startup shares one client and reads both boards')
  player.lvl=1;player.xp=0;player.race='human';player.highscoresDisqualified=false
  player.equip={weapon:{kind:'weapon',name:'Fractional Sword',base:'Sword',atk:2.25,grace:3.5},armor:null,shield:null}
  player.speedPotionTurns=5;player.speedPotionBonus=4
  player.curseDebuffs=[{stat:'atk',amt:-2,turnsLeft:5}]
  const turn=turnCount,seed=rngState
  const amount=Math.ceil([1,2,3,4].reduce((sum,level)=>sum+xpToNext(level),0)/xpMultiplier())
  gainXp(amount)
  const expected=playerPermanentStats()
  await tick()
  const high=()=>online.posts.filter(post=>post.table==='highscore_records')
  check(player.lvl===5&&high().length===1,'one final milestone after multiple levels')
  const record=high()[0].record
  check(record.level===5&&record.character_id===player.characterId,'milestone identity and level')
  for(const stat of ['atk','def','spd','grace']) check(record[stat]===expected[stat],`permanent ${stat}`)
  check(record.atk!==playerAtk()&&record.spd!==playerSpd(),'transient bonuses excluded')
  check(turnCount===turn&&rngState===seed,'online activity adds no turns or RNG')
  check(!('strength' in record)&&!('created_at' in record)&&!('id' in record),'server fields not submitted')
  gainXp(1)
  const saved=JSON.parse(JSON.stringify(buildSaveObject()))
  check(saved.version===self.VAGABOND_SAVE_VERSION&&saved.player.highscoresDisqualified===false,'current save persists eligibility')
  loadGameFromObject(saved,{isReplayInit:true})
  await tick();check(high().length===1,'ordinary XP and load do not submit')
  for(const flag of ['replayPlaying','replaySimulationMode','replayAnimationsDisabled','replayActionRunning','replayCurrentActionIndex']) {
    const previous=eval(flag)
    try {
      eval(`${flag}=${flag==='replayCurrentActionIndex'?'0':'true'}`)
      gainXp(Math.ceil(xpToNext(player.lvl)/xpMultiplier()))
      await tick()
      check(high().length===1,`${flag} blocks submission`)
    } finally {eval(`${flag}=${JSON.stringify(previous)}`)}
  }
  check(online.reads.length===2,'level-up and load do not refetch')
  die(null,'environment');await tick()
  check(high().length===1,'death does not submit a Highscores milestone')
  check(online.posts.some(post=>post.table==='death_records'),'shared Graveyard submission still works')
  stopDeathTransition()
}

async function modeChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  await tick()
  player.race='human';player.lvl=1;player.xp=0;player.permadeath=true
  gainXp(Math.ceil(xpToNext(1)/xpMultiplier()));await tick()
  check(window.__highscoresOnline.posts.length===0,'full permadeath cutoff suppresses low-level milestone')
  player.permadeath=false
  gainXp(Math.ceil(xpToNext(player.lvl)/xpMultiplier()));await tick()
  const posts=window.__highscoresOnline.posts
  check(posts.length===1&&posts[0].record.permadeath===false,'partial normal board qualifies independently')
}

async function exclusionChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  const original=JSON.parse(JSON.stringify(buildSaveObject()))
  const malformed=JSON.parse(JSON.stringify(original))
  delete malformed.player.highscoresDisqualified
  let rejected=false
  try {loadGameFromObject(malformed,{isReplayInit:true})}
  catch(error) {rejected=error.message.includes('Highscores eligibility')}
  check(rejected,'current saves require the explicit exclusion flag')
  useGodModeKey()
  check(player.highscoresDisqualified===true,'god mode immediately excludes character')
  useGodModeKey()
  check(!player.godMode&&player.highscoresDisqualified,'turning god mode off keeps exclusion')
  gainXp(1000);await tick()
  check(window.__highscoresOnline.posts.length===0,'excluded character never submits')
  const excluded=JSON.parse(JSON.stringify(buildSaveObject()))
  loadGameFromObject(excluded,{isReplayInit:true})
  check(player.highscoresDisqualified,'saved exclusion restores in replay initialization')
  loadGameFromObject(original)
  check(player.highscoresDisqualified,'earlier live save reconciles browser exclusion')
  loadGameFromObject(original,{isReplayInit:true})
  check(!player.highscoresDisqualified,'replay initialization ignores browser ledger')
  player.characterId='highscores-replay-only'
  replayPlaying=true
  try {
    useGodModeKey();gainXp(1000);await tick()
    check(player.highscoresDisqualified,'replay reproduces exclusion in game state')
    check(localStorage.getItem('vagabond_highscores_disqualified_highscores-replay-only')===null,'replay never writes exclusion ledger')
    check(window.__highscoresOnline.posts.length===0,'replay never submits')
  } finally {replayPlaying=false;replaySimulationMode=false;replayAnimationsDisabled=false}
  loadGameFromObject(original,{isReplayRestore:true})
  check(!player.highscoresDisqualified,'live snapshot restore remains exact')
  resetForNewCharacter()
  check(!player.highscoresDisqualified&&player.characterId===null,'new character initializes clean eligibility')
}

async function offlineChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  check(window.__highscoresOnline.clients===0,'offline startup skips SDK client')
  const oldLevel=player.lvl,seed=rngState
  gainXp(Math.ceil(xpToNext(player.lvl)/xpMultiplier()));await tick()
  check(player.lvl>oldLevel&&rngState===seed,'offline leveling works without RNG changes')
  check(window.__highscoresOnline.posts.length===0,'offline milestone is not queued')
  Object.defineProperty(navigator,'onLine',{configurable:true,value:true})
  window.dispatchEvent(new Event('online'));await tick()
  check(window.__highscoresOnline.posts.length===0,'reconnecting does not submit offline milestone')
  gainXp(Math.ceil(xpToNext(player.lvl)/xpMultiplier()));await tick()
  check(window.__highscoresOnline.posts.length===1,'next live level-up can submit with unknown cutoff')
  check(window.__highscoresOnline.reads.length===0,'reconnect does not refetch')
}

module.exports={installOnlineMock,levelUpChecks,modeChecks,exclusionChecks,offlineChecks}
