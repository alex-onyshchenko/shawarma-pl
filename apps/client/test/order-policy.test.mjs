import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxAdditional } from '../src/utils/orderPolicy.js';
const row = (id, quantity, size) => ({product:{id},quantity,size});
test('all sizes and toasting variants share the five-item product limit and ten-item cart limit', () => {
  assert.equal(maxAdditional([], 'a'),5);
  assert.equal(maxAdditional([row('a',2,'small'),row('a',2,'large')],'a'),1);
  assert.equal(maxAdditional([row('a',3,'small'),row('a',2,'large')],'a'),0);
  const full=[row('a',5),row('b',5)];
  assert.equal(maxAdditional(full,'c'),0);
  assert.equal(maxAdditional([row('a',5),row('b',4)],'c'),1);
  assert.equal(maxAdditional([row('a',5),row('b',3)],'b'),2);
});
