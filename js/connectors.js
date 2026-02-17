// ============================================================
// connectors.js — Arrow/connector snapping to shape boundaries
// ============================================================

const Connectors = (() => {
  const SNAP_DISTANCE = 20;

  /**
   * Find the nearest boundary point on any connectable shape.
   * Returns { shapeId, angle, x, y } or null.
   *
   * "angle" is the direction (radians) from the shape centre to the
   * boundary point – stored in the binding so we can re-resolve it
   * when the shape moves or resizes.
   */
  function findNearestBoundaryPoint(shapes, worldX, worldY, excludeIds = []) {
    let best = null;
    let bestDist = SNAP_DISTANCE;

    for (const shape of shapes) {
      if (excludeIds.includes(shape.id)) continue;
      if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'freehand' || shape.type === 'text') continue;

      const bp = Shapes.getBoundaryPoint(shape, worldX, worldY);
      if (!bp) continue;

      const d = Utils.distance(worldX, worldY, bp.x, bp.y);
      if (d < bestDist) {
        const b = Shapes.getBounds(shape);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        bestDist = d;
        best = {
          shapeId: shape.id,
          angle: Math.atan2(bp.y - cy, bp.x - cx),
          x: bp.x,
          y: bp.y,
        };
      }
    }

    return best;
  }

  /**
   * Draw a boundary highlight when the cursor is close enough to snap.
   * Shows a small circle at the computed boundary point.
   */
  function drawAnchorHints(ctx, shapes, worldX, worldY, scale) {
    for (const shape of shapes) {
      if (shape.type === 'line' || shape.type === 'arrow' || shape.type === 'freehand' || shape.type === 'text') continue;

      const bp = Shapes.getBoundaryPoint(shape, worldX, worldY);
      if (!bp) continue;

      const d = Utils.distance(worldX, worldY, bp.x, bp.y);
      if (d < SNAP_DISTANCE * 1.5) {
        ctx.save();
        ctx.fillStyle = d < SNAP_DISTANCE ? '#6c47ff' : 'rgba(108,71,255,0.3)';
        ctx.beginPath();
        ctx.arc(bp.x, bp.y, 5 / scale, 0, Math.PI * 2);
        ctx.fill();

        // Subtle shape outline highlight to show which shape will connect
        if (d < SNAP_DISTANCE) {
          const b = Shapes.getBounds(shape);
          ctx.strokeStyle = 'rgba(108,71,255,0.25)';
          ctx.lineWidth = 2 / scale;
          ctx.setLineDash([4 / scale, 4 / scale]);
          ctx.strokeRect(b.x, b.y, b.w, b.h);
          ctx.setLineDash([]);
        }
        ctx.restore();
      }
    }
  }

  /**
   * Update all arrows/lines that are bound to a given shape.
   * Call this after moving/resizing a shape so connected arrows follow.
   */
  function updateBindings(shapes, movedShapeId) {
    for (const shape of shapes) {
      if (shape.type !== 'arrow' && shape.type !== 'line') continue;
      if (!shape.points || shape.points.length < 2) continue;

      if (shape.startBinding && shape.startBinding.shapeId === movedShapeId) {
        const target = shapes.find(s => s.id === movedShapeId);
        if (target) {
          const pt = Shapes.getBoundaryPointFromAngle(target, shape.startBinding.angle);
          if (pt) shape.points[0] = { x: pt.x, y: pt.y };
        }
      }

      if (shape.endBinding && shape.endBinding.shapeId === movedShapeId) {
        const target = shapes.find(s => s.id === movedShapeId);
        if (target) {
          const pt = Shapes.getBoundaryPointFromAngle(target, shape.endBinding.angle);
          if (pt) shape.points[shape.points.length - 1] = { x: pt.x, y: pt.y };
        }
      }
    }
  }

  /**
   * Re-resolve ALL bindings (e.g. after undo/redo or load).
   */
  function resolveAllBindings(shapes) {
    for (const shape of shapes) {
      if (shape.type !== 'arrow' && shape.type !== 'line') continue;
      if (!shape.points || shape.points.length < 2) continue;

      if (shape.startBinding) {
        const target = shapes.find(s => s.id === shape.startBinding.shapeId);
        if (target) {
          const pt = Shapes.getBoundaryPointFromAngle(target, shape.startBinding.angle);
          if (pt) shape.points[0] = { x: pt.x, y: pt.y };
        } else {
          shape.startBinding = null; // target deleted
        }
      }

      if (shape.endBinding) {
        const target = shapes.find(s => s.id === shape.endBinding.shapeId);
        if (target) {
          const pt = Shapes.getBoundaryPointFromAngle(target, shape.endBinding.angle);
          if (pt) shape.points[shape.points.length - 1] = { x: pt.x, y: pt.y };
        } else {
          shape.endBinding = null;
        }
      }
    }
  }

  return {
    findNearestBoundaryPoint,
    drawAnchorHints,
    updateBindings,
    resolveAllBindings,
    SNAP_DISTANCE,
  };
})();
