export function clampPointToRect(x, y, rect, halfWidth, halfHeight) {
  const clampedX = Math.min(Math.max(x, rect.x + halfWidth), rect.x + rect.width - halfWidth);
  const clampedY = Math.min(Math.max(y, rect.y + halfHeight), rect.y + rect.height - halfHeight);
  return { x: clampedX, y: clampedY, clamped: clampedX !== x || clampedY !== y };
}

export function isPointInsideRect(x, y, rect, halfWidth = 0, halfHeight = 0) {
  return x >= rect.x + halfWidth
    && x <= rect.x + rect.width - halfWidth
    && y >= rect.y + halfHeight
    && y <= rect.y + rect.height - halfHeight;
}

export function launchBullet(bullet, group, velocityX, velocityY) {
  group.add(bullet);
  bullet.setVelocity(velocityX, velocityY);
  return bullet;
}
