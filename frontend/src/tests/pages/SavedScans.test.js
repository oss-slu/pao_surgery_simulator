import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import { Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from '../../pages/Dashboard';
import Viewer from '../../pages/Viewer';
import { clearAuthStorage, renderWithRouter, seedAuthStorage } from '../test-utils';

jest.mock('../../components/VTKViewer', () => ({
  __esModule: true,
  default: function VTKViewerStub({ modelUrl }) {
    return <div data-testid="vtk-model-url">{modelUrl}</div>;
  },
}));

const API_BASE = 'http://127.0.0.1:5000';

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

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
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
