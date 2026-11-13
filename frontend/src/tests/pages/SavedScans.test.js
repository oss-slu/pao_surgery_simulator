import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from '../../pages/Dashboard';
import Viewer from '../../pages/Viewer';
import { clearAuthStorage, renderWithRouter, seedAuthStorage } from '../test-utils';
import { fetchHistory, saveHistory } from '../../historyApi';

jest.mock('../../historyApi', () => ({
  fetchHistory: jest.fn(async () => ({ revision: 0, cursor: 0, actions: [] })),
  saveHistory: jest.fn(async (_scanId, { revision, cursor, actions }) => ({
    revision: revision + 1,
    cursor,
    actions,
  })),
  toPersistedActions: jest.requireActual('../../historyApi').toPersistedActions,
}));

jest.mock('../../components/VTKViewer', () => ({
  __esModule: true,
  default: function VTKViewerStub({
    modelUrl,
    onMarkerStrokeAdded,
    onMarkerStrokeRemoved,
    onHistoryChange,
  }) {
    return (
      <>
        <div data-testid="vtk-model-url">{modelUrl}</div>
        <button
          type="button"
          onClick={() => {
            onMarkerStrokeAdded({
              strokeId: 'stroke-1',
              markers: [{
                id: 'marker-1',
                strokeId: 'stroke-1',
                coordinates: { x: 1, y: 2, z: 3 },
                color: '#ff0000',
              }],
            });
            onHistoryChange?.({
              cursor: 1,
              actions: [{
                type: 'markerStroke',
                strokeId: 'stroke-1',
                color: '#ff0000',
                points: [[1, 2, 3]],
                markers: [{
                  id: 'marker-1',
                  strokeId: 'stroke-1',
                  coordinates: { x: 1, y: 2, z: 3 },
                  color: '#ff0000',
                }],
              }],
            });
          }}
        >
          Add test marker
        </button>
        <button
          type="button"
          onClick={() => onMarkerStrokeRemoved('stroke-1')}
        >
          Undo test marker stroke
        </button>
        <button
          type="button"
          onClick={() => onMarkerStrokeAdded({
            strokeId: 'stroke-1',
            markers: [{
              id: 'marker-1',
              strokeId: 'stroke-1',
              coordinates: { x: 1, y: 2, z: 3 },
              color: '#ff0000',
            }],
          })}
        >
          Redo test marker stroke
        </button>
      </>
    );
  },
}));

const API_BASE = process.env.REACT_APP_API_BASE || 'http://127.0.0.1:5000';

function CurrentPath() {
  const { pathname } = useLocation();
  return <output data-testid="current-path">{pathname}</output>;
}

function DashboardAndViewerRoutes() {
  return (
    <>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/viewer/:uploadId" element={<Viewer />} />
      </Routes>
      <CurrentPath />
    </>
  );
}

beforeEach(() => {
  fetchHistory.mockReset();
  saveHistory.mockReset();
  fetchHistory.mockResolvedValue({ revision: 0, cursor: 0, actions: [] });
  saveHistory.mockImplementation(async (_scanId, { revision, cursor, actions }) => ({
    revision: revision + 1,
    cursor,
    actions,
  }));
});

afterEach(() => {
  clearAuthStorage();
  jest.useRealTimers();
});

