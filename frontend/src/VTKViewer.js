import React, { useRef, useEffect } from "react";
import vtkRenderWindow from "vtk.js/Sources/Rendering/Core/RenderWindow";
import vtkRenderer from "vtk.js/Sources/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "vtk.js/Sources/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "vtk.js/Sources/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleTrackballCamera from "vtk.js/Sources/Interaction/Style/InteractorStyleTrackballCamera";
import vtkXMLImageDataReader from "vtk.js/Sources/IO/XML/XMLImageDataReader";
import vtkVolumeMapper from "vtk.js/Sources/Rendering/Core/VolumeMapper";
import vtkVolume from "vtk.js/Sources/Rendering/Core/Volume";
import vtkColorTransferFunction from "vtk.js/Sources/Rendering/Core/ColorTransferFunction";
import vtkPiecewiseFunction from "vtk.js/Sources/Common/DataModel/PiecewiseFunction";

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

    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0, 0, 0] });
    renderWindow.addRenderer(renderer);

    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setContainer(container);
    openGLRenderWindow.setSize(rect.width, rect.height);

    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.setContainer(container);
    interactor.setInteractorStyle(vtkInteractorStyleTrackballCamera.newInstance());

    renderWindowRef.current = renderWindow;
    rendererRef.current = renderer;
    openGLRef.current = openGLRenderWindow;
    interactorRef.current = interactor;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      openGLRenderWindow.setSize(rect.width, rect.height);
      renderWindow.render();
    });
    observer.observe(container);
    resizeObserverRef.current = observer;

    rendererInitialized.current = true;
  };

  const handleFile = (event) => {
    initRenderer();
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result;
      const vtkReader = vtkXMLImageDataReader.newInstance();

      try {
        vtkReader.parseAsArrayBuffer(arrayBuffer);
        const image = vtkReader.getOutputData();
        if (!image) {
          console.error("Failed to parse VTI file or empty output.");
          return;
        }

        rendererRef.current.getVolumes().slice().forEach((v) =>
          rendererRef.current.removeVolume(v)
        );

        const mapper = vtkVolumeMapper.newInstance();
        mapper.setInputData(image);
        mapper.setSampleDistance(0.1);

        const volume = vtkVolume.newInstance();
        volume.setMapper(mapper);

        const scalars = image.getPointData().getScalars();
        if (!scalars) {
          console.error("No scalar data in VTI file.");
          return;
        }
        const [min, max] = scalars.getRange();
        console.log("Scalar range:", min, max);

        const ctfun = vtkColorTransferFunction.newInstance();
        const ofun = vtkPiecewiseFunction.newInstance();
        ctfun.addRGBPoint(min, 0, 0, 0);
        ctfun.addRGBPoint(max, 1, 1, 1);
        ofun.addPoint(min, 0.05);
        ofun.addPoint(max, 0.9);

        volume.getProperty().setRGBTransferFunction(0, ctfun);
        volume.getProperty().setScalarOpacity(0, ofun);
        volume.getProperty().setInterpolationTypeToLinear();
        volume.getProperty().setShade(true);
        volume.getProperty().setAmbient(0.2);
        volume.getProperty().setDiffuse(0.7);
        volume.getProperty().setSpecular(0.3);

        rendererRef.current.addVolume(volume);
        rendererRef.current.resetCamera();
        rendererRef.current.resetCameraClippingRange();

        const camera = rendererRef.current.getActiveCamera();
        camera.zoom(1.2);

        renderWindowRef.current.render();
      } catch (err) {
        console.error("Failed to load VTI file:", err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Initialize renderer once on mount
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
      <input type="file" accept=".vti" onChange={handleFile} />
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
