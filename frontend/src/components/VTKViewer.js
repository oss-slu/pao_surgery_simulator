import React, { useRef, useEffect, useState } from 'react';
import { sessionFetch } from '../sessionApi';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import { vec3 } from 'gl-matrix';

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
  };
}

function VTKViewer({ modelUrl, label }) {
  const vtkContainerRef = useRef(null);
  const context = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [emphasizeDenseTissue, setEmphasizeDenseTissue] = useState(false);
  const [activeTool, setActiveTool] = useState('navigate');
  const [cutThickness, setCutThickness] = useState(3);
  const [isVolumeReady, setIsVolumeReady] = useState(false);

  const toolsDisabled = !modelUrl || !isVolumeReady || isLoading || Boolean(error);

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
    if (!context.current) return;

    const { ofun, renderWindow } = context.current;
    ofun.addPoint(400, emphasizeDenseTissue ? 0.75 : 0.3);
    renderWindow.render();
  }, [emphasizeDenseTissue]);

  useEffect(() => {
    if (!modelUrl || !context.current) return undefined;

    const controller = new AbortController();
    const { genericRenderWindow, mapper, renderer, renderWindow, actor } = context.current;
    setIsLoading(true);
    setError('');
    setIsVolumeReady(false);
    setActiveTool('navigate');

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

        renderer.addVolume(actor);
        genericRenderWindow.resize();
        renderer.resetCamera();
        renderWindow.render();
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

  const handleTestCut = () => {
    if (toolsDisabled || activeTool !== 'cut' || !context.current) {
      return;
    }

    const { mapper, renderWindow } = context.current;
    const imageData = mapper.getInputData();

    if (!imageData) return;

    const [xMin, xMax] = imageData.getBounds();
    const [, centerY, centerZ] = imageData.getCenter();

    const cut = applyStraightCut(imageData, {
      start: [xMin, centerY, centerZ],
      end: [xMax, centerY, centerZ],
      depthDirection: [0, 0, 1],
      thickness: cutThickness,
    });

    renderWindow.render();

    console.log('Changed volume samples:', cut.indices.length);
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 0, position: 'relative' }}>
      <div
        ref={vtkContainerRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: activeTool === 'cut' ? 'crosshair' : 'grab',
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
            disabled={toolsDisabled || activeTool !== 'cut'}
            onChange={(event) =>
              setCutThickness(Number(event.target.value))
            }
          />
        </label>

        <button
          type="button"
          disabled={toolsDisabled || activeTool !== 'cut'}
          onClick={handleTestCut}
          style={{ marginTop: '0.75rem' }}
        >
          Apply test cut
        </button>
      </fieldset>

      {label && label.visible !== false && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: '1rem',
            left: '1rem',
            zIndex: 10,
            maxWidth: 'min(24rem, calc(100% - 2rem))',
            padding: '0.75rem 1rem',
            background: 'rgba(15, 52, 96, 0.94)',
            border: '1px solid #90cdf4',
            borderRadius: '6px',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
          }}
        >
          <strong style={{ display: 'block' }}>{label.name}</strong>
          <span style={{ display: 'block', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {label.description}
          </span>
          <code style={{ display: 'block', marginTop: '0.35rem', color: '#bee3f8' }}>
            3D: ({label.coordinates.x}, {label.coordinates.y}, {label.coordinates.z})
          </code>
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
