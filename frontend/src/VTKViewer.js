import React, { useEffect, useRef } from "react";
import vtkRenderWindow from "vtk.js/Sources/Rendering/Core/RenderWindow";
import vtkRenderer from "vtk.js/Sources/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "vtk.js/Sources/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "vtk.js/Sources/Rendering/Core/RenderWindowInteractor";
import vtkOBJReader from "vtk.js/Sources/IO/Misc/OBJReader";
import vtkMapper from "vtk.js/Sources/Rendering/Core/Mapper";
import vtkActor from "vtk.js/Sources/Rendering/Core/Actor";

const VTKViewer = () => {
  const containerRef = useRef(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return;
    initializedRef.current = true;

    const container = containerRef.current;
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return; // Avoid zero-size container

    // Renderer and render window 
    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.1] });
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addRenderer(renderer);
    renderWindow.addView(openGLRenderWindow);

    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.setContainer(containerRef.current);
    interactor.start();

    const reader = vtkOBJReader.newInstance();
    const modelUrl = process.env.PUBLIC_URL + "/models/cube.obj";
    console.log("Loading model from:", modelUrl);

    reader
      .setUrl(modelUrl)
      .then(() => {
        const mapper = vtkMapper.newInstance();
        mapper.setInputConnection(reader.getOutputPort());

        const actor = vtkActor.newInstance();
        actor.setMapper(mapper);

        renderer.addActor(actor);
        renderer.resetCamera();
        renderWindow.render();
      })
    .catch((err) => {
        console.error("Failed to load OBJ model:", err);
    });

    // --- Cleanup ---
    return () => {
      interactor.delete();
      openGLRenderWindow.delete();
      renderer.delete();
      renderWindow.delete();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100vh",
        background: "#000",
      }}
    />
  );
};

export default VTKViewer;