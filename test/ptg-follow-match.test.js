import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPTGFollowNotification,
  buildPTGFollowMentionPrefix,
  chunkPTGFollowMatchesByFollowers,
  getPTGFollowRecipientKey,
  getPTGFollowAvailabilityState,
  isPTGFollowItemAvailable,
  matchesPTGFollow,
  normalizePTGFollowName,
} from '../src/service-ngh/api-crawl/content/ptg-follow-match.js';

test('normalizes Vietnamese seed follow names', () => {
  assert.equal(normalizePTGFollowName(' Hạt giống CÀ RỐT '), 'ca rot');
  assert.equal(normalizePTGFollowName('hạt carot'), 'ca rot');
  assert.equal(normalizePTGFollowName('Hạt ngô'), 'bap');
  assert.equal(normalizePTGFollowName('Hạt cây đậu'), 'dau');
});

test('matches short seed follows against PTG shop names', () => {
  assert.equal(matchesPTGFollow({ vi: 'Dưa hấu', stock: 1 }, 'hạt dưa'), true);
  assert.equal(matchesPTGFollow({ vi: 'Cà rốt', en: 'Carrot', stock: 1 }, 'hạt carot'), true);
  assert.equal(matchesPTGFollow({ vi: 'Hạt giống cà rốt mặt trăng', stock: 1 }, 'hạt carot mặt trăng'), true);
  assert.equal(matchesPTGFollow({ vi: 'Bắp', en: 'Corn', stock: 1 }, 'hạt ngô'), true);
  assert.equal(matchesPTGFollow({ vi: 'Hạt giống hoa hồng (trắng)', stock: 1 }, 'hạt giống hoa hồng'), true);
  assert.equal(matchesPTGFollow({ vi: 'Vòi tưới siêu cao cấp (đỏ)' }, 'vòi đỏ'), true);
  assert.equal(matchesPTGFollow({ vi: 'Ánh trăng' }, 'ánhtrăng'), true);
});

test('does not match unrelated shop items', () => {
  assert.equal(matchesPTGFollow({ vi: 'Dâu tây' }, 'hạt dưa'), false);
  assert.equal(matchesPTGFollow({ vi: 'Vòi tưới cao cấp' }, 'hạt cà rốt'), false);
  assert.equal(matchesPTGFollow({ vi: 'Cà rốt' }, 'hạt cà rốt mặt trăng'), false);
});

test('notifies once per in-stock period and rearms after stock disappears', () => {
  assert.deepEqual(getPTGFollowAvailabilityState(undefined, true), { inStock: true, shouldNotify: true });
  assert.deepEqual(getPTGFollowAvailabilityState(false, true), { inStock: true, shouldNotify: true });
  assert.deepEqual(getPTGFollowAvailabilityState(true, true), { inStock: true, shouldNotify: false });
  assert.deepEqual(getPTGFollowAvailabilityState(true, false), { inStock: false, shouldNotify: false });
  assert.deepEqual(getPTGFollowAvailabilityState(false, false), { inStock: false, shouldNotify: false });
});

test('uses end time for weather follow availability', () => {
  const now = Date.parse('2026-09-28T00:00:00.000Z');
  assert.equal(isPTGFollowItemAvailable({ endTime: '2026-09-28T00:01:00.000Z' }, 'weather', now), true);
  assert.equal(isPTGFollowItemAvailable({ endTime: '2026-09-27T23:59:00.000Z' }, 'weather', now), false);
  assert.equal(isPTGFollowItemAvailable({ stock: 1 }, 'seeds', now), true);
  assert.equal(isPTGFollowItemAvailable({ stock: 0 }, 'seeds', now), false);
});

test('groups all newly available follows into one notification and removes duplicates', () => {
  const message = buildPTGFollowNotification([
    { categoryKey: 'seeds', item: { id: 'bean', vi: 'Đậu' } },
    { categoryKey: 'seeds', item: { id: 'bean', vi: 'Đậu' } },
    { categoryKey: 'tools', item: { id: 'red-sprinkler', vi: 'Vòi tưới đỏ' } },
    { categoryKey: 'weather', item: { id: 'aurora', vi: 'Cực quang' } },
  ]);

  assert.equal(message, [
    'Các mục bạn theo dõi hiện đã xuất hiện:',
    '• Mặt hàng: Đậu',
    '• Mặt hàng: Vòi tưới đỏ',
    '• Thời tiết: Cực quang',
  ].join('\n'));
});

test('builds one deduplicated mention prefix for all followers in a conversation', () => {
  const prefix = buildPTGFollowMentionPrefix([
    { entry: { userId: '101', userName: 'An' } },
    { entry: { userId: '101', userName: 'An' } },
    { entry: { userId: '202', userName: 'Bình' } },
  ]);

  assert.equal(prefix.text, 'An, Bình');
  assert.deepEqual(prefix.mentions, [
    { uid: '101', pos: 0, len: 2 },
    { uid: '202', pos: 4, len: 4 },
  ]);
});

test('groups different followers by destination instead of user id', () => {
  const first = { botId: 'bot-1', threadId: 'group-1', type: 1, userId: '101' };
  const second = { botId: 'bot-1', threadId: 'group-1', type: 1, userId: '202' };
  const otherGroup = { ...second, threadId: 'group-2' };

  assert.equal(getPTGFollowRecipientKey(first), getPTGFollowRecipientKey(second));
  assert.notEqual(getPTGFollowRecipientKey(first), getPTGFollowRecipientKey(otherGroup));
});

test('splits crowded groups without separating one follower multiple items', () => {
  const matches = [];
  for (let user = 1; user <= 35; user++) {
    matches.push({ entry: { userId: String(user), userName: `User ${user}` }, item: { id: `item-${user}` } });
  }
  matches.push({ entry: { userId: '1', userName: 'User 1' }, item: { id: 'second-item' } });

  const batches = chunkPTGFollowMatchesByFollowers(matches, 15);
  assert.deepEqual(batches.map((batch) => new Set(batch.map((match) => match.entry.userId)).size), [15, 15, 5]);
  assert.equal(batches[0].filter((match) => match.entry.userId === '1').length, 2);
});
