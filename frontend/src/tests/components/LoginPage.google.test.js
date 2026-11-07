/**
 * LoginPage Google error surfacing (GIS button mocked).
 */
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

jest.mock('../../components/GoogleContinueButton', () => {
  const React = require('react');
  return function MockGoogleButton({ onError }) {
    return React.createElement(
      'button',
      {
        type: 'button',
        onClick: () =>
          onError(
            Object.assign(
              new Error(
                'Unable to sign in with Google for this email. Sign in with your existing password instead.'
              ),
              { code: 'ACCOUNT_CONFLICT', status: 409 }
            )
          ),
      },
      'Mock Google'
    );
  };
});

import LoginPage from '../../components/LoginPage';
import { clearAuthStorage, renderWithRouter } from '../test-utils';

afterEach(() => {
  clearAuthStorage();
  jest.restoreAllMocks();
});

test('Google ACCOUNT_CONFLICT error is shown without storing a session', async () => {
  const user = userEvent.setup();
  const onLoginSuccess = jest.fn();

  renderWithRouter(
    <LoginPage
      apiBase="http://127.0.0.1:5000"
      onLoginSuccess={onLoginSuccess}
      onShowSignUp={jest.fn()}
    />
  );

  await user.click(screen.getByRole('button', { name: 'Mock Google' }));

  expect(
    await screen.findByText(/Unable to sign in with Google for this email/i)
  ).toBeInTheDocument();
  expect(onLoginSuccess).not.toHaveBeenCalled();
  expect(localStorage.getItem('user_id')).toBeNull();
});
