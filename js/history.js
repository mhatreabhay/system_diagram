// ============================================================
// history.js — Undo / Redo stack
// ============================================================

const History = (() => {
  const MAX_STACK = 100;
  let undoStack = [];
  let redoStack = [];
  let onChange = null;

  /**
   * Set callback when history changes (to update UI buttons)
   */
  function setOnChange(fn) {
    onChange = fn;
  }

  /**
   * Push a snapshot of all shapes (deep clone)
   */
  function push(shapes) {
    undoStack.push(Utils.deepClone(shapes));
    if (undoStack.length > MAX_STACK) undoStack.shift();
    redoStack = []; // clear redo on new action
    if (onChange) onChange();
  }

  /**
   * Undo: returns the previous shapes state, or null
   */
  function undo(currentShapes) {
    if (undoStack.length === 0) return null;
    redoStack.push(Utils.deepClone(currentShapes));
    const prev = undoStack.pop();
    if (onChange) onChange();
    return prev;
  }

  /**
   * Redo: returns the next shapes state, or null
   */
  function redo(currentShapes) {
    if (redoStack.length === 0) return null;
    undoStack.push(Utils.deepClone(currentShapes));
    const next = redoStack.pop();
    if (onChange) onChange();
    return next;
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function clear() {
    undoStack = [];
    redoStack = [];
    if (onChange) onChange();
  }

  return { setOnChange, push, undo, redo, canUndo, canRedo, clear };
})();
