import test from 'node:test';
import assert from 'node:assert/strict';
import { getGameAssets, getExactGameIdentityProfile, isVerifiedLegacyGamePlayer, mergeGamePlayerDocuments } from '../src/database/player-sync.js';

test('legacy account requires exact global ID and the issuing bot', () => {
  const legacy = {idUserZalo:'LEGACY',serverId:'bot-a',balance:'183916527216',rankPoints:100000};
  assert.equal(isVerifiedLegacyGamePlayer(legacy,{globalId:'LEGACY'},'bot-a'),true);
  assert.equal(isVerifiedLegacyGamePlayer(legacy,{globalId:'LEGACY'},'bot-b'),false);
  assert.equal(isVerifiedLegacyGamePlayer(legacy,{globalId:'OTHER'},'bot-a'),false);
  assert.equal(isVerifiedLegacyGamePlayer({...legacy,mergedInto:'other'},{globalId:'LEGACY'},'bot-a'),false);
});

test('Kha recovery retains wallet, savings and diamond points without converting savings into spendable money', () => {
  const merged=mergeGamePlayerDocuments({balance:'183916527216',rankPoints:100000},{balance:'10000',rankPoints:0});
  assert.equal(merged.rankPoints,100000);
  assert.deepEqual(getGameAssets(merged.balance,'284676902295002'),{
    walletBalance:'183916537216',savings:'284676902295002',totalAssets:'284860818832218',
  });
});

test('exact profile lookup accepts suffix and changed profiles but rejects unrelated identities',()=>{
  const profile={globalId:'LEGACY',username:'new'};
  assert.equal(getExactGameIdentityProfile({changed_profiles:{'123_0':profile}},'123'),profile);
  assert.equal(getExactGameIdentityProfile({unchanged_profiles:{'123':profile}},'123_0'),profile);
  assert.equal(getExactGameIdentityProfile({profiles:{'999':profile}},'123'),null);
});
