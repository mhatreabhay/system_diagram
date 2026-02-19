// ============================================================
// app.js — Application bootstrap, event wiring, toolbar sync
// ============================================================

(function () {
  'use strict';

  // === DOM References ===
  const canvas = document.getElementById('drawCanvas');
  const toolBtns = document.querySelectorAll('.tool-btn');
  const strokeColorInput = document.getElementById('strokeColor');
  const fillColorInput = document.getElementById('fillColor');
  const strokeWidthSelect = document.getElementById('strokeWidth');
  const strokeEnabledCheckbox = document.getElementById('strokeEnabled');
  const edgeStyleSelect = document.getElementById('edgeStyleSelect');
  const strokeDashSelect = document.getElementById('strokeDashSelect');
  const fillStyleSelect = document.getElementById('fillStyleSelect');
  const fontSizeSelect = document.getElementById('fontSizeSelect');
  const wordWrapCheckbox = document.getElementById('wordWrap');
  const strokeSwatch = document.getElementById('strokeSwatch');
  const fillSwatch = document.getElementById('fillSwatch');
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  const deleteBtn = document.getElementById('deleteBtn');
  const exportPngBtn = document.getElementById('exportPngBtn');
  const exportJsonBtn = document.getElementById('exportJsonBtn');
  const importJsonBtn = document.getElementById('importJsonBtn');
  const importFileInput = document.getElementById('importFileInput');
  const clearAllBtn = document.getElementById('clearAllBtn');
  const zoomInBtn = document.getElementById('zoomInBtn');
  const zoomOutBtn = document.getElementById('zoomOutBtn');
  const zoomResetBtn = document.getElementById('zoomResetBtn');
  const zoomLevel = document.getElementById('zoomLevel');
  const contextMenu = document.getElementById('contextMenu');
  const stylePanel = document.getElementById('stylePanel');
  const panelToggle = document.getElementById('panelToggle');

  // === Panning state ===
  let spaceHeld = false;
  let isPanning = false;
  let panStart = null;

  // === Panel toggle ===
  panelToggle.addEventListener('click', () => {
    stylePanel.classList.toggle('collapsed');
    // Re-measure canvas after panel toggle animation
    setTimeout(() => {
      CanvasView.handleResize();
      Tools.redraw();
    }, 220);
  });

  // === Initialize ===
  CanvasView.init(canvas);

  Tools.init(
    // redraw callback
    (shapes, selectedIds, selectionRect, anchorHintCtx) => {
      CanvasView.render(shapes, selectedIds, selectionRect, anchorHintCtx);
      updateZoomDisplay();
      Export.autoSave(shapes);
    },
    // tool change callback
    (tool) => {
      toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
      // Update canvas cursor for hand tool
      if (tool === 'hand') {
        canvas.style.cursor = 'grab';
      } else if (tool === 'select') {
        canvas.style.cursor = 'default';
      } else {
        canvas.style.cursor = 'crosshair';
      }
      // If switching back to select (e.g. after drawing), clear dropdown & ribbon highlights
      if (tool === 'select') {
        document.querySelectorAll('.ribbon-item').forEach(r => r.classList.remove('active'));
        document.querySelectorAll('.ribbon-category').forEach(c => c.classList.remove('active'));
      }
    }
  );

  // Load autosaved data
  const saved = Export.autoLoad();
  if (saved && Array.isArray(saved) && saved.length > 0) {
    Connectors.resolveAllBindings(saved);
    Tools.setShapes(saved);
    History.push(saved);
  }

  // History change callback
  History.setOnChange(() => {
    undoBtn.style.opacity = History.canUndo() ? '1' : '0.3';
    redoBtn.style.opacity = History.canRedo() ? '1' : '0.3';
  });

  // Initial render (deferred to let flex layout settle + canvas resize)
  requestAnimationFrame(() => {
    CanvasView.handleResize();
    Tools.redraw();
  });

  // === Text Alignment Buttons (in panel) ===
  const alignBtns = document.querySelectorAll('.panel-icon-btn.align-btn');
  alignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const align = btn.dataset.valign;
      Tools.setTextVAlign(align);
      alignBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Horizontal text alignment (left/center/right)
  const hAlignBtns = document.querySelectorAll('.panel-icon-btn.halign-btn');
  hAlignBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const align = btn.dataset.halign;
      Tools.setStyle('textHAlign', align);
      hAlignBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // === Left Shape Ribbon ===
  const ribbonItems = document.querySelectorAll('.ribbon-item');

  function positionRibbonFlyout(categoryEl) {
    const flyout = categoryEl.querySelector('.ribbon-flyout');
    const icon = categoryEl.querySelector('.ribbon-icon');
    if (!flyout || !icon) return;

    const margin = 8;
    const viewportH = window.innerHeight;
    const maxH = Math.max(140, viewportH - margin * 2);

    // Reset before measuring
    flyout.style.top = '0px';
    flyout.style.maxHeight = `${maxH}px`;
    flyout.style.overflowY = 'auto';
    flyout.style.overflowX = 'hidden';

    // Ensure it's measurable even if CSS hasn't flipped it visible yet
    const prevDisplay = flyout.style.display;
    const computedDisplay = window.getComputedStyle(flyout).display;
    if (computedDisplay === 'none') {
      flyout.style.visibility = 'hidden';
      flyout.style.display = 'block';
    }

    const iconRect = icon.getBoundingClientRect();
    const flyoutRect = flyout.getBoundingClientRect();
    const flyoutH = flyoutRect.height;

    // Flyout is positioned relative to the category's top which aligns with the icon.
    // Clamp so the flyout stays within [margin, viewportH - margin].
    const minOffset = margin - iconRect.top;
    const desiredOffset = viewportH - margin - flyoutH - iconRect.top;
    const topOffset = Math.min(0, Math.max(minOffset, desiredOffset));
    flyout.style.top = `${topOffset}px`;

    if (computedDisplay === 'none') {
      flyout.style.display = prevDisplay;
      flyout.style.visibility = '';
    }
  }

  // Keep long flyouts (like Kubernetes) on-screen.
  document.querySelectorAll('.ribbon-category').forEach(cat => {
    cat.addEventListener('mouseenter', () => {
      requestAnimationFrame(() => positionRibbonFlyout(cat));
    });
  });

  window.addEventListener('resize', () => {
    const hovered = document.querySelector('.ribbon-category:hover');
    if (hovered) positionRibbonFlyout(hovered);
  });

  ribbonItems.forEach(item => {
    item.addEventListener('click', () => {
      const systool = item.dataset.systool;
      Tools.setPendingLabel(item.dataset.label || null);
      Tools.setTool(systool);

      // Highlight active ribbon item
      ribbonItems.forEach(r => r.classList.remove('active'));
      item.classList.add('active');

      // Highlight category
      document.querySelectorAll('.ribbon-category').forEach(c => c.classList.remove('active'));
      item.closest('.ribbon-category').classList.add('active');

      // Clear active from other tool buttons
      toolBtns.forEach(b => b.classList.remove('active'));
    });
  });

  // === Toolbar Events ===

  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      Tools.setTool(btn.dataset.tool);
      Tools.setPendingLabel(null);
    });
  });

  strokeColorInput.addEventListener('input', (e) => {
    strokeSwatch.style.background = e.target.value;
    Tools.setStyle('strokeColor', e.target.value);
  });

  fillColorInput.addEventListener('input', (e) => {
    fillSwatch.style.background = e.target.value;
    fillSwatch.style.border = '2px solid #ccc';
    Tools.setStyle('fillColor', e.target.value);
  });

  strokeWidthSelect.addEventListener('change', (e) => {
    Tools.setStyle('strokeWidth', e.target.value);
  });

  strokeEnabledCheckbox.addEventListener('change', (e) => {
    // Checkbox is labeled "No border".
    // checked => no border => strokeEnabled=false
    const noBorder = !!e.target.checked;
    strokeWidthSelect.disabled = noBorder;
    strokeDashSelect.disabled = noBorder;
    Tools.setStyle('strokeEnabled', !noBorder);
  });

  edgeStyleSelect.addEventListener('change', (e) => {
    Tools.setStyle('edgeStyle', e.target.value);
  });

  strokeDashSelect.addEventListener('change', (e) => {
    Tools.setStyle('strokeDash', e.target.value);
  });

  fontSizeSelect.addEventListener('change', (e) => {
    Tools.setStyle('fontSize', e.target.value);
  });

  wordWrapCheckbox.addEventListener('change', (e) => {
    Tools.setStyle('wordWrap', !!e.target.checked);
  });

  fillStyleSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val !== 'none') {
      fillSwatch.style.background = fillColorInput.value;
      fillSwatch.style.border = '2px solid #ccc';
    } else {
      fillSwatch.style.background = 'transparent';
      fillSwatch.style.border = '2px dashed #888';
    }
    Tools.setStyle('shapeFillStyle', val);
  });

  undoBtn.addEventListener('click', () => Tools.undo());
  redoBtn.addEventListener('click', () => Tools.redo());
  deleteBtn.addEventListener('click', () => Tools.deleteSelected());

  clearAllBtn.addEventListener('click', () => {
    if (Tools.getShapes().length === 0) return;
    if (confirm('Clear the entire canvas? This cannot be undone.')) {
      History.push(Tools.getShapes());
      Tools.setShapes([]);
      Export.autoSave([]);
      Tools.redraw();
    }
  });

  exportPngBtn.addEventListener('click', () => Export.toPNG(Tools.getShapes()));
  exportJsonBtn.addEventListener('click', () => Export.toJSON(Tools.getShapes()));
  document.getElementById('exportArchBtn').addEventListener('click', () => Export.toArchitecture(Tools.getShapes()));
  importJsonBtn.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
      Export.fromJSON(e.target.files[0], (shapes) => {
        History.push(Tools.getShapes());
        Connectors.resolveAllBindings(shapes);
        Tools.setShapes(shapes);
        Tools.redraw();
      });
      e.target.value = '';
    }
  });

  // Zoom buttons
  zoomInBtn.addEventListener('click', () => {
    CanvasView.zoomAt(1.2, CanvasView.width / 2, CanvasView.height / 2);
    Tools.redraw();
  });

  zoomOutBtn.addEventListener('click', () => {
    CanvasView.zoomAt(0.8, CanvasView.width / 2, CanvasView.height / 2);
    Tools.redraw();
  });

  zoomResetBtn.addEventListener('click', () => {
    CanvasView.resetView();
    Tools.redraw();
  });

  function updateZoomDisplay() {
    zoomLevel.textContent = Math.round(CanvasView.getScale() * 100) + '%';
  }

  // === Canvas Pointer Events ===

  canvas.addEventListener('pointerdown', (e) => {
    // Space + click = pan, or hand tool active, or middle-click
    if (spaceHeld || e.button === 1 || Tools.getTool() === 'hand') {
      isPanning = true;
      panStart = { x: e.offsetX, y: e.offsetY };
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }

    if (e.button === 2) return; // right-click handled separately

    Tools.onPointerDown(e);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (isPanning && panStart) {
      const dx = e.offsetX - panStart.x;
      const dy = e.offsetY - panStart.y;
      CanvasView.pan(dx, dy);
      panStart = { x: e.offsetX, y: e.offsetY };
      Tools.redraw();
      return;
    }

    Tools.onPointerMove(e);
  });

  canvas.addEventListener('pointerup', (e) => {
    if (isPanning) {
      isPanning = false;
      panStart = null;
      const tool = Tools.getTool();
      canvas.style.cursor = spaceHeld || tool === 'hand' ? 'grab' : (tool === 'select' ? 'default' : 'crosshair');
      return;
    }

    Tools.onPointerUp(e);
  });

  // Scroll = pan, Ctrl+scroll = zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      CanvasView.zoomAt(factor, e.offsetX, e.offsetY);
    } else {
      // Pan
      CanvasView.pan(-e.deltaX, -e.deltaY);
    }
    Tools.redraw();
  }, { passive: false });

  // === Keyboard Shortcuts ===

  document.addEventListener('keydown', (e) => {
    // Ignore when typing in text input
    if (e.target.id === 'textInput') return;

    if (e.code === 'Space' && !spaceHeld) {
      spaceHeld = true;
      canvas.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    // Tool shortcuts
    if (!e.ctrlKey && !e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'v': Tools.setTool('select'); return;
        case 'r': Tools.setTool('rectangle'); return;
        case 'o': Tools.setTool('ellipse'); return;
        case 'd': Tools.setTool('diamond'); return;
        case 'l': Tools.setTool('line'); return;
        case 'a': Tools.setTool('arrow'); return;
        case 'p': Tools.setTool('freehand'); return;
        case 't': Tools.setTool('text'); return;
        case 'h': Tools.setTool('hand'); return;
      }
    }

    // Ctrl shortcuts
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'z':
          if (e.shiftKey) Tools.redo();
          else Tools.undo();
          e.preventDefault();
          return;
        case 'y':
          Tools.redo();
          e.preventDefault();
          return;
        case 'a':
          Tools.selectAll();
          e.preventDefault();
          return;
        case 'c':
          Tools.copySelected();
          e.preventDefault();
          return;
        case 'v':
          Tools.pasteClipboard();
          e.preventDefault();
          return;
        case 'x':
          Tools.cutSelected();
          e.preventDefault();
          return;
        case 'd':
          Tools.duplicateSelected();
          e.preventDefault();
          return;
      }
    }

    // Enter — edit text inside selected shape
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      const selIds = Tools.getSelectedIds();
      if (selIds.size === 1 && Tools.getTool() === 'select') {
        const shapes = Tools.getShapes();
        const shape = shapes.find(s => s.id === [...selIds][0]);
        if (shape && Shapes.CONTAINER_TYPES.has(shape.type)) {
          Tools.editShapeText(shape);
          e.preventDefault();
          return;
        }
      }
    }

    // Delete / Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      Tools.deleteSelected();
      e.preventDefault();
    }

    // Escape
    if (e.key === 'Escape') {
      Tools.finishTextEditing();
      Tools.setTool('select');
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      const tool = Tools.getTool();
      canvas.style.cursor = tool === 'hand' ? 'grab' : (tool === 'select' ? 'default' : 'crosshair');
    }
  });

  // === Context Menu ===

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const world = CanvasView.screenToWorld(e.offsetX, e.offsetY);

    // Select shape under cursor if not already selected
    let found = false;
    const shapes = Tools.getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (Shapes.hitTest(shapes[i], world.x, world.y, 6 / CanvasView.getScale())) {
        if (!Tools.getSelectedIds().has(shapes[i].id)) {
          Tools.getSelectedIds().clear();
          Tools.getSelectedIds().add(shapes[i].id);
          Tools.redraw();
        }
        found = true;
        break;
      }
    }

    if (!found) return;

    contextMenu.style.display = 'block';
    contextMenu.style.left = e.clientX + 'px';
    contextMenu.style.top = e.clientY + 'px';
  });

  document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
  });

  contextMenu.querySelectorAll('.ctx-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      switch (action) {
        case 'duplicate': Tools.duplicateSelected(); break;
        case 'delete': Tools.deleteSelected(); break;
        case 'bringFront': Tools.bringToFront(); break;
        case 'sendBack': Tools.sendToBack(); break;
      }
      contextMenu.style.display = 'none';
    });
  });

  // Double-click to edit text in shapes
  canvas.addEventListener('dblclick', (e) => {
    const world = CanvasView.screenToWorld(e.offsetX, e.offsetY);
    const shapes = Tools.getShapes();
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (Shapes.hitTest(shapes[i], world.x, world.y)) {
        const shape = shapes[i];
        // Container shapes — use in-shape text editor
        if (Shapes.CONTAINER_TYPES.has(shape.type)) {
          Tools.editShapeText(shape);
          break;
        }
        // Standalone text shape — inline editor
        if (shape.type === 'text') {
          const input = document.getElementById('textInput');
          const screen = CanvasView.worldToScreen(shape.x, shape.y);
          input.style.display = 'block';
          input.style.left = screen.x + 'px';
          input.style.top = (screen.y + 48) + 'px';
          input.style.fontSize = (shape.fontSize * CanvasView.getScale()) + 'px';
          input.style.textAlign = 'left';
          input.value = shape.text;
          input.focus();
          input.select();

          const shapeRef = shape;
          input.onblur = () => {
            if (input.value.trim()) {
              History.push(shapes);
              shapeRef.text = input.value;
              const ctx = canvas.getContext('2d');
              ctx.font = `${shapeRef.fontSize}px ${shapeRef.fontFamily}`;
              const lines = shapeRef.text.split('\n');
              let maxW = 0;
              for (const line of lines) {
                maxW = Math.max(maxW, ctx.measureText(line).width);
              }
              shapeRef.width = maxW + 8;
              shapeRef.height = lines.length * shapeRef.fontSize * 1.4;
            }
            input.style.display = 'none';
            input.style.width = '';
            input.style.height = '';
            Tools.redraw();
          };
          input.onkeydown = (ke) => {
            if (ke.key === 'Escape') input.blur();
          };
          break;
        }
      }
    }
  });

  // === Prevent leaving with unsaved ===
  window.addEventListener('beforeunload', (e) => {
    const shapes = Tools.getShapes();
    if (shapes.length > 0) {
      Export.autoSave(shapes);
    }
  });

})();