test('opens a saved scan in the full-page viewer and renders it automatically', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => [{
      upload_id: 'scan-42',
      upload_date: '2026-10-08T12:00:00',
      files: ['slice1.dcm'],
    }],
  });

  renderWithRouter(<DashboardAndViewerRoutes />, { route: '/dashboard' });

  await user.click(await screen.findByRole('button', { name: 'Open scan scan-42' }));

  expect(screen.getByTestId('current-path')).toHaveTextContent('/viewer/scan-42');
  expect(toast.success).toHaveBeenCalledWith('Previous upload reopened successfully');
  expect(screen.getByTestId('vtk-model-url')).toHaveTextContent(
    `${API_BASE}/api/render_dicom/scan-42`
  );
  expect(screen.getByLabelText('Model ID scan-42')).toBeInTheDocument();
  expect(screen.queryByText('patient_name')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '← Dashboard' })).toBeInTheDocument();

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/users/9/scans`,
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      })
    );
  });
});

test('redirects to the full-page viewer and starts rendering after upload', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  global.fetch = jest.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        upload_id: 'new-scan-7',
        patient_name: 'Private Patient',
      }),
    });

  renderWithRouter(<DashboardAndViewerRoutes />, { route: '/dashboard' });
  await user.click(screen.getByRole('button', { name: 'Upload DICOM and Render 3D' }));

  const input = document.querySelector('input[type="file"]');
  await user.upload(input, new File(['DICOM'], 'slice.dcm', { type: 'application/dicom' }));
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  expect(await screen.findByTestId('current-path')).toHaveTextContent('/viewer/new-scan-7');
  expect(await screen.findByTestId('vtk-model-url')).toHaveTextContent(
    `${API_BASE}/api/render_dicom/new-scan-7`
  );
  expect(screen.getByLabelText('Model ID new-scan-7')).toBeInTheDocument();
  expect(screen.queryByText('Private Patient')).not.toBeInTheDocument();
});

test('uploads drawn marker coordinates through the label endpoint', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ label_id: 1 }),
  });

  renderWithRouter(
    <Routes>
      <Route path="/viewer/:uploadId" element={<Viewer />} />
    </Routes>,
    { route: '/viewer/scan-42' }
  );
  await user.click(screen.getByRole('button', { name: 'Add test marker' }));
  await user.click(screen.getByRole('button', { name: 'Upload markers (1)' }));

  expect(await screen.findByText('Uploaded 1 marker(s).')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    `${API_BASE}/api/scans/scan-42/labels`,
    expect.objectContaining({
      method: 'POST',
      body: expect.any(String),
    })
  );
  const labelCall = global.fetch.mock.calls.find(([url]) => String(url).includes('/labels'));
  expect(JSON.parse(labelCall[1].body)).toEqual(expect.objectContaining({
    name: 'Marker',
    description: 'Drawn marker (#ff0000)',
    coordinates: { x: 1, y: 2, z: 3 },
    scan_2d_id: 'scan-42',
    scan_3d_id: 'scan-42',
  }));
  expect(screen.getByRole('button', { name: 'Upload markers (0)' })).toBeDisabled();
});

test('marker stroke undo clears the upload queue and uploaded ids are not re-queued', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ label_id: 1 }),
  });

  renderWithRouter(
    <Routes>
      <Route path="/viewer/:uploadId" element={<Viewer />} />
    </Routes>,
    { route: '/viewer/scan-42' }
  );

  await user.click(screen.getByRole('button', { name: 'Add test marker' }));
  expect(screen.getByRole('button', { name: 'Upload markers (1)' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Undo test marker stroke' }));
  expect(screen.getByRole('button', { name: 'Upload markers (0)' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Add test marker' }));
  await user.click(screen.getByRole('button', { name: 'Upload markers (1)' }));
  expect(await screen.findByText('Uploaded 1 marker(s).')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload markers (0)' })).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Undo test marker stroke' }));
  await user.click(screen.getByRole('button', { name: 'Redo test marker stroke' }));
  expect(screen.getByRole('button', { name: 'Upload markers (0)' })).toBeDisabled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('loads history on open and saves after local edits', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  fetchHistory.mockResolvedValue({
    revision: 2,
    cursor: 0,
    actions: [],
  });

  renderWithRouter(
    <Routes>
      <Route path="/viewer/:uploadId" element={<Viewer />} />
    </Routes>,
    { route: '/viewer/scan-42' }
  );

  await waitFor(() => expect(fetchHistory).toHaveBeenCalledWith('scan-42'));
  await user.click(screen.getByRole('button', { name: 'Add test marker' }));

  await waitFor(() => expect(saveHistory).toHaveBeenCalledWith('scan-42', {
    revision: 2,
    cursor: 1,
    actions: expect.arrayContaining([
      expect.objectContaining({ type: 'markerStroke', strokeId: 'stroke-1' }),
    ]),
  }));
});

test('shows retry after history save failure and reloads on revision conflict', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });
  fetchHistory.mockResolvedValue({ revision: 0, cursor: 0, actions: [] });

  const conflict = Object.assign(new Error('History revision conflict'), {
    status: 409,
    code: 'REVISION_CONFLICT',
    body: {
      revision: 5,
      cursor: 0,
      actions: [],
    },
  });
  saveHistory
    .mockReset()
    .mockRejectedValueOnce(Object.assign(new Error('network'), { status: 500 }))
    .mockRejectedValueOnce(Object.assign(new Error('network'), { status: 500 }))
    .mockRejectedValueOnce(conflict);

  renderWithRouter(
    <Routes>
      <Route path="/viewer/:uploadId" element={<Viewer />} />
    </Routes>,
    { route: '/viewer/scan-42' }
  );

  await waitFor(() => expect(fetchHistory).toHaveBeenCalled());
  await user.click(screen.getByRole('button', { name: 'Add test marker' }));

  expect(await screen.findByLabelText('History status')).toHaveTextContent('History save failed.');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();

  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByLabelText('History status')).toHaveTextContent(
    'History conflict — reloaded from server.'
  );
});
