import { type ClientConfig, DEFAULT_CLIENT_CONFIG } from '@ds/contracts';
import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { appGateState } from '../domain/appGate';
import { AppGate } from '../presentation/AppGate';

const config = (over: Partial<ClientConfig> = {}): ClientConfig => ({ ...DEFAULT_CLIENT_CONFIG, ...over });

describe('appGateState', () => {
  it('requires an update below the minimum version', () => {
    expect(appGateState(config({ minSupportedAppVersion: '1.4.0' }), '1.3.9').updateRequired).toBe(true);
    expect(appGateState(config({ minSupportedAppVersion: '1.4.0' }), '1.10.0').updateRequired).toBe(false);
  });
  it('hints at a newer version and passes the maintenance message on', () => {
    const s = appGateState(
      config({
        latestAppVersion: '0.2.0',
        maintenance: { active: true, message: { en: 'Back at 11 pm' }, blocksWrites: true },
      }),
      '0.1.0',
    );
    expect(s.updateAvailable).toBe(true);
    expect(s.maintenance?.message.en).toBe('Back at 11 pm');
  });
});

describe('AppGate', () => {
  const deps = (c: ClientConfig) => ({
    getClientConfig: async () => c,
    openUrl: jest.fn(async () => {}),
    appVersion: '0.1.0',
  });

  it('blocks the app and opens the Play Store when the version is too old', async () => {
    const d = deps(config({ minSupportedAppVersion: '0.2.0' }));
    await renderWithProviders(
      <AppGate deps={d}>
        <Text>Billing</Text>
      </AppGate>,
    );
    expect(await screen.findByText('Please update the app')).toBeTruthy();
    expect(screen.queryByText('Billing')).toBeNull();
    await fireEvent.press(screen.getByText('Update'));
    expect(d.openUrl).toHaveBeenCalledWith('market://details?id=in.dukaansaathi.app');
  });

  it('shows maintenance above the app', async () => {
    await renderWithProviders(
      <AppGate
        deps={deps(
          config({ maintenance: { active: true, message: { en: 'Back at 11 pm' }, blocksWrites: false } }),
        )}
      >
        <Text>Billing</Text>
      </AppGate>,
    );
    expect(await screen.findByText('Back at 11 pm')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
  });

  it('does not block when the config cannot be fetched', async () => {
    await renderWithProviders(
      <AppGate
        deps={{
          getClientConfig: async () => {
            throw new Error('offline');
          },
          openUrl: jest.fn(),
          appVersion: '0.1.0',
        }}
      >
        <Text>Billing</Text>
      </AppGate>,
    );
    expect(await screen.findByText('Billing')).toBeTruthy();
  });
});
