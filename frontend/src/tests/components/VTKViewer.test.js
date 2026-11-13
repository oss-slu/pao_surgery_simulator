import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkXMLImageDataReader from '@kitware/vtk.js/IO/XML/XMLImageDataReader';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import VTKViewer from '../../components/VTKViewer';
import { sessionFetch } from '../../sessionApi';

jest.mock('../../sessionApi', () => ({ sessionFetch: jest.fn() }));

function createImage() {
  const values = Float32Array.from({ length: 21 * 21 * 5 }, (_, i) => 500 + i / 10);
  const scalars = {
    getData: () => values,
    getNumberOfComponents: () => 1,
    getComponent: (index) => values[index],
    dataChange: jest.fn(),
  };
  const image = {
    getPointData: () => ({ getScalars: () => scalars }),
    getNumberOfPoints: () => values.length,
    getExtent: () => [0, 20, 0, 20, 0, 4],
    getBounds: () => [-10, 10, -10, 10, -2, 2],
    getDimensions: () => [21, 21, 5],
    getSpacing: () => [1, 1, 1],
    worldToIndex: ([x, y, z]) => [x + 10, y + 10, z + 2],
    indexToWorld: ([i, j, k], out) => {
      out[0] = i - 10;
      out[1] = j - 10;
      out[2] = k - 2;
      return out;
    },
    modified: jest.fn(),
  };
  return { image, values, scalars };
}

let scene;

beforeEach(() => {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const image = createImage();
  let input;
  let cameraEnabled = true;
  const style = {
    getEnabled: () => cameraEnabled,
    setEnabled: jest.fn((enabled) => { cameraEnabled = enabled; }),
    isDeleted: () => false,
  };
  const camera = {
    setParallelProjection: jest.fn(),
    getPosition: () => [0, 0, 10],
    getFocalPoint: () => [0, 0, 0],
    getClippingRange: () => [0.1, 100],
    getParallelProjection: () => true,
    getDirectionOfProjection: () => [0, 0, -1],
    getParallelScale: () => 30,
    onModified: () => ({ unsubscribe: jest.fn() }),
  };
  const renderer = {
    getActiveCamera: () => camera,
    addVolume: jest.fn(),
    removeVolume: jest.fn(),
    resetCamera: jest.fn(),
    worldToNormalizedDisplay: () => [0, 0, 0.5],
    normalizedDisplayToWorld: () => [0, 0, 0],
  };
  // A 2x pixel-density, orthographic view with 60 world units of height.
  const view = {
    getViewportSize: () => [800, 600],
    getFramebufferSize: () => [1600, 1200],
    normalizedDisplayToDisplay: (x, y, z) => [x, y, z],
    displayToNormalizedDisplay: (x, y, z) => [x / 800, y / 600, z],
    worldToDisplay: (x, y) => [800 + x * 20, 600 + y * 20, 0.5],
    displayToWorld: (x, y) => [(x - 800) / 20, (y - 600) / 20, 0],
  };
  const renderWindow = {
    render: jest.fn(),
    getViews: () => [view],
    getInteractor: () => ({ getInteractorStyle: () => style }),
  };
  const mapper = {
    setInputData: jest.fn((data) => { input = data; }),
    getInputData: () => input,
  };
  const genericRenderWindow = {
    setContainer: jest.fn(),
    getRenderer: () => renderer,
    getRenderWindow: () => renderWindow,
    resize: jest.fn(),
    onResize: () => ({ unsubscribe: jest.fn() }),
    delete: jest.fn(),
  };
  const reader = {
    parseAsArrayBuffer: jest.fn(),
    getOutputData: jest.fn(() => image.image),
  };

  jest.spyOn(vtkGenericRenderWindow, 'newInstance').mockReturnValue(genericRenderWindow);
  jest.spyOn(vtkVolumeMapper, 'newInstance').mockReturnValue(mapper);
  const actor = {
    setMapper: jest.fn(),
    getProperty: () => ({
      setRGBTransferFunction: jest.fn(),
      setScalarOpacity: jest.fn(),
      setInterpolationTypeToLinear: jest.fn(),
    }),
  };
  jest.spyOn(vtkVolume, 'newInstance').mockReturnValue(actor);
  jest.spyOn(vtkXMLImageDataReader, 'newInstance').mockReturnValue(reader);
  jest.spyOn(vtkColorTransferFunction, 'newInstance').mockReturnValue({ addRGBPoint: jest.fn() });
  jest.spyOn(vtkPiecewiseFunction, 'newInstance').mockReturnValue({
    addPoint: jest.fn(),
    getValue: () => 0.3,
  });
  sessionFetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

  scene = { ...image, renderWindow, reader, renderer, actor, style };
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  sessionFetch.mockReset();
});

