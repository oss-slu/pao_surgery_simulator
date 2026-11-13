export function createEditHistory() {
  return { entries: [], cursor: 0 };
}

export function canUndo(history) {
  return history.cursor > 0;
}

export function canRedo(history) {
  return history.cursor < history.entries.length;
}

export function pushEdit(history, entry) {
  history.entries.length = history.cursor;
  history.entries.push(entry);
  history.cursor = history.entries.length;
}

export function undoEdit(history) {
  if (!canUndo(history)) return null;
  history.cursor -= 1;
  return history.entries[history.cursor];
}

export function redoEdit(history) {
  if (!canRedo(history)) return null;
  const entry = history.entries[history.cursor];
  history.cursor += 1;
  return entry;
}

export function clearEdits(history) {
  history.entries = [];
  history.cursor = 0;
}
