import React, { useRef, useEffect, useState, useCallback } from 'react';
import { sessionFetch } from '../sessionApi';
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  clearEdits,
  createEditHistory,
  pushEdit,
  redoEdit,
  undoEdit,
} from '../editHistory';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { vec3 } from 'gl-matrix';

function findVolumePosition(event, container, renderWindow, renderer, imageData, ofun) {
  if (!imageData) return null;

  const rect = container.getBoundingClientRect();
  const view = renderWindow.getViews()[0];
  const viewportSize = view.getViewportSize(renderer);
  if (!rect.width || !rect.height || !viewportSize[0] || !viewportSize[1]) return null;

  const aspect = viewportSize[0] / viewportSize[1];
  const camera = renderer.getActiveCamera();
  const cameraPosition = camera.getPosition();
  const focalPoint = camera.getFocalPoint();
  const focalDisplay = renderer.worldToNormalizedDisplay(
    focalPoint[0], focalPoint[1], focalPoint[2], aspect
  );
  const selectionZ = view.normalizedDisplayToDisplay(...focalDisplay)[2];
  const selection = view.displayToNormalizedDisplay(
    (event.clientX - rect.left) * viewportSize[0] / rect.width,
    (rect.bottom - event.clientY) * viewportSize[1] / rect.height,
    selectionZ
  );
  const pickPosition = renderer.normalizedDisplayToWorld(
    selection[0], selection[1], selection[2], aspect
  );
  const direction = [
    focalPoint[0] - cameraPosition[0],
    focalPoint[1] - cameraPosition[1],
    focalPoint[2] - cameraPosition[2],
  ];
  const directionLength = Math.hypot(...direction);
  if (!directionLength) return null;
  for (let axis = 0; axis < 3; axis += 1) direction[axis] /= directionLength;

  const ray = pickPosition.map((value, axis) => value - cameraPosition[axis]);
  const rayLength = ray.reduce((sum, value, axis) => sum + value * direction[axis], 0);
  if (!rayLength) return null;

  const clippingRange = camera.getClippingRange();
  const nearDistance = camera.getParallelProjection()
    ? clippingRange[0] - rayLength
    : clippingRange[0] / rayLength;
  const farDistance = camera.getParallelProjection()
    ? clippingRange[1] - rayLength
    : clippingRange[1] / rayLength;
  const start = camera.getParallelProjection()
    ? pickPosition.map((value, axis) => value + nearDistance * direction[axis])
    : cameraPosition.map((value, axis) => value + nearDistance * ray[axis]);
  const end = camera.getParallelProjection()
    ? pickPosition.map((value, axis) => value + farDistance * direction[axis])
    : cameraPosition.map((value, axis) => value + farDistance * ray[axis]);

  const bounds = imageData.getBounds();
  const rayVector = end.map((value, axis) => value - start[axis]);
  let first = 0;
  let last = 1;
  for (let axis = 0; axis < 3; axis += 1) {
    if (rayVector[axis] === 0) {
      if (start[axis] < bounds[axis * 2] || start[axis] > bounds[axis * 2 + 1]) return null;
      continue;
    }
    let entry = (bounds[axis * 2] - start[axis]) / rayVector[axis];
    let exit = (bounds[axis * 2 + 1] - start[axis]) / rayVector[axis];
    if (entry > exit) [entry, exit] = [exit, entry];
    first = Math.max(first, entry);
    last = Math.min(last, exit);
    if (first > last) return null;
  }

  const spacing = imageData.getSpacing().map(Math.abs).filter((value) => value > 0);
  const sampleStep = Math.max(Math.min(...spacing) * 0.5, 0.01);
  const sampleCount = Math.max(1, Math.ceil(
    Math.hypot(...rayVector) * (last - first) / sampleStep
  ));
  const dimensions = imageData.getDimensions();
  const scalars = imageData.getPointData().getScalars();

  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const ratio = first + (last - first) * sample / sampleCount;
    const worldPosition = start.map((value, axis) => value + ratio * rayVector[axis]);
    const index = imageData.worldToIndex(worldPosition);
    const x = Math.round(index[0]);
    const y = Math.round(index[1]);
    const z = Math.round(index[2]);
    if (
      x < 0 || x >= dimensions[0] ||
      y < 0 || y >= dimensions[1] ||
      z < 0 || z >= dimensions[2]
    ) continue;

    const scalar = scalars.getComponent(x + dimensions[0] * (y + dimensions[1] * z), 0);
    if (ofun.getValue(scalar) >= 0.05) {
      const rayLength = Math.hypot(...rayVector);
      return {
        position: worldPosition,
        viewDirection: rayVector.map((value) => value / rayLength),
      };
    }
  }
  return null;
}

