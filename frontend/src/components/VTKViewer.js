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

  useEffect(() => {
    if (!context.current) {
      
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
      ofun.addPoint(0, 0.0);    
      ofun.addPoint(200, 0.0);  
      ofun.addPoint(400, 0.3);  
      ofun.addPoint(800, 0.9);  

      actor.getProperty().setRGBTransferFunction(0, ctfun);
      actor.getProperty().setScalarOpacity(0, ofun);
      actor.getProperty().setInterpolationTypeToLinear();

      
      context.current = { genericRenderWindow, renderWindow, mapper, renderer, actor };
    }

    
    if (modelUrl) {
      const { mapper, renderer, renderWindow, actor } = context.current;
      setIsLoading(true);
      
      
      fetch(modelUrl)
        .then((response) => {
          if (!response.ok) throw new Error("Network response was not ok");
          return response.arrayBuffer(); 
        })
        .then((arrayBuffer) => {
          const reader = vtkXMLImageDataReader.newInstance();
          
          
          reader.parseAsArrayBuffer(arrayBuffer);
          mapper.setInputData(reader.getOutputData());

          
          renderer.addVolume(actor);
          renderer.resetCamera();
          renderWindow.render();
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Error loading VTI file:", error);
          setIsLoading(false);
        });
    }

    
    return () => {
      if (context.current) {
        context.current.genericRenderWindow.delete();
        context.current = null;
      }
    };
  }, [modelUrl]);

  return (
    <div style={{ width: '100%', height: '512px', border: '1px solid #444', position: 'relative' }}>
      <div ref={vtkContainerRef} style={{ width: '100%', height: '100%' }} />

      {isLoading && (
        <div style={{position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "center"}}>
          <div style={{width: "60px", height: "60px", border: "6px solid #444", borderTop: "6px solid #4cafef", borderRadius: "50%", animation: "spin 1s linear infinite"}} />
          <styler>{'@keyframes spin {from { transform: rotate(0deg); } to { transform: rotate(360deg); }}'}</styler>
        </div>
      )}
      
      {modelUrl && (
        <div style={{ position: 'absolute', top: 10, left: 10, color: 'white', pointerEvents: 'none' }}>
          Loading 3D Volume...
        </div>
      )}
    </div>
  );
}

export default VTKViewer;