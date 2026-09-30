import test from 'node:test';
import assert from 'node:assert/strict';
import { hasGameDisplayName, selectGameDisplayName } from '../src/database/player-sync.js';

test('missing API name and UID cannot replace a real player name', () => {
  assert.equal(selectGameDisplayName('Không xác định', '3525277270036155141', 'Trần My'), 'Trần My');
  assert.equal(selectGameDisplayName('t_m7bezg8n7z', '5QIUI4ME1OSF9J4QID9096098SF8L5G0'), '');
  assert.equal(selectGameDisplayName(' Trần My '), 'Trần My');
});

test('leaderboard excludes internal IDs from display names', () => {
  for (const value of ['', null, 'Ẩn', 'Không xác định', '3525277270036155141',
    '5QIUI4ME1OSF9J4QID9096098SF8L5G0', 't_m7bezg8n7z', 'private:bot:123']) {
    assert.equal(hasGameDisplayName(value), false);
  }
  assert.equal(hasGameDisplayName('Ẩn Danh'), true);
  assert.equal(hasGameDisplayName('Trần My'), true);
});
