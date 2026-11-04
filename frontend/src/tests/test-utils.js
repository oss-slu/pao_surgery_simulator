/**
 * Shared helpers for component tests.
 * Seed a valid local display identity and backend session cookie for protected routes.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { clearSession, storeSession } from '../sessionApi';

export function clearAuthStorage() {
  clearSession();
}

export function seedAuthStorage({ userId = '1', userName = 'testuser' } = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  storeSession({
    session_token: 'test-session-token',
    issued_at: issuedAt,
    expires_at: issuedAt + 3600,
  });
  localStorage.setItem('user_id', String(userId));
  localStorage.setItem('user_name', userName);
}

/** Render with MemoryRouter so components using react-router hooks work in Jest. */
export function renderWithRouter(ui, { route = '/', ...options } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>,
    options
  );
}
