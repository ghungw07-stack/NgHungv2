// Run without --apply to inspect. Applying requires nghung-bot to be stopped.
import { MongoClient } from 'mongodb';
import { execFileSync } from 'node:child_process';
import Big from 'big.js';
import { mergeGamePlayerDocuments } from '../src/database/player-sync.js';

const apply = process.argv.includes('--apply');
// Explicitly confirmed by the user; never infer these pairs from avatar/name.
const confirmedPairs = process.argv.includes('--confirmed-remaining') ? new Map([
  ['t_m7d8fgbbf9', 'HCJRQFQQAH660M5D0UFM251MN46DA9O0'],
  ['t_m7d8fb7ddf', 'GIGKL1U0LN3VLGIVJNUJKRI5V1361M00'],
]) : null;
const client = new MongoClient('mongodb://127.0.0.1:27017', { serverSelectionTimeoutMS: 5000 });
const references = {
  game_history: ['playerId', 'idUserZalo', 'username'],
  game_savings_transactions: ['playerId'],
  game_transactions: ['senderId', 'receiverId'],
  game_reward_payouts: ['playerId'],
  game_donate_manual_logs: ['playerId'],
  donation_codes: ['uid'],
  player_identity: ['playerId'],
};
try {
  await client.connect();
  const db = client.db('bot-zalo-ngh');
  const players = db.collection('players_zalo');
  const rows = await players.find({ mergedInto: { $exists: false } }).toArray();
  const legacy = rows.filter(p => /^[A-Z0-9]{32}$/.test(p.idUserZalo));
  const plans = [], unresolved = [];
  for (const source of rows.filter(p => /^t_/.test(p.idUserZalo))) {
    if (confirmedPairs && !confirmedPairs.has(source.idUserZalo)) continue;
    const matches = legacy.filter(p => p.playerName === source.playerName);
    if (!matches.length) continue;
    const target = matches[0];
    // One-time recovery only: require unique old/new names plus the same exact
    // nonempty avatar URL. Runtime identity resolution never uses this heuristic.
    const confirmed = confirmedPairs?.get(source.idUserZalo) === target.idUserZalo;
    if (matches.length !== 1 || (!confirmed && (!source.avatar || source.avatar !== target.avatar)) ||
        rows.filter(p => /^t_/.test(p.idUserZalo) && p.playerName === source.playerName).length !== 1) {
      unresolved.push(source.playerName);
      continue;
    }
    plans.push({ source, target });
  }
  console.log(JSON.stringify({ apply, pairs: plans.map(({source,target}) => ({
    name: source.playerName, source: source.idUserZalo, target: target.idUserZalo,
    wallet: new Big(source.balance || 0).plus(target.balance || 0).toString(),
    rankPoints: Number(source.rankPoints || 0) + Number(target.rankPoints || 0),
  })), unresolved }, null, 2));
  if (apply) {
    const processes = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
    if (!processes.some(p => p.name === 'nghung-bot' && p.pm2_env.status === 'stopped')) {
      throw new Error('Stop nghung-bot before applying this offline repair.');
    }
    for (const {source, target} of plans) {
      const sourceId = source.idUserZalo, targetId = target.idUserZalo;
      const backupId = `split-game-v1:${sourceId}:${targetId}`;
      if (await db.collection('repair_backups').findOne({_id:backupId})) {
        throw new Error(`Existing backup ${backupId}; inspect before retrying.`);
      }
      const savings = await db.collection('game_savings_accounts').find({playerId:{$in:[sourceId,targetId]}}).toArray();
      const privacy = await db.collection('player_game_privacy').find({playerId:{$in:[sourceId,targetId]}}).toArray();
      const linked = {};
      for (const [name, fields] of Object.entries(references)) {
        linked[name] = await db.collection(name).find({$or:fields.map(field=>({[field]:sourceId}))}).toArray();
      }
      await db.collection('repair_backups').insertOne({
        _id:backupId, type:'split-game-v1', createdAt:new Date(), status:'started',
        evidence:confirmedPairs ? 'User explicitly confirmed this exact pair' : 'Unique legacy/username pair with identical name and avatar; offline recovery',
        source,target,savings,privacy,linked,
      });
      const merged = mergeGamePlayerDocuments(target,source);
      await players.updateOne({_id:target._id},{$set:merged,$addToSet:{mergedSources:sourceId}});
      const sourceSavings = savings.find(p=>p.playerId===sourceId);
      const targetSavings = savings.find(p=>p.playerId===targetId);
      if (sourceSavings) {
        const dates = [sourceSavings.lastInterestAt,targetSavings?.lastInterestAt].filter(Boolean).map(x=>new Date(x));
        await db.collection('game_savings_accounts').updateOne({playerId:targetId},{$set:{
          playerId:targetId,principal:new Big(sourceSavings.principal||0).plus(targetSavings?.principal||0).toString(),
          lastInterestAt:dates.length ? new Date(Math.max(...dates.map(Number))) : new Date(),updatedAt:new Date(),
        }},{upsert:true});
        await db.collection('game_savings_accounts').deleteOne({_id:sourceSavings._id});
      }
      for(const [name,fields] of Object.entries(references)) {
        for(const field of fields) await db.collection(name).updateMany({[field]:sourceId},{$set:{[field]:targetId}});
      }
      const sourcePrivacy=privacy.find(p=>p.playerId===sourceId);
      if(sourcePrivacy){
        await db.collection('player_game_privacy').updateOne({playerId:targetId},{$set:{playerId:targetId,
          hideProfile:privacy.some(p=>p.hideProfile),hideTier:privacy.some(p=>p.hideTier),updatedAt:new Date(),
        }},{upsert:true});
        await db.collection('player_game_privacy').deleteOne({_id:sourcePrivacy._id});
      }
      await players.updateOne({_id:source._id},{$set:{mergedInto:targetId,mergedAt:new Date(),
        balance:'0',rankPoints:0,pendingRefund:'0',totalWinnings:'0',totalLosses:'0',netProfit:'0',totalGames:0,totalWinGames:0,winRate:0,
      }});
      for(const aliasId of [sourceId,targetId]) await db.collection('player_identity').updateOne({aliasId},{$set:{aliasId,playerId:targetId,updatedAt:new Date()}},{upsert:true});
      await db.collection('player_identity').updateOne({identityKey:`USERNAME:${sourceId}`},{$set:{identityKey:`USERNAME:${sourceId}`,playerId:targetId,updatedAt:new Date()}},{upsert:true});
      const after=await players.findOne({_id:target._id});
      if(after.balance!==merged.balance||after.rankPoints!==merged.rankPoints)throw new Error('Repair verification failed');
      await db.collection('repair_backups').updateOne({_id:backupId},{$set:{status:'complete',completedAt:new Date(),after}});
      console.log(`Repaired: ${source.playerName}`);
    }
  }
} finally { await client.close(); }
