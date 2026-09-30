import test from 'node:test';
import assert from 'node:assert/strict';
import {rollNoHuSlots, NOHU_WIN_RATE} from '../src/service-ngh/game-service/nohu/rules.js';
import {chooseLongHoResult, LONG_HO_DOORS} from '../src/service-ngh/game-service/long-ho/rules.js';

function seededRandom(seed=42){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('slot sample stays close to the modestly reduced hit rate',()=>{
  const random=seededRandom();let wins=0;
  for(let i=0;i<50000;i++){
    const slots=rollNoHuSlots(random);
    if(new Set(slots.map(s=>s.key)).size<3) wins++;
  }
  assert.equal(NOHU_WIN_RATE,.23);
  assert.ok(Math.abs(wins/50000-.23)<.01,`actual hit rate ${wins/50000}`);
});

test('shared table default is slightly harder without eliminating wins',()=>{
  const bets={one:{door:LONG_HO_DOORS.long,amount:'10000'}};
  const before=seededRandom(),after=seededRandom();let oldWins=0,newWins=0;
  for(let i=0;i<10000;i++){
    if(chooseLongHoResult(bets,{random:before,houseBiasChance:.15}).resultDoor==='long')oldWins++;
    if(chooseLongHoResult(bets,{random:after}).resultDoor==='long')newWins++;
  }
  assert.ok(newWins<oldWins);
  assert.ok((oldWins-newWins)/10000<.04);
  assert.ok(newWins/10000>.3);
});
