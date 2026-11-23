import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './ModelLabels.css';

export const MAX_LABEL_LENGTH = 500;

// Saved positions are world coordinates. Only their screen projection changes.
export function projectLabel(label, vtk, rect) {
  const view = vtk.renderWindow.getViews()[0];
  const [width, height] = view.getFramebufferSize();
  if (!rect.width || !rect.height || !width || !height) return null;

  const camera = vtk.renderer.getActiveCamera();
  const offset = label.position.map((value, axis) => value - camera.getPosition()[axis]);
  const depth = offset.reduce(
    (sum, value, axis) => sum + value * camera.getDirectionOfProjection()[axis], 0
  );
  const [near, far] = camera.getClippingRange();
  if (depth < near || depth > far) return null;

  const display = view.worldToDisplay(...label.position, vtk.renderer);
  const x = display[0] * rect.width / width;
  const y = rect.height - display[1] * rect.height / height;
  if (![x, y].every(Number.isFinite) || x < 0 || x > rect.width || y < 0 || y > rect.height) {
    return null;
  }

  const initial = vtk.initialCameraState;
  const referenceDistance = initial
    ? Math.hypot(...initial.position.map((value, axis) => value - initial.focalPoint[axis]))
    : 1;
  // Orthographic zoom changes parallelScale without moving the camera.
  const zoom = camera.getParallelProjection() && initial
    ? initial.parallelScale / camera.getParallelScale()
    : 1;
  const scale = Math.max(0.55, Math.min(1, 0.85 * referenceDistance * zoom / Math.max(Math.hypot(...offset), 0.001)));
  return { x, y, scale, opacity: 0.3 + (scale - 0.55) / 0.45 * 0.6 };
}

