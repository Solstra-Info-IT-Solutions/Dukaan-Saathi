import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { AppError } from '@/core/errors/AppError';
import { translateError } from '@/core/errors/translateError';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type { AuthSession, SignUpResult } from '../domain/entities/AuthSession';
import { AuthInputError } from '../domain/errors';
import type { AuthRepository } from '../domain/repositories/AuthRepository';
import {
  ChangePassword,
  RegisterAccount,
  RequestPasswordReset,
  ResetPassword,
  SignInWithPassword,
} from '../domain/usecases/authUseCases';
import {
  ForgotPasswordScreen,
  PasswordLoginScreen,
  RegisterScreen,
} from '../presentation/screens/PasswordAuthScreens';

const SESSION: AuthSession = { userId: 'u1', phone: null, email: 'owner@shop.in' };

/** In-memory accounts with Supabase-like behaviour (wrong password, taken email, emailed reset code). */
class FakePasswordAuth implements AuthRepository {
  accounts = new Map<string, string>([['owner@shop.in', 'chai-paani-123']]);
  confirmEmails = false;
  resetCodes = new Map<string, string>();
  calls: string[] = [];
  async requestOtp() {}
  async verifyOtp() {
    return SESSION;
  }
  async getSession() {
    return null;
  }
  onSessionChange() {
    return () => {};
  }
  async signOut() {}
  async signInWithPassword(email: string, password: string) {
    this.calls.push(`signIn:${email}`);
    if (this.accounts.get(email) !== password) throw new AppError('AUTH_INVALID_CREDENTIALS');
    return { ...SESSION, email };
  }
  async signUp(input: { email: string; password: string; displayName: string }): Promise<SignUpResult> {
    if (this.accounts.has(input.email)) throw new AppError('AUTH_EMAIL_IN_USE');
    this.accounts.set(input.email, input.password);
    this.calls.push(`signUp:${input.displayName}`);
    return this.confirmEmails
      ? { kind: 'confirm_email', email: input.email }
      : { kind: 'signed_in', session: { ...SESSION, email: input.email } };
  }
  async requestPasswordReset(email: string) {
    this.resetCodes.set(email, '482915');
  }
  async resetPassword(email: string, code: string, newPassword: string) {
    if (this.resetCodes.get(email) !== code) throw new AppError('AUTH_OTP_INVALID');
    this.accounts.set(email, newPassword);
    return { ...SESSION, email };
  }
  async updatePassword(newPassword: string) {
    this.accounts.set('owner@shop.in', newPassword);
  }
}

describe('password use cases', () => {
  it('signs in with a normalised email and refuses a wrong password', async () => {
    const auth = new FakePasswordAuth();
    await expect(
      new SignInWithPassword(auth).execute(' Owner@Shop.IN ', 'chai-paani-123'),
    ).resolves.toMatchObject({
      email: 'owner@shop.in',
    });
    await expect(new SignInWithPassword(auth).execute('owner@shop.in', 'nope')).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(() => new SignInWithPassword(auth).execute('not-an-email', 'x')).toThrow(AuthInputError);
  });

  it('checks name, email, password length and confirmation before creating an account', async () => {
    const register = new RegisterAccount(new FakePasswordAuth());
    const ok = {
      name: '  Shubham   Jain ',
      email: 'new@shop.in',
      password: 'secret-123',
      confirm: 'secret-123',
    };
    expect(() => register.execute({ ...ok, name: 'S' })).toThrow(
      expect.objectContaining({ reason: 'invalid_name' }),
    );
    expect(() => register.execute({ ...ok, password: 'short', confirm: 'short' })).toThrow(
      expect.objectContaining({ reason: 'invalid_password' }),
    );
    expect(() => register.execute({ ...ok, confirm: 'other-123' })).toThrow(
      expect.objectContaining({ reason: 'passwords_differ' }),
    );
    await expect(register.execute(ok)).resolves.toMatchObject({ kind: 'signed_in' });
    await expect(register.execute(ok)).rejects.toMatchObject({ code: 'AUTH_EMAIL_IN_USE' });
  });

  it('resets a password with the emailed code', async () => {
    const auth = new FakePasswordAuth();
    expect(await new RequestPasswordReset(auth).execute('Owner@Shop.in')).toBe('owner@shop.in');
    await expect(
      new ResetPassword(auth).execute('owner@shop.in', '000000', 'brand-new-1', 'brand-new-1'),
    ).rejects.toMatchObject({ code: 'AUTH_OTP_INVALID' });
    await new ResetPassword(auth).execute('owner@shop.in', '482 915', 'brand-new-1', 'brand-new-1');
    expect(auth.accounts.get('owner@shop.in')).toBe('brand-new-1');
  });

  it('changes the password only after checking the current one', async () => {
    const auth = new FakePasswordAuth();
    const change = new ChangePassword(auth);
    await expect(
      change.execute('owner@shop.in', 'wrong', 'brand-new-1', 'brand-new-1'),
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_CREDENTIALS',
    });
    expect(auth.accounts.get('owner@shop.in')).toBe('chai-paani-123');
    await change.execute('owner@shop.in', 'chai-paani-123', 'brand-new-1', 'brand-new-1');
    expect(auth.accounts.get('owner@shop.in')).toBe('brand-new-1');
  });

  it('maps Supabase auth error codes to messages', () => {
    expect(translateError({ code: 'invalid_credentials' }).code).toBe('AUTH_INVALID_CREDENTIALS');
    expect(translateError({ code: 'user_already_exists' }).code).toBe('AUTH_EMAIL_IN_USE');
    expect(translateError({ code: 'weak_password' }).code).toBe('AUTH_WEAK_PASSWORD');
    expect(translateError({ code: 'email_not_confirmed' }).code).toBe('AUTH_EMAIL_NOT_CONFIRMED');
    expect(translateError({ code: 'otp_expired' }).code).toBe('AUTH_OTP_INVALID');
  });
});