function applyStraightCut(imageData, {
  start,
  end,
  depthDirection,
  thickness,
  emptyValue = -1000,
}) {
  const isVector = (v) =>
    v?.length === 3 && Array.from(v).every(Number.isFinite);

  if (![start, end, depthDirection].every(isVector)) {
    throw new Error(
      'Start, end, and depthDirection must be finite 3D vectors.'
    );
  }

  if (!Number.isFinite(thickness) || thickness <= 0) {
    throw new Error('Thickness must be greater than zero.');
  }

  if (!Number.isFinite(emptyValue)) {
    throw new Error('The empty value must be finite.');
  }

  const scalars = imageData?.getPointData()?.getScalars();

  if (!scalars || scalars.getNumberOfComponents() !== 1) {
    throw new Error(
      'A volume with one scalar value per sample is required.'
    );
  }

  // Direction and length of the drawn segment.
  const along = vec3.subtract([0, 0, 0], end, start);
  const length = vec3.length(along);

  if (length < 1e-8 || vec3.length(depthDirection) < 1e-8) {
    throw new Error(
      'The segment and depth direction must have nonzero length.'
    );
  }

  vec3.normalize(along, along);
  const depth = vec3.normalize([0, 0, 0], depthDirection);

  if (Math.abs(vec3.dot(along, depth)) > 1e-6) {
    throw new Error(
      'The cut segment must be perpendicular to its depth direction.'
    );
  }

  // Direction across the blade's thickness.
  const across = vec3.cross([0, 0, 0], along, depth);
  vec3.normalize(across, across);

  const values = scalars.getData();
  const [iMin, iMax, jMin, jMax, kMin, kMax] =
    imageData.getExtent();

  const indices = [];
  const previousValues = [];
  const point = [0, 0, 0];
  const offset = [0, 0, 0];

  // Small tolerance for floating-point rounding at boundaries.
  const epsilon = 1e-6 * Math.max(1, length, thickness);
  let index = 0;

  // VTK stores samples with I changing fastest, then J, then K.
  for (let k = kMin; k <= kMax; k++) {
    for (let j = jMin; j <= jMax; j++) {
      for (let i = iMin; i <= iMax; i++, index++) {
        // Account for the image's spacing, origin, and orientation.
        imageData.indexToWorld([i, j, k], point);
        vec3.subtract(offset, point, start);

        const distanceAlong = vec3.dot(offset, along);
        const distanceAcross = vec3.dot(offset, across);

        const inside =
          distanceAlong >= -epsilon &&
          distanceAlong <= length + epsilon &&
          Math.abs(distanceAcross) <= thickness / 2 + epsilon;

        if (!inside || values[index] === emptyValue) {
          continue;
        }

        indices.push(index);
        previousValues.push(values[index]);
        values[index] = emptyValue;
      }
    }
  }

  if (indices.length > 0) {
    scalars.dataChange();
    imageData.modified();
  }

  return {
    indices: Uint32Array.from(indices),
    previousValues: values.constructor.from(previousValues),
    emptyValue,
  };
}

function getCutPointerPosition(event, vtk) {
  const rect = event.currentTarget.getBoundingClientRect();
  const view = vtk.renderWindow.getViews()[0];
  const [width, height] = view.getFramebufferSize();

  if (!rect.width || !rect.height || !width || !height) {
    return null;
  }

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const camera = vtk.renderer.getActiveCamera();
  const focalPoint = camera.getFocalPoint();

  const displayDepth = view.worldToDisplay(
    ...focalPoint,
    vtk.renderer
  )[2];

  const world = view.displayToWorld(
    (x / rect.width) * width,
    (1 - y / rect.height) * height,
    displayDepth,
    vtk.renderer
  );

  return {
    x,
    y,
    world,
    height: rect.height,
    inside:
      x >= 0 &&
      x <= rect.width &&
      y >= 0 &&
      y <= rect.height,
  };
}

