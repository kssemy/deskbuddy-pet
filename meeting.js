function charactersMeet(own, friend, size) {
  const dx = own.x + 120 - (friend.x + 95);
  const dy = own.y + 222 - size / 2 - (friend.y + 321);
  return Math.hypot(dx, dy) < size / 2 + 48;
}

module.exports = { charactersMeet };
