function charactersMeet(own, friend, size) {
  const dx = own.x + 120 - (friend.x + 95);
  const dy = own.y + 222 - size / 2 - (friend.y + 381 - size / 2);
  return Math.hypot(dx, dy) < size - 5;
}

module.exports = { charactersMeet };
