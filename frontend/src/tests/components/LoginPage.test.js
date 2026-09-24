/**
 * LoginPage: form render + POST /api/login handling.
 * fetch is mocked — these do not start Flask.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../../components/LoginPage';
import { clearAuthStorage, renderWithRouter } from '../test-utils';

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
});

test('renders login form', () => {
  const { container } = renderWithRouter(
    <LoginPage
      apiBase={API_BASE}
      onLoginSuccess={jest.fn()}
      onShowSignUp={jest.fn()}
    />
  );

  expect(screen.getByText('Welcome back')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter your username')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
  expect(container.querySelector('button.submit-btn')).toBeInTheDocument();
});

test('successful login stores user_id and user_name', async () => {
  const user = userEvent.setup();
  const onLoginSuccess = jest.fn();

  // Fake network response shaped like Flask login success.
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      message: 'Login successful',
      user_id: 7,
      user_name: 'testuser',
    }),
  });

  const { container } = renderWithRouter(
    <LoginPage
      apiBase={API_BASE}
      onLoginSuccess={onLoginSuccess}
      onShowSignUp={jest.fn()}
    />
  );

  await user.type(
    screen.getByPlaceholderText('Enter your username'),
    'testuser'
  );
  await user.type(
    screen.getByPlaceholderText('Enter your password'),
    'password123'
  );
  await user.click(container.querySelector('button.submit-btn'));

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/login`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  expect(localStorage.getItem('user_id')).toBe('7');
  expect(localStorage.getItem('user_name')).toBe('testuser');
  expect(onLoginSuccess).toHaveBeenCalledWith('testuser');
});
