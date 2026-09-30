import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeCustomReactionText,
  resolveReactionInput,
  resolveReactionKey,
} from '../src/api-zalo/models/Reaction.js';

test('keeps a custom mybot style icon separate from named Zalo reactions', () => {
  assert.equal(resolveReactionKey('nghiu'), null);
  assert.deepEqual(resolveReactionInput('nghiu'), { rType: 200, text: 'nghiu' });
});

test('protects the final character of a custom reaction during transport', () => {
  assert.equal(encodeCustomReactionText('nghiu'), 'nghiuu');
  assert.equal(encodeCustomReactionText('ngọc'), 'ngọcc');
  assert.equal(encodeCustomReactionText('nghiu\u200B'), 'nghiuu');
});
