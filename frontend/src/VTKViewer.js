    import React, { useEffect, useRef } from "react";
import vtkRenderWindow from "vtk.js/Sources/Rendering/Core/RenderWindow";
import vtkRenderer from "vtk.js/Sources/Rendering/Core/Renderer";
import vtkRenderWindowInteractor from "vtk.js/Sources/Rendering/Core/RenderWindowInteractor";
import vtkOpenGLRenderWindow from "vtk.js/Sources/Rendering/OpenGL/RenderWindow";

import vtkOBJReader from "vtk.js/Sources/IO/Misc/OBJReader";
import vtkMapper from "vtk.js/Sources/Rendering/Core/Mapper";
import vtkActor from "vtk.js/Sources/Rendering/Core/Actor";
import vtkPolyDataNormals from "vtk.js/Sources/Filters/Core/PolyDataNormals";

const VTKViewer = () => {
const containerRef = useRef(null);
const canvasRef = useRef(null);

useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const renderWindow = vtkRenderWindow.newInstance();
    const renderer = vtkRenderer.newInstance({ background: [0.1, 0.1, 0.1] });
    renderWindow.addRenderer(renderer);

    const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
    openGLRenderWindow.setCanvas(canvasRef.current);
    renderWindow.addView(openGLRenderWindow);

    const { width, height } = containerRef.current.getBoundingClientRect();
    openGLRenderWindow.setSize(width, height);

    const interactor = vtkRenderWindowInteractor.newInstance();
    interactor.setView(openGLRenderWindow);
    interactor.initialize({ container: canvasRef.current });
    interactor.start();

    const reader = vtkOBJReader.newInstance();
    reader.setUrl("/models/cube.obj").then(() => {
    const polyData = reader.getOutputData();
    console.log("PolyData points:", polyData.getPoints()?.getNumberOfPoints());

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
    });

    return () => {
    renderWindow.delete();
    renderer.delete();
    openGLRenderWindow.delete();
    interactor.delete();
    };
    }, []);

    return (
        <div
        ref={containerRef}
        style={{ width: "100%", height: "500px", border: "1px solid #ccc" }}
        >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};

export default VTKViewer;
