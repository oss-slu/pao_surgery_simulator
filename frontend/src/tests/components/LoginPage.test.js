/**
 * LoginPage: form render + POST /api/login handling.
 * fetch is mocked — these do not start Flask.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import toast from 'react-hot-toast';
import LoginPage from '../../components/LoginPage';
import { clearAuthStorage, renderWithRouter } from '../test-utils';

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
});

function renderLogin(onLoginSuccess = jest.fn()) {
  return renderWithRouter(
    <LoginPage
      apiBase={API_BASE}
      onLoginSuccess={onLoginSuccess}
      onShowSignUp={jest.fn()}
    />
  );
}

async function fillAndSubmit(user, container, email, password) {
  await user.type(screen.getByPlaceholderText('Enter your email'), email);
  await user.type(screen.getByPlaceholderText('Enter your password'), password);
  await user.click(container.querySelector('button.submit-btn'));
}

test('renders login form', () => {
  const { container } = renderLogin();

  expect(screen.getByText('Welcome back')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  expect(container.querySelector('button.submit-btn')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /resend verification email/i })
  ).not.toBeInTheDocument();
});

test('successful login stores user_id and user_name', async () => {
  const user = userEvent.setup();
  const onLoginSuccess = jest.fn();

  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      message: 'Login successful',
      user_id: 7,
      user_name: 'testuser',
      session_token: 'test-session-token',
      issued_at: 1_800_000_000,
      expires_at: 1_800_003_600,
    }),
  });

  const { container } = renderLogin(onLoginSuccess);
  await fillAndSubmit(user, container, 'testuser@example.com', 'password123');

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/login`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  expect(localStorage.getItem('user_id')).toBe('7');
  expect(localStorage.getItem('user_name')).toBe('testuser');
  expect(onLoginSuccess).toHaveBeenCalledWith('testuser');
  expect(
    screen.queryByRole('button', { name: /resend verification email/i })
  ).not.toBeInTheDocument();
});

test('unverified login shows verification message and resend action', async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 403,
    json: async () => ({
      error: 'Email verification required',
      code: 'EMAIL_NOT_VERIFIED',
    }),
  });

  const { container } = renderLogin();
  await fillAndSubmit(user, container, 'unverified@example.com', 'password123');

  expect(
    await screen.findByText('Email verification required')
  ).toBeInTheDocument();
  expect(
    screen.getByText(/verify your email before logging in/i)
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: /resend verification email/i })
  ).toBeInTheDocument();
  // Login alone must not claim an email was just sent (only signup/resend send).
  expect(
    screen.queryByText(/a verification email has been sent/i)
  ).not.toBeInTheDocument();
  expect(localStorage.getItem('user_id')).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/api\/login$/);
});

test('resend calls /api/resend_verification with entered email', async () => {
  const user = userEvent.setup();

  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        message:
          'If an unverified account exists for that email, a verification email has been sent.',
      }),
    });

  const { container } = renderLogin();
  await fillAndSubmit(user, container, 'unverified@example.com', 'password123');

  await user.click(
    await screen.findByRole('button', { name: /resend verification email/i })
  );

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/resend_verification`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'unverified@example.com' }),
      })
    );
  });

  expect(
    await screen.findByRole('status')
  ).toHaveTextContent(
    'If an unverified account exists for that email, a verification email has been sent.'
  );
  expect(toast.success).toHaveBeenCalled();
});

test('resend failure shows controlled message', async () => {
  const user = userEvent.setup();

  global.fetch = jest
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: 'Email verification required',
        code: 'EMAIL_NOT_VERIFIED',
      }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Unable to send verification email' }),
    });

  const { container } = renderLogin();
  await fillAndSubmit(user, container, 'unverified@example.com', 'password123');

  await user.click(
    await screen.findByRole('button', { name: /resend verification email/i })
  );

  expect(
    await screen.findByText('Unable to send verification email')
  ).toBeInTheDocument();
  expect(toast.error).toHaveBeenCalled();
});

test('invalid password does not show resend action', async () => {
  const user = userEvent.setup();

  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: 'Invalid password' }),
  });

  const { container } = renderLogin();
  await fillAndSubmit(user, container, 'user@example.com', 'wrongpassword');

  expect(await screen.findByText('Invalid password')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /resend verification email/i })
  ).not.toBeInTheDocument();
});
