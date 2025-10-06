import React, { useEffect, useRef } from "react";
import vtkRenderWindow from "vtk.js/Sources/Rendering/Core/RenderWindow";
import vtkRenderer from "vtk.js/Sources/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "vtk.js/Sources/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "vtk.js/Sources/Rendering/Core/RenderWindowInteractor";
import vtkOBJReader from "vtk.js/Sources/IO/Misc/OBJReader";
import vtkMapper from "vtk.js/Sources/Rendering/Core/Mapper";
import vtkActor from "vtk.js/Sources/Rendering/Core/Actor";
import vtkPolyDataNormals from "vtk.js/Sources/Filters/Core/PolyDataNormals";

const VTKViewer = ({ modelUrl = "/models/cube.obj" }) => {
  const containerRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return; // Avoid zero-size container

    // Renderer and render window 
    const renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.1] });
    const renderWindow = vtkRenderWindow.newInstance();
    renderWindow.addRenderer(renderer);

    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    openGLRenderWindow.setContainer(container);
    openGLRenderWindow.setSize(width, height);

    // Defer interactor setup until view is ready 
    requestAnimationFrame(() => {
      const interactor = vtkRenderWindowInteractor.newInstance();
      interactor.setView(openGLRenderWindow);
      interactor.initialize();
      interactor.setContainer(container);

      fetch(modelUrl)
        .then((res) => res.text())
        .then((text) => {
          const reader = vtkOBJReader.newInstance();
          reader.parseAsText(text);

          const polyData = reader.getOutputData();
          if (!polyData || !polyData.getPoints()) {
            console.error("OBJ model is invalid or empty:", modelUrl);
            return;
          }

          const normals = vtkPolyDataNormals.newInstance();
          normals.setInputData(polyData);

          const mapper = vtkMapper.newInstance();
          mapper.setInputConnection(normals.getOutputPort());

          const actor = vtkActor.newInstance();
          actor.setMapper(mapper);

          renderer.addActor(actor);
          renderer.resetCamera();
          renderer.resetCameraClippingRange();
          renderWindow.render();
        })
        .catch((err) => console.error("Failed to load OBJ model:", err));
    });

    // Cleanup
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
      renderWindow.delete();
      renderer.delete();
      openGLRenderWindow.delete();
    };
  }, [modelUrl]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "500px", border: "1px solid #ccc" }}
    />
  );
};

export default VTKViewer;
