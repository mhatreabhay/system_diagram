// ============================================================
// utils.js — Math helpers, geometry, ID generation
// ============================================================

const Utils = (() => {
  let _idCounter = 0;

  function generateId() {
    return 'shape_' + Date.now().toString(36) + '_' + (++_idCounter);
  }

  // Distance between two points
  function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  }

  // Point-to-line-segment distance
  function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return distance(px, py, x1, y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return distance(px, py, x1 + t * dx, y1 + t * dy);
  }

  // Is point inside rectangle?
  function pointInRect(px, py, x, y, w, h) {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }

  // Is point inside ellipse?
  function pointInEllipse(px, py, cx, cy, rx, ry) {
    return ((px - cx) ** 2) / (rx ** 2) + ((py - cy) ** 2) / (ry ** 2) <= 1;
  }

  // Is point inside diamond (rhombus)?
  function pointInDiamond(px, py, cx, cy, halfW, halfH) {
    return Math.abs(px - cx) / halfW + Math.abs(py - cy) / halfH <= 1;
  }

  // Bounding box from two corner points
  function normalizeBounds(x1, y1, x2, y2) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1),
      h: Math.abs(y2 - y1),
    };
  }

  // Clamp value
  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
  }

  // Rectangles overlap?
  function rectsOverlap(a, b) {
    return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
  }

  // Angle between two points
  function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
  }

  // Lerp
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  // Deep clone (JSON-safe)
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  return {
    generateId,
    distance,
    pointToSegmentDist,
    pointInRect,
    pointInEllipse,
    pointInDiamond,
    normalizeBounds,
    clamp,
    rectsOverlap,
    angle,
    lerp,
    deepClone,
  };
})();