describe('password screens', () => {
  it('signs in, and explains a wrong password', async () => {
    const auth = new FakePasswordAuth();
    await renderWithProviders(
      <PasswordLoginScreen
        deps={{ signInWithPassword: new SignInWithPassword(auth) }}
        onForgot={jest.fn()}
        onRegister={jest.fn()}
        onUseCode={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'owner@shop.in');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-one');
    await fireEvent.press(screen.getByText('Sign in'));
    expect(await screen.findByText('Email or password is wrong.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Password'), 'chai-paani-123');
    await fireEvent.press(screen.getByText('Sign in'));
    await waitFor(() => expect(auth.calls).toEqual(['signIn:owner@shop.in', 'signIn:owner@shop.in']));
    expect(screen.queryByText('Email or password is wrong.')).toBeNull();
  });

  it('opens forgot password with the typed email, and the other sign-in ways', async () => {
    const onForgot = jest.fn();
    const onRegister = jest.fn();
    const onUseCode = jest.fn();
    await renderWithProviders(
      <PasswordLoginScreen
        deps={{ signInWithPassword: new SignInWithPassword(new FakePasswordAuth()) }}
        onForgot={onForgot}
        onRegister={onRegister}
        onUseCode={onUseCode}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'owner@shop.in');
    await fireEvent.press(screen.getByText('Forgot password?'));
    await fireEvent.press(screen.getByText('Register your shop'));
    await fireEvent.press(screen.getByText('Sign in with a one-time code'));
    expect(onForgot).toHaveBeenCalledWith('owner@shop.in');
    expect(onRegister).toHaveBeenCalled();
    expect(onUseCode).toHaveBeenCalled();
  });

  it('registers a shop owner; with email confirmation on, asks for the code next', async () => {
    const auth = new FakePasswordAuth();
    auth.confirmEmails = true;
    const onDone = jest.fn();
    await renderWithProviders(
      <RegisterScreen
        deps={{ registerAccount: new RegisterAccount(auth) }}
        onDone={onDone}
        onSignIn={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Your name'), 'Shubham Jain');
    await fireEvent.changeText(screen.getByLabelText('Email address'), 'new@shop.in');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'secret-123');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'secret-12');
    await fireEvent.press(screen.getByText('Create account'));
    expect(await screen.findByText('The two passwords do not match.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'secret-123');
    await fireEvent.press(screen.getByText('Create account'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith({ kind: 'confirm_email', email: 'new@shop.in' }));
    expect(auth.calls).toContain('signUp:Shubham Jain');
  });

  it('resets the password in two steps', async () => {
    const auth = new FakePasswordAuth();
    await renderWithProviders(
      <ForgotPasswordScreen
        deps={{
          requestPasswordReset: new RequestPasswordReset(auth),
          resetPassword: new ResetPassword(auth),
        }}
        initialEmail="owner@shop.in"
        onBack={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Email me a code'));
    expect(await screen.findByText(/Enter the code we sent to owner@shop.in/)).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Code'), '482915');
    await fireEvent.changeText(screen.getByLabelText('New password'), 'brand-new-1');
    await fireEvent.changeText(screen.getByLabelText('Confirm new password'), 'brand-new-1');
    await fireEvent.press(screen.getByText('Save new password'));
    await waitFor(() => expect(auth.accounts.get('owner@shop.in')).toBe('brand-new-1'));
  });
});
