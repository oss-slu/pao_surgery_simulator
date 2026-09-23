/**
 * Shared helpers for component tests.
 * Auth in this app is localStorage-only (user_id / user_name) — not server sessions.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

export function clearAuthStorage() {
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_name');
}

export function seedAuthStorage({ userId = '1', userName = 'testuser' } = {}) {
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
