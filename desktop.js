function envelope(areas, visual) {
  return {
    minX: Math.min(...areas.map(area => area.x - visual.left)),
    maxX: Math.max(...areas.map(area => area.x + area.width - visual.right)),
    minY: Math.min(...areas.map(area => area.y - visual.top)),
    maxY: Math.max(...areas.map(area => area.y + area.height - visual.bottom))
  };
}

function fitToDisplays(x, y, areas, visual) {
  const centerX = x + (visual.left + visual.right) / 2;
  const centerY = y + (visual.top + visual.bottom) / 2;
  const candidates = areas.map(area => {
    const nx = Math.max(area.x - visual.left, Math.min(area.x + area.width - visual.right, x));
    const ny = Math.max(area.y - visual.top, Math.min(area.y + area.height - visual.bottom, y));
    const inside = centerX >= area.x && centerX < area.x + area.width &&
      centerY >= area.y && centerY < area.y + area.height;
    return { x: nx, y: ny, score: (inside ? -1 : 0) + (nx - x) ** 2 + (ny - y) ** 2 };
  });
  candidates.sort((a, b) => a.score - b.score);
  return { x: candidates[0].x, y: candidates[0].y };
}

function homeSlot(area, size, index) {
  const gap = 12;
  const columns = Math.max(1, Math.floor((area.width - gap) / (size + gap)));
  return { x: area.x + area.width - gap - size - (index % columns) * (size + gap),
    y: area.y + 75 + Math.floor(index / columns) * (size + 85) };
}

module.exports = { envelope, fitToDisplays, homeSlot };
