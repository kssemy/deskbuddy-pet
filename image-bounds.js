function visibleBounds(bitmap, width, height) {
  let left = width, top = height, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (bitmap[(y * width + x) * 4 + 3] <= 8) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left) return { x: 0, y: 0, width, height };
  const pad = Math.ceil(Math.max(right - left + 1, bottom - top + 1) * 0.03);
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
function cutoutBackground(bitmap, width, height) {
  const count = width * height;
  for (let i = 0; i < count; i++) if (bitmap[i * 4 + 3] < 255) return false;
  const key = bitmap.subarray(0, 3), seen = new Uint8Array(count), queue = new Int32Array(count);
  let head = 0, tail = 0;
  function add(index) {
    if (seen[index]) return;
    seen[index] = 1;
    const offset = index * 4;
    if (Math.abs(bitmap[offset] - key[0]) > 40 || Math.abs(bitmap[offset + 1] - key[1]) > 40 ||
        Math.abs(bitmap[offset + 2] - key[2]) > 40) return;
    queue[tail++] = index;
  }
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width;
    bitmap[index * 4 + 3] = 0;
    if (x > 0) add(index - 1);
    if (x < width - 1) add(index + 1);
    if (index >= width) add(index - width);
    if (index + width < count) add(index + width);
  }
  return tail > 0;
}
module.exports = { visibleBounds, cutoutBackground };
