describe('Monster invisibility and Giant Spider web visuals', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('#raceName').clear().type('Invisibility Tester')
    cy.get('#worldSizeSelect').select('XS')
    cy.window().then(win => win.eval('WORLD_SEED = 32107; rngState = WORLD_SEED'))
    cy.get('#btnBegin').click()
    cy.get('#loadingOverlay', {timeout: 60000}).should('not.be.visible')
    cy.get('#raceOverlay').should('not.have.class', 'show')
    cy.window().then(win => win.eval(`(() => {
      window.invisibilityAssert=(ok,msg)=>{if(!ok)throw Error(msg)}
      currentZ=0;currentCave=-1;map=surfaceMap;enemies=[];npcs=[];occupied=new Set();
      spawnPoint={x:5,y:5};player.x=40;player.y=40;player.hp=5000;player.maxHp=5000;
      player.invisibleTurns=0;player.godMode=false;player.spiderWebSourceId=null;
      turnCount=1;deathTransition=null;replayAnimationsDisabled=false;
      for(let y=30;y<=50;y++)for(let x=30;x<=50;x++){
        map[y][x]='grass';grasslandTrees.delete(keyXY(x,y));}
      window.spawnStealth=(name,x,y)=>{
        const t=ENEMY_TEMPLATE_BY_NAME[name];
        const e=addEnemy({...t,x,y,baseName:name,homeX:x,homeY:y,
          homeTileType:'grass',hp:t.hp,maxHp:t.hp,level:0,alive:true,aware:true});
        occupied.add(keyXY(x,y));return e;}
      snapCameraToPlayer();render();
    })()`))
  })

  it('hides remote invisibility, shows nearby shimmer, and reveals on attack', () => {
    cy.window().then(win => win.eval(`(() => {
      const e=spawnStealth('Skerva',36,40);
      e.invisibleUntilTurn=5;
      invisibilityAssert(!enemyCanBeSeen(e),'hidden when more than two tiles away');
      invisibilityAssert(tileInspectInfo(36,40)?.enemy!==e,'no secret tooltip');
      e.x=38;occupied.clear();occupied.add(keyXY(38,40));
      invisibilityAssert(enemyInvisibleShimmer(e),'shimmer within two tiles');
      invisibilityAssert(tileInspectInfo(38,40)?.enemy===e,'activation shimmer inspectable');
      turnCount=2;
      invisibilityAssert(!enemyCanBeSeen(e),'fully invisible next turn');
      invisibilityAssert(tileInspectInfo(38,40)?.enemy!==e,'no tooltip when fully hidden');
      render();
      revealEnemyInvisibility(e);
      invisibilityAssert(!enemyInvisibleActive(e),'reveal clears invisibility');
      render();
    })()`))
  })

  it('draws species sprites in tile mode and preserves glyph fallbacks in ASCII', () => {
    cy.window().then(win => win.eval(`(() => {
      const visuals=Object.entries(RENDER_STYLE.enemies.tiles);
      invisibilityAssert(visuals.length===94,'all monster sprites are mapped');
      invisibilityAssert(ENEMY_TEMPLATES.every(enemy=>RENDER_STYLE.enemies.tiles[enemy.name]),
        'every monster species has tile artwork');
      invisibilityAssert(visuals.every(([name,visual]) =>
        ENEMY_TEMPLATE_BY_NAME[name] && preloadedImages.has(visual.image)),
        'mapped monster sprites are preloaded before play');
      invisibilityAssert(['Lich','Gargoyle','Naledi','Ogre','Xibal','Yeti','Amplyg','Alacran',
        'Serpent Queen','Gorgon','Cave Troll','Wyrdhag','NHALUUN'].every(name =>
        visuals.some(([mapped])=>mapped===name)),
        'new surface, tower and mine sprites are mapped');
      invisibilityAssert(!visuals.some(([,visual])=>visual.image.includes('dont-use')),
        'rejected orc reference is excluded');

      const goblin=spawnStealth('Goblin',41,40);
      goblin.prefix='Champion';goblin.name='Champion Goblin';
      const lich=spawnStealth('Lich',43,40);
      const skerva=spawnStealth('Skerva',42,40);
      const oldMode=USE_TILE_IMAGES, oldDraw=ctx.drawImage, oldText=ctx.fillText;
      const calls=[];
      ctx.drawImage=function(...args){calls.push('image');return oldDraw.apply(this,args)};
      ctx.fillText=function(text,...args){calls.push(text);return oldText.call(this,text,...args)};
      const capture=(enemy,tiles)=>{
        USE_TILE_IMAGES=tiles;calls.length=0;
        drawEnemyVisual(0,0,enemy);
        return calls.slice();
      };
      try {
        const sprite=capture(goblin,true);
        invisibilityAssert(sprite.includes('image') && !sprite.includes('g'),
          'prefixed goblin uses its base-species sprite');
        const ascii=capture(goblin,false);
        invisibilityAssert(!ascii.includes('image') && ascii.includes('g'),
          'ASCII mode keeps the lowercase tier-two glyph');
        const lichSprite=capture(lich,true);
        invisibilityAssert(lichSprite.includes('image'),
          'newly supplied species uses its tile sprite');
        const lichAscii=capture(lich,false);
        invisibilityAssert(!lichAscii.includes('image'),
          'newly supplied species still uses a glyph in ASCII');
        const skervaSprite=capture(skerva,true);
        invisibilityAssert(skervaSprite.includes('image'),
          'previously unmapped species now uses its tile sprite');
        const skervaImagePath=RENDER_STYLE.enemies.tiles.Skerva.image;
        const skervaImage=preloadedImages.get(skervaImagePath);
        try {
          preloadedImages.delete(skervaImagePath);
          const fallback=capture(skerva,true);
          invisibilityAssert(!fallback.includes('image') && fallback.includes('S'),
            'missing sprite falls back to the monster glyph');
        } finally {
          preloadedImages.set(skervaImagePath,skervaImage);
        }
      } finally {
        ctx.drawImage=oldDraw;ctx.fillText=oldText;USE_TILE_IMAGES=oldMode;
      }
      render();
    })()`))
  })

  it('keeps the larger web over the player until movement or spider death', () => {
    cy.window().then(win => win.eval(`(() => {
      const spider=spawnStealth('Giant Spider',36,40);
      const previousChance=chance;chance=p=>p===0.70;
      invisibilityAssert(tryEnemyRush(spider),'spider can pull');chance=previousChance;
      invisibilityAssert(player.spiderWebSourceId===spider.id,'web owner assigned');
      invisibilityAssert(SPIDER_WEB_OVERLAY_SCALE===1.35,'large overlay');
      invisibilityAssert(SPIDER_WEB_THROW_MS<SPIDER_WEB_PULL_MS,'throw faster than drag');
      // Render both ASCII and tile modes, retaining the web status.
      const oldTileMode=USE_TILE_IMAGES;
      USE_TILE_IMAGES=false;render();USE_TILE_IMAGES=oldTileMode;render();
      invisibilityAssert(spiderWebSource()===spider,'visible status linked to living spider');
      clearSpiderWeb();
      invisibilityAssert(player.spiderWebSourceId===null,'movement clear helper');
      markSpiderWeb(spider,false);spider.hp=0;killEnemy(spider,false);
      invisibilityAssert(player.spiderWebSourceId===null,'death clears overlay');
    })()`))
  })
})
