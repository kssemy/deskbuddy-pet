const { test } = require('node:test');
const assert = require('node:assert/strict');
const { envelope, fitToDisplays, homeSlot, resizeAnchoredPanel } = require('./desktop');

test('friend PNG reaches every edge and crosses two monitors', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1080 }, { x: 1920, y: 100, width: 1280, height: 900 }];
  const visual = { left: 35, right: 155, top: 261, bottom: 395 };
  assert.deepEqual(envelope(areas, visual), { minX: -35, maxX: 3045, minY: -261, maxY: 685 });
  assert.deepEqual(fitToDisplays(-35, -261, areas, visual), { x: -35, y: -261 });
  assert.deepEqual(fitToDisplays(3045, 685, areas, visual), { x: 3045, y: 605 });
  assert.deepEqual(fitToDisplays(2000, -100, areas, visual), { x: 2000, y: -100 });
  const own = { left: 55, right: 185, top: 87, bottom: 240 };
  assert.deepEqual(envelope(areas, own), { minX: -55, maxX: 3015, minY: -87, maxY: 840 });
  assert.deepEqual(fitToDisplays(3015, 500, areas, own), { x: 3015, y: 500 });
});

test('home button fills the upper right and wraps without overlap', () => {
  const area = { x: 0, y: 0, width: 400, height: 700 };
  assert.deepEqual([0, 1, 2].map(index => homeSlot(area, 130, index)), [
    { x: 258, y: 75 }, { x: 116, y: 75 }, { x: 258, y: 290 }
  ]);
});

test('todo grows away from the character on either side', () => {
  const area = { x: 0, y: 0, width: 800, height: 700 };
  assert.deepEqual(resizeAnchoredPanel({ x: 20, y: 350, width: 240, height: 300 }, area, 400, 'above'),
    { x: 20, y: 250, width: 240, height: 400 });
  assert.deepEqual(resizeAnchoredPanel({ x: 20, y: 150, width: 240, height: 300 }, area, 400, 'below'),
    { x: 20, y: 150, width: 240, height: 400 });
});
