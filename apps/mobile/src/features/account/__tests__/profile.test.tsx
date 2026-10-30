import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { resolveDark, useAppearanceStore } from '@/core/appearance/appearance';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import {
  GetMyProfile,
  type MyProfile,
  type ProfilePatch,
  type ProfileRepository,
  UpdateMyProfile,
} from '../domain/profile';
import { ChangePasswordScreen, ProfileScreen } from '../presentation/screens/ProfileScreens';

class FakeProfiles implements ProfileRepository {
  profile: MyProfile = {
    displayName: 'Shubham',
    phone: null,
    email: 'owner@shop.in',
    preferredLanguage: 'en',
  };
  patches: ProfilePatch[] = [];
  async get() {
    return this.profile;
  }
  async update(patch: ProfilePatch) {
    this.patches.push(patch);
    this.profile = { ...this.profile, ...patch };
  }
}

const deps = (repo: FakeProfiles) => ({
  getProfile: new GetMyProfile(repo),
  updateProfile: new UpdateMyProfile(repo),
});

describe('appearance', () => {
  it('follows the phone on Auto and overrides it otherwise', () => {
    expect(resolveDark('system', 'dark')).toBe(true);
    expect(resolveDark('system', 'light')).toBe(false);
    expect(resolveDark('light', 'dark')).toBe(false);
    expect(resolveDark('dark', 'light')).toBe(true);
  });
});

describe('ProfileScreen', () => {
  afterEach(() => useAppearanceStore.setState({ mode: 'system' }));

  it('saves a tidied name and refuses a one-letter name', async () => {
    const repo = new FakeProfiles();
    await renderWithProviders(
      <ProfileScreen deps={deps(repo)} onChangePassword={jest.fn()} onSignOut={jest.fn()} />,
    );
    const name = await screen.findByLabelText('Your name');
    await fireEvent.changeText(name, 'S');
    await fireEvent.press(screen.getByText('Save name'));
    expect(await screen.findByText('Enter your name (2 to 80 letters).')).toBeTruthy();
    await fireEvent.changeText(name, '  Shubham   Jain ');
    await fireEvent.press(screen.getByText('Save name'));
    await waitFor(() => expect(repo.patches).toEqual([{ displayName: 'Shubham Jain' }]));
    expect(await screen.findByText('Saved.')).toBeTruthy();
  });

  it('switches to dark mode and back', async () => {
    await renderWithProviders(
      <ProfileScreen deps={deps(new FakeProfiles())} onChangePassword={jest.fn()} onSignOut={jest.fn()} />,
    );
    await fireEvent.press(await screen.findByText('Dark'));
    expect(useAppearanceStore.getState().mode).toBe('dark');
    await fireEvent.press(screen.getByText('Light'));
    expect(useAppearanceStore.getState().mode).toBe('light');
  });

  it('opens change password for an email account, and signs out', async () => {
    const onChangePassword = jest.fn();
    const onSignOut = jest.fn();
    await renderWithProviders(
      <ProfileScreen
        deps={deps(new FakeProfiles())}
        onChangePassword={onChangePassword}
        onSignOut={onSignOut}
      />,
    );
    await fireEvent.press(await screen.findByText('Change password'));
    await fireEvent.press(screen.getByText('Sign out'));
    expect(onChangePassword).toHaveBeenCalledWith('owner@shop.in');
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe('ChangePasswordScreen', () => {
  it('sends current and new password and closes when done', async () => {
    const execute = jest.fn(async () => {});
    const onDone = jest.fn();
    await renderWithProviders(
      <ChangePasswordScreen
        deps={{ changePassword: { execute }, errorKey: () => 'errors.UNKNOWN' }}
        email="owner@shop.in"
        onDone={onDone}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Current password'), 'old-pass-1');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'new-pass-1');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'new-pass-1');
    await fireEvent.press(screen.getByText('Save new password'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(execute).toHaveBeenCalledWith('owner@shop.in', 'old-pass-1', 'new-pass-1', 'new-pass-1');
  });
});
