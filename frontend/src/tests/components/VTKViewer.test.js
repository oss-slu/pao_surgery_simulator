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

test('marker tool adds volume coordinates and supports choosing a color', async () => {
  const onMarkerAdded = jest.fn();
  const canvasContext = {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    stroke: jest.fn(),
  };
  HTMLCanvasElement.prototype.getContext.mockReturnValue(canvasContext);
  const view = await renderReady({ onMarkerAdded });
  const vtkContainer = view.container.querySelector('canvas').parentElement.firstElementChild;
  vtkContainer.getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    right: 900,
    bottom: 650,
    width: 800,
    height: 600,
  });
  view.container.querySelector('canvas').getBoundingClientRect = () => ({
    left: 100,
    top: 50,
    right: 900,
    bottom: 650,
    width: 800,
    height: 600,
  });

  fireEvent.click(screen.getByRole('button', { name: 'Marker' }));
  fireEvent.change(screen.getByLabelText('Marker color'), { target: { value: '#00ff00' } });
  pointer(vtkContainer, 'pointerdown', 400, 300);
  pointer(vtkContainer, 'pointerup', 400, 300);

  expect(onMarkerAdded).toHaveBeenCalledWith(expect.objectContaining({
    coordinates: expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    }),
    color: '#00ff00',
  }));
  expect(canvasContext.stroke).toHaveBeenCalled();
});

function setThickness(value) {
  fireEvent.change(screen.getByRole('slider', { name: /Thickness/ }), {
    target: { value: String(value) },
  });
}

test('shows thickness and undo only in Cut mode', async () => {
  await renderReady();
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();

  selectCut();
  expect(screen.getByRole('slider', { name: /Thickness/ })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
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

test('undo and thickness are disabled during a drag and restored after cancellation', async () => {
  await renderReady();
  const original = scene.values.slice();
  const svg = selectCut();
  drag(svg);
  pointer(svg, 'pointerdown', 350, 350);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  expect(screen.getByRole('slider')).toBeDisabled();

  fireEvent.keyDown(window, { key: 'Escape' });
  pointer(svg, 'pointerup', 500, 350);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('slider')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(scene.values).toEqual(original);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});
