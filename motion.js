function step(position, velocity, min, max) {
  let next = position + velocity;
  if (next < min || next > max) {
    velocity = -velocity;
    next = Math.max(min, Math.min(max, next));
  }
  return [next, velocity];
}

module.exports = { step };
