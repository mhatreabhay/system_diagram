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
   * Draw a shape to an arbitrary context (for export)
   */
  function drawShapeToCtx(ctx, rc, shape) {
    const opts = {
      stroke: shape.strokeColor,
      strokeWidth: shape.strokeWidth,
      fill: shape.fillColor !== 'transparent' ? shape.fillColor : undefined,
      fillStyle: shape.fillColor !== 'transparent' ? 'hachure' : undefined,
      roughness: 1.2,
      seed: shape.seed,
    };

    ctx.globalAlpha = shape.opacity || 1;

    switch (shape.type) {
      case 'rectangle':
        rc.rectangle(shape.x, shape.y, shape.width, shape.height, opts);
        break;

      case 'ellipse': {
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        rc.ellipse(cx, cy, shape.width, shape.height, opts);
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
    }

    ctx.globalAlpha = 1;
  }

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
