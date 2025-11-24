import React, { useRef, useEffect } from "react";
import vtk from "vtk.js";

const VTKViewer = () => {
  const containerRef = useRef(null);

  const rendererRef = useRef(null);
  const renderWindowRef = useRef(null);
  const openGLRef = useRef(null);
  const interactorRef = useRef(null);
  const rendererInitialized = useRef(false);
  const resizeObserverRef = useRef(null);

  const initRenderer = () => {
    if (rendererInitialized.current) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const renderWindow = vtk.Rendering.Core.vtkRenderWindow.newInstance();
    const renderer = vtk.Rendering.Core.vtkRenderer.newInstance({
      background: [0, 0, 0],
    });
    renderWindow.addRenderer(renderer);

    const openGLWindow =
      vtk.Rendering.OpenGL.vtkRenderWindow.newInstance();
    renderWindow.addView(openGLWindow);
    openGLWindow.setContainer(container);
    openGLWindow.setSize(rect.width, rect.height);

    const interactor =
      vtk.Rendering.Core.vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLWindow);
    interactor.initialize();
    interactor.setContainer(container);

    const style =
      vtk.Interaction.Style.vtkInteractorStyleTrackballCamera.newInstance();
    interactor.setInteractorStyle(style);

    rendererRef.current = renderer;
    renderWindowRef.current = renderWindow;
    openGLRef.current = openGLWindow;
    interactorRef.current = interactor;

    const observer = new ResizeObserver(() => {
      const r = container.getBoundingClientRect();
      openGLWindow.setSize(r.width, r.height);
      renderWindow.render();
    });

    observer.observe(container);
    resizeObserverRef.current = observer;

    rendererInitialized.current = true;
  };

  const handleDICOM = async (e) => {
    initRenderer();

    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const dicomReader = vtk.IO.Misc.vtkDICOMReader.newInstance();
    dicomReader.setFileNameStack(files.map((f) => f.name));

    await dicomReader.parseAsArrayBufferSequence(files);

    const imageData = dicomReader.getOutputData();
    const renderer = rendererRef.current;
    const renderWindow = renderWindowRef.current;

    renderer.getVolumes().forEach((v) => renderer.removeVolume(v));

    const mapper = vtk.Rendering.Core.vtkVolumeMapper.newInstance();
    mapper.setInputData(imageData);

    const volume = vtk.Rendering.Core.vtkVolume.newInstance();
    volume.setMapper(mapper);

    const scalars = imageData.getPointData().getScalars();
    const [min, max] = scalars.getRange();

    const ctfun =
      vtk.Rendering.Core.vtkColorTransferFunction.newInstance();
    const ofun =
      vtk.Common.DataModel.vtkPiecewiseFunction.newInstance();

    ctfun.addRGBPoint(min, 0, 0, 0);
    ctfun.addRGBPoint(max, 1, 1, 1);

    ofun.addPoint(min, 0.05);
    ofun.addPoint(max, 0.9);

    const prop = volume.getProperty();
    prop.setRGBTransferFunction(0, ctfun);
    prop.setScalarOpacity(0, ofun);
    prop.setShade(true);
    prop.setInterpolationTypeToLinear();

    renderer.addVolume(volume);
    renderer.resetCamera();
    renderer.resetCameraClippingRange();

    const camera = renderer.getActiveCamera();
    camera.zoom(1.2);

    renderWindow.render();
  };

  useEffect(() => {
    initRenderer();
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div>
      <input
        type="file"
        accept=".dcm"
        multiple
        onChange={handleDICOM}
      />

      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "500px",
          background: "#000",
          borderRadius: "8px",
          marginTop: "10px",
        }}
      />
    </div>
  );
};

export default VTKViewer;
