/**
 * VerifyEmail: reads ?token= and POSTs /api/verify_email once.
 * fetch is mocked — these do not start Flask.
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import VerifyEmail from '../../pages/VerifyEmail';
import { clearAuthStorage, renderWithRouter } from '../test-utils';

const API_BASE = 'http://127.0.0.1:5000';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
});

function mockJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

test('reads token from query string and verifies once', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    mockJsonResponse({ message: 'Email verified' })
  );

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=abc123' });

  await waitFor(() => {
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  expect(global.fetch).toHaveBeenCalledWith(
    `${API_BASE}/api/verify_email`,
    expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'abc123' }),
    })
  );
});

test('shows success state and login link', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    mockJsonResponse({ message: 'Email verified' })
  );

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=good-token' });

  expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Email verified');
  expect(
    screen.getByText(/Your email has been verified/i)
  ).toBeInTheDocument();

  const loginLink = screen.getByRole('link', { name: /go to login/i });
  expect(loginLink).toHaveAttribute('href', '/login');
  expect(localStorage.getItem('user_id')).toBeNull();
  expect(localStorage.getItem('user_name')).toBeNull();
});

test('missing token does not call the API', async () => {
  global.fetch = jest.fn();

  renderWithRouter(<VerifyEmail />, { route: '/verify' });

  expect(
    await screen.findByText(/missing a token/i)
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Verification failed' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /go to login/i })).toHaveAttribute(
    'href',
    '/login'
  );
  expect(global.fetch).not.toHaveBeenCalled();
});

test('expired token response', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    mockJsonResponse(
      {
        error: 'Verification link has expired',
        code: 'token_expired',
      },
      { ok: false, status: 400 }
    )
  );

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=expired' });

  expect(
    await screen.findByText('Verification link has expired')
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Verification failed' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /go to login/i })).toBeInTheDocument();
});

test('invalid token response', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    mockJsonResponse(
      {
        error: 'Invalid verification link',
        code: 'token_invalid',
      },
      { ok: false, status: 400 }
    )
  );

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=bad' });

  expect(
    await screen.findByText('Invalid verification link')
  ).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Verification failed' })).toBeInTheDocument();
});

test('generic API failure', async () => {
  global.fetch = jest.fn().mockResolvedValue(
    mockJsonResponse(
      { error: 'An internal error has occurred' },
      { ok: false, status: 500 }
    )
  );

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=x' });

  expect(
    await screen.findByText('An internal error has occurred')
  ).toBeInTheDocument();
});

test('network failure shows generic message', async () => {
  global.fetch = jest.fn().mockRejectedValue(new Error('Failed to fetch'));

  renderWithRouter(<VerifyEmail />, { route: '/verify?token=x' });

  expect(
    await screen.findByText(
      'Unable to verify your email. Please try again later.'
    )
  ).toBeInTheDocument();
  expect(screen.queryByText(/Failed to fetch/i)).not.toBeInTheDocument();
});
