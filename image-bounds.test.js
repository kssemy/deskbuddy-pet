const { test } = require('node:test');
const { deepStrictEqual } = require('node:assert');
const { visibleBounds, cutoutBackground } = require('./image-bounds');

test('transparent padding is removed while visible character edges stay inside', () => {
  const width = 100, height = 100, pixels = Buffer.alloc(width * height * 4);
  for (let y = 30; y < 70; y++) for (let x = 20; x < 80; x++) pixels[(y * width + x) * 4 + 3] = 255;
  deepStrictEqual(visibleBounds(pixels, width, height), { x: 18, y: 28, width: 64, height: 44 });
  pixels.fill(255);
  deepStrictEqual(visibleBounds(pixels, width, height), { x: 0, y: 0, width, height });
});

test('opaque outer background becomes transparent without erasing enclosed light parts', () => {
  const pixels = Buffer.alloc(7 * 7 * 4, 255);
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) {
    const offset = (y * 7 + x) * 4;
    if (x !== 3 || y !== 3) pixels.fill(0, offset, offset + 3);
  }
  cutoutBackground(pixels, 7, 7);
  deepStrictEqual([pixels[3], pixels[(3 * 7 + 3) * 4 + 3], pixels[(2 * 7 + 3) * 4 + 3]], [0, 255, 255]);
});
