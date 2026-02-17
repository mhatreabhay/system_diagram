// ============================================================
// tools.js — Drawing tool state machine & interaction logic
// ============================================================

const Tools = (() => {
  let currentTool = 'select';
  let shapes = [];
  let selectedIds = new Set();

  // Drag state
  let isDragging = false;
  let dragType = null; // 'draw', 'move', 'resize', 'pan', 'select-rect'
  let dragHandle = null;
  let dragStartWorld = null;
  let dragStartScreen = null;
  let dragShape = null;
  let dragOrigShapes = null; // snapshot for move
  let selectionRect = null;
  let drawingShape = null;

  // Live cursor position in world coords (for anchor hints)
  let cursorWorld = null;

  // Style state (synced from toolbar)
  let strokeColor = '#1e1e1e';
  let fillColor = '#ffffff';
  let fillEnabled = false;
  let strokeWidth = 0.5;
  let edgeStyle = 'sharp';      // 'sharp' | 'round'
  let strokeDash = 'solid';     // 'solid' | 'dashed' | 'dotted' | 'dashdot'
  let shapeFillStyle = 'none';  // 'none' | 'solid' | 'hachure' | 'cross-hatch' | 'zigzag'

  // Pending label for system shapes (set before draw, applied after)
  let pendingShapeLabel = null;

  // Text editing state
  let editingTextShape = null;

  // Callbacks
  let onRedraw = null;
  let onToolChange = null;

  function init(redrawFn, toolChangeFn) {
    onRedraw = redrawFn;
    onToolChange = toolChangeFn;
  }

  function setTool(tool) {
    finishTextEditing();
    currentTool = tool;
    if (tool !== 'select') {
      selectedIds.clear();
    }
    if (onToolChange) onToolChange(tool);
    redraw();
  }

  function getTool() { return currentTool; }
  function getShapes() { return shapes; }
  function setShapes(s) { shapes = s; }
  function getSelectedIds() { return selectedIds; }
  function getSelectionRect() { return selectionRect; }

  function setStyle(prop, value) {
    switch (prop) {
      case 'strokeColor': strokeColor = value; break;
      case 'fillColor': fillColor = value; break;
      case 'fillEnabled': fillEnabled = !!value; break;
      case 'strokeWidth': strokeWidth = parseFloat(value); break;
      case 'edgeStyle': edgeStyle = value; break;
      case 'strokeDash': strokeDash = value; break;
      case 'shapeFillStyle': shapeFillStyle = value; fillEnabled = value !== 'none'; break;
    }
    // Apply to selected shapes
    for (const id of selectedIds) {
      const s = shapes.find(s => s.id === id);
      if (s) {
        if (prop === 'strokeColor') s.strokeColor = value;
        if (prop === 'fillColor') s.fillColor = value;
        if (prop === 'strokeWidth') s.strokeWidth = parseFloat(value);
        if (prop === 'edgeStyle') s.edgeStyle = value;
        if (prop === 'strokeDash') s.strokeDash = value;
        if (prop === 'shapeFillStyle') {
          s.shapeFillStyle = value;
          s.fillColor = value !== 'none' ? fillColor : 'transparent';
        }
      }
    }
    if (selectedIds.size > 0) {
      History.push(shapes);
      redraw();
    }
  }

  function redraw() {
    // Build anchor hint context if drawing/moving/resizing an arrow/line
    let anchorHintCtx = null;
    const tool = currentTool;
    const isArrowTool = (tool === 'arrow' || tool === 'line') || (drawingShape && (drawingShape.type === 'arrow' || drawingShape.type === 'line'));
    const isDraggingArrow = isDragging && (dragType === 'move' || dragType === 'resize') && _isSelectedArrowOrLine();
    if (isArrowTool || isDraggingArrow) {
      anchorHintCtx = {
        cursorWorld: cursorWorld,
        snapTarget: drawingShape ? drawingShape._hoverSnap : null,
      };
    }
    if (onRedraw) onRedraw(shapes, selectedIds, selectionRect, anchorHintCtx);
  }

  /** Check if current selection contains an arrow or line */
  function _isSelectedArrowOrLine() {
    for (const id of selectedIds) {
      const s = shapes.find(sh => sh.id === id);
      if (s && (s.type === 'arrow' || s.type === 'line')) return true;
    }
    return false;
  }

  // === MOUSE EVENTS ===

  function onPointerDown(e) {
    const screenX = e.offsetX;
    const screenY = e.offsetY;
    const world = CanvasView.screenToWorld(screenX, screenY);

    dragStartWorld = { ...world };
    dragStartScreen = { x: screenX, y: screenY };

    // Middle-button or space+click → pan
    if (e.button === 1) {
      isDragging = true;
      dragType = 'pan';
      return;
    }

    // Right-click → context menu (handled in app.js)
    if (e.button === 2) return;

    switch (currentTool) {
      case 'select':
        handleSelectDown(world, e.shiftKey);
        break;

      case 'rectangle':
      case 'ellipse':
      case 'diamond':
      case 'database':
      case 'queue':
      case 'cache':
      case 'server':
      case 'cloud':
      case 'firewall':
      case 'loadbalancer':
      case 'apigateway':
      case 'cdn':
      case 'user':
      case 'microservice':
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
        drawingShape = Shapes.create(currentTool, {
          x: world.x, y: world.y,
          width: 0, height: 0,
          strokeColor,
          fillColor: fillEnabled ? fillColor : 'transparent',
          strokeWidth, edgeStyle, strokeDash, shapeFillStyle,
        });
        isDragging = true;
        dragType = 'draw';
        break;

      case 'line':
      case 'arrow': {
        // Snap start point to nearest boundary point if close
        let startPt = { x: world.x, y: world.y };
        let startBinding = null;
        const startSnap = Connectors.findNearestBoundaryPoint(shapes, world.x, world.y);
        if (startSnap) {
          startPt = { x: startSnap.x, y: startSnap.y };
          startBinding = { shapeId: startSnap.shapeId, angle: startSnap.angle };
        }
        drawingShape = Shapes.create(currentTool, {
          points: [{ ...startPt }, { ...startPt }],
          strokeColor, strokeWidth, strokeDash,
          arrowHead: currentTool === 'arrow',
          startBinding,
        });
        isDragging = true;
        dragType = 'draw';
        break;
      }

      case 'freehand':
        drawingShape = Shapes.create('freehand', {
          points: [{ x: world.x, y: world.y }],
          strokeColor, strokeWidth, strokeDash,
        });
        isDragging = true;
        dragType = 'draw';
        break;

      case 'text':
        handleTextClick(world);
        break;
    }
  }

  function onPointerMove(e) {
    // Track cursor world position for anchor hint rendering
    cursorWorld = CanvasView.screenToWorld(e.offsetX, e.offsetY);

    if (!isDragging) {
      updateCursor(e);
      return;
    }

    const screenX = e.offsetX;
    const screenY = e.offsetY;
    const world = CanvasView.screenToWorld(screenX, screenY);

    switch (dragType) {
      case 'pan': {
        const dx = screenX - dragStartScreen.x;
        const dy = screenY - dragStartScreen.y;
        CanvasView.pan(dx, dy);
        dragStartScreen = { x: screenX, y: screenY };
        redraw();
        break;
      }

      case 'draw':
        handleDrawMove(world);
        break;

      case 'move':
        handleMoveMove(world);
        break;

      case 'resize':
        handleResizeMove(world);
        break;

      case 'select-rect': {
        const bounds = Utils.normalizeBounds(
          dragStartWorld.x, dragStartWorld.y, world.x, world.y
        );
        selectionRect = bounds;
        redraw();
        break;
      }
    }
  }

  function onPointerUp(e) {
    if (!isDragging) return;

    const world = CanvasView.screenToWorld(e.offsetX, e.offsetY);

    switch (dragType) {
      case 'draw':
        finishDraw(world);
        break;

      case 'move':
        _tryRebindArrowsAfterMove();
        History.push(shapes);
        break;

      case 'resize':
        _tryRebindAfterResize(world);
        History.push(shapes);
        break;

      case 'select-rect':
        finishSelectRect();
        break;
    }

    isDragging = false;
    dragType = null;
    dragHandle = null;
    drawingShape = null;
    dragOrigShapes = null;
    selectionRect = null;
    redraw();
  }

  // === SELECT TOOL ===

  function handleSelectDown(world, shiftKey) {
    // Check if clicking a handle on selected shape
    for (const id of selectedIds) {
      const shape = shapes.find(s => s.id === id);
      if (!shape) continue;
      const handle = Shapes.getHandleAtPoint(shape, world.x, world.y, 8 / CanvasView.getScale());
      if (handle) {
        isDragging = true;
        dragType = 'resize';
        dragHandle = handle;
        dragShape = shape;
        return;
      }
    }

    // Check if clicking on a shape (reverse order = top-most first)
    let clickedShape = null;
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (Shapes.hitTest(shapes[i], world.x, world.y, 6 / CanvasView.getScale())) {
        clickedShape = shapes[i];
        break;
      }
    }

    if (clickedShape) {
      if (shiftKey) {
        if (selectedIds.has(clickedShape.id)) {
          selectedIds.delete(clickedShape.id);
        } else {
          selectedIds.add(clickedShape.id);
        }
      } else {
        if (!selectedIds.has(clickedShape.id)) {
          selectedIds.clear();
          selectedIds.add(clickedShape.id);
        }
      }
      isDragging = true;
      dragType = 'move';
      dragOrigShapes = Utils.deepClone(
        shapes.filter(s => selectedIds.has(s.id))
      );
      History.push(shapes);
      redraw();
    } else {
      if (!shiftKey) selectedIds.clear();
      isDragging = true;
      dragType = 'select-rect';
      selectionRect = { x: world.x, y: world.y, w: 0, h: 0 };
      redraw();
    }
  }

  // === DRAWING ===

  function handleDrawMove(world) {
    if (!drawingShape) return;

    switch (drawingShape.type) {
      case 'rectangle':
      case 'ellipse':
      case 'diamond':
      case 'database':
      case 'queue':
      case 'cache':
      case 'server':
      case 'cloud':
      case 'firewall':
      case 'loadbalancer':
      case 'apigateway':
      case 'cdn':
      case 'user':
      case 'microservice':
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
        const bounds = Utils.normalizeBounds(
          dragStartWorld.x, dragStartWorld.y, world.x, world.y
        );
        drawingShape.x = bounds.x;
        drawingShape.y = bounds.y;
        drawingShape.width = bounds.w;
        drawingShape.height = bounds.h;
        break;
      }

      case 'line':
      case 'arrow': {
        // Snap end point to nearest boundary point
        const endSnap = Connectors.findNearestBoundaryPoint(shapes, world.x, world.y,
          drawingShape.startBinding ? [drawingShape.startBinding.shapeId] : []);
        if (endSnap) {
          drawingShape.points[1] = { x: endSnap.x, y: endSnap.y };
          drawingShape._hoverSnap = endSnap; // temp ref for finishDraw
        } else {
          drawingShape.points[1] = { x: world.x, y: world.y };
          drawingShape._hoverSnap = null;
        }
        break;
      }

      case 'freehand':
        drawingShape.points.push({ x: world.x, y: world.y });
        break;
    }

    // Temporarily render the in-progress shape
    CanvasView.render(
      [...shapes, drawingShape],
      selectedIds,
      null,
      (drawingShape.type === 'arrow' || drawingShape.type === 'line')
        ? { cursorWorld: cursorWorld, snapTarget: drawingShape._hoverSnap || null }
        : null
    );
  }

  function finishDraw(world) {
    if (!drawingShape) return;

    // Reject tiny shapes (accidental clicks)
    let tooSmall = false;
    if (Shapes.CONTAINER_TYPES.has(drawingShape.type)) {
      if (drawingShape.width < 5 && drawingShape.height < 5) tooSmall = true;
    } else if ((drawingShape.type === 'line' || drawingShape.type === 'arrow') && drawingShape.points) {
      const d = Utils.distance(
        drawingShape.points[0].x, drawingShape.points[0].y,
        drawingShape.points[1].x, drawingShape.points[1].y
      );
      if (d < 5) tooSmall = true;
    } else if (drawingShape.type === 'freehand' && drawingShape.points) {
      if (drawingShape.points.length < 3) tooSmall = true;
    }

    if (!tooSmall) {
      // Store end binding if arrow/line snapped to a boundary point
      if ((drawingShape.type === 'line' || drawingShape.type === 'arrow') && drawingShape._hoverSnap) {
        drawingShape.endBinding = {
          shapeId: drawingShape._hoverSnap.shapeId,
          angle: drawingShape._hoverSnap.angle,
        };
      }
      delete drawingShape._hoverSnap;

      // Apply pending label for system shapes (e.g. "SQL", "NoSQL")
      if (pendingShapeLabel && Shapes.CONTAINER_TYPES.has(drawingShape.type)) {
        drawingShape.text = pendingShapeLabel;
      }

      History.push(shapes);
      shapes.push(drawingShape);
      selectedIds.clear();
      selectedIds.add(drawingShape.id);
    }

    // Switch back to select after drawing (Excalidraw behavior)
    setTool('select');
  }

  // === MOVE ===

  function handleMoveMove(world) {
    const dx = world.x - dragStartWorld.x;
    const dy = world.y - dragStartWorld.y;

    for (const orig of dragOrigShapes) {
      const shape = shapes.find(s => s.id === orig.id);
      if (!shape) continue;

      if (shape.points) {
        shape.points = orig.points.map(p => ({
          x: p.x + dx,
          y: p.y + dy,
        }));
        // When dragging an arrow/line directly, detach its bindings
        if (shape.type === 'arrow' || shape.type === 'line') {
          shape.startBinding = null;
          shape.endBinding = null;
        }
      } else {
        shape.x = orig.x + dx;
        shape.y = orig.y + dy;
      }

      // Update any arrows/lines bound to this shape
      Connectors.updateBindings(shapes, shape.id);
    }
    redraw();
  }

  // === RESIZE ===

  function handleResizeMove(world) {
    const dx = world.x - dragStartWorld.x;
    const dy = world.y - dragStartWorld.y;
    dragStartWorld = { ...world };

    // If dragging an arrow/line endpoint, snap to boundary points
    if ((dragShape.type === 'arrow' || dragShape.type === 'line') && dragShape.points &&
        (dragHandle === 'lineStart' || dragHandle === 'lineEnd')) {
      const excludeIds = [dragShape.id];
      const snap = Connectors.findNearestBoundaryPoint(shapes, world.x, world.y, excludeIds);
      if (snap) {
        if (dragHandle === 'lineStart') {
          dragShape.points[0] = { x: snap.x, y: snap.y };
        } else {
          dragShape.points[dragShape.points.length - 1] = { x: snap.x, y: snap.y };
        }
      } else {
        Shapes.resize(dragShape, dragHandle, dx, dy);
      }
    } else {
      Shapes.resize(dragShape, dragHandle, dx, dy);
    }
    // Update any arrows/lines bound to this shape
    Connectors.updateBindings(shapes, dragShape.id);
    redraw();
  }

  /**
   * After finishing a move of arrow/line shapes, try to re-bind
   * their endpoints to nearby shape boundaries.
   */
  function _tryRebindArrowsAfterMove() {
    for (const id of selectedIds) {
      const shape = shapes.find(s => s.id === id);
      if (!shape) continue;
      if (shape.type !== 'arrow' && shape.type !== 'line') continue;
      if (!shape.points || shape.points.length < 2) continue;

      const excludeIds = [shape.id];

      // Try start endpoint
      const startPt = shape.points[0];
      const startSnap = Connectors.findNearestBoundaryPoint(shapes, startPt.x, startPt.y, excludeIds);
      if (startSnap) {
        shape.points[0] = { x: startSnap.x, y: startSnap.y };
        shape.startBinding = { shapeId: startSnap.shapeId, angle: startSnap.angle };
      } else {
        shape.startBinding = null;
      }

      // Try end endpoint
      const endPt = shape.points[shape.points.length - 1];
      const endSnap = Connectors.findNearestBoundaryPoint(shapes, endPt.x, endPt.y, excludeIds);
      if (endSnap) {
        shape.points[shape.points.length - 1] = { x: endSnap.x, y: endSnap.y };
        shape.endBinding = { shapeId: endSnap.shapeId, angle: endSnap.angle };
      } else {
        shape.endBinding = null;
      }
    }
  }

  /**
   * After finishing a resize (endpoint drag) on an arrow/line,
   * try to bind the dragged endpoint.
   */
  function _tryRebindAfterResize(world) {
    if (!dragShape) return;
    if (dragShape.type !== 'arrow' && dragShape.type !== 'line') return;
    if (!dragShape.points || dragShape.points.length < 2) return;
    if (dragHandle !== 'lineStart' && dragHandle !== 'lineEnd') return;

    const excludeIds = [dragShape.id];
    const pt = dragHandle === 'lineStart'
      ? dragShape.points[0]
      : dragShape.points[dragShape.points.length - 1];
    const snap = Connectors.findNearestBoundaryPoint(shapes, pt.x, pt.y, excludeIds);

    if (dragHandle === 'lineStart') {
      if (snap) {
        dragShape.points[0] = { x: snap.x, y: snap.y };
        dragShape.startBinding = { shapeId: snap.shapeId, angle: snap.angle };
      } else {
        dragShape.startBinding = null;
      }
    } else {
      if (snap) {
        dragShape.points[dragShape.points.length - 1] = { x: snap.x, y: snap.y };
        dragShape.endBinding = { shapeId: snap.shapeId, angle: snap.angle };
      } else {
        dragShape.endBinding = null;
      }
    }
  }

  // === SELECTION RECT ===

  function finishSelectRect() {
    if (!selectionRect) return;

    for (const shape of shapes) {
      const b = Shapes.getBounds(shape);
      if (Utils.rectsOverlap(selectionRect, b)) {
        selectedIds.add(shape.id);
      }
    }
    selectionRect = null;
  }

  // === TEXT ===

  function handleTextClick(world) {
    const input = document.getElementById('textInput');
    const screen = CanvasView.worldToScreen(world.x, world.y);

    input.style.display = 'block';
    input.style.left = (screen.x) + 'px';
    input.style.top = (screen.y + 48) + 'px'; // offset for toolbar
    input.style.fontSize = (16 * CanvasView.getScale()) + 'px';
    input.style.textAlign = 'left';
    input.value = '';
    input.focus();

    editingTextShape = Shapes.create('text', {
      x: world.x,
      y: world.y,
      text: '',
      strokeColor,
      fontSize: 16,
    });
    _editingInShapeRef = null; // standalone text, not in-shape

    input.onblur = () => finishTextEditing();
    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        input.blur();
      }
    };
    input.oninput = () => {
      if (editingTextShape) {
        editingTextShape.text = input.value;
      }
    };
  }

  // Reference to the container shape being text-edited (null for standalone text)
  let _editingInShapeRef = null;

  /**
   * Start editing text inside a container shape (rectangle, ellipse, diamond).
   * Called when Enter is pressed with a shape selected, or on double-click.
   */
  function editShapeText(shape) {
    if (!shape) return;
    // Only container shapes can hold text
    if (!Shapes.CONTAINER_TYPES.has(shape.type)) return;

    const input = document.getElementById('textInput');
    const b = Shapes.getBounds(shape);
    const scale = CanvasView.getScale();
    const screenTL = CanvasView.worldToScreen(b.x, b.y);

    input.style.display = 'block';
    input.style.left = screenTL.x + 'px';
    input.style.top = (screenTL.y + 48) + 'px';
    input.style.width = (b.w * scale) + 'px';
    input.style.height = (b.h * scale) + 'px';
    input.style.fontSize = ((shape.fontSize || 16) * scale) + 'px';
    input.style.textAlign = 'center';
    input.value = shape.text || '';
    input.focus();
    input.select();

    _editingInShapeRef = shape;
    editingTextShape = null; // not creating a new text shape

    input.onblur = () => _finishShapeTextEditing();
    input.onkeydown = (e) => {
      if (e.key === 'Escape') {
        input.blur();
      }
    };
  }

  function _finishShapeTextEditing() {
    const input = document.getElementById('textInput');
    if (!_editingInShapeRef) return;

    History.push(shapes);
    _editingInShapeRef.text = input.value;

    _editingInShapeRef = null;
    input.style.display = 'none';
    input.style.width = '';
    input.style.height = '';
    input.value = '';
    redraw();
  }

  function finishTextEditing() {
    // If editing text inside a shape, use that handler
    if (_editingInShapeRef) {
      _finishShapeTextEditing();
      return;
    }

    const input = document.getElementById('textInput');
    if (!editingTextShape) return;

    if (input.value.trim()) {
      editingTextShape.text = input.value;
      // Measure text to set width/height
      const canvas = document.getElementById('drawCanvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `${editingTextShape.fontSize}px ${editingTextShape.fontFamily}`;
      const lines = editingTextShape.text.split('\n');
      let maxW = 0;
      for (const line of lines) {
        const m = ctx.measureText(line);
        maxW = Math.max(maxW, m.width);
      }
      editingTextShape.width = maxW + 8;
      editingTextShape.height = lines.length * editingTextShape.fontSize * 1.4;

      History.push(shapes);
      shapes.push(editingTextShape);
    }

    editingTextShape = null;
    input.style.display = 'none';
    input.style.width = '';
    input.style.height = '';
    input.value = '';
    setTool('select');
  }

  /**
   * Set text vertical alignment on selected shapes
   */
  function setTextVAlign(align) {
    if (selectedIds.size === 0) return;
    History.push(shapes);
    for (const id of selectedIds) {
      const s = shapes.find(sh => sh.id === id);
      if (s && (Shapes.CONTAINER_TYPES.has(s.type) || s.type === 'text')) {
        s.textVAlign = align;
      }
    }
    redraw();
  }

  function setPendingLabel(label) {
    pendingShapeLabel = label;
  }

  // === CURSOR ===

  function updateCursor(e) {
    const canvas = document.getElementById('drawCanvas');
    if (currentTool === 'hand') {
      canvas.style.cursor = 'grab';
      return;
    }
    if (currentTool !== 'select') {
      canvas.style.cursor = 'crosshair';
      return;
    }

    const world = CanvasView.screenToWorld(e.offsetX, e.offsetY);

    // Check resize handles
    for (const id of selectedIds) {
      const shape = shapes.find(s => s.id === id);
      if (!shape) continue;
      const handle = Shapes.getHandleAtPoint(shape, world.x, world.y, 8 / CanvasView.getScale());
      if (handle) {
        const cursors = {
          nw: 'nwse-resize', se: 'nwse-resize',
          ne: 'nesw-resize', sw: 'nesw-resize',
          n: 'ns-resize', s: 'ns-resize',
          e: 'ew-resize', w: 'ew-resize',
          lineStart: 'grab', lineEnd: 'grab',
        };
        canvas.style.cursor = cursors[handle] || 'move';
        return;
      }
    }

    // Check hover on shape
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (Shapes.hitTest(shapes[i], world.x, world.y, 6 / CanvasView.getScale())) {
        canvas.style.cursor = 'move';
        return;
      }
    }

    canvas.style.cursor = 'default';
  }

  // === ACTIONS ===

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    History.push(shapes);
    // Clean up bindings referencing deleted shapes
    const deletedIds = new Set(selectedIds);
    for (const shape of shapes) {
      if (deletedIds.has(shape.id)) continue;
      if (shape.startBinding && deletedIds.has(shape.startBinding.shapeId)) {
        shape.startBinding = null;
      }
      if (shape.endBinding && deletedIds.has(shape.endBinding.shapeId)) {
        shape.endBinding = null;
      }
    }
    shapes = shapes.filter(s => !selectedIds.has(s.id));
    selectedIds.clear();
    redraw();
  }

  function duplicateSelected() {
    if (selectedIds.size === 0) return;
    History.push(shapes);
    const newIds = new Set();
    for (const id of selectedIds) {
      const orig = shapes.find(s => s.id === id);
      if (!orig) continue;
      const copy = Utils.deepClone(orig);
      copy.id = Utils.generateId();
      copy.seed = Math.floor(Math.random() * 2147483647);
      Shapes.move(copy, 20, 20);
      shapes.push(copy);
      newIds.add(copy.id);
    }
    selectedIds.clear();
    for (const id of newIds) selectedIds.add(id);
    redraw();
  }

  function bringToFront() {
    if (selectedIds.size === 0) return;
    History.push(shapes);
    const sel = shapes.filter(s => selectedIds.has(s.id));
    shapes = shapes.filter(s => !selectedIds.has(s.id));
    shapes.push(...sel);
    redraw();
  }

  function sendToBack() {
    if (selectedIds.size === 0) return;
    History.push(shapes);
    const sel = shapes.filter(s => selectedIds.has(s.id));
    shapes = shapes.filter(s => !selectedIds.has(s.id));
    shapes.unshift(...sel);
    redraw();
  }

  function selectAll() {
    selectedIds.clear();
    for (const s of shapes) selectedIds.add(s.id);
    redraw();
  }

  function undo() {
    const prev = History.undo(shapes);
    if (prev) {
      shapes = prev;
      selectedIds.clear();
      redraw();
    }
  }

  function redo() {
    const next = History.redo(shapes);
    if (next) {
      shapes = next;
      selectedIds.clear();
      redraw();
    }
  }

  return {
    init,
    setTool,
    getTool,
    getShapes,
    setShapes,
    getSelectedIds,
    getSelectionRect,
    setStyle,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    deleteSelected,
    duplicateSelected,
    bringToFront,
    sendToBack,
    selectAll,
    undo,
    redo,
    redraw,
    finishTextEditing,
    editShapeText,
    setTextVAlign,
    setPendingLabel,
    getCursorWorld() { return cursorWorld; },
  };
})();
