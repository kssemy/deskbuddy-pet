const { test } = require('node:test');
const assert = require('node:assert/strict');
const { step } = require('./motion');

test('pet stays on screen and turns at an edge', () => {
  assert.deepEqual(step(99, 2, 0, 100), [100, -2]);
  assert.deepEqual(step(1, -2, 0, 100), [0, 2]);
});
