/**
 * ProtectedRoute requires a session cookie; the backend validates protected operations.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import ProtectedRoute from '../../components/ProtectedRoute';
import {
  clearAuthStorage,
  seedAuthStorage,
  renderWithRouter,
} from '../test-utils';

afterEach(() => {
  clearAuthStorage();
});

function renderProtected() {
  return renderWithRouter(
    <Routes>
      <Route path="/login" element={<div>Login page</div>} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <div>Protected content</div>
          </ProtectedRoute>
        }
      />
    </Routes>,
    { route: '/dashboard' }
  );
}

test('redirects to login when the session cookie is missing', () => {
  clearAuthStorage();
  renderProtected();
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
});

test('renders children when the session cookie is present', () => {
  seedAuthStorage({ userId: '42', userName: 'surgeon' });
  renderProtected();
  expect(screen.getByText('Protected content')).toBeInTheDocument();
  expect(screen.queryByText('Login page')).not.toBeInTheDocument();
});

 test('a stored user ID without a session cookie cannot open a protected page', () => {
  clearAuthStorage();
  localStorage.setItem('user_id', '42');
  renderProtected();
  expect(screen.getByText('Login page')).toBeInTheDocument();
  expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
});
