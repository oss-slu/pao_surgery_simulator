/**
 * SignUpPage: form render + POST /api/signup (mocked fetch).
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import SignUpPage from '../../components/SignUpPage';
import { clearAuthStorage, renderWithRouter } from '../test-utils';
import { vi } from 'vitest';

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  vi.restoreAllMocks();
  toast.success.mockClear();
  toast.error.mockClear();
});

test('renders signup form', () => {
  const { container } = renderWithRouter(
    <SignUpPage
      apiBase={API_BASE}
      onSignupSuccess={vi.fn()}
      onBackToLogin={vi.fn()}
    />
  );

  expect(screen.getByText('Create an account')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Your name')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
  expect(container.querySelector('button.submit-btn')).toBeInTheDocument();
});

test('successful signup calls API and returns to login', async () => {
  const user = userEvent.setup();
  const onSignupSuccess = vi.fn();
  const onBackToLogin = vi.fn();

  // Match live POST /api/signup response: { message, id } (not user_id).
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({
      message: 'User Account',
      id: 42,
    }),
  });

  const { container } = renderWithRouter(
    <SignUpPage
      apiBase={API_BASE}
      onSignupSuccess={onSignupSuccess}
      onBackToLogin={onBackToLogin}
    />
  );

  await user.type(screen.getByPlaceholderText('Your name'), 'New User');
  await user.type(screen.getByPlaceholderText('you@example.com'), 'new@example.com');
  await user.type(screen.getByPlaceholderText('Create a password'), 'password123');
  await user.click(container.querySelector('button.submit-btn'));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/signup`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  expect(onSignupSuccess).toHaveBeenCalled();
  expect(toast.success).toHaveBeenCalledWith('Account created successfully');
  expect(onBackToLogin).toHaveBeenCalled();
});
