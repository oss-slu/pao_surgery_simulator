/**
 * UploadSection: multipart upload + wiring Render 3D to /api/render_dicom/<id>.
 * VTKViewer is stubbed so Jest never loads real VTK.js.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import UploadSection from '../../components/UploadSection';
import { clearAuthStorage, seedAuthStorage } from '../test-utils';

jest.mock('../../components/VTKViewer', () => {
  return function VTKViewerStub({ modelUrl }) {
    return (
      <div data-testid="vtk-stub">{modelUrl}</div>
    );
  };
});

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
  toast.success.mockClear();
  toast.error.mockClear();
});

function renderUpload(props = {}) {
  return render(
    <UploadSection
      apiBase={API_BASE}
      onBack={jest.fn()}
      onUploadComplete={jest.fn()}
      {...props}
    />
  );
}

async function selectDicomFiles(user, names = ['slice1.dcm']) {
  const input = document.querySelector('input[type="file"]');
  const files = names.map(
    (name) => new File(['dummy'], name, { type: 'application/dicom' })
  );
  await user.upload(input, files);
  return files;
}

test('renders upload UI', () => {
  renderUpload();

  expect(screen.getByText('Upload DICOM Series')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Choose DICOM Files' })
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Render 3D' })).toBeDisabled();
});

test('successful upload posts FormData and calls onUploadComplete', async () => {
  const user = userEvent.setup();
  const onUploadComplete = jest.fn();
  seedAuthStorage({ userId: '9', userName: 'surgeon' });

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      message: 'Files uploaded',
      upload_id: 'upload-abc',
      patient_name: 'Test Patient',
    }),
  });

  renderUpload({ onUploadComplete });
  await selectDicomFiles(user, ['scan.dcm']);

  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/upload_dicom`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  const [, options] = global.fetch.mock.calls[0];
  expect(options.body).toBeInstanceOf(FormData);
  expect(options.body.get('user_id')).toBe('9');
  expect(options.body.get('files')).toBeInstanceOf(File);
  expect(options.body.get('files').name).toBe('scan.dcm');

  expect(onUploadComplete).toHaveBeenCalledWith(
    ['scan.dcm'],
    expect.objectContaining({
      uploadId: 'upload-abc',
      patientName: 'Test Patient',
    })
  );
  expect(toast.success).toHaveBeenCalledWith('Files uploaded successfully');
});

test('failed upload shows error toast', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '1' });

  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ error: 'No valid .dcm files uploaded' }),
  });

  renderUpload();
  await selectDicomFiles(user);

  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await waitFor(() => {
    expect(toast.error).toHaveBeenCalledWith('No valid .dcm files uploaded');
  });
  expect(screen.getByText('No valid .dcm files uploaded')).toBeInTheDocument();
  expect(toast.success).not.toHaveBeenCalled();
});

test('render sets VTKViewer modelUrl to render_dicom path', async () => {
  const user = userEvent.setup();
  seedAuthStorage({ userId: '1' });

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      message: 'Files uploaded',
      upload_id: 'uid-123',
      patient_name: 'Test Patient',
    }),
  });

  renderUpload();
  await selectDicomFiles(user);
  await user.click(screen.getByRole('button', { name: 'Upload' }));

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Render 3D' })).not.toBeDisabled();
  });

  // Render sets modelUrl only; it does not issue another fetch.
  const fetchCallsBeforeRender = global.fetch.mock.calls.length;
  await user.click(screen.getByRole('button', { name: 'Render 3D' }));

  expect(global.fetch.mock.calls.length).toBe(fetchCallsBeforeRender);
  expect(screen.getByTestId('vtk-stub')).toHaveTextContent(
    `${API_BASE}/api/render_dicom/uid-123`
  );
});