function CutOverlay({ vtk, thickness, onCut, status, onStatusChange, onDragChange }) {
  const dragRef = useRef(null);
  const [preview, setPreview] = useState(null);

  const cancelDrag = useCallback(() => {
    const drag = dragRef.current;

    dragRef.current = null;
    setPreview(null);
    onDragChange(false);

    if (drag?.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId);
    }
  }, [onDragChange]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        cancelDrag();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', cancelDrag);
    window.addEventListener('resize', cancelDrag);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', cancelDrag);
      window.removeEventListener('resize', cancelDrag);
      cancelDrag();
    };
  }, [cancelDrag]);

  const handlePointerDown = (event) => {
    if (
      event.button !== 0 ||
      !event.isPrimary ||
      dragRef.current
    ) {
      return;
    }

    const start = getCutPointerPosition(event, vtk);
    if (!start) return;

    event.preventDefault();

    const camera = vtk.renderer.getActiveCamera();

    dragRef.current = {
      pointerId: event.pointerId,
      element: event.currentTarget,
      start,
      thickness,
      depthDirection: [...camera.getDirectionOfProjection()],
    };

    event.currentTarget.setPointerCapture(event.pointerId);

    onDragChange(true);
    onStatusChange('');
    setPreview({
      start,
      end: start,
      width:
        thickness *
        start.height /
        (2 * camera.getParallelScale()),
    });
  };

  const handlePointerMove = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    const end = getCutPointerPosition(event, vtk);

    if (end) {
      setPreview((current) =>
        current ? { ...current, end } : current
      );
    }
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;

    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      event.button !== 0
    ) {
      return;
    }

    const end = getCutPointerPosition(event, vtk);

    cancelDrag();

    // Ignore releases outside the viewer and tiny gestures.
    if (
      !end ||
      !end.inside ||
      Math.hypot(
        end.x - drag.start.x,
        end.y - drag.start.y
      ) < 3
    ) {
      return;
    }

    try {
      const imageData = vtk.mapper.getInputData();
      const cut = applyStraightCut(
        imageData,
        {
          start: drag.start.world,
          end: end.world,
          depthDirection: drag.depthDirection,
          thickness: drag.thickness,
        }
      );

      if (cut.indices.length > 0) {
        onCut({ imageData, ...cut });
      }
      vtk.renderWindow.render();

      onStatusChange(
        cut.indices.length
          ? `${cut.indices.length.toLocaleString()} samples changed.`
          : 'No new samples changed.'
      );
    } catch (cutError) {
      onStatusChange(cutError.message);
    }
  };

  return (
    <>
      <svg
        aria-label="Cut drawing area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          zIndex: 5,
          cursor: 'crosshair',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <rect
          width="100%"
          height="100%"
          fill="transparent"
        />

        {preview && (
          <g pointerEvents="none">
            <line
              x1={preview.start.x}
              y1={preview.start.y}
              x2={preview.end.x}
              y2={preview.end.y}
              stroke="#ff5555"
              strokeOpacity="0.3"
              strokeWidth={preview.width}
              strokeLinecap="butt"
            />

            <line
              x1={preview.start.x}
              y1={preview.start.y}
              x2={preview.end.x}
              y2={preview.end.y}
              stroke="#ff5555"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
          </g>
        )}
      </svg>

      {status && (
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            zIndex: 6,
            color: 'white',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '0.5rem',
            pointerEvents: 'none',
          }}
        >
          {status}
        </div>
      )}
    </>
  );
}

