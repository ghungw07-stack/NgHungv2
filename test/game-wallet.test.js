import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGameAmount, parseGameBetAmount} from '../src/utils/format-util.js';
import {EMPTY_GAME_WALLET_MESSAGE, getEmptySavingsMessage, parseSavingsArguments} from '../src/utils/game-wallet.js';

test('empty wallet reports no funds for all, percentage and fixed bets',()=>{
  for(const amount of ['all','allin','100%','10k']) {
    assert.throws(()=>parseGameBetAmount(amount,'0'),{code:'EMPTY_GAME_WALLET',message:EMPTY_GAME_WALLET_MESSAGE});
  }
  assert.throws(()=>parseGameBetAmount('10k','5000'),/Ví game không đủ tiền cược/);
  assert.equal(parseGameBetAmount('all','10000'),'allin');
  assert.equal(parseGameBetAmount('50%','10000').toString(),'5000');
  assert.equal(parseGameBetAmount('10k','10000').toString(),'10000');
});

test('ordinary amount parsing still supports operations with zero reference balance',()=>{
  assert.equal(parseGameAmount('100k',0).toString(),'100000');
  assert.equal(parseGameAmount('10bb',0).toString(),'10000000000000');
  assert.equal(parseGameAmount('2.437.500.000.000',0).toString(),'2437500000000');
  assert.throws(()=>parseGameAmount('1bbb',0),/Số tiền không hợp lệ/);
  assert.throws(()=>parseGameAmount('1bbbbbbbb',0),/Số tiền không hợp lệ/);
  assert.throws(()=>parseGameAmount('10abc%',10000),/Số tiền không hợp lệ/);
  assert.throws(()=>parseGameBetAmount('invalid','10000'),/Số tiền không hợp lệ/);
});

test('empty savings is distinct from empty wallet and a bad amount',()=>{
  assert.equal(getEmptySavingsMessage('rut','0'),'Ngân hàng của bạn không còn tiền để rút.');
  assert.equal(getEmptySavingsMessage('gui','0'),'Ví game đã hết tiền, không có tiền để gửi ngân hàng.');
  assert.equal(getEmptySavingsMessage('rut','10000'),null);
  assert.equal(getEmptySavingsMessage('gui','10000'),null);
});

test('bank command accepts direct and game aliases with literal custom prefix',()=>{
  assert.deepEqual(parseSavingsArguments('.game nganhang rut all','.'),['rut','all']);
  assert.deepEqual(parseSavingsArguments('.game nh rut all','.'),['rut','all']);
  assert.deepEqual(parseSavingsArguments('.nganhang rut all','.'),['rut','all']);
  assert.deepEqual(parseSavingsArguments('.nh gui 10k','.'),['gui','10k']);
  assert.deepEqual(parseSavingsArguments('!game nganhang gui 10k','!'),['gui','10k']);
  assert.deepEqual(parseSavingsArguments('!game nh gui 10k','!'),['gui','10k']);
  assert.deepEqual(parseSavingsArguments('$game nganhang rut 50%','$'),['rut','50%']);
});
