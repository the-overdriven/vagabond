function highscoreRows(mode) {
  return Array.from({length:10},(_,index)=>({
    id:`record-${mode}-${index}`,character_id:`character-${mode}-${index}`,
    character_name:index===0?'<img src=x onerror=alert(1)>':`Veteran ${index}`,
    race:'elf',permadeath:mode,is_dead:mode && index%2===0,level:20-index,strength:30.25-index,
    atk:10.25,def:8,spd:6,grace:6,max_hp:240,mf:5,gold:400,
    cumulated_xp:12345,death_number:mode?0:3,steps_taken:700,creatures_slain:120,
    equipment:{weapon:{name:'A Very Long Sword Name',stat_line:'ATK 10.25, GRACE 6 '+('x'.repeat(600))}},
    artifacts:[{name:'Old Amulet',stat_line:'DEF +2'}],
    strongest_enemy_killed:{name:'GIANT TOAD',strength:42},world_seed:-123,
    world_size:'L',world_traits:[{name:'Cold World'}],game_version:'v108',
    created_at:'2026-10-15T12:00:00.000001+00:00'
  }))
}

function layoutChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const trophy=document.getElementById('btnHighscores'),box=trophy.getBoundingClientRect()
  check(trophy.textContent==='🏆'&&trophy.title==='Highscores'&&trophy.getAttribute('aria-label')==='Highscores','accessible trophy button')
  check(box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight,'trophy fits viewport')
  check(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2)===trophy,'trophy reachable above character selection')
  const overlay=document.getElementById('highscoresOverlay')
  Highscores.open()
  const close=document.getElementById('btnHighscoresClose'),rect=close.getBoundingClientRect()
  check(rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,'close control fits viewport')
  check(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2)===close,'close control unobstructed')
  const panel=overlay.querySelector('.panelbox').getBoundingClientRect()
  check(panel.left>=0&&panel.right<=innerWidth&&panel.top>=0&&panel.bottom<=innerHeight+1,'panel fits viewport')
  check(getComputedStyle(document.getElementById('highscoresList')).overflowY==='auto','list has independent scrolling')
  check(document.documentElement.scrollWidth<=innerWidth,'no horizontal page overflow')
}

async function recordChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  Highscores.open();await tick()
  let cards=[...document.querySelectorAll('#highscoresList > details')]
  check(cards.length===10,'top ten records rendered')
  check(cards[0].querySelector('strong').textContent.startsWith('#1 <img'),'names are literal text and ranks are visible')
  check(cards.every(card=>!card.querySelector('strong').textContent.includes('💀')),'normal highscore board never renders death markers')
  check(document.querySelectorAll('#highscoresList img, #highscoresList script').length===0,'remote HTML is never parsed')
  cards[0].open=true
  check(cards[0].textContent.includes('Strongest slain enemy: GIANT TOAD'),'achievement details')
  check(!cards[0].textContent.includes('Snapshot: Level-up achievement'),'no redundant level-up snapshot label')
  check(cards[0].textContent.includes('World traits: Cold World'),'world details')
  check(cards[0].textContent.includes('Game version: v108'),'version details')
  const list=document.getElementById('highscoresList')
  check(list.scrollWidth<=list.clientWidth+1,'long item stat text wraps without horizontal overflow')
  const close=document.getElementById('btnHighscoresClose'),before=close.getBoundingClientRect().top
  list.scrollTop=list.scrollHeight
  check(list.scrollTop>0,'long board scrolls')
  check(close.getBoundingClientRect().top===before,'close control stays visible while list scrolls')
  const queries=window.__highscoresOnline.reads.length
  document.querySelector('#highscoresFilters [data-mode="true"]').click();await tick()
  cards=[...document.querySelectorAll('#highscoresList > details')]
  check(cards.length===10&&cards.every(card=>card.classList.contains('permadeath')),'mode switch uses separate board')
  check(cards[0].querySelector('strong').textContent.endsWith('💀'),'dead permadeath character shows a skull')
  check(cards[0].querySelector('strong span').getAttribute('aria-label')==='Died in permadeath','death status has an accessible label')
  check(!cards[1].querySelector('strong').textContent.includes('💀'),'unmarked permadeath character has no skull')
  check(window.__highscoresOnline.reads.length===queries+1,'switch fetches only requested mode')
  check(window.__highscoresOnline.reads.at(-1).name==='highscores_permadeath_top_ten','only permadeath mode uses death-aware RPC')
  check(document.querySelector('#highscoresFilters [data-mode="true"]').getAttribute('aria-pressed')==='true','active mode is accessible')
  check(window.__highscoresOnline.posts.length===0,'viewing records never submits a milestone')
}

