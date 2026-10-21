const { test } = require('node:test');
const { deepStrictEqual } = require('node:assert');
const { visibleBounds } = require('./image-bounds');

test('transparent padding is removed while visible character edges stay inside', () => {
  const width = 100, height = 100, pixels = Buffer.alloc(width * height * 4);
  for (let y = 30; y < 70; y++) for (let x = 20; x < 80; x++) pixels[(y * width + x) * 4 + 3] = 255;
  deepStrictEqual(visibleBounds(pixels, width, height), { x: 18, y: 28, width: 64, height: 44 });
  pixels.fill(255);
  deepStrictEqual(visibleBounds(pixels, width, height), { x: 0, y: 0, width, height });
});
