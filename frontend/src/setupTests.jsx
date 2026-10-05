import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

import { TextEncoder, TextDecoder } from 'util';

// react-router v7 expects TextEncoder/TextDecoder
// which may be missing from jsdom.

if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = TextEncoder;
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = TextDecoder;
}

// VTK.js pulls WebGL/WASM; keep Vitest from loading the real package.

vi.mock('@kitware/vtk.js/Rendering/Profiles/Volume', () => ({}));

vi.mock('@kitware/vtk.js/Rendering/Misc/GenericRenderWindow', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/Volume', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/VolumeMapper', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('@kitware/vtk.js/IO/XML/XMLImageDataReader', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/ColorTransferFunction', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('@kitware/vtk.js/Common/DataModel/PiecewiseFunction', () => ({
  __esModule: true,
  default: { newInstance: () => ({}) },
}));

vi.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}
