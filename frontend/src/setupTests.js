import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// react-router v7 expects TextEncoder/TextDecoder (missing in CRA's jsdom).
if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === 'undefined') {
  global.TextDecoder = TextDecoder;
}

// VTK.js pulls WebGL/WASM; keep Jest from loading the real package.
jest.mock('@kitware/vtk.js/Rendering/Profiles/Volume', () => ({}));
jest.mock('@kitware/vtk.js/Rendering/Misc/GenericRenderWindow', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));
jest.mock('@kitware/vtk.js/Rendering/Core/Volume', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));
jest.mock('@kitware/vtk.js/Rendering/Core/VolumeMapper', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));
jest.mock('@kitware/vtk.js/IO/XML/XMLImageDataReader', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));
jest.mock('@kitware/vtk.js/Rendering/Core/ColorTransferFunction', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));
jest.mock('@kitware/vtk.js/Common/DataModel/PiecewiseFunction', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

if (!window.matchMedia) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}
