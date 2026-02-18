// ============================================================
// canvas.js — Canvas viewport (pan/zoom) and rendering engine
// ============================================================

// Azure icon image cache — preloaded SVGs
const AzureIcons = (() => {
  const _cache = {};
  const _icons = {
    blobstorage:    'icons/azure-storage/blob-storage.svg',
    filestorage:    'icons/azure-storage/file-storage.svg',
    queuestorage:   'icons/azure-storage/queue-storage.svg',
    tablestorage:   'icons/azure-storage/table-storage.svg',
    datalake:       'icons/azure-storage/data-lake.svg',
    manageddisks:   'icons/azure-storage/managed-disks.svg',
    // Azure Database
    azuresql:       'icons/azure-database/azure-sql.svg',
    cosmosdb:       'icons/azure-database/cosmos-db.svg',
    azuremysql:     'icons/azure-database/mysql.svg',
    azurepostgres:  'icons/azure-database/postgresql.svg',
    sqlmanaged:     'icons/azure-database/sql-managed-instance.svg',
    rediscache:     'icons/azure-database/redis-cache.svg',
    datafactory:    'icons/azure-database/data-factory.svg',
    synapse:        'icons/azure-database/synapse.svg',
  };
  // Preload all icons as Image objects
  for (const [key, src] of Object.entries(_icons)) {
    const img = new Image();
    img.src = src;
    _cache[key] = img;
  }
  /** Get preloaded image for a shape type (or null) */
  function get(type) { return _cache[type] || null; }
  return { get };
})();