async function renderReady(props = {}) {
  const view = render(<VTKViewer modelUrl="/scan-a" {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cut' })).toBeEnabled());
  return view;
}

function selectCut() {
  fireEvent.click(screen.getByRole('button', { name: 'Cut' }));
  const svg = screen.getByLabelText('Cut drawing area');
  svg.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 600 });
  let capturedPointer;
  svg.setPointerCapture = (id) => { capturedPointer = id; };
  svg.hasPointerCapture = (id) => capturedPointer === id;
  svg.releasePointerCapture = () => { capturedPointer = undefined; };
  return svg;
}

function pointer(svg, type, x, y) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100 + x,
    clientY: 50 + y,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    isPrimary: { value: true },
  });
  fireEvent(svg, event);
}

function drag(svg, start = [300, 300], end = [500, 300]) {
  pointer(svg, 'pointerdown', ...start);
  pointer(svg, 'pointermove', ...end);
  pointer(svg, 'pointerup', ...end);
}

function prepareMarkerSurface(view) {
  const vtkContainer = view.container.querySelector('canvas').parentElement.firstElementChild;
  const bounds = {
    left: 100,
    top: 50,
    right: 900,
    bottom: 650,
    width: 800,
    height: 600,
  };
  vtkContainer.getBoundingClientRect = () => bounds;
  view.container.querySelector('canvas').getBoundingClientRect = () => bounds;
  return vtkContainer;
}

function selectMarker(view) {
  fireEvent.click(screen.getByRole('button', { name: 'Marker' }));
  return prepareMarkerSurface(view);
}

function mockDrawingCanvas() {
  HTMLCanvasElement.prototype.getContext.mockReturnValue({
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  });
}

function markerHistoryFns() {
  return {
    onMarkerStrokeAdded: jest.fn(),
    onMarkerStrokeRemoved: jest.fn(),
  };
}

test('marker tool commits a whole stroke and supports choosing a color', async () => {
  const onMarkerStrokeAdded = jest.fn();
  const canvasContext = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  };
  HTMLCanvasElement.prototype.getContext.mockReturnValue(canvasContext);
  const view = await renderReady({ onMarkerStrokeAdded });
  const vtkContainer = selectMarker(view);
  fireEvent.change(screen.getByLabelText('Marker color'), { target: { value: '#00ff00' } });
  pointer(vtkContainer, 'pointerdown', 400, 300);
  pointer(vtkContainer, 'pointermove', 420, 310);
  pointer(vtkContainer, 'pointerup', 420, 310);

  expect(onMarkerStrokeAdded).toHaveBeenCalledTimes(1);
  expect(onMarkerStrokeAdded).toHaveBeenCalledWith(expect.objectContaining({
    strokeId: expect.any(String),
    markers: expect.arrayContaining([
      expect.objectContaining({
        id: expect.any(String),
        strokeId: expect.any(String),
        coordinates: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          z: expect.any(Number),
        }),
        color: '#00ff00',
      }),
    ]),
  }));
  expect(canvasContext.stroke).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

function setThickness(value) {
  fireEvent.change(screen.getByRole('slider', { name: /Thickness/ }), {
    target: { value: String(value) },
  });
}

