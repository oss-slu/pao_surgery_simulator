import React, { useRef, useEffect, useState } from 'react';
import { sessionFetch } from '../sessionApi';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

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

function VTKViewer({ modelUrl, onMarkerAdded }) {
  const vtkContainerRef = useRef(null);
  const drawingCanvasRef = useRef(null);
  const context = useRef(null);
  const onMarkerAddedRef = useRef(onMarkerAdded);
  const drawingRef = useRef(false);
  const previousPositionRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const strokesRef = useRef([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emphasizeDenseTissue, setEmphasizeDenseTissue] = useState(false);
  const [tool, setTool] = useState('navigate');
  const [markerColor, setMarkerColor] = useState('#ff0000');

  onMarkerAddedRef.current = onMarkerAdded;

  useEffect(() => {
    const genericRenderWindow = vtkGenericRenderWindow.newInstance({
      background: [0.0, 0.0, 0.0],
    });
    genericRenderWindow.setContainer(vtkContainerRef.current);

    const renderer = genericRenderWindow.getRenderer();
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
    context.current = { genericRenderWindow, renderWindow, mapper, renderer, actor, ofun };

    return () => {
      genericRenderWindow.delete();
      context.current = null;
    };
  }, []);

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

    const stopVtkMouseEvent = (event) => {
      if (tool !== 'marker') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const addMarkerAt = (event) => {
      const current = context.current;
      if (!current?.imageData || !current.renderer) return;
      const hit = findVolumePosition(
        event, container, current.renderWindow, current.renderer, current.imageData, current.ofun
      );
      if (!hit) return;
      const { position } = hit;

      const spacing = current.imageData.getSpacing().map(Math.abs).filter((value) => value > 0);
      const lastPosition = previousPositionRef.current;
      const minimumDistance = Math.min(...spacing) * 0.25;
      if (
        lastPosition &&
        Math.hypot(...position.map((value, axis) => value - lastPosition[axis])) < minimumDistance
      ) return;

      previousPositionRef.current = position;
      if (!activeStrokeRef.current) {
        activeStrokeRef.current = { color: markerColor, points: [] };
        strokesRef.current.push(activeStrokeRef.current);
      }
      activeStrokeRef.current.points.push(position);
      drawStrokes();

      onMarkerAddedRef.current?.({
        id: `${Date.now()}-${Math.random()}`,
        coordinates: { x: position[0], y: position[1], z: position[2] },
        color: markerColor,
      });
    };

    const handlePointerDown = (event) => {
      if (tool !== 'marker' || event.button !== 0) return;
      stopVtkMouseEvent(event);
      drawingRef.current = true;
      previousPositionRef.current = null;
      activeStrokeRef.current = null;
      addMarkerAt(event);
      container.setPointerCapture?.(event.pointerId);
    };
    const handlePointerMove = (event) => {
      if (tool === 'marker' && drawingRef.current) {
        stopVtkMouseEvent(event);
        addMarkerAt(event);
      }
    };
    const handlePointerUp = (event) => {
      if (tool !== 'marker' || !drawingRef.current) return;
      stopVtkMouseEvent(event);
      drawingRef.current = false;
      previousPositionRef.current = null;
      activeStrokeRef.current = null;
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
      drawingRef.current = false;
      previousPositionRef.current = null;
      activeStrokeRef.current = null;
    };
  }, [tool, markerColor]);

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
    context.current.imageData = null;
    strokesRef.current = [];
    setIsLoading(true);
    setError('');

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
        genericRenderWindow.resize();
        renderer.resetCamera();
        renderWindow.render();
        drawingCanvasRef.current?.getContext('2d')?.clearRect(
          0, 0, drawingCanvasRef.current.width, drawingCanvasRef.current.height
        );
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
      <div ref={vtkContainerRef} style={{ width: '100%', height: '100%' }} />
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
          <select aria-label="Tool" value={tool} onChange={(event) => setTool(event.target.value)}>
            <option value="navigate">Navigate</option>
            <option value="marker">Marker</option>
          </select>
        </label>
        {tool === 'marker' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
            Marker color
            <input
              aria-label="Marker color"
              type="color"
              value={markerColor}
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
      </fieldset>

      {isLoading && (
        <div style={{position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", zIndex: 1000}}>
          <div style={{width: "60px", height: "60px", border: "6px solid #444", borderTop: "6px solid #4cafef", borderRadius: "50%", animation: "vtk-spin 1s linear infinite"}} />
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