const CanvasView = (() => {
  let canvas, ctx, rc; // rc = rough canvas
  let width, height;

  // Viewport state
  let offsetX = 0, offsetY = 0;
  let scale = 1;
  const MIN_SCALE = 0.1;
  const MAX_SCALE = 5;
  const GRID_SIZE = 20;

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    rc = rough.canvas(canvas);
    handleResize();
    window.addEventListener('resize', handleResize);
  }

  function handleResize() {
    // Read the CSS-computed size (flex layout)
    const rect = canvas.getBoundingClientRect();
    width = Math.floor(rect.width);
    height = Math.floor(rect.height);
    // Set internal resolution
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  // === Coordinate conversion ===

  function screenToWorld(sx, sy) {
    return {
      x: (sx - offsetX) / scale,
      y: (sy - offsetY) / scale,
    };
  }

  function worldToScreen(wx, wy) {
    return {
      x: wx * scale + offsetX,
      y: wy * scale + offsetY,
    };
  }

  // === Viewport controls ===

  function pan(dx, dy) {
    offsetX += dx;
    offsetY += dy;
  }

  function zoomAt(factor, screenX, screenY) {
    const newScale = Utils.clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    const realFactor = newScale / scale;
    offsetX = screenX - (screenX - offsetX) * realFactor;
    offsetY = screenY - (screenY - offsetY) * realFactor;
    scale = newScale;
  }

  function setZoom(newScale) {
    const center = { x: width / 2, y: height / 2 };
    zoomAt(newScale / scale, center.x, center.y);
  }

  function resetView() {
    offsetX = 0;
    offsetY = 0;
    scale = 1;
  }

  function getScale() { return scale; }
  function getOffset() { return { x: offsetX, y: offsetY }; }

  // === Drawing ===

  function clear() {
    ctx.save();
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;

    const gridWorld = GRID_SIZE;
    const gridScreen = gridWorld * scale;

    // Only draw if grid is big enough to see
    if (gridScreen < 6) { ctx.restore(); return; }

    const startX = offsetX % gridScreen;
    const startY = offsetY % gridScreen;

    ctx.beginPath();
    for (let x = startX; x < width; x += gridScreen) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let y = startY; y < height; y += gridScreen) {
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function applyTransform() {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
  }

  function restoreTransform() {
    ctx.restore();
  }

  /**
   * Render a single shape using Rough.js
   */
  function drawShape(shape) {
    // Resolve fill
    const fillStyle = shape.shapeFillStyle || 'none';
    const hasFill = fillStyle !== 'none' && shape.fillColor && shape.fillColor !== 'transparent';

    const opts = {
      stroke: shape.strokeColor,
      strokeWidth: shape.strokeWidth,
      fill: hasFill ? shape.fillColor : undefined,
      fillStyle: hasFill ? (fillStyle === 'solid' ? 'solid' : fillStyle) : undefined,
      roughness: 1.2,
      seed: shape.seed,
    };

    // Stroke dash pattern
    const dash = shape.strokeDash || 'solid';
    if (dash !== 'solid') {
      const sw = shape.strokeWidth || 2;
      switch (dash) {
        case 'dashed':   opts.strokeLineDash = [sw * 5, sw * 3]; break;
        case 'dotted':   opts.strokeLineDash = [sw * 1.2, sw * 2.5]; break;
        case 'dashdot':  opts.strokeLineDash = [sw * 5, sw * 2, sw * 1.2, sw * 2]; break;
      }
    }

    ctx.globalAlpha = shape.opacity || 1;

    switch (shape.type) {
      case 'rectangle':
        if (shape.edgeStyle === 'round') {
          _drawRoundedRect(shape.x, shape.y, shape.width, shape.height, Math.min(12, Math.min(shape.width, shape.height) * 0.2), opts);
        } else {
          rc.rectangle(shape.x, shape.y, shape.width, shape.height, opts);
        }
        _drawShapeText(shape);
        break;

      case 'ellipse': {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        rc.ellipse(cx, cy, shape.width, shape.height, opts);
        _drawShapeText(shape);
        break;
      }

      case 'diamond': {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        const hw = shape.width / 2;
        const hh = shape.height / 2;
        rc.polygon([
          [cx, cy - hh],
          [cx + hw, cy],
          [cx, cy + hh],
          [cx - hw, cy],
        ], opts);
        _drawShapeText(shape);
        break;
      }

      case 'line':
      case 'arrow': {
        if (shape.points && shape.points.length >= 2) {
          for (let i = 0; i < shape.points.length - 1; i++) {
            rc.line(
              shape.points[i].x, shape.points[i].y,
              shape.points[i + 1].x, shape.points[i + 1].y,
              opts
            );
          }
          // Draw arrowhead
          if (shape.type === 'arrow' || shape.arrowHead) {
            const last = shape.points[shape.points.length - 1];
            const prev = shape.points[shape.points.length - 2];
            drawArrowHead(prev.x, prev.y, last.x, last.y, shape.strokeColor, shape.strokeWidth);
          }
        }
        break;
      }

      case 'freehand': {
        if (shape.points && shape.points.length >= 2) {
          const pathPoints = shape.points.map(p => [p.x, p.y]);
          rc.curve(pathPoints, {
            ...opts,
            fill: undefined,
            fillStyle: undefined,
          });
        }
        break;
      }

      case 'text': {
        ctx.save();
        ctx.font = `${shape.fontSize || 16}px ${shape.fontFamily || 'Segoe UI, system-ui, sans-serif'}`;
        ctx.fillStyle = shape.strokeColor;
        ctx.textBaseline = 'top';
        const lines = (shape.text || '').split('\n');
        const lineHeight = (shape.fontSize || 16) * 1.4;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], shape.x, shape.y + i * lineHeight);
        }
        ctx.restore();
        break;
      }

      // ---------- System-design shapes ----------

      case 'database':
        _drawDatabase(shape, opts);
        break;

      case 'queue':
        _drawQueue(shape, opts);
        break;

      case 'cache':
        _drawCache(shape, opts);
        break;

      case 'server':
        _drawServer(shape, opts);
        break;

      case 'cloud':
        _drawCloud(shape, opts);
        break;

      case 'firewall':
        _drawFirewall(shape, opts);
        break;

      case 'loadbalancer':
        _drawLoadBalancer(shape, opts);
        break;

      case 'apigateway':
        _drawApiGateway(shape, opts);
        break;

      case 'cdn':
        _drawCdn(shape, opts);
        break;

      case 'user':
        _drawUser(shape, opts);
        break;

      case 'microservice':
        _drawMicroservice(shape, opts);
        break;

      case 'pubsub':
        _drawPubSub(shape, opts);
        break;

      case 'storage':
        _drawStorage(shape, opts);
        break;

      case 'function':
        _drawFunction(shape, opts);
        break;

      case 'container':
        _drawContainer(shape, opts);
        break;

      case 'eventbus':
        _drawEventBus(shape, opts);
        break;

      case 'browser':
        _drawBrowser(shape, opts);
        break;

      case 'mobile':
        _drawMobile(shape, opts);
        break;

      case 'monitor':
        _drawMonitor(shape, opts);
        break;

      case 'notification':
        _drawNotification(shape, opts);
        break;

      case 'auth':
        _drawAuth(shape, opts);
        break;

      case 'externalapi':
        _drawExternalApi(shape, opts);
        break;

      case 'scheduler':
        _drawScheduler(shape, opts);
        break;

      case 'logger':
        _drawLogger(shape, opts);
        break;

      case 'search':
        _drawSearch(shape, opts);
        break;

      case 'datawarehouse':
        _drawDataWarehouse(shape, opts);
        break;

      // Azure Storage shapes
      case 'blobstorage':
        _drawBlobStorage(shape, opts);
        break;
      case 'filestorage':
        _drawFileStorage(shape, opts);
        break;
      case 'queuestorage':
        _drawQueueStorage(shape, opts);
        break;
      case 'tablestorage':
        _drawTableStorage(shape, opts);
        break;
      case 'datalake':
        _drawDataLake(shape, opts);
        break;
      case 'manageddisks':
        _drawManagedDisks(shape, opts);
        break;

      // Generic Storage shapes
      case 'objectstorage':
        _drawObjectStorage(shape, opts);
        break;
      case 'blockstorage':
        _drawBlockStorage(shape, opts);
        break;
      case 'fileshare':
        _drawFileShare(shape, opts);
        break;
      case 'archivestorage':
        _drawArchiveStorage(shape, opts);
        break;

      // Azure Database shapes
      case 'azuresql':
        _drawAzureSql(shape, opts);
        break;
      case 'cosmosdb':
        _drawCosmosDb(shape, opts);
        break;
      case 'azuremysql':
        _drawAzureMySql(shape, opts);
        break;
      case 'azurepostgres':
        _drawAzurePostgres(shape, opts);
        break;
      case 'sqlmanaged':
        _drawSqlManaged(shape, opts);
        break;
      case 'rediscache':
        _drawRedisCache(shape, opts);
        break;
      case 'datafactory':
        _drawDataFactory(shape, opts);
        break;
      case 'synapse':
        _drawSynapse(shape, opts);
        break;
    }

    ctx.globalAlpha = 1;
  }

  // === System-shape renderers ====================================

  /** Database — cylinder */
  function _drawDatabase(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const ry = Math.min(h * 0.15, 20); // ellipse cap height

    // Body rectangle (skip fill — we fill manually)
    if (opts.fill) {
      ctx.save();
      ctx.fillStyle = opts.fill;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Top ellipse
    rc.ellipse(x + w / 2, y + ry, w, ry * 2, { ...opts, fill: opts.fill, fillStyle: opts.fill ? 'hachure' : undefined });
    // Left side
    rc.line(x, y + ry, x, y + h - ry, opts);
    // Right side
    rc.line(x + w, y + ry, x + w, y + h - ry, opts);
    // Bottom arc (half-ellipse)
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const a1 = (i / steps) * Math.PI;
      const a2 = ((i + 1) / steps) * Math.PI;
      rc.line(
        x + w / 2 + (w / 2) * Math.cos(a1), y + h - ry + ry * Math.sin(a1),
        x + w / 2 + (w / 2) * Math.cos(a2), y + h - ry + ry * Math.sin(a2),
        opts
      );
    }
    _drawShapeText(shape);
  }

  /** Queue — rectangle with horizontal dividers and right arrow */
  function _drawQueue(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _drawRoundedRect(x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
    // Horizontal dividers
    const slots = 3;
    const slotW = w / (slots + 1);
    for (let i = 1; i <= slots; i++) {
      rc.line(x + slotW * i, y + 4, x + slotW * i, y + h - 4, { ...opts, fill: undefined });
    }
    // Arrow pointing right
    const arrowY = y + h / 2;
    const arrowX1 = x + w + 6;
    const arrowX2 = x + w + 18;
    rc.line(arrowX1, arrowY, arrowX2, arrowY, opts);
    rc.line(arrowX2 - 5, arrowY - 4, arrowX2, arrowY, opts);
    rc.line(arrowX2 - 5, arrowY + 4, arrowX2, arrowY, opts);
    _drawShapeText(shape);
  }

  /** Cache — rounded rectangle with lightning bolt */
  function _drawCache(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _drawRoundedRect(x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
    // Lightning bolt icon (top-right area)
    const ix = x + w - 18;
    const iy = y + 6;
    const s = Math.min(14, h * 0.25);
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = shape.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.5, iy);
    ctx.lineTo(ix, iy + s * 0.55);
    ctx.lineTo(ix + s * 0.4, iy + s * 0.5);
    ctx.lineTo(ix + s * 0.1, iy + s);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Server — rectangle with horizontal slot lines */
  function _drawServer(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _drawRoundedRect(x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
    // Rack lines
    const lines = Math.min(3, Math.floor(h / 20));
    const gap = h / (lines + 1);
    for (let i = 1; i <= lines; i++) {
      const ly = y + gap * i;
      rc.line(x + 6, ly, x + w - 6, ly, { ...opts, fill: undefined });
      // Small status circle
      ctx.save();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(x + w - 14, ly - gap * 0.25, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    _drawShapeText(shape);
  }

  /** Cloud — cloud shape using bezier curves */
  function _drawCloud(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    // Classic cloud silhouette using cubic bezier curves
    // Flat bottom, 3 distinct puffs on top, small bumps on sides
    const path = [
      // Start at bottom-left
      `M ${x + w * 0.15} ${y + h * 0.78}`,
      // Left side bump going up
      `C ${x - w * 0.02} ${y + h * 0.78}, ${x - w * 0.02} ${y + h * 0.42}, ${x + w * 0.12} ${y + h * 0.42}`,
      // Left puff to upper-left
      `C ${x + w * 0.04} ${y + h * 0.18}, ${x + w * 0.24} ${y + h * 0.06}, ${x + w * 0.38} ${y + h * 0.18}`,
      // Top-center big puff
      `C ${x + w * 0.38} ${y - h * 0.02}, ${x + w * 0.64} ${y - h * 0.02}, ${x + w * 0.68} ${y + h * 0.18}`,
      // Upper-right puff
      `C ${x + w * 0.82} ${y + h * 0.06}, ${x + w * 0.98} ${y + h * 0.22}, ${x + w * 0.92} ${y + h * 0.42}`,
      // Right side bump going down
      `C ${x + w * 1.04} ${y + h * 0.48}, ${x + w * 1.02} ${y + h * 0.78}, ${x + w * 0.85} ${y + h * 0.78}`,
      // Flat bottom
      `Z`
    ].join(' ');
    rc.path(path, opts);
    _drawShapeText(shape);
  }

  /** Firewall — rectangle with brick-wall pattern */
  function _drawFirewall(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _drawRoundedRect(x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
    // Brick pattern — red bricks
    ctx.save();
    ctx.strokeStyle = '#cc3333';   // red brick lines
    ctx.lineWidth = (shape.strokeWidth || 2) * 0.7;
    ctx.globalAlpha = 0.5;
    const brickH = Math.max(10, h / 4);
    const brickW = Math.max(16, w / 3);
    for (let row = 0; row < Math.ceil(h / brickH); row++) {
      const ly = y + row * brickH;
      if (ly > y && ly < y + h) {
        ctx.beginPath();
        ctx.moveTo(x + 3, ly);
        ctx.lineTo(x + w - 3, ly);
        ctx.stroke();
      }
      const offset = (row % 2) * (brickW / 2);
      for (let col = 0; col < Math.ceil(w / brickW) + 1; col++) {
        const lx = x + col * brickW + offset;
        if (lx > x + 3 && lx < x + w - 3) {
          const topY = ly;
          const botY = Math.min(ly + brickH, y + h);
          ctx.beginPath();
          ctx.moveTo(lx, Math.max(topY, y + 3));
          ctx.lineTo(lx, botY - 3);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
    _drawShapeText(shape);
  }

  // ---------- NEW SYSTEM SHAPE RENDERERS ----------

  /** Helper: draw a base rect (rounded or sharp) */
  function _baseRect(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _drawRoundedRect(x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
  }

  /** Helper: draw an icon character in top-right corner */
  function _drawIcon(shape, icon, color) {
    ctx.save();
    const fs = Math.min(16, Math.min(shape.width, shape.height) * 0.25);
    ctx.font = `${fs}px Segoe UI, system-ui, sans-serif`;
    ctx.fillStyle = color || '#666';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(icon, shape.x + shape.width - 6, shape.y + 5);
    ctx.restore();
  }

  /** Load Balancer — rect with branching arrows */
  function _drawLoadBalancer(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = Math.max(1.5, (shape.strokeWidth || 2) * 0.8);
    ctx.lineCap = 'round';
    const cx = x + w - 18, cy = y + 8, s = Math.min(12, h * 0.2);
    ctx.beginPath();
    ctx.moveTo(cx, cy + s);
    ctx.lineTo(cx, cy + s * 0.4);
    ctx.lineTo(cx - s * 0.5, cy);
    ctx.moveTo(cx, cy + s * 0.4);
    ctx.lineTo(cx + s * 0.5, cy);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** API Gateway — rect with arrow-through-gate icon */
  function _drawApiGateway(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = Math.max(1.5, (shape.strokeWidth || 2) * 0.8);
    ctx.lineCap = 'round';
    const ix = x + w - 20, iy = y + 7, s = Math.min(12, h * 0.2);
    ctx.beginPath();
    ctx.moveTo(ix, iy); ctx.lineTo(ix, iy + s);
    ctx.moveTo(ix + s, iy); ctx.lineTo(ix + s, iy + s);
    ctx.moveTo(ix - 2, iy + s * 0.5); ctx.lineTo(ix + s + 2, iy + s * 0.5);
    ctx.moveTo(ix + s - 2, iy + s * 0.3); ctx.lineTo(ix + s + 2, iy + s * 0.5);
    ctx.moveTo(ix + s - 2, iy + s * 0.7); ctx.lineTo(ix + s + 2, iy + s * 0.5);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** CDN — globe with horizontal line and vertical ellipse */
  function _drawCdn(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = Math.max(1, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 15, cy = y + 13, r = Math.min(7, h * 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** User — circle head + body arc */
  function _drawUser(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    rc.ellipse(x + w / 2, y + h * 0.65, w * 0.8, h * 0.55, opts);
    const headR = Math.min(w, h) * 0.28;
    rc.ellipse(x + w / 2, y + h * 0.25, headR, headR, { ...opts, fill: opts.fill || undefined });
    _drawShapeText(shape);
  }

  /** Microservice — hexagon */
  function _drawMicroservice(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const cx = x + w / 2, cy = y + h / 2;
    const rx = w / 2, ry = h / 2;
    rc.polygon([
      [cx - rx, cy],
      [cx - rx * 0.5, cy - ry],
      [cx + rx * 0.5, cy - ry],
      [cx + rx, cy],
      [cx + rx * 0.5, cy + ry],
      [cx - rx * 0.5, cy + ry],
    ], opts);
    _drawShapeText(shape);
  }

  /** Pub/Sub — rect with broadcast icon */
  function _drawPubSub(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 16, cy = y + 12, r = Math.min(5, h * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ec4899'; ctx.fill();
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath(); ctx.arc(cx, cy, r * i, -Math.PI * 0.4, Math.PI * 0.4); ctx.stroke();
    }
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Object Storage — rect with barrel icon */
  function _drawStorage(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const ix = x + w - 18, iy = y + 5, iw = 12, ih = 14;
    ctx.beginPath(); ctx.ellipse(ix + iw / 2, iy + 3, iw / 2, 3, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix, iy + 3); ctx.lineTo(ix, iy + ih - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ix + iw, iy + 3); ctx.lineTo(ix + iw, iy + ih - 3); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(ix + iw / 2, iy + ih - 3, iw / 2, 3, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Serverless Function — rect with lambda symbol */
  function _drawFunction(shape, opts) {
    _baseRect(shape, opts);
    _drawIcon(shape, '\u03BB', '#e11d48');
    _drawShapeText(shape);
  }

  /** Container — rect with 3D box icon */
  function _drawContainer(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const ix = x + w - 20, iy = y + 5, s = Math.min(13, h * 0.2);
    ctx.beginPath(); ctx.rect(ix, iy + s * 0.25, s * 0.7, s * 0.7); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix, iy + s * 0.25); ctx.lineTo(ix + s * 0.3, iy);
    ctx.lineTo(ix + s, iy); ctx.lineTo(ix + s * 0.7, iy + s * 0.25); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix + s * 0.7, iy + s * 0.25); ctx.lineTo(ix + s, iy);
    ctx.lineTo(ix + s, iy + s * 0.7); ctx.lineTo(ix + s * 0.7, iy + s * 0.95); ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Event Bus — rect with horizontal bus lines */
  function _drawEventBus(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = Math.max(1.5, (shape.strokeWidth || 2) * 0.7);
    ctx.lineCap = 'round';
    const gap = Math.min(5, h * 0.08);
    const ix = x + 8, iw = w - 16, iy = y + h - 12;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(ix, iy + i * gap);
      ctx.lineTo(ix + iw, iy + i * gap); ctx.stroke();
    }
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Browser — rect with address bar and traffic-light dots */
  function _drawBrowser(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    const barH = Math.min(14, h * 0.18);
    rc.line(x + 4, y + barH, x + w - 4, y + barH, { ...opts, fill: undefined });
    ctx.save();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(x + 8, y + barH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.arc(x + 16, y + barH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(x + 24, y + barH / 2, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Mobile — tall rounded rect with home indicator */
  function _drawMobile(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(16, Math.min(w, h) * 0.25);
    _drawRoundedRect(x, y, w, h, r, opts);
    rc.line(x + 6, y + 14, x + w - 6, y + 14, { ...opts, fill: undefined });
    ctx.save();
    ctx.strokeStyle = opts.stroke || '#1e1e1e';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + h - 6);
    ctx.lineTo(x + w * 0.65, y + h - 6);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Monitor — rect with graph pulse line */
  function _drawMonitor(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = Math.max(1.5, (shape.strokeWidth || 2) * 0.7);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const gy = y + h - 14, gx = x + 8, gw = w - 16;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + gw * 0.2, gy - 4);
    ctx.lineTo(gx + gw * 0.35, gy + 2);
    ctx.lineTo(gx + gw * 0.45, gy - 8);
    ctx.lineTo(gx + gw * 0.55, gy + 3);
    ctx.lineTo(gx + gw * 0.7, gy - 3);
    ctx.lineTo(gx + gw * 0.85, gy + 1);
    ctx.lineTo(gx + gw, gy);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Notification — rect with bell icon */
  function _drawNotification(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    ctx.lineCap = 'round';
    const cx = x + w - 15, cy = y + 8, s = Math.min(10, h * 0.15);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.4, cy + s);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
    ctx.quadraticCurveTo(cx - s * 0.5, cy - s * 0.2, cx, cy - s * 0.3);
    ctx.quadraticCurveTo(cx + s * 0.5, cy - s * 0.2, cx + s * 0.5, cy + s * 0.5);
    ctx.lineTo(cx + s * 0.4, cy + s);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + s + 2, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b'; ctx.fill();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Auth / Identity — rect with lock icon */
  function _drawAuth(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 15, cy = y + 7, s = Math.min(10, h * 0.15);
    ctx.beginPath(); ctx.rect(cx - s * 0.4, cy + s * 0.3, s * 0.8, s * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.3, Math.PI, 0); ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** External API — rect with plug icon */
  function _drawExternalApi(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    ctx.lineCap = 'round';
    const ix = x + w - 18, iy = y + 7, s = Math.min(10, h * 0.15);
    ctx.beginPath();
    ctx.moveTo(ix, iy); ctx.lineTo(ix, iy + s * 0.4);
    ctx.moveTo(ix + s * 0.5, iy); ctx.lineTo(ix + s * 0.5, iy + s * 0.4);
    ctx.moveTo(ix - s * 0.1, iy + s * 0.4); ctx.lineTo(ix + s * 0.6, iy + s * 0.4);
    ctx.moveTo(ix + s * 0.25, iy + s * 0.4); ctx.lineTo(ix + s * 0.25, iy + s);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Scheduler — rect with clock icon */
  function _drawScheduler(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 14, cy = y + 12, r = Math.min(7, h * 0.1);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - r * 0.65);
    ctx.moveTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy + r * 0.2);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Logger — rect with document lines icon */
  function _drawLogger(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#78716c';
    ctx.lineWidth = Math.max(1, (shape.strokeWidth || 2) * 0.5);
    ctx.lineCap = 'round';
    const ix = x + w - 20, iy = y + 6, s = Math.min(12, h * 0.18);
    for (let i = 0; i < 3; i++) {
      const lineW = i === 1 ? s * 0.6 : s;
      ctx.beginPath();
      ctx.moveTo(ix, iy + i * (s * 0.45));
      ctx.lineTo(ix + lineW, iy + i * (s * 0.45));
      ctx.stroke();
    }
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Search Index — rect with magnifying glass icon */
  function _drawSearch(shape, opts) {
    _baseRect(shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#ea580c';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    ctx.lineCap = 'round';
    const cx = x + w - 16, cy = y + 10, r = Math.min(5, h * 0.08);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.7, cy + r * 0.7);
    ctx.lineTo(cx + r * 1.6, cy + r * 1.6);
    ctx.stroke();
    ctx.restore();
    _drawShapeText(shape);
  }

  /** Data Warehouse — stacked cylinder */
  function _drawDataWarehouse(shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const ry = Math.min(h * 0.12, 16);
    if (opts.fill) {
      ctx.save();
      ctx.fillStyle = opts.fill;
      ctx.beginPath();
      ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, Math.PI, Math.PI * 2);
      ctx.lineTo(x + w, y + h - ry);
      ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    rc.ellipse(x + w / 2, y + ry, w, ry * 2, { ...opts, fill: opts.fill, fillStyle: opts.fill ? 'hachure' : undefined });
    rc.line(x, y + ry, x, y + h - ry, opts);
    rc.line(x + w, y + ry, x + w, y + h - ry, opts);
    // Middle shelf
    const midY = y + h * 0.5;
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const a1 = (i / steps) * Math.PI;
      const a2 = ((i + 1) / steps) * Math.PI;
      rc.line(
        x + w / 2 + (w / 2) * Math.cos(a1), midY + ry * 0.6 * Math.sin(a1),
        x + w / 2 + (w / 2) * Math.cos(a2), midY + ry * 0.6 * Math.sin(a2),
        { ...opts, fill: undefined }
      );
    }
    // Bottom arc
    for (let i = 0; i < steps; i++) {
      const a1 = (i / steps) * Math.PI;
      const a2 = ((i + 1) / steps) * Math.PI;
      rc.line(
        x + w / 2 + (w / 2) * Math.cos(a1), y + h - ry + ry * Math.sin(a1),
        x + w / 2 + (w / 2) * Math.cos(a2), y + h - ry + ry * Math.sin(a2),
        opts
      );
    }
    _drawShapeText(shape);
  }

  // === Azure Storage shape renderers ============================
  // All use official Microsoft Azure SVG icons via AzureIcons cache.

  /** Helper: draw an Azure SVG icon in the top-right corner of a shape */
  function _drawAzureIcon(shape, typeKey) {
    const img = AzureIcons.get(typeKey);
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = Math.min(24, Math.min(shape.width, shape.height) * 0.35);
    ctx.drawImage(img, shape.x + shape.width - s - 4, shape.y + 4, s, s);
  }

  function _drawBlobStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'blobstorage');
    _drawShapeText(shape);
  }

  function _drawFileStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'filestorage');
    _drawShapeText(shape);
  }

  function _drawQueueStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'queuestorage');
    _drawShapeText(shape);
  }

  function _drawTableStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'tablestorage');
    _drawShapeText(shape);
  }

  function _drawDataLake(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'datalake');
    _drawShapeText(shape);
  }

  function _drawManagedDisks(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'manageddisks');
    _drawShapeText(shape);
  }

  // === Generic Storage shape renderers ============================

  function _drawObjectStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawIcon(shape, '\u{1F4E6}', '#f97316');
    _drawShapeText(shape);
  }

  function _drawBlockStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawIcon(shape, '\u{1F4BF}', '#6366f1');
    _drawShapeText(shape);
  }

  function _drawFileShare(shape, opts) {
    _baseRect(shape, opts);
    _drawIcon(shape, '\u{1F4C1}', '#0ea5e9');
    _drawShapeText(shape);
  }

  function _drawArchiveStorage(shape, opts) {
    _baseRect(shape, opts);
    _drawIcon(shape, '\u{1F5C4}', '#78716c');
    _drawShapeText(shape);
  }

  // === Azure Database shape renderers ============================

  function _drawAzureSql(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'azuresql');
    _drawShapeText(shape);
  }

  function _drawCosmosDb(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'cosmosdb');
    _drawShapeText(shape);
  }

  function _drawAzureMySql(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'azuremysql');
    _drawShapeText(shape);
  }

  function _drawAzurePostgres(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'azurepostgres');
    _drawShapeText(shape);
  }

  function _drawSqlManaged(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'sqlmanaged');
    _drawShapeText(shape);
  }

  function _drawRedisCache(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'rediscache');
    _drawShapeText(shape);
  }

  function _drawDataFactory(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'datafactory');
    _drawShapeText(shape);
  }

  function _drawSynapse(shape, opts) {
    _baseRect(shape, opts);
    _drawAzureIcon(shape, 'synapse');
    _drawShapeText(shape);
  }

  // ---------- END NEW SYSTEM SHAPE RENDERERS ----------

  /**
   * Draw a rectangle with rounded corners using Rough.js path
   */
  function _drawRoundedRect(x, y, w, h, r, opts) {
    r = Math.min(r, w / 2, h / 2);
    // Build SVG path for a rounded rectangle
    const path = `M ${x + r} ${y}
      L ${x + w - r} ${y}
      A ${r} ${r} 0 0 1 ${x + w} ${y + r}
      L ${x + w} ${y + h - r}
      A ${r} ${r} 0 0 1 ${x + w - r} ${y + h}
      L ${x + r} ${y + h}
      A ${r} ${r} 0 0 1 ${x} ${y + h - r}
      L ${x} ${y + r}
      A ${r} ${r} 0 0 1 ${x + r} ${y}
      Z`;
    rc.path(path, opts);
  }

  /**
   * Draw text inside a container shape (rectangle, ellipse, diamond)
   */
  function _drawShapeText(shape) {
    if (!shape.text) return;
    ctx.save();
    const fs = shape.fontSize || 16;
    ctx.font = `${fs}px ${shape.fontFamily || 'Segoe UI, system-ui, sans-serif'}`;
    ctx.fillStyle = shape.strokeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const lines = shape.text.split('\n');
    const lineHeight = fs * 1.4;
    const totalTextH = lines.length * lineHeight;
    const cx = shape.x + shape.width / 2;
    const pad = 6;

    let startY;
    const vAlign = shape.textVAlign || 'bottom';
    if (vAlign === 'top') {
      // Outside, above the shape
      startY = shape.y - totalTextH - pad;
    } else if (vAlign === 'bottom') {
      // Outside, below the shape
      startY = shape.y + shape.height + pad;
    } else {
      // Middle — inside shape, vertically centered
      startY = shape.y + (shape.height - totalTextH) / 2;
    }

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * lineHeight);
    }
    ctx.restore();
  }

  function drawArrowHead(fromX, fromY, toX, toY, color, strokeW) {
    const headLen = Math.max(12, strokeW * 4);
    const ang = Utils.angle(fromX, fromY, toX, toY);
    const a1 = ang + Math.PI * 0.82;
    const a2 = ang - Math.PI * 0.82;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = strokeW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(toX + headLen * Math.cos(a1), toY + headLen * Math.sin(a1));
    ctx.lineTo(toX, toY);
    ctx.lineTo(toX + headLen * Math.cos(a2), toY + headLen * Math.sin(a2));
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draw selection box / handles for a shape
   */
  function drawSelectionBox(shape) {
    const b = Shapes.getBounds(shape);
    const pad = 4;

    ctx.save();
    ctx.strokeStyle = '#6c47ff';
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.strokeRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
    ctx.setLineDash([]);

    // Draw handles
    const handleSize = 6 / scale;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#6c47ff';
    ctx.lineWidth = 1.5 / scale;

    if (shape.type === 'line' || shape.type === 'arrow') {
      // Only start/end handles
      if (shape.points && shape.points.length >= 2) {
        const pts = [shape.points[0], shape.points[shape.points.length - 1]];
        for (const p of pts) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, handleSize, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }
    } else if (shape.type !== 'freehand') {
      const positions = [
        { x: b.x,         y: b.y },
        { x: b.x + b.w/2, y: b.y },
        { x: b.x + b.w,   y: b.y },
        { x: b.x + b.w,   y: b.y + b.h/2 },
        { x: b.x + b.w,   y: b.y + b.h },
        { x: b.x + b.w/2, y: b.y + b.h },
        { x: b.x,         y: b.y + b.h },
        { x: b.x,         y: b.y + b.h/2 },
      ];
      for (const p of positions) {
        ctx.fillRect(p.x - handleSize, p.y - handleSize, handleSize * 2, handleSize * 2);
        ctx.strokeRect(p.x - handleSize, p.y - handleSize, handleSize * 2, handleSize * 2);
      }
    }

    ctx.restore();
  }

  /**
   * Draw a selection rectangle (rubber-band)
   */
  function drawSelectionRect(x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = '#6c47ff';
    ctx.fillStyle = 'rgba(108, 71, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Full render pass
   */
  function render(shapes, selectedIds, selectionRect, anchorHintCtx) {
    clear();
    drawGrid();

    applyTransform();

    // Draw all shapes
    for (const shape of shapes) {
      drawShape(shape);
    }

    // Draw selection highlight
    for (const shape of shapes) {
      if (selectedIds.has(shape.id)) {
        drawSelectionBox(shape);
      }
    }

    // Draw rubber-band selection rect
    if (selectionRect) {
      drawSelectionRect(
        selectionRect.x, selectionRect.y,
        selectionRect.w, selectionRect.h
      );
    }

    // Draw anchor snap hints during arrow/line drawing
    if (anchorHintCtx && anchorHintCtx.cursorWorld) {
      Connectors.drawAnchorHints(ctx, shapes, anchorHintCtx.cursorWorld.x, anchorHintCtx.cursorWorld.y, scale);
      // Draw a small snap indicator on the snapped anchor
      if (anchorHintCtx.snapTarget) {
        ctx.save();
        ctx.strokeStyle = '#6c47ff';
        ctx.lineWidth = 2 / scale;
        ctx.beginPath();
        ctx.arc(anchorHintCtx.snapTarget.x, anchorHintCtx.snapTarget.y, 8 / scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Draw connection dots on bound endpoints of selected arrows
    for (const shape of shapes) {
      if (!selectedIds.has(shape.id)) continue;
      if (shape.type !== 'arrow' && shape.type !== 'line') continue;
      if (!shape.points || shape.points.length < 2) continue;

      ctx.save();
      if (shape.startBinding) {
        const p = shape.points[0];
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
      if (shape.endBinding) {
        const p = shape.points[shape.points.length - 1];
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5 / scale, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    restoreTransform();
  }

  return {
    init,
    render,
    screenToWorld,
    worldToScreen,
    pan,
    zoomAt,
    setZoom,
    resetView,
    getScale,
    getOffset,
    handleResize,
    get width() { return width; },
    get height() { return height; },
  };
})();
