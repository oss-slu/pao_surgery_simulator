import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import Dashboard from '../../pages/Dashboard';
import { clearAuthStorage, renderWithRouter, seedAuthStorage } from '../test-utils';

jest.mock('../../components/VTKViewer', () => ({
  __esModule: true,
  default: function VTKViewerStub({ modelUrl }) {
    return <div data-testid="vtk-model-url">{modelUrl}</div>;
  },
}));

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
});

test('opens a saved scan in the dashboard upload screen for rendering', async () => {
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

  renderWithRouter(<Dashboard />, { route: '/dashboard' });

  await user.click(await screen.findByRole('button', { name: 'Open scan scan-42' }));

  expect(screen.getByText('Upload DICOM Series')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Render 3D' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Send dummy label' })).toBeEnabled();
  expect(toast.success).toHaveBeenCalledWith('Previous upload reopened successfully');
  expect(screen.getByTestId('vtk-model-url')).toHaveTextContent(
    `${API_BASE}/api/render_dicom/scan-42`
  );

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/users/9/scans`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
});
