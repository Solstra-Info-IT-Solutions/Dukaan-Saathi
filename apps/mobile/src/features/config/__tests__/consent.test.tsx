import type { ConsentDto } from '@ds/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { needsConsent } from '../domain/consent';
import { ConsentGate, LegalScreen } from '../presentation/screens/ConsentScreen';

const published = (accepted: string | null): ConsentDto => ({
  currentVersion: '2026-11',
  acceptedVersion: accepted,
  acceptedAt: accepted ? '2026-10-29T05:00:00.000Z' : null,
  privacyUrl: 'https://dukaansaathi.in/privacy',
  termsUrl: 'https://dukaansaathi.in/terms',
});

describe('needsConsent', () => {
  it('asks only for a published version the user has not accepted', () => {
    expect(needsConsent(published(null))).toBe(true);
    expect(needsConsent(published('2026-10'))).toBe(true);
    expect(needsConsent(published('2026-11'))).toBe(false);
    expect(needsConsent({ ...published(null), currentVersion: null })).toBe(false);
  });
});

describe('ConsentGate', () => {
  it('shows the terms until accepted, then the app', async () => {
    let state = published(null);
    const deps = {
      getMyConsent: async () => state,
      acceptTerms: jest.fn(async (v: string) => (state = { ...state, acceptedVersion: v })),
      openUrl: jest.fn(async () => {}),
    };
    await renderWithProviders(
      <ConsentGate deps={deps} onSignOut={jest.fn()}>
        <Text>Billing</Text>
      </ConsentGate>,
    );
    expect(await screen.findByText('Privacy policy and terms')).toBeTruthy();
    expect(screen.queryByText('Billing')).toBeNull();
    await fireEvent.press(screen.getByText('Read the terms of use'));
    expect(deps.openUrl).toHaveBeenCalledWith('https://dukaansaathi.in/terms');
    await fireEvent.press(screen.getByText('I have read and accept'));
    await waitFor(() => expect(screen.getByText('Billing')).toBeTruthy());
    expect(deps.acceptTerms).toHaveBeenCalledWith('2026-11');
  });

  it('lets the user sign out instead', async () => {
    const onSignOut = jest.fn();
    await renderWithProviders(
      <ConsentGate
        deps={{ getMyConsent: async () => published(null), acceptTerms: jest.fn(), openUrl: jest.fn() }}
        onSignOut={onSignOut}
      >
        <Text>Billing</Text>
      </ConsentGate>,
    );
    await fireEvent.press(await screen.findByText('Sign out'));
    expect(onSignOut).toHaveBeenCalled();
  });

  it('shows when the user accepted, in More', async () => {
    await renderWithProviders(
      <LegalScreen
        deps={{ getMyConsent: async () => published('2026-11'), acceptTerms: jest.fn(), openUrl: jest.fn() }}
      />,
    );
    expect(await screen.findByText(/You accepted version 2026-11 on/)).toBeTruthy();
  });
});