function ModelLabels({ vtk, disabled, busy, labels, pickPosition, onChange, onEditingChange, resetKey, children }) {
  const viewportRef = useRef(null);
  const inputRef = useRef(null);
  const [editing, setEditing] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [focusedId, setFocusedId] = useState(null);
  const [layout, setLayout] = useState({ positions: {}, width: 0, height: 0 });
  const [status, setStatus] = useState('');
  const isEditing = Boolean(editing);
  const pendingId = editing && !editing.before ? editing.id : null;
  const pendingPosition = pendingId ? editing.position : null;
  const displayed = useMemo(() => pendingId
    ? [...labels, { id: pendingId, position: pendingPosition }]
    : labels, [labels, pendingId, pendingPosition]);

  useEffect(() => {
    setEditing(null);
    setHoveredId(null);
    setFocusedId(null);
    setStatus('');
  }, [resetKey]);

  useEffect(() => {
    onEditingChange(isEditing);
    return () => onEditingChange(false);
  }, [isEditing, onEditingChange]);

  const editingId = editing?.id;
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => {
    if (!vtk || disabled) return undefined;
    const update = () => {
      const rect = viewportRef.current.getBoundingClientRect();
      const positions = {};
      displayed.forEach((label) => { positions[label.id] = projectLabel(label, vtk, rect); });
      setLayout({ positions, width: rect.width, height: rect.height });
    };
    update();
    const cameraSubscription = vtk.renderer.getActiveCamera().onModified(update);
    const resizeSubscription = vtk.genericRenderWindow.onResize(update);
    // A panel/layout change need not resize the browser window.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(viewportRef.current);
    return () => {
      cameraSubscription.unsubscribe();
      resizeSubscription.unsubscribe();
      observer?.disconnect();
    };
  }, [vtk, disabled, displayed]);

  const finishEditing = useCallback(() => {
    if (!editing) return;
    const text = editing.text.trim();
    if (text && text !== editing.before?.text) {
      onChange({
        type: 'label',
        labelId: editing.id,
        before: editing.before,
        after: { id: editing.id, text, position: [...editing.position] },
      });
    }
    setEditing(null);
    setFocusedId(null);
  }, [editing, onChange]);

  const startEditing = (label) => {
    if (disabled || busy) return;
    if (editing?.id === label.id) {
      inputRef.current?.focus();
      return;
    }
    finishEditing();
    setEditing({ ...label, before: label });
    setStatus('');
  };

  const handleContextMenu = (event) => {
    event.preventDefault();
    if (event.target.closest('[data-model-label]') || disabled || busy) return;
    finishEditing();
    const hit = pickPosition(event);
    if (!hit) {
      setStatus('Right-click a visible part of the model to add a label.');
      return;
    }
    setEditing({
      id: `label-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`,
      text: '',
      position: [...hit.position],
      before: null,
    });
    setStatus('');
  };

  const reserveRightButton = (event) => {
    if (event.button === 2 && !event.target.closest('[data-model-label]')) {
      event.stopPropagation();
    }
  };

  return (
    <div
      ref={viewportRef}
      className="model-label-viewport"
      data-testid="model-label-viewport"
      onContextMenu={handleContextMenu}
      onPointerDownCapture={reserveRightButton}
      onPointerUpCapture={reserveRightButton}
      onMouseDownCapture={reserveRightButton}
      onMouseUpCapture={reserveRightButton}
    >
      {children}
      {!disabled && <div className="model-label-overlay" aria-label="Model labels">
        {displayed.map((label) => {
          const projected = layout.positions[label.id];
          if (!projected) return null;
          const active = editing?.id === label.id;
          const highlighted = active || hoveredId === label.id || focusedId === label.id;
          const alignRight = projected.x > layout.width / 2;
          const below = projected.y < 90;
          return (
            <div
              key={label.id}
              data-model-label={label.id}
              className={`model-label-anchor${highlighted ? ' is-highlighted' : ''}`}
              style={{ left: projected.x, top: projected.y, zIndex: highlighted ? 2 : 1 }}
              onMouseEnter={() => setHoveredId(label.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(label.id)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setFocusedId(null);
                  if (active) finishEditing();
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                startEditing(label);
              }}
            >
              <svg className="model-label-leader" aria-hidden="true" style={{ overflow: 'visible' }}>
                <line x1="0" y1="0" x2={alignRight ? -12 : 12} y2={below ? 12 : -12} />
                <circle cx="0" cy="0" r="3" />
              </svg>
              <div
                className="model-label-card"
                style={{
                  [alignRight ? 'right' : 'left']: 12,
                  [below ? 'top' : 'bottom']: 12,
                  maxWidth: Math.max(40, Math.min(240,
                    (alignRight ? projected.x : layout.width - projected.x) - 16)),
                  maxHeight: Math.max(40, Math.min(180,
                    (below ? layout.height - projected.y : projected.y) - 16)),
                  transformOrigin: `${alignRight ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`,
                  transform: `scale(${highlighted ? 1 : projected.scale})`,
                  opacity: highlighted ? 1 : projected.opacity,
                }}
              >
                {active ? (
                  <div className="model-label-editor">
                    <div className="model-label-editor-row">
                      <input
                        ref={inputRef}
                        autoFocus
                        aria-label="Label text"
                        placeholder="Type a label"
                        maxLength={MAX_LABEL_LENGTH}
                        value={editing.text}
                        onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.nativeEvent.isComposing) return;
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            finishEditing();
                          } else if (event.key === 'Escape') {
                            event.preventDefault();
                            setEditing(null);
                            setFocusedId(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="model-label-delete"
                        aria-label="Delete label"
                        title="Delete label"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          if (editing.before) {
                            onChange({ type: 'label', labelId: label.id, before: editing.before, after: null });
                          }
                          setEditing(null);
                          setHoveredId(null);
                          setFocusedId(null);
                        }}
                      >×</button>
                    </div>
                    <span className="model-label-hint">Enter to save · Esc to cancel</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="model-label-text"
                    title="Right-click to edit label"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === 'F2') {
                        event.preventDefault();
                        startEditing(label);
                      }
                    }}
                  >{label.text}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>}
      {status && <div role="status" className="model-label-status">{status}</div>}
    </div>
  );
}

export default ModelLabels;