async function inputChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  const before={x:player.x,y:player.y,turn:turnCount,rng:rngState,god:player.godMode}
  pendingMove={dx:1,dy:0};autoPath=[{x:player.x+1,y:player.y}]
  Highscores.open();await tick()
  check(pendingMove===null&&autoPath===null,'opening cancels queued live movement')
  await tryMove(1,0);skipTurn();flushPendingMove()
  for(const key of ['ArrowRight','t','f','g','Tab',' ']) {
    window.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))
  }
  check(player.x===before.x&&player.y===before.y&&turnCount===before.turn&&rngState===before.rng&&player.godMode===before.god,'live input blocked without turns or RNG')
  check(getComputedStyle(document.getElementById('touchControls')).display==='none','touch controls hidden')
  Graveyard.open()
  check(!Highscores.isOpen()&&Graveyard.isOpen(),'Graveyard closes Highscores')
  Highscores.open();await tick()
  check(!Graveyard.isOpen()&&Highscores.isOpen(),'Highscores closes Graveyard')
  Highscores.close()
  replaySimulationMode=true
  try {
    const reads=window.__highscoresOnline.reads.length
    Highscores.open();await tick()
    check(document.getElementById('highscoresStatus').textContent==='Highscores unavailable during replay.','replay state explained')
    check(window.__highscoresOnline.reads.length===reads,'replay opening sends no query')
    check(!onlineRecordsBlockActions(),'overlay does not block recorded replay actions')
  } finally {Highscores.close();replaySimulationMode=false}
}

async function responseRaceChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,0))
  Highscores.open();await tick()
  check(document.getElementById('highscoresStatus').textContent==='Loading...','loading state')
  const pending=window.__highscoresOnline.pendingReads
  document.querySelector('#highscoresFilters [data-mode="true"]').click();await tick()
  const newest=pending[pending.length-1]
  newest.resolve({data:[],error:null});await tick()
  check(document.getElementById('highscoresStatus').textContent==='No highscores yet.','empty selected board state')
  for(const request of pending.slice(0,-1)) request.resolve({data:null,error:{message:'stale error'}})
  await tick()
  check(document.getElementById('highscoresStatus').textContent==='No highscores yet.','stale responses cannot repaint another mode')
  document.querySelector('#highscoresFilters [data-mode="false"]').click();await tick()
  const last=pending[pending.length-1]
  Highscores.close();last.resolve({data:null,error:{message:'late error'}});await tick()
  check(!Highscores.isOpen(),'late responses do not reopen closed overlay')
}

async function replayOverlayChecks() {
  const check=(ok,message)=>{if(!ok)throw Error(message)}
  const tick=()=>new Promise(resolve=>setTimeout(resolve,10))
  enemies=[];npcs=[];consecutiveWaitTurns=0
  replayRecording=false;replayPlaying=false;replayData=null
  startReplayRecording();skipTurn()
  check(replayData.actions.length===1,'one real wait recorded')
  const originalSkip=skipTurn
  let playedTurns=0
  skipTurn=function() {
    const before=turnCount
    const result=originalSkip()
    if(replayPlaying) {
      check(turnCount===before+1,'recorded wait advances time while Highscores is visible')
      playedTurns++
    }
    return result
  }
  const reads=window.__highscoresOnline.reads.length
  try {
    startReplayPlayback();Highscores.open()
    for(let i=0;i<300&&replayPlaying;i++) await tick()
    check(!replayPlaying&&playedTurns===1,'replay finishes with visible overlay')
    check(window.lastReplayDiagnostic?.completedActions===1,'replay action completed')
    check(window.__highscoresOnline.reads.length===reads,'no query during playback')
  } finally {skipTurn=originalSkip;Highscores.close();stopReplayPlayback()}
}

module.exports={highscoreRows,layoutChecks,recordChecks,inputChecks,responseRaceChecks,replayOverlayChecks}
