// ============================================================
// export.js — Export to PNG, SVG, and JSON save/load
// ============================================================

const Export = (() => {

  /**
   * Export canvas to PNG and download
   */
  function toPNG(shapes) {
    if (shapes.length === 0) return;

    // Calculate bounding box of all shapes
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const shape of shapes) {
      const b = Shapes.getBounds(shape);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }

    const padding = 40;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;

    // Create offscreen canvas
    const offCanvas = document.createElement('canvas');
    const dpr = 2; // export at 2x for quality
    offCanvas.width = w * dpr;
    offCanvas.height = h * dpr;
    const ctx = offCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Translate so shapes are inside
    ctx.translate(-minX + padding, -minY + padding);

    // Draw shapes with rough.js
    const rc = rough.canvas(offCanvas);
    for (const shape of shapes) {
      drawShapeToCtx(ctx, rc, shape);
    }

    // Download
    const link = document.createElement('a');
    link.download = 'system-diagram.png';
    link.href = offCanvas.toDataURL('image/png');
    link.click();
  }

  /**
   * Draw a shape to an arbitrary context (for export).
   * Mirrors CanvasView.drawShape() so exported PNGs match on-screen rendering.
   */
  function drawShapeToCtx(ctx, rc, shape) {
    // Resolve fill style exactly like canvas.js
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
          _exportRoundedRect(rc, shape.x, shape.y, shape.width, shape.height, Math.min(12, Math.min(shape.width, shape.height) * 0.2), opts);
        } else {
          rc.rectangle(shape.x, shape.y, shape.width, shape.height, opts);
        }
        _exportShapeText(ctx, shape);
        break;

      case 'ellipse': {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        rc.ellipse(cx, cy, shape.width, shape.height, opts);
        _exportShapeText(ctx, shape);
        break;
      }

      case 'diamond': {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        const hw = shape.width / 2;
        const hh = shape.height / 2;
        rc.polygon([
          [cx, cy - hh], [cx + hw, cy],
          [cx, cy + hh], [cx - hw, cy],
        ], opts);
        _exportShapeText(ctx, shape);
        break;
      }

      case 'line':
      case 'arrow':
        if (shape.points && shape.points.length >= 2) {
          for (let i = 0; i < shape.points.length - 1; i++) {
            rc.line(
              shape.points[i].x, shape.points[i].y,
              shape.points[i + 1].x, shape.points[i + 1].y,
              opts
            );
          }
          if (shape.type === 'arrow' || shape.arrowHead) {
            const last = shape.points[shape.points.length - 1];
            const prev = shape.points[shape.points.length - 2];
            drawArrowHeadExport(ctx, prev.x, prev.y, last.x, last.y, shape.strokeColor, shape.strokeWidth);
          }
        }
        break;

      case 'freehand':
        if (shape.points && shape.points.length >= 2) {
          const pathPoints = shape.points.map(p => [p.x, p.y]);
          rc.curve(pathPoints, { ...opts, fill: undefined, fillStyle: undefined });
        }
        break;

      case 'text':
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

      // ---------- System-design shapes ----------

      case 'database':
        _exportDatabase(ctx, rc, shape, opts);
        break;

      case 'queue':
        _exportQueue(ctx, rc, shape, opts);
        break;

      case 'cache':
        _exportCache(ctx, rc, shape, opts);
        break;

      case 'server':
        _exportServer(ctx, rc, shape, opts);
        break;

      case 'cloud':
        _exportCloud(ctx, rc, shape, opts);
        break;

      case 'firewall':
        _exportFirewall(ctx, rc, shape, opts);
        break;

      case 'loadbalancer':
        _exportLoadBalancer(ctx, rc, shape, opts);
        break;

      case 'apigateway':
        _exportApiGateway(ctx, rc, shape, opts);
        break;

      case 'cdn':
        _exportCdn(ctx, rc, shape, opts);
        break;

      case 'user':
        _exportUser(ctx, rc, shape, opts);
        break;

      case 'microservice':
        _exportMicroservice(ctx, rc, shape, opts);
        break;

      case 'pubsub':
        _exportPubSub(ctx, rc, shape, opts);
        break;

      case 'storage':
        _exportStorage(ctx, rc, shape, opts);
        break;

      case 'function':
        _exportFunction(ctx, rc, shape, opts);
        break;

      case 'container':
        _exportContainer(ctx, rc, shape, opts);
        break;

      case 'eventbus':
        _exportEventBus(ctx, rc, shape, opts);
        break;

      case 'browser':
        _exportBrowser(ctx, rc, shape, opts);
        break;

      case 'mobile':
        _exportMobile(ctx, rc, shape, opts);
        break;

      case 'monitor':
        _exportMonitor(ctx, rc, shape, opts);
        break;

      case 'notification':
        _exportNotification(ctx, rc, shape, opts);
        break;

      case 'auth':
        _exportAuth(ctx, rc, shape, opts);
        break;

      case 'externalapi':
        _exportExternalApi(ctx, rc, shape, opts);
        break;

      case 'scheduler':
        _exportScheduler(ctx, rc, shape, opts);
        break;

      case 'logger':
        _exportLogger(ctx, rc, shape, opts);
        break;

      case 'search':
        _exportSearch(ctx, rc, shape, opts);
        break;

      case 'datawarehouse':
        _exportDataWarehouse(ctx, rc, shape, opts);
        break;

      // Azure Storage shapes
      case 'blobstorage':
        _exportBlobStorage(ctx, rc, shape, opts);
        break;
      case 'filestorage':
        _exportFileStorage(ctx, rc, shape, opts);
        break;
      case 'queuestorage':
        _exportQueueStorage(ctx, rc, shape, opts);
        break;
      case 'tablestorage':
        _exportTableStorage(ctx, rc, shape, opts);
        break;
      case 'datalake':
        _exportDataLake(ctx, rc, shape, opts);
        break;
      case 'manageddisks':
        _exportManagedDisks(ctx, rc, shape, opts);
        break;

      // Azure Database shapes
      case 'azuresql':
        _exportAzureSql(ctx, rc, shape, opts);
        break;
      case 'cosmosdb':
        _exportCosmosDb(ctx, rc, shape, opts);
        break;
      case 'azuremysql':
        _exportAzureMySql(ctx, rc, shape, opts);
        break;
      case 'azurepostgres':
        _exportAzurePostgres(ctx, rc, shape, opts);
        break;
      case 'sqlmanaged':
        _exportSqlManaged(ctx, rc, shape, opts);
        break;
      case 'rediscache':
        _exportRedisCache(ctx, rc, shape, opts);
        break;
      case 'datafactory':
        _exportDataFactory(ctx, rc, shape, opts);
        break;
      case 'synapse':
        _exportSynapse(ctx, rc, shape, opts);
        break;

      // Generic Storage shapes
      case 'objectstorage':
        _exportObjectStorage(ctx, rc, shape, opts);
        break;
      case 'blockstorage':
        _exportBlockStorage(ctx, rc, shape, opts);
        break;
      case 'fileshare':
        _exportFileShare(ctx, rc, shape, opts);
        break;
      case 'archivestorage':
        _exportArchiveStorage(ctx, rc, shape, opts);
        break;

      // Azure Compute shapes
      case 'azurevm':      _exportAzureVm(ctx, rc, shape, opts); break;
      case 'appservice':   _exportAppService(ctx, rc, shape, opts); break;
      case 'azurefunc':    _exportAzureFunc(ctx, rc, shape, opts); break;
      case 'aks':          _exportAks(ctx, rc, shape, opts); break;
      case 'aci':          _exportAci(ctx, rc, shape, opts); break;
      case 'springapps':   _exportSpringApps(ctx, rc, shape, opts); break;

      // Azure Networking shapes
      case 'vnet':         _exportVnet(ctx, rc, shape, opts); break;
      case 'azurelb':      _exportAzureLb(ctx, rc, shape, opts); break;
      case 'appgateway':   _exportAppGateway(ctx, rc, shape, opts); break;
      case 'expressroute': _exportExpressRoute(ctx, rc, shape, opts); break;
      case 'azurefirewall':_exportAzureFirewall(ctx, rc, shape, opts); break;
      case 'frontdoor':    _exportFrontDoor(ctx, rc, shape, opts); break;
      case 'azuredns':     _exportAzureDns(ctx, rc, shape, opts); break;
      case 'bastion':      _exportBastion(ctx, rc, shape, opts); break;

      // Azure Integration shapes
      case 'apim':         _exportApim(ctx, rc, shape, opts); break;
      case 'servicebus':   _exportServiceBus(ctx, rc, shape, opts); break;
      case 'eventgrid':    _exportEventGrid(ctx, rc, shape, opts); break;
      case 'eventhubs':    _exportEventHubs(ctx, rc, shape, opts); break;
      case 'logicapps':    _exportLogicApps(ctx, rc, shape, opts); break;
      case 'appconfig':    _exportAppConfig(ctx, rc, shape, opts); break;

      // Azure Security shapes
      case 'keyvault':     _exportKeyVault(ctx, rc, shape, opts); break;
      case 'sentinel':     _exportSentinel(ctx, rc, shape, opts); break;
      case 'defender':     _exportDefender(ctx, rc, shape, opts); break;
      case 'entraid':      _exportEntraId(ctx, rc, shape, opts); break;
      case 'managedid':    _exportManagedId(ctx, rc, shape, opts); break;

      // Azure DevOps & Monitoring shapes
      case 'azuredevops':  _exportAzureDevops(ctx, rc, shape, opts); break;
      case 'appinsights':  _exportAppInsights(ctx, rc, shape, opts); break;
      case 'loganalytics': _exportLogAnalytics(ctx, rc, shape, opts); break;
      case 'azuremonitor': _exportAzureMonitor(ctx, rc, shape, opts); break;
      case 'loadtest':     _exportLoadTest(ctx, rc, shape, opts); break;

      // Azure AI & ML shapes
      case 'openai':       _exportOpenAi(ctx, rc, shape, opts); break;
      case 'cogservices':  _exportCogServices(ctx, rc, shape, opts); break;
      case 'azureml':      _exportAzureMl(ctx, rc, shape, opts); break;
      case 'botservice':   _exportBotService(ctx, rc, shape, opts); break;
      case 'aisearch':     _exportAiSearch(ctx, rc, shape, opts); break;
      case 'aistudio':     _exportAiStudio(ctx, rc, shape, opts); break;

      // Azure IoT shapes
      case 'iothub':       _exportIotHub(ctx, rc, shape, opts); break;
      case 'iotcentral':   _exportIotCentral(ctx, rc, shape, opts); break;
      case 'digitaltwins': _exportDigitalTwins(ctx, rc, shape, opts); break;
      case 'iotedge':      _exportIotEdge(ctx, rc, shape, opts); break;

      // Azure Analytics shapes
      case 'databricks':   _exportDatabricks(ctx, rc, shape, opts); break;
      case 'hdinsight':    _exportHdInsight(ctx, rc, shape, opts); break;
      case 'dataexplorer': _exportDataExplorer(ctx, rc, shape, opts); break;
      case 'powerbi':      _exportPowerBi(ctx, rc, shape, opts); break;
    }

    ctx.globalAlpha = 1;
  }

  // === Export helpers (mirror canvas.js renderers) ===

  function _exportRoundedRect(rc, x, y, w, h, r, opts) {
    r = Math.min(r, w / 2, h / 2);
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

  function _exportBaseRect(rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(12, Math.min(w, h) * 0.2);
    if (shape.edgeStyle === 'round') {
      _exportRoundedRect(rc, x, y, w, h, r, opts);
    } else {
      rc.rectangle(x, y, w, h, opts);
    }
  }

  function _exportShapeText(ctx, shape) {
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
    const vAlign = shape.textVAlign || 'middle';
    if (vAlign === 'top') {
      startY = shape.y + pad;
    } else if (vAlign === 'bottom') {
      startY = shape.y + shape.height - totalTextH - pad;
    } else {
      startY = shape.y + (shape.height - totalTextH) / 2;
    }
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], cx, startY + i * lineHeight);
    }
    ctx.restore();
  }

  function _exportIcon(ctx, shape, icon, color) {
    ctx.save();
    const fs = Math.min(16, Math.min(shape.width, shape.height) * 0.25);
    ctx.font = `${fs}px Segoe UI, system-ui, sans-serif`;
    ctx.fillStyle = color || '#666';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(icon, shape.x + shape.width - 6, shape.y + 5);
    ctx.restore();
  }

  function _exportDatabase(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const ry = Math.min(h * 0.15, 20);
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
    _exportShapeText(ctx, shape);
  }

  function _exportQueue(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    _exportBaseRect(rc, shape, opts);
    const slots = 3;
    const slotW = w / (slots + 1);
    for (let i = 1; i <= slots; i++) {
      rc.line(x + slotW * i, y + 4, x + slotW * i, y + h - 4, { ...opts, fill: undefined });
    }
    const arrowY = y + h / 2;
    const arrowX1 = x + w + 6;
    const arrowX2 = x + w + 18;
    rc.line(arrowX1, arrowY, arrowX2, arrowY, opts);
    rc.line(arrowX2 - 5, arrowY - 4, arrowX2, arrowY, opts);
    rc.line(arrowX2 - 5, arrowY + 4, arrowX2, arrowY, opts);
    _exportShapeText(ctx, shape);
  }

  function _exportCache(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportServer(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    _exportBaseRect(rc, shape, opts);
    const lineCount = Math.min(3, Math.floor(h / 20));
    const gap = h / (lineCount + 1);
    for (let i = 1; i <= lineCount; i++) {
      const ly = y + gap * i;
      rc.line(x + 6, ly, x + w - 6, ly, { ...opts, fill: undefined });
      ctx.save();
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(x + w - 14, ly - gap * 0.25, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    _exportShapeText(ctx, shape);
  }

  function _exportCloud(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const path = [
      `M ${x + w * 0.15} ${y + h * 0.78}`,
      `C ${x - w * 0.02} ${y + h * 0.78}, ${x - w * 0.02} ${y + h * 0.42}, ${x + w * 0.12} ${y + h * 0.42}`,
      `C ${x + w * 0.04} ${y + h * 0.18}, ${x + w * 0.24} ${y + h * 0.06}, ${x + w * 0.38} ${y + h * 0.18}`,
      `C ${x + w * 0.38} ${y - h * 0.02}, ${x + w * 0.64} ${y - h * 0.02}, ${x + w * 0.68} ${y + h * 0.18}`,
      `C ${x + w * 0.82} ${y + h * 0.06}, ${x + w * 0.98} ${y + h * 0.22}, ${x + w * 0.92} ${y + h * 0.42}`,
      `C ${x + w * 1.04} ${y + h * 0.48}, ${x + w * 1.02} ${y + h * 0.78}, ${x + w * 0.85} ${y + h * 0.78}`,
      `Z`
    ].join(' ');
    rc.path(path, opts);
    _exportShapeText(ctx, shape);
  }

  function _exportFirewall(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    _exportBaseRect(rc, shape, opts);
    ctx.save();
    ctx.strokeStyle = opts.stroke || '#1e1e1e';
    ctx.lineWidth = (shape.strokeWidth || 2) * 0.6;
    ctx.globalAlpha = 0.3;
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
    _exportShapeText(ctx, shape);
  }

  function _exportLoadBalancer(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportApiGateway(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportCdn(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = Math.max(1, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 15, cy = y + 13, r = Math.min(7, h * 0.12);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.45, r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    _exportShapeText(ctx, shape);
  }

  function _exportUser(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    rc.ellipse(x + w / 2, y + h * 0.65, w * 0.8, h * 0.55, opts);
    const headR = Math.min(w, h) * 0.28;
    rc.ellipse(x + w / 2, y + h * 0.25, headR, headR, { ...opts, fill: opts.fill || undefined });
    _exportShapeText(ctx, shape);
  }

  function _exportMicroservice(ctx, rc, shape, opts) {
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
    _exportShapeText(ctx, shape);
  }

  function _exportPubSub(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportFunction(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportIcon(ctx, shape, '\u03BB', '#e11d48');
    _exportShapeText(ctx, shape);
  }

  function _exportContainer(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportEventBus(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportBrowser(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportMobile(ctx, rc, shape, opts) {
    const { x, y, width: w, height: h } = shape;
    const r = Math.min(16, Math.min(w, h) * 0.25);
    _exportRoundedRect(rc, x, y, w, h, r, opts);
    rc.line(x + 6, y + 14, x + w - 6, y + 14, { ...opts, fill: undefined });
    ctx.save();
    ctx.strokeStyle = opts.stroke || '#1e1e1e';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.35, y + h - 6);
    ctx.lineTo(x + w * 0.65, y + h - 6);
    ctx.stroke();
    ctx.restore();
    _exportShapeText(ctx, shape);
  }

  function _exportMonitor(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportNotification(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportAuth(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    const { x, y, width: w, height: h } = shape;
    ctx.save();
    ctx.strokeStyle = '#0ea5e9';
    ctx.lineWidth = Math.max(1.2, (shape.strokeWidth || 2) * 0.6);
    const cx = x + w - 15, cy = y + 7, s = Math.min(10, h * 0.15);
    ctx.beginPath(); ctx.rect(cx - s * 0.4, cy + s * 0.3, s * 0.8, s * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy + s * 0.3, s * 0.3, Math.PI, 0); ctx.stroke();
    ctx.restore();
    _exportShapeText(ctx, shape);
  }

  function _exportExternalApi(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportScheduler(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportLogger(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportSearch(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
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
    _exportShapeText(ctx, shape);
  }

  function _exportDataWarehouse(ctx, rc, shape, opts) {
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
    const steps = 20;
    const midY = y + h * 0.5;
    for (let i = 0; i < steps; i++) {
      const a1 = (i / steps) * Math.PI;
      const a2 = ((i + 1) / steps) * Math.PI;
      rc.line(
        x + w / 2 + (w / 2) * Math.cos(a1), midY + ry * 0.6 * Math.sin(a1),
        x + w / 2 + (w / 2) * Math.cos(a2), midY + ry * 0.6 * Math.sin(a2),
        { ...opts, fill: undefined }
      );
    }
    for (let i = 0; i < steps; i++) {
      const a1 = (i / steps) * Math.PI;
      const a2 = ((i + 1) / steps) * Math.PI;
      rc.line(
        x + w / 2 + (w / 2) * Math.cos(a1), y + h - ry + ry * Math.sin(a1),
        x + w / 2 + (w / 2) * Math.cos(a2), y + h - ry + ry * Math.sin(a2),
        opts
      );
    }
    _exportShapeText(ctx, shape);
  }

  // === Azure Storage export renderers ===
  // Uses same AzureIcons cache (preloaded in canvas.js)

  function _exportAzureIcon(ctx, shape, typeKey) {
    const img = AzureIcons.get(typeKey);
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = Math.min(24, Math.min(shape.width, shape.height) * 0.35);
    ctx.drawImage(img, shape.x + shape.width - s - 4, shape.y + 4, s, s);
  }

  function _exportBlobStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'blobstorage');
    _exportShapeText(ctx, shape);
  }

  function _exportFileStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'filestorage');
    _exportShapeText(ctx, shape);
  }

  function _exportQueueStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'queuestorage');
    _exportShapeText(ctx, shape);
  }

  function _exportTableStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'tablestorage');
    _exportShapeText(ctx, shape);
  }

  function _exportDataLake(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'datalake');
    _exportShapeText(ctx, shape);
  }

  function _exportManagedDisks(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'manageddisks');
    _exportShapeText(ctx, shape);
  }

  // === Azure Database export renderers ===

  function _exportAzureSql(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'azuresql');
    _exportShapeText(ctx, shape);
  }

  function _exportCosmosDb(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'cosmosdb');
    _exportShapeText(ctx, shape);
  }

  function _exportAzureMySql(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'azuremysql');
    _exportShapeText(ctx, shape);
  }

  function _exportAzurePostgres(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'azurepostgres');
    _exportShapeText(ctx, shape);
  }

  function _exportSqlManaged(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'sqlmanaged');
    _exportShapeText(ctx, shape);
  }

  function _exportRedisCache(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'rediscache');
    _exportShapeText(ctx, shape);
  }

  function _exportDataFactory(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'datafactory');
    _exportShapeText(ctx, shape);
  }

  function _exportSynapse(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportAzureIcon(ctx, shape, 'synapse');
    _exportShapeText(ctx, shape);
  }

  // === Generic Storage export renderers ===

  function _exportObjectStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportIcon(ctx, shape, '\u{1F4E6}', '#f97316');
    _exportShapeText(ctx, shape);
  }

  function _exportBlockStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportIcon(ctx, shape, '\u{1F4BF}', '#6366f1');
    _exportShapeText(ctx, shape);
  }

  function _exportFileShare(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportIcon(ctx, shape, '\u{1F4C1}', '#0ea5e9');
    _exportShapeText(ctx, shape);
  }

  function _exportArchiveStorage(ctx, rc, shape, opts) {
    _exportBaseRect(rc, shape, opts);
    _exportIcon(ctx, shape, '\u{1F5C4}', '#78716c');
    _exportShapeText(ctx, shape);
  }

  // === Azure Compute export renderers ===
  function _exportAzureVm(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azurevm');_exportShapeText(c,s);}
  function _exportAppService(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'appservice');_exportShapeText(c,s);}
  function _exportAzureFunc(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azurefunc');_exportShapeText(c,s);}
  function _exportAks(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'aks');_exportShapeText(c,s);}
  function _exportAci(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'aci');_exportShapeText(c,s);}
  function _exportSpringApps(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'springapps');_exportShapeText(c,s);}

  // === Azure Networking export renderers ===
  function _exportVnet(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'vnet');_exportShapeText(c,s);}
  function _exportAzureLb(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azurelb');_exportShapeText(c,s);}
  function _exportAppGateway(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'appgateway');_exportShapeText(c,s);}
  function _exportExpressRoute(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'expressroute');_exportShapeText(c,s);}
  function _exportAzureFirewall(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azurefirewall');_exportShapeText(c,s);}
  function _exportFrontDoor(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'frontdoor');_exportShapeText(c,s);}
  function _exportAzureDns(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azuredns');_exportShapeText(c,s);}
  function _exportBastion(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'bastion');_exportShapeText(c,s);}

  // === Azure Integration export renderers ===
  function _exportApim(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'apim');_exportShapeText(c,s);}
  function _exportServiceBus(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'servicebus');_exportShapeText(c,s);}
  function _exportEventGrid(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'eventgrid');_exportShapeText(c,s);}
  function _exportEventHubs(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'eventhubs');_exportShapeText(c,s);}
  function _exportLogicApps(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'logicapps');_exportShapeText(c,s);}
  function _exportAppConfig(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'appconfig');_exportShapeText(c,s);}

  // === Azure Security export renderers ===
  function _exportKeyVault(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'keyvault');_exportShapeText(c,s);}
  function _exportSentinel(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'sentinel');_exportShapeText(c,s);}
  function _exportDefender(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'defender');_exportShapeText(c,s);}
  function _exportEntraId(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'entraid');_exportShapeText(c,s);}
  function _exportManagedId(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'managedid');_exportShapeText(c,s);}

  // === Azure DevOps & Monitoring export renderers ===
  function _exportAzureDevops(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azuredevops');_exportShapeText(c,s);}
  function _exportAppInsights(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'appinsights');_exportShapeText(c,s);}
  function _exportLogAnalytics(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'loganalytics');_exportShapeText(c,s);}
  function _exportAzureMonitor(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azuremonitor');_exportShapeText(c,s);}
  function _exportLoadTest(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'loadtest');_exportShapeText(c,s);}

  // === Azure AI & ML export renderers ===
  function _exportOpenAi(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'openai');_exportShapeText(c,s);}
  function _exportCogServices(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'cogservices');_exportShapeText(c,s);}
  function _exportAzureMl(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'azureml');_exportShapeText(c,s);}
  function _exportBotService(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'botservice');_exportShapeText(c,s);}
  function _exportAiSearch(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'aisearch');_exportShapeText(c,s);}
  function _exportAiStudio(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'aistudio');_exportShapeText(c,s);}

  // === Azure IoT export renderers ===
  function _exportIotHub(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'iothub');_exportShapeText(c,s);}
  function _exportIotCentral(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'iotcentral');_exportShapeText(c,s);}
  function _exportDigitalTwins(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'digitaltwins');_exportShapeText(c,s);}
  function _exportIotEdge(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'iotedge');_exportShapeText(c,s);}

  // === Azure Analytics export renderers ===
  function _exportDatabricks(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'databricks');_exportShapeText(c,s);}
  function _exportHdInsight(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'hdinsight');_exportShapeText(c,s);}
  function _exportDataExplorer(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'dataexplorer');_exportShapeText(c,s);}
  function _exportPowerBi(c,rc,s,o){_exportBaseRect(rc,s,o);_exportAzureIcon(c,s,'powerbi');_exportShapeText(c,s);}

  function drawArrowHeadExport(ctx, fromX, fromY, toX, toY, color, strokeW) {
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
   * Save shapes to JSON and download
   */
  function toJSON(shapes) {
    const data = {
      version: 1,
      appName: 'SystemDraw',
      timestamp: new Date().toISOString(),
      shapes: shapes,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.download = 'system-diagram.json';
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }

  /**
   * Load shapes from JSON file
   */
  function fromJSON(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.shapes && Array.isArray(data.shapes)) {
          callback(data.shapes);
        } else {
          alert('Invalid SystemDraw file.');
        }
      } catch (err) {
        alert('Error reading file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  /**
   * Auto-save to localStorage
   */
  function autoSave(shapes) {
    try {
      localStorage.setItem('systemdraw_autosave', JSON.stringify(shapes));
    } catch (e) { /* quota exceeded, silently fail */ }
  }

  /**
   * Auto-load from localStorage
   */
  function autoLoad() {
    try {
      const data = localStorage.getItem('systemdraw_autosave');
      if (data) return JSON.parse(data);
    } catch (e) { /* ignore */ }
    return null;
  }

  return { toPNG, toJSON, fromJSON, autoSave, autoLoad };
})();
