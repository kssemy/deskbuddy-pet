const { test } = require('node:test');
const assert = require('node:assert/strict');
const { envelope, fitToDisplays } = require('./desktop');

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
