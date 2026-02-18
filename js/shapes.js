// ============================================================
// shapes.js — Shape data model, hit-testing, bounding boxes
// ============================================================

const Shapes = (() => {
  // Shape types: rectangle, ellipse, diamond, line, arrow, freehand, text
  // System shapes: database, queue, cache, server, cloud, firewall

  const CONTAINER_TYPES = new Set([
    'rectangle', 'ellipse', 'diamond',
    'database', 'queue', 'cache', 'server', 'cloud', 'firewall',
    'loadbalancer', 'apigateway', 'cdn', 'user', 'microservice',
    'pubsub', 'storage', 'function', 'container', 'eventbus',
    'browser', 'mobile', 'monitor', 'notification', 'auth',
    'externalapi', 'scheduler', 'logger', 'search', 'datawarehouse',
    // Azure Storage
    'blobstorage', 'filestorage', 'queuestorage', 'tablestorage',
    'datalake', 'manageddisks',
    // Azure Database
    'azuresql', 'cosmosdb', 'azuremysql', 'azurepostgres',
    'sqlmanaged', 'rediscache', 'datafactory', 'synapse',
  ]);

  /**
   * Create a new shape object
   */
  function create(type, props = {}) {
    const base = {
      id: Utils.generateId(),
      type,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      strokeColor: '#1e1e1e',
      fillColor: 'transparent',
      strokeWidth: 2,
      opacity: 1,
      rotation: 0,
      // For line/arrow/freehand
      points: null,
      // For text (standalone text shapes AND text inside container shapes)
      text: '',
      fontSize: 16,
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      textVAlign: 'bottom', // 'top' | 'middle' | 'bottom'
      // For arrow
      arrowHead: type === 'arrow',
      // Edge style: 'sharp' or 'round'
      edgeStyle: 'sharp',
      // Stroke dash: 'solid' | 'dashed' | 'dotted' | 'dashdot'
      strokeDash: 'solid',
      // Fill style: 'none' | 'solid' | 'hachure' | 'cross-hatch' | 'zigzag'
      shapeFillStyle: 'none',
      // Connection bindings for arrows/lines
      // { shapeId, angle } or null
      startBinding: null,
      endBinding: null,
      // Rough.js seed for consistent hand-drawn look
      seed: Math.floor(Math.random() * 2147483647),
    };
    return { ...base, ...props };
  }

  /**
   * Get the axis-aligned bounding box of a shape (world coords)
   */
  function getBounds(shape) {
    if (shape.type === 'line' || shape.type === 'arrow') {
      if (shape.points && shape.points.length >= 2) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of shape.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
      return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
    }
    if (shape.type === 'freehand') {
      if (shape.points && shape.points.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of shape.points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
      }
    }
    return { x: shape.x, y: shape.y, w: shape.width, h: shape.height };
  }

  /**
   * Get anchor points (for connector snapping)
   */
  function getAnchors(shape) {
    const b = getBounds(shape);
    return {
      top:    { x: b.x + b.w / 2, y: b.y },
      bottom: { x: b.x + b.w / 2, y: b.y + b.h },
      left:   { x: b.x,           y: b.y + b.h / 2 },
      right:  { x: b.x + b.w,     y: b.y + b.h / 2 },
      center: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
    };
  }

  /**
   * Hit-test: is point (px, py) on/inside the shape?
   */
  function hitTest(shape, px, py, tolerance = 6) {
    const b = getBounds(shape);

    switch (shape.type) {
      case 'rectangle':
        return Utils.pointInRect(px, py,
          b.x - tolerance, b.y - tolerance,
          b.w + tolerance * 2, b.h + tolerance * 2);

      case 'ellipse': {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return Utils.pointInEllipse(px, py, cx, cy,
          b.w / 2 + tolerance, b.h / 2 + tolerance);
      }

      case 'diamond': {
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return Utils.pointInDiamond(px, py, cx, cy,
          b.w / 2 + tolerance, b.h / 2 + tolerance);
      }

      case 'line':
      case 'arrow': {
        if (shape.points && shape.points.length >= 2) {
          for (let i = 0; i < shape.points.length - 1; i++) {
            const d = Utils.pointToSegmentDist(px, py,
              shape.points[i].x, shape.points[i].y,
              shape.points[i + 1].x, shape.points[i + 1].y);
            if (d <= tolerance + shape.strokeWidth) return true;
          }
          return false;
        }
        return false;
      }

      case 'freehand': {
        if (shape.points && shape.points.length >= 2) {
          for (let i = 0; i < shape.points.length - 1; i++) {
            const d = Utils.pointToSegmentDist(px, py,
              shape.points[i].x, shape.points[i].y,
              shape.points[i + 1].x, shape.points[i + 1].y);
            if (d <= tolerance + shape.strokeWidth + 2) return true;
          }
          return false;
        }
        return false;
      }

      case 'text':
      case 'database':
      case 'queue':
      case 'cache':
      case 'server':
      case 'firewall':
      case 'loadbalancer':
      case 'apigateway':
      case 'cdn':
      case 'pubsub':
      case 'storage':
      case 'function':
      case 'container':
      case 'eventbus':
      case 'browser':
      case 'mobile':
      case 'monitor':
      case 'notification':
      case 'auth':
      case 'externalapi':
      case 'scheduler':
      case 'logger':
      case 'search':
      case 'datawarehouse': {
        return Utils.pointInRect(px, py,
          b.x - tolerance, b.y - tolerance,
          b.w + tolerance * 2, b.h + tolerance * 2);
      }

      case 'cloud': {
        const ccx = b.x + b.w / 2;
        const ccy = b.y + b.h / 2;
        return Utils.pointInEllipse(px, py, ccx, ccy,
          b.w / 2 + tolerance, b.h / 2 + tolerance);
      }

      case 'user': {
        const ucx = b.x + b.w / 2;
        const ucy = b.y + b.h / 2;
        return Utils.pointInEllipse(px, py, ucx, ucy,
          b.w / 2 + tolerance, b.h / 2 + tolerance);
      }

      case 'microservice': {
        const mcx = b.x + b.w / 2;
        const mcy = b.y + b.h / 2;
        return Utils.pointInDiamond(px, py, mcx, mcy,
          b.w / 2 + tolerance, b.h / 2 + tolerance);
      }

      default:
        return Utils.pointInRect(px, py, b.x - tolerance, b.y - tolerance,
          b.w + tolerance * 2, b.h + tolerance * 2);
    }
  }

  /**
   * Get resize handle at point. Returns handle name or null.
   * Handles: nw, n, ne, e, se, s, sw, w
   */
  function getHandleAtPoint(shape, px, py, handleSize = 8) {
    if (shape.type === 'freehand') return null; // no resize for freehand

    const b = getBounds(shape);
    const hs = handleSize;
    const handles = {
      nw: { x: b.x,         y: b.y },
      n:  { x: b.x + b.w/2, y: b.y },
      ne: { x: b.x + b.w,   y: b.y },
      e:  { x: b.x + b.w,   y: b.y + b.h/2 },
      se: { x: b.x + b.w,   y: b.y + b.h },
      s:  { x: b.x + b.w/2, y: b.y + b.h },
      sw: { x: b.x,         y: b.y + b.h },
      w:  { x: b.x,         y: b.y + b.h/2 },
    };

    // For lines/arrows, only start and end handles
    if (shape.type === 'line' || shape.type === 'arrow') {
      if (shape.points && shape.points.length >= 2) {
        const startP = shape.points[0];
        const endP = shape.points[shape.points.length - 1];
        if (Utils.distance(px, py, startP.x, startP.y) <= hs) return 'lineStart';
        if (Utils.distance(px, py, endP.x, endP.y) <= hs) return 'lineEnd';
      }
      return null;
    }

    for (const [name, pos] of Object.entries(handles)) {
      if (Utils.distance(px, py, pos.x, pos.y) <= hs) return name;
    }
    return null;
  }

  /**
   * Move shape by delta
   */
  function move(shape, dx, dy) {
    if (shape.points) {
      shape.points = shape.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
    } else {
      shape.x += dx;
      shape.y += dy;
    }
  }

  /**
   * Resize shape using a handle drag
   */
  function resize(shape, handle, dx, dy) {
    if (handle === 'lineStart' && shape.points) {
      shape.points[0].x += dx;
      shape.points[0].y += dy;
      return;
    }
    if (handle === 'lineEnd' && shape.points) {
      shape.points[shape.points.length - 1].x += dx;
      shape.points[shape.points.length - 1].y += dy;
      return;
    }

    switch (handle) {
      case 'nw': shape.x += dx; shape.y += dy; shape.width -= dx; shape.height -= dy; break;
      case 'n':  shape.y += dy; shape.height -= dy; break;
      case 'ne': shape.width += dx; shape.y += dy; shape.height -= dy; break;
      case 'e':  shape.width += dx; break;
      case 'se': shape.width += dx; shape.height += dy; break;
      case 's':  shape.height += dy; break;
      case 'sw': shape.x += dx; shape.width -= dx; shape.height += dy; break;
      case 'w':  shape.x += dx; shape.width -= dx; break;
    }

    // Enforce minimum size
    if (shape.width < 10) shape.width = 10;
    if (shape.height < 10) shape.height = 10;
  }

  // === Boundary-point intersection helpers ===

  /**
   * Ray from rectangle center to target, intersected with rect edges.
   */
  function _rayRectFromCenter(cx, cy, tx, ty, halfW, halfH) {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx + halfW, y: cy };
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const scale = (absDx / halfW > absDy / halfH)
      ? halfW / absDx
      : halfH / absDy;
    return { x: cx + dx * scale, y: cy + dy * scale };
  }

  /**
   * Ray from ellipse center to target, intersected with ellipse boundary.
   */
  function _rayEllipseFromCenter(cx, cy, tx, ty, rx, ry) {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx + rx, y: cy };
    const angle = Math.atan2(dy, dx);
    return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  }

  /**
   * Ray from diamond center to target, intersected with diamond edges.
   * Diamond edges satisfy |x/halfW| + |y/halfH| = 1.
   */
  function _rayDiamondFromCenter(cx, cy, tx, ty, halfW, halfH) {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy - halfH };
    const scale = 1 / (Math.abs(dx) / halfW + Math.abs(dy) / halfH);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }

  /**
   * Get the point on a shape's boundary closest to the line from centre→target.
   * Returns { x, y } in world coords or null if shape type is not connectable.
   */
  function getBoundaryPoint(shape, targetX, targetY) {
    const b = getBounds(shape);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    switch (shape.type) {
      case 'rectangle':
      case 'database':
      case 'queue':
      case 'cache':
      case 'server':
      case 'firewall':
      case 'loadbalancer':
      case 'apigateway':
      case 'cdn':
      case 'pubsub':
      case 'storage':
      case 'function':
      case 'container':
      case 'eventbus':
      case 'browser':
      case 'mobile':
      case 'monitor':
      case 'notification':
      case 'auth':
      case 'externalapi':
      case 'scheduler':
      case 'logger':
      case 'search':
      case 'datawarehouse':
        return _rayRectFromCenter(cx, cy, targetX, targetY, b.w / 2, b.h / 2);
      case 'ellipse':
      case 'cloud':
      case 'user':
        return _rayEllipseFromCenter(cx, cy, targetX, targetY, b.w / 2, b.h / 2);
      case 'diamond':
      case 'microservice':
        return _rayDiamondFromCenter(cx, cy, targetX, targetY, b.w / 2, b.h / 2);
      default:
        // Fallback: treat as rectangle so unknown shapes can still be connected
        return _rayRectFromCenter(cx, cy, targetX, targetY, b.w / 2, b.h / 2);
    }
  }

  /**
   * Resolve a boundary point from a stored angle (radians from center).
   * Used to re-compute the connection point after a shape moves/resizes.
   */
  function getBoundaryPointFromAngle(shape, angle) {
    const b = getBounds(shape);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const far = 10000;
    return getBoundaryPoint(shape, cx + Math.cos(angle) * far, cy + Math.sin(angle) * far);
  }

  return {
    create,
    getBounds,
    getAnchors,
    hitTest,
    getHandleAtPoint,
    move,
    resize,
    getBoundaryPoint,
    getBoundaryPointFromAngle,
    CONTAINER_TYPES,
  };
})();
