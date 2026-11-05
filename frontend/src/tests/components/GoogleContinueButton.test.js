/**
 * GoogleContinueButton: configuration messaging without live GIS.
 */
import React from 'react';
import { screen } from '@testing-library/react';
import GoogleContinueButton from '../../components/GoogleContinueButton';
import { renderWithRouter } from '../test-utils';

const ORIGINAL_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID;

afterEach(() => {
  process.env.REACT_APP_GOOGLE_CLIENT_ID = ORIGINAL_CLIENT_ID;
  jest.restoreAllMocks();
});

test('shows clear error when REACT_APP_GOOGLE_CLIENT_ID is missing', () => {
  process.env.REACT_APP_GOOGLE_CLIENT_ID = '';

  renderWithRouter(
    <GoogleContinueButton
      apiBase="http://127.0.0.1:5000"
      onSuccess={jest.fn()}
      onError={jest.fn()}
    />
  );

  expect(
    screen.getByText(/Google sign-in is not configured/i)
  ).toBeInTheDocument();
  expect(screen.getByTestId('google-continue-host')).toBeInTheDocument();
});
