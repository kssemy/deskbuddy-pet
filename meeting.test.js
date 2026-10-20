const { test } = require('node:test');
const assert = require('node:assert/strict');
const { charactersMeet } = require('./meeting');

test('high five starts only when character images meet', () => {
  const own = { x: 100, y: 100 };
  assert.equal(charactersMeet(own, { x: 125, y: -64 }, 130), true);
  assert.equal(charactersMeet(own, { x: 400, y: 100 }, 130), false);
});
