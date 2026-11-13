import {
  canRedo,
  canUndo,
  clearEdits,
  createEditHistory,
  pushEdit,
  redoEdit,
  undoEdit,
} from '../editHistory';

test('empty history cannot undo or redo', () => {
  const history = createEditHistory();
  expect(canUndo(history)).toBe(false);
  expect(canRedo(history)).toBe(false);
  expect(undoEdit(history)).toBeNull();
  expect(redoEdit(history)).toBeNull();
});

test('supports multiple undo and redo steps', () => {
  const history = createEditHistory();
  pushEdit(history, 'a');
  pushEdit(history, 'b');
  pushEdit(history, 'c');

  expect(undoEdit(history)).toBe('c');
  expect(undoEdit(history)).toBe('b');
  expect(canUndo(history)).toBe(true);
  expect(canRedo(history)).toBe(true);

  expect(redoEdit(history)).toBe('b');
  expect(redoEdit(history)).toBe('c');
  expect(canRedo(history)).toBe(false);
  expect(undoEdit(history)).toBe('c');
});

test('a new edit discards redo entries', () => {
  const history = createEditHistory();
  pushEdit(history, 'a');
  pushEdit(history, 'b');
  undoEdit(history);
  undoEdit(history);
  pushEdit(history, 'x');

  expect(canUndo(history)).toBe(true);
  expect(canRedo(history)).toBe(false);
  expect(undoEdit(history)).toBe('x');
  expect(canUndo(history)).toBe(false);
  expect(redoEdit(history)).toBe('x');
  expect(history.entries).toEqual(['x']);
});

test('clearEdits resets the stack', () => {
  const history = createEditHistory();
  pushEdit(history, 'a');
  undoEdit(history);
  clearEdits(history);

  expect(history.entries).toEqual([]);
  expect(history.cursor).toBe(0);
  expect(canUndo(history)).toBe(false);
  expect(canRedo(history)).toBe(false);
});