function VTKViewer({
  modelUrl,
  label,
  onMarkerStrokeAdded,
  onMarkerStrokeRemoved,
}) {
  const vtkContainerRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const context = useRef(null);
  const onMarkerStrokeAddedRef = useRef(onMarkerStrokeAdded);
  const onMarkerStrokeRemovedRef = useRef(onMarkerStrokeRemoved);
  const drawingRef = useRef(false);
  const previousPositionRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const strokesRef = useRef([]);
  const drawStrokesRef = useRef(null);
  const editHistoryRef = useRef(createEditHistory());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emphasizeDenseTissue, setEmphasizeDenseTissue] = useState(false);
  const [activeTool, setActiveTool] = useState('navigate');
  const [markerColor, setMarkerColor] = useState('#ff0000');
  const [cutThickness, setCutThickness] = useState(3);
  const [isVolumeReady, setIsVolumeReady] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [cutStatus, setCutStatus] = useState('');
  const [isCutDragging, setIsCutDragging] = useState(false);
  const [isMarkerDrawing, setIsMarkerDrawing] = useState(false);

  onMarkerStrokeAddedRef.current = onMarkerStrokeAdded;
  onMarkerStrokeRemovedRef.current = onMarkerStrokeRemoved;

  const toolsDisabled = !modelUrl || !isVolumeReady || isLoading || Boolean(error);
  const historyToolActive = activeTool === 'cut' || activeTool === 'marker';
  const historyBusy = isCutDragging || isMarkerDrawing;

  const syncHistoryButtons = useCallback(() => {
    const history = editHistoryRef.current;
    setCanUndo(historyCanUndo(history));
    setCanRedo(historyCanRedo(history));
  }, []);

  const recordCut = useCallback((cut) => {
    if (cut.imageData !== context.current?.mapper.getInputData()) return;

    pushEdit(editHistoryRef.current, { type: 'cut', ...cut });
    syncHistoryButtons();
  }, [syncHistoryButtons]);

  const applyCutEntry = useCallback((cut, mode) => {
    const { mapper, renderWindow } = context.current;
    const imageData = mapper.getInputData();
    if (cut.imageData !== imageData) return false;

    const scalars = imageData.getPointData().getScalars();
    const values = scalars.getData();
    for (let i = 0; i < cut.indices.length; i++) {
      values[cut.indices[i]] =
        mode === 'undo' ? cut.previousValues[i] : cut.emptyValue;
    }

    scalars.dataChange();
    imageData.modified();
    renderWindow.render();
    return true;
  }, []);

  const applyMarkerStrokeEntry = useCallback((entry, mode) => {
    if (mode === 'undo') {
      strokesRef.current = strokesRef.current.filter(
        (stroke) => stroke.strokeId !== entry.strokeId
      );
      drawStrokesRef.current?.();
      onMarkerStrokeRemovedRef.current?.(entry.strokeId);
      return;
    }

    strokesRef.current = [
      ...strokesRef.current.filter((stroke) => stroke.strokeId !== entry.strokeId),
      {
        strokeId: entry.strokeId,
        color: entry.color,
        points: entry.points.slice(),
        markers: entry.markers.slice(),
      },
    ];
    drawStrokesRef.current?.();
    onMarkerStrokeAddedRef.current?.({
      strokeId: entry.strokeId,
      markers: entry.markers.slice(),
    });
  }, []);

  const handleUndo = useCallback(() => {
    if (toolsDisabled || !historyToolActive || historyBusy || !context.current) {
      return;
    }

    const history = editHistoryRef.current;
    if (!historyCanUndo(history)) return;

    const entry = history.entries[history.cursor - 1];
    if (!entry) return;

    if (entry.type === 'cut') {
      if (!applyCutEntry(entry, 'undo')) return;
      undoEdit(history);
      syncHistoryButtons();
      setCutStatus('Last cut undone.');
      return;
    }

    if (entry.type === 'markerStroke') {
      undoEdit(history);
      applyMarkerStrokeEntry(entry, 'undo');
      syncHistoryButtons();
      setCutStatus('Last marker stroke undone.');
    }
  }, [
    toolsDisabled,
    historyToolActive,
    historyBusy,
    applyCutEntry,
    applyMarkerStrokeEntry,
    syncHistoryButtons,
  ]);

  const handleRedo = useCallback(() => {
    if (toolsDisabled || !historyToolActive || historyBusy || !context.current) {
      return;
    }

    const history = editHistoryRef.current;
    if (!historyCanRedo(history)) return;

    const entry = history.entries[history.cursor];
    if (!entry) return;

    if (entry.type === 'cut') {
      if (!applyCutEntry(entry, 'redo')) return;
      redoEdit(history);
      syncHistoryButtons();
      setCutStatus('Last cut redone.');
      return;
    }

    if (entry.type === 'markerStroke') {
      redoEdit(history);
      applyMarkerStrokeEntry(entry, 'redo');
      syncHistoryButtons();
      setCutStatus('Last marker stroke redone.');
    }
  }, [
    toolsDisabled,
    historyToolActive,
    historyBusy,
    applyCutEntry,
    applyMarkerStrokeEntry,
    syncHistoryButtons,
  ]);

  useEffect(() => {
    const genericRenderWindow = vtkGenericRenderWindow.newInstance({
      background: [0.0, 0.0, 0.0],
    });
    genericRenderWindow.setContainer(vtkContainerRef.current);

    const renderer = genericRenderWindow.getRenderer();
    renderer.getActiveCamera().setParallelProjection(true);
    const renderWindow = genericRenderWindow.getRenderWindow();
    const mapper = vtkVolumeMapper.newInstance();
    const actor = vtkVolume.newInstance();
    actor.setMapper(mapper);

    const ctfun = vtkColorTransferFunction.newInstance();
    ctfun.addRGBPoint(-1000, 0.0, 0.0, 0.0);
    ctfun.addRGBPoint(400, 1.0, 0.9, 0.8);
    ctfun.addRGBPoint(3000, 1.0, 1.0, 1.0);

    const ofun = vtkPiecewiseFunction.newInstance();
    ofun.addPoint(-1000, 0.0);
    ofun.addPoint(200, 0.0);
    ofun.addPoint(400, 0.3);
    ofun.addPoint(800, 0.9);

    actor.getProperty().setRGBTransferFunction(0, ctfun);
    actor.getProperty().setScalarOpacity(0, ofun);
    actor.getProperty().setInterpolationTypeToLinear();
    context.current = {
      genericRenderWindow,
      renderWindow,
      mapper,
      renderer,
      actor,
      ofun,
      volumeAttached: false,
    };

    return () => {
      genericRenderWindow.delete();
      context.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeTool !== 'cut' || !context.current) {
      return undefined;
    }

    const interactor = context.current.renderWindow.getInteractor();
    const style = interactor.getInteractorStyle();
    const wasEnabled = style.getEnabled();

    style.setEnabled(false);

    return () => {
      if (!style.isDeleted()) {
        style.setEnabled(wasEnabled);
      }
    };
  }, [activeTool]);

  useEffect(() => {
    if (!historyToolActive) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (historyBusy || toolsDisabled) return;
      if (!(event.ctrlKey || event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [historyToolActive, historyBusy, toolsDisabled, handleUndo, handleRedo]);

  useEffect(() => {
    const container = vtkContainerRef.current;
    const canvas = drawingCanvasRef.current;
    const current = context.current;
    if (!container || !canvas || !current) return undefined;

    const drawStrokes = () => {
      const rect = canvas.getBoundingClientRect();
      const pixelRatio = window.devicePixelRatio || 1;
      const width = Math.round(rect.width * pixelRatio);
      const height = Math.round(rect.height * pixelRatio);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      const context2d = canvas.getContext('2d');
      if (!context2d) return;
      context2d.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context2d.clearRect(0, 0, rect.width, rect.height);
      if (!current.imageData || !rect.width || !rect.height) return;

      const view = current.renderWindow.getViews()[0];
      const framebufferSize = view.getFramebufferSize();
      const scaleX = framebufferSize[0] / rect.width;
      const scaleY = framebufferSize[1] / rect.height;

      strokesRef.current.forEach((stroke) => {
        if (!stroke.points.length) return;
        const projectedPoints = stroke.points.map((point) => {
          const displayPoint = view.worldToDisplay(
            point[0], point[1], point[2], current.renderer
          );
          return [
            displayPoint[0] / scaleX,
            rect.height - displayPoint[1] / scaleY,
          ];
        });

        context2d.lineCap = 'round';
        context2d.lineJoin = 'round';
        context2d.lineWidth = 5;
        context2d.strokeStyle = '#111111';
        context2d.beginPath();
        projectedPoints.forEach(([x, y], index) => {
          if (index === 0) context2d.moveTo(x, y);
          else context2d.lineTo(x, y);
        });
        if (projectedPoints.length === 1) {
          context2d.lineTo(projectedPoints[0][0] + 0.1, projectedPoints[0][1] + 0.1);
        }
        context2d.stroke();

        context2d.lineWidth = 3;
        context2d.strokeStyle = stroke.color;
        context2d.beginPath();
        projectedPoints.forEach(([x, y], index) => {
          if (index === 0) context2d.moveTo(x, y);
          else context2d.lineTo(x, y);
        });
        if (projectedPoints.length === 1) {
          context2d.lineTo(projectedPoints[0][0] + 0.1, projectedPoints[0][1] + 0.1);
        }
        context2d.stroke();
      });
    };

    const cameraSubscription = current.renderer.getActiveCamera().onModified(drawStrokes);
    const resizeSubscription = current.genericRenderWindow.onResize(drawStrokes);
    drawStrokesRef.current = drawStrokes;

    const stopVtkMouseEvent = (event) => {
      if (activeTool !== 'marker') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const addMarkerAt = (event) => {
      const vtk = context.current;
      if (!vtk?.imageData || !vtk.renderer) return;
      const hit = findVolumePosition(
        event, container, vtk.renderWindow, vtk.renderer, vtk.imageData, vtk.ofun
      );
      if (!hit) return;
      const { position } = hit;

      const spacing = vtk.imageData.getSpacing().map(Math.abs).filter((value) => value > 0);
      const lastPosition = previousPositionRef.current;
      const minimumDistance = Math.min(...spacing) * 0.25;
      if (
        lastPosition &&
        Math.hypot(...position.map((value, axis) => value - lastPosition[axis])) < minimumDistance
      ) return;

      previousPositionRef.current = position;
      if (!activeStrokeRef.current) {
        const strokeId = `${Date.now()}-${Math.random()}`;
        activeStrokeRef.current = {
          strokeId,
          color: markerColor,
          points: [],
          markers: [],
        };
        strokesRef.current.push(activeStrokeRef.current);
      }
      const stroke = activeStrokeRef.current;
      stroke.points.push(position);
      stroke.markers.push({
        id: `${stroke.strokeId}-${stroke.points.length - 1}`,
        strokeId: stroke.strokeId,
        coordinates: { x: position[0], y: position[1], z: position[2] },
        color: markerColor,
      });
      drawStrokes();
    };

    const finishMarkerStroke = () => {
      drawingRef.current = false;
      setIsMarkerDrawing(false);
      previousPositionRef.current = null;
      const stroke = activeStrokeRef.current;
      activeStrokeRef.current = null;
      if (!stroke?.points.length) return;

      const entry = {
        type: 'markerStroke',
        strokeId: stroke.strokeId,
        color: stroke.color,
        points: stroke.points.slice(),
        markers: stroke.markers.slice(),
      };
      pushEdit(editHistoryRef.current, entry);
      syncHistoryButtons();
      onMarkerStrokeAddedRef.current?.({
        strokeId: stroke.strokeId,
        markers: stroke.markers.slice(),
      });
    };

    const handlePointerDown = (event) => {
      if (activeTool !== 'marker' || event.button !== 0) return;
      stopVtkMouseEvent(event);
      drawingRef.current = true;
      setIsMarkerDrawing(true);
      previousPositionRef.current = null;
      activeStrokeRef.current = null;
      addMarkerAt(event);
      container.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event) => {
      if (activeTool === 'marker' && drawingRef.current) {
        stopVtkMouseEvent(event);
        addMarkerAt(event);
      }
    };
    const handlePointerUp = (event) => {
      if (activeTool !== 'marker' || !drawingRef.current) return;
      stopVtkMouseEvent(event);
      finishMarkerStroke();
    };

    container.addEventListener('pointerdown', handlePointerDown, true);
    container.addEventListener('pointermove', handlePointerMove, true);
    container.addEventListener('pointerup', handlePointerUp, true);
    container.addEventListener('pointercancel', handlePointerUp, true);
    container.addEventListener('mousedown', stopVtkMouseEvent, true);
    container.addEventListener('mousemove', stopVtkMouseEvent, true);
    container.addEventListener('mouseup', stopVtkMouseEvent, true);
    return () => {
      container.removeEventListener('pointerdown', handlePointerDown, true);
      container.removeEventListener('pointermove', handlePointerMove, true);
      container.removeEventListener('pointerup', handlePointerUp, true);
      container.removeEventListener('pointercancel', handlePointerUp, true);
      container.removeEventListener('mousedown', stopVtkMouseEvent, true);
      container.removeEventListener('mousemove', stopVtkMouseEvent, true);
      container.removeEventListener('mouseup', stopVtkMouseEvent, true);
      cameraSubscription.unsubscribe();
      resizeSubscription.unsubscribe();
      if (drawStrokesRef.current === drawStrokes) {
        drawStrokesRef.current = null;
      }
      if (drawingRef.current) {
        finishMarkerStroke();
      } else {
        drawingRef.current = false;
        setIsMarkerDrawing(false);
        previousPositionRef.current = null;
        activeStrokeRef.current = null;
      }
    };
  }, [activeTool, markerColor, syncHistoryButtons]);

  useEffect(() => {
    if (!context.current) return;

    const { ofun, renderWindow } = context.current;
    ofun.addPoint(400, emphasizeDenseTissue ? 0.75 : 0.3);
    renderWindow.render();
  }, [emphasizeDenseTissue]);

  useEffect(() => {
    if (!modelUrl || !context.current) return undefined;

    const controller = new AbortController();
    const { genericRenderWindow, mapper, renderer, renderWindow, actor } = context.current;
    if (context.current.volumeAttached) {
      renderer.removeVolume(actor);
      context.current.volumeAttached = false;
      renderWindow.render();
    }
    context.current.imageData = null;
    strokesRef.current = [];
    setIsLoading(true);
    setError('');
    setIsVolumeReady(false);
    setActiveTool('navigate');
    clearEdits(editHistoryRef.current);
    setCanUndo(false);
    setCanRedo(false);
    setCutStatus('');
    setIsCutDragging(false);
    setIsMarkerDrawing(false);

    const loadVolume = async () => {
      try {
        const response = await sessionFetch(modelUrl, { signal: controller.signal });
        if (!response.ok) throw new Error(`The render service returned ${response.status}.`);

        const reader = vtkXMLImageDataReader.newInstance();
        reader.parseAsArrayBuffer(await response.arrayBuffer());
        const imageData = reader.getOutputData(0);
        const scalars = imageData?.getPointData()?.getScalars();
        if (!scalars || imageData.getNumberOfPoints() === 0) {
          throw new Error('The render service returned an invalid or empty VTI volume.');
        }

        if (controller.signal.aborted || !context.current) return;
        mapper.setInputData(imageData);
        context.current.imageData = imageData;
        renderer.addVolume(actor);
        context.current.volumeAttached = true;
        genericRenderWindow.resize();
        renderer.resetCamera();
        renderWindow.render();
        drawingCanvasRef.current?.getContext('2d')?.clearRect(
          0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height
        );
        setIsVolumeReady(true);
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          console.error('Error loading VTI file:', loadError);
          setError(loadError.message || 'Unable to load the 3D volume.');
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    loadVolume();
    return () => controller.abort();
  }, [modelUrl]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}>
      <div
        ref={vtkContainerRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: activeTool === 'navigate' ? 'grab' : 'crosshair',
        }}
      />

      <canvas
        ref={drawingCanvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />

      {activeTool === 'cut' &&
        !toolsDisabled &&
        context.current && (
          <CutOverlay
            key={modelUrl}
            vtk={context.current}
            thickness={cutThickness}
            onCut={recordCut}
            status={cutStatus}
            onStatusChange={setCutStatus}
            onDragChange={setIsCutDragging}
          />
        )}

      <fieldset
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          zIndex: 10,
          margin: 0,
          padding: '0.65rem 0.85rem',
          background: 'rgba(15, 52, 96, 0.94)',
          border: '1px solid #4a90d9',
          borderRadius: '6px',
          color: '#ffffff',
        }}
      >
        <legend style={{ padding: '0 0.25rem', fontSize: '0.85rem' }}>Control panel</legend>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
          Tool
          <select
            aria-label="Tool"
            value={activeTool}
            onChange={(event) => setActiveTool(event.target.value)}
          >
            <option value="navigate">Navigate</option>
            <option value="marker">Marker</option>
            <option value="cut">Cut</option>
          </select>
        </label>
        {activeTool === 'marker' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Marker color
            <input
              aria-label="Marker color"
              type="color"
              value={markerColor}
              disabled={toolsDisabled || isMarkerDrawing}
              onChange={(event) => setMarkerColor(event.target.value)}
            />
          </label>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
          <input
            type="checkbox"
            checked={emphasizeDenseTissue}
            onChange={(event) => setEmphasizeDenseTissue(event.target.checked)}
          />
          Emphasize dense tissue
        </label>
        <div
          role="group"
          aria-label="Viewer tools"
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginTop: '0.85rem',
          }}
        >
          <button
            type="button"
            aria-pressed={activeTool === 'navigate'}
            disabled={toolsDisabled}
            onClick={() => setActiveTool('navigate')}
            style={{
              background: activeTool === 'navigate' ? '#4a90d9' : '#16213e',
              color: '#ffffff',
              padding: '0.4rem 0.7rem',
            }}
          >
            Navigate
          </button>

          <button
            type="button"
            aria-pressed={activeTool === 'marker'}
            disabled={toolsDisabled}
            onClick={() => setActiveTool('marker')}
            style={{
              background: activeTool === 'marker' ? '#4a90d9' : '#16213e',
              color: '#ffffff',
              padding: '0.4rem 0.7rem',
            }}
          >
            Marker
          </button>

          <button
            type="button"
            aria-pressed={activeTool === 'cut'}
            disabled={toolsDisabled}
            onClick={() => setActiveTool('cut')}
            style={{
              background: activeTool === 'cut' ? '#4a90d9' : '#16213e',
              color: '#ffffff',
              padding: '0.4rem 0.7rem',
            }}
          >
            Cut
          </button>
        </div>

        {activeTool === 'cut' && (
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
              marginTop: '0.85rem',
            }}
          >
            <span>Thickness: {cutThickness} mm</span>

            <input
              type="range"
              min="1"
              max="30"
              step="0.5"
              value={cutThickness}
              disabled={toolsDisabled || isCutDragging}
              onChange={(event) =>
                setCutThickness(Number(event.target.value))
              }
            />
          </label>
        )}

        {historyToolActive && (
          <>
            <button
              type="button"
              disabled={toolsDisabled || !canUndo || historyBusy}
              onClick={handleUndo}
              style={{ marginTop: '0.75rem' }}
            >
              Undo
            </button>

            <button
              type="button"
              disabled={toolsDisabled || !canRedo || historyBusy}
              onClick={handleRedo}
              style={{ marginTop: '0.75rem', marginLeft: '0.5rem' }}
            >
              Redo
            </button>
          </>
        )}
      </fieldset>

      {activeTool === 'marker' && cutStatus && (
        <div
          role="status"
          style={{
            position: 'absolute',
            bottom: '1rem',
            left: '1rem',
            zIndex: 6,
            color: 'white',
            background: 'rgba(0, 0, 0, 0.8)',
            padding: '0.5rem',
            pointerEvents: 'none',
          }}
        >
          {cutStatus}
        </div>
      )}

      {isLoading && (
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
          <div style={{ width: "60px", height: "60px", border: "6px solid #444", borderTop: "6px solid #4cafef", borderRadius: "50%", animation: "vtk-spin 1s linear infinite" }} />
          <style>{'@keyframes vtk-spin {from { transform: rotate(0deg); } to { transform: rotate(360deg); }}'}</style>
        </div>
      )}
      {error && (
        <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: '1rem', color: '#ffb4ab', textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
}

export default VTKViewer;
