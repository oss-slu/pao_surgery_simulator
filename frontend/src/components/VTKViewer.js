import React, { useRef, useEffect, useState } from 'react';
import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';

function VTKViewer({ modelUrl }) {
  const vtkContainerRef = useRef(null);
  const context = useRef(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
    context.current = { genericRenderWindow, renderWindow, mapper, renderer, actor };

    return () => {
      genericRenderWindow.delete();
      context.current = null;
    };
  }, []);

  useEffect(() => {
    if (!modelUrl || !context.current) return undefined;

    const controller = new AbortController();
    const { genericRenderWindow, mapper, renderer, renderWindow, actor } = context.current;
    setIsLoading(true);
    setError('');

    const loadVolume = async () => {
      try {
        const response = await fetch(modelUrl, { signal: controller.signal });
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
    <div style={{ width: '100%', height: '512px', border: '1px solid #444', position: 'relative' }}>
      <div ref={vtkContainerRef} style={{ width: '100%', height: '100%' }} />

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
