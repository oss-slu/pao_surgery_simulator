import React, { useRef, useLayoutEffect } from "react";
import vtkRenderWindow from "vtk.js/Sources/Rendering/Core/RenderWindow";
import vtkRenderer from "vtk.js/Sources/Rendering/Core/Renderer";
import vtkOpenGLRenderWindow from "vtk.js/Sources/Rendering/OpenGL/RenderWindow";
import vtkRenderWindowInteractor from "vtk.js/Sources/Rendering/Core/RenderWindowInteractor";
import vtkInteractorStyleTrackballCamera from "vtk.js/Sources/Interaction/Style/InteractorStyleTrackballCamera";
import vtkOBJReader from "vtk.js/Sources/IO/Misc/OBJReader";
import vtkMapper from "vtk.js/Sources/Rendering/Core/Mapper";
import vtkActor from "vtk.js/Sources/Rendering/Core/Actor";

const VTKViewer = () => {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // --- Renderer Setup ---
    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.1] });
    renderWindow.addRenderer(renderer);

    // --- OpenGL Canvas ---
    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    renderWindow.addView(openGLRenderWindow);
    openGLRenderWindow.setContainer(container);
    openGLRenderWindow.setSize(rect.width, rect.height);

    // --- Interactor ---
    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize();
    interactor.bindEvents(container);
    const style = vtkInteractorStyleTrackballCamera.newInstance();
    interactor.setInteractorStyle(style);

    // --- Add basic lighting ---
    const lights = renderer.getLights();
    if (lights.length) {
      lights[0].setIntensity(1.2); // brighten the scene
    }

    // --- OBJ Loader ---
    const reader = vtkOBJReader.newInstance();
    const mapper = vtkMapper.newInstance();
    const actor = vtkActor.newInstance();

    const modelUrl =
      "https://raw.githubusercontent.com/alecjacobson/common-3d-test-models/master/data/cow.obj";

    fetch(modelUrl)
      .then((res) => res.text())
      .then((objText) => {
        reader.parseAsText(objText);
        const polydata = reader.getOutputData();

        mapper.setScalarVisibility(false); // ignore scalar coloring
        mapper.setInputData(polydata);
        actor.setMapper(mapper);
        actor.getProperty().setColor(1, 1, 1); // white cow
        try {
        renderer.addActor(actor);
        } catch (e) {
        console.warn("VTK internal includes error ignored:", e);
        }


        // --- Auto scale and center ---
        const bounds = actor.getBounds();
        const xSize = bounds[1] - bounds[0];
        const ySize = bounds[3] - bounds[2];
        const zSize = bounds[5] - bounds[4];
        const maxSize = Math.max(xSize, ySize, zSize);

        if (maxSize > 0) {
          const scaleFactor = 20 / maxSize;
          actor.setScale(scaleFactor, scaleFactor, scaleFactor);
        }

        const centerX = (bounds[0] + bounds[1]) / 2;
        const centerY = (bounds[2] + bounds[3]) / 2;
        const centerZ = (bounds[4] + bounds[5]) / 2;
        actor.setPosition(-centerX, -centerY, -centerZ);

        // --- Camera framing ---
        renderer.resetCamera();
        renderer.getActiveCamera().setFocalPoint(0, 0, 0);
        renderer.resetCameraClippingRange();

        renderWindow.render();
        console.log("Actor bounds:", actor.getBounds());
        console.log("Render complete ✅");
      })
      .catch((err) =>
        console.error(
          "Failed to load OBJ model (ignore internal includes error):",
          err
        )
      );

    // --- Handle Resize ---
    const resizeObserver = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      openGLRenderWindow.setSize(rect.width, rect.height);
      renderWindow.render();
    });
    resizeObserver.observe(container);

    // --- Cleanup ---
    return () => {
      resizeObserver.disconnect();
      interactor.unbindEvents(container);
      renderWindow.delete();
      renderer.delete();
      openGLRenderWindow.delete();
      interactor.delete();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "500px", // visible size
        background: "#111",
        borderRadius: "8px",
        overflow: "hidden",
      }}
    />
  );
};

export default VTKViewer;