test('shows undo and redo in Cut and Marker modes, thickness only in Cut', async () => {
  await renderReady();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument();

  selectCut();
  expect(screen.getByRole('slider', { name: /Thickness/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Marker' }));
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Redo' })).not.toBeInTheDocument();
  expect(scene.style.getEnabled()).toBe(true);
});

test('undo restores the exact scan values and notifies VTK', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  setThickness(2);
  drag(svg);

  expect(scene.values.filter((value) => value === -1000)).toHaveLength(315);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  const rendersBeforeUndo = scene.renderWindow.render.mock.calls.length;

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(scene.scalars.dataChange).toHaveBeenCalledTimes(2);
  expect(scene.image.modified).toHaveBeenCalledTimes(2);
  expect(scene.renderWindow.render).toHaveBeenCalledTimes(rendersBeforeUndo + 1);
  expect(screen.getByRole('status')).toHaveTextContent('Last cut undone.');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('overlapping cuts undo in reverse order without restoring the earlier cut', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const afterFirstCut = scene.values.slice();
  drag(svg, [400, 200], [400, 400]);
  expect(scene.values.filter((value) => value === -1000)).toHaveLength(585);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(afterFirstCut);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('repeating a cut with no new changes does not consume an undo step', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  drag(svg);
  drag(svg);
  expect(screen.getByRole('status')).toHaveTextContent('No new samples changed.');

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('history survives switching to Navigate and back to Cut', async () => {
  await renderReady();
  const original = scene.values.slice();
  drag(selectCut());
  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(screen.queryByLabelText('Cut drawing area')).not.toBeInTheDocument();

  selectCut();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
});

test('a different scan clears history without modifying either scan', async () => {
  const { rerender } = await renderReady();
  drag(selectCut());
  const previousScan = scene.values.slice();
  const nextScan = createImage();
  const nextOriginal = nextScan.values.slice();
  scene.reader.getOutputData.mockReturnValue(nextScan.image);
  const addCountBeforeSwitch = scene.renderer.addVolume.mock.calls.length;

  rerender(<VTKViewer modelUrl="/scan-b" />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cut' })).toBeEnabled());
  expect(scene.renderer.removeVolume).toHaveBeenCalledWith(scene.actor);
  expect(scene.renderer.addVolume).toHaveBeenCalledTimes(addCountBeforeSwitch + 1);
  expect(scene.renderer.removeVolume.mock.invocationCallOrder[0])
    .toBeLessThan(scene.renderer.addVolume.mock.invocationCallOrder[1]);
  selectCut();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(nextScan.values).toEqual(nextOriginal);
  expect(scene.values).toEqual(previousScan);
});

test('undo, redo, and thickness are disabled during a drag and restored after cancellation', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  drag(svg);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  pointer(svg, 'pointerdown', 350, 350);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  expect(screen.getByRole('slider')).toBeDisabled();

  fireEvent.keyDown(window, { key: 'Escape' });
  pointer(svg, 'pointerup', 500, 350);
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  expect(screen.getByRole('slider')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).not.toEqual(original);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('redo restores cut voxels after undo', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const afterCut = scene.values.slice();
  expect(afterCut.filter((value) => value === -1000)).toHaveLength(315);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

  const rendersBeforeRedo = scene.renderWindow.render.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(afterCut);
  expect(scene.scalars.dataChange).toHaveBeenCalled();
  expect(scene.image.modified).toHaveBeenCalled();
  expect(scene.renderWindow.render).toHaveBeenCalledTimes(rendersBeforeRedo + 1);
  expect(screen.getByRole('status')).toHaveTextContent('Last cut redone.');
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('overlapping cuts support multi-step undo and redo', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const afterFirstCut = scene.values.slice();
  drag(svg, [400, 200], [400, 400]);
  const afterSecondCut = scene.values.slice();

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(afterFirstCut);
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);

  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(afterFirstCut);
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(afterSecondCut);
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('a new cut after undo discards redo', async () => {
  await renderReady();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const firstCut = scene.values.slice();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

  drag(svg, [400, 200], [400, 400]);
  const replacementCut = scene.values.slice();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  expect(replacementCut).not.toEqual(firstCut);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(replacementCut);
});

test('redo still works after switching to Navigate and back to Cut', async () => {
  await renderReady();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const afterCut = scene.values.slice();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(scene.style.getEnabled()).toBe(true);
  expect(screen.queryByLabelText('Cut drawing area')).not.toBeInTheDocument();

  selectCut();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(afterCut);
});

test('keyboard shortcuts undo and redo cuts', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  setThickness(2);
  drag(svg);
  const afterCut = scene.values.slice();

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('status')).toHaveTextContent('Last cut undone.');

  fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
  expect(scene.values).toEqual(afterCut);
  expect(screen.getByRole('status')).toHaveTextContent('Last cut redone.');

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
  expect(scene.values).toEqual(afterCut);
});

test('marker stroke undo and redo notify the parent as a whole stroke', async () => {
  const { onMarkerStrokeAdded, onMarkerStrokeRemoved } = markerHistoryFns();
  mockDrawingCanvas();
  const view = await renderReady({ onMarkerStrokeAdded, onMarkerStrokeRemoved });
  const vtkContainer = selectMarker(view);
  drag(vtkContainer, [400, 300], [440, 320]);

  expect(onMarkerStrokeAdded).toHaveBeenCalledTimes(1);
  const { strokeId, markers } = onMarkerStrokeAdded.mock.calls[0][0];
  expect(markers.length).toBeGreaterThan(0);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onMarkerStrokeRemoved).toHaveBeenCalledWith(strokeId);
  expect(screen.getByRole('status')).toHaveTextContent('Last marker stroke undone.');
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(onMarkerStrokeAdded).toHaveBeenCalledTimes(2);
  expect(onMarkerStrokeAdded).toHaveBeenLastCalledWith({
    strokeId,
    markers,
  });
  expect(screen.getByRole('status')).toHaveTextContent('Last marker stroke redone.');
});

test('shared history undoes marker then cut and discards redo after a new stroke', async () => {
  const { onMarkerStrokeAdded, onMarkerStrokeRemoved } = markerHistoryFns();
  mockDrawingCanvas();
  const view = await renderReady({ onMarkerStrokeAdded, onMarkerStrokeRemoved });
  const original = scene.values.slice();

  const cutSvg = selectCut();
  setThickness(2);
  drag(cutSvg);
  const afterCut = scene.values.slice();

  const markerSurface = selectMarker(view);
  drag(markerSurface, [400, 300], [440, 320]);
  const firstStrokeId = onMarkerStrokeAdded.mock.calls[0][0].strokeId;

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(onMarkerStrokeRemoved).toHaveBeenCalledWith(firstStrokeId);
  expect(scene.values).toEqual(afterCut);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);

  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).toEqual(afterCut);
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();

  drag(markerSurface, [360, 280], [390, 300]);
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  expect(onMarkerStrokeAdded).toHaveBeenCalledTimes(2);
});

test('keyboard shortcuts undo marker strokes in Marker mode', async () => {
  const { onMarkerStrokeAdded, onMarkerStrokeRemoved } = markerHistoryFns();
  mockDrawingCanvas();
  const view = await renderReady({ onMarkerStrokeAdded, onMarkerStrokeRemoved });
  const vtkContainer = selectMarker(view);
  drag(vtkContainer, [400, 300], [440, 320]);
  const { strokeId } = onMarkerStrokeAdded.mock.calls[0][0];

  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(onMarkerStrokeRemoved).toHaveBeenCalledWith(strokeId);

  fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
  expect(onMarkerStrokeAdded).toHaveBeenCalledTimes(2);
});

test('onHistoryChange emits persisted cut geometry after a cut', async () => {
  const onHistoryChange = jest.fn();
  await renderReady({ onHistoryChange });
  const svg = selectCut();
  setThickness(2);
  drag(svg);

  expect(onHistoryChange).toHaveBeenCalled();
  const snapshot = onHistoryChange.mock.calls.at(-1)[0];
  expect(snapshot.cursor).toBe(1);
  expect(snapshot.actions[0]).toEqual(expect.objectContaining({
    type: 'cut',
    thickness: 2,
    start: expect.any(Array),
    end: expect.any(Array),
    depthDirection: expect.any(Array),
  }));
  expect(snapshot.actions[0].indices).toBeUndefined();
  expect(snapshot.actions[0].imageData).toBeUndefined();
});

test('restoredHistory replays cuts and markers onto the original volume', async () => {
  const onMarkerStrokeAdded = jest.fn();
  mockDrawingCanvas();

  const restoredHistory = {
    cursor: 2,
    actions: [
      {
        type: 'cut',
        start: [-5, 0, 0],
        end: [5, 0, 0],
        depthDirection: [0, 0, -1],
        thickness: 2,
        emptyValue: -1000,
      },
      {
        type: 'markerStroke',
        strokeId: 'stroke-restored',
        color: '#00ff00',
        points: [[0, 0, 0]],
        markers: [{
          id: 'marker-restored',
          strokeId: 'stroke-restored',
          coordinates: { x: 0, y: 0, z: 0 },
          color: '#00ff00',
        }],
      },
    ],
  };

  await renderReady({
    onMarkerStrokeAdded,
    restoredHistory,
    historyRestoreKey: 1,
  });

  await waitFor(() => {
    expect(scene.values.some((value) => value === -1000)).toBe(true);
  });
  expect(onMarkerStrokeAdded).toHaveBeenCalledWith({
    strokeId: 'stroke-restored',
    markers: restoredHistory.actions[1].markers,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Cut' }));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
});

test('restored redo-tail cut applies on Redo', async () => {
  const restoredHistory = {
    cursor: 0,
    actions: [
      {
        type: 'cut',
        start: [-5, 0, 0],
        end: [5, 0, 0],
        depthDirection: [0, 0, -1],
        thickness: 2,
        emptyValue: -1000,
      },
    ],
  };

  await renderReady({
    restoredHistory,
    historyRestoreKey: 2,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Cut' }));
  expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled();
  const before = scene.values.slice();
  fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
  expect(scene.values).not.toEqual(before);
  expect(scene.values.some((value) => value === -1000)).toBe(true);
});
