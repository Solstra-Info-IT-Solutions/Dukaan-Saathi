import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import type { Session } from '@supabase/supabase-js';
import { AppError } from '@/core/errors/AppError';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import { AuthRepositoryImpl, toAuthSession } from '../data/repositories/AuthRepositoryImpl';
import type { SupabaseAuthDataSource } from '../data/datasources/remote/SupabaseAuthDataSource';
import type { AuthSession, OtpDestination } from '../domain/entities/AuthSession';
import { AuthInputError } from '../domain/errors';
import type { AuthRepository } from '../domain/repositories/AuthRepository';
import { RequestOtp, SignOut, toOtpDestination, VerifyOtp } from '../domain/usecases/authUseCases';
import { LoginScreen } from '../presentation/screens/LoginScreen';
import { useLoginViewModel } from '../presentation/viewmodels/useLoginViewModel';
import { RESEND_SECONDS, useOtpViewModel } from '../presentation/viewmodels/useOtpViewModel';

class FakeAuthRepository implements AuthRepository {
  requested: OtpDestination[] = [];
  verified: { destination: OtpDestination; code: string }[] = [];
  requestError: unknown = null;
  verifyError: unknown = null;
  signedOut = false;
  async requestOtp(destination: OtpDestination) {
    this.requested.push(destination);
    if (this.requestError) throw this.requestError;
  }
  async verifyOtp(destination: OtpDestination, code: string): Promise<AuthSession> {
    this.verified.push({ destination, code });
    if (this.verifyError) throw this.verifyError;
    return { userId: 'u1', phone: '+919876543210', email: null };
  }
  async getSession() {
    return null;
  }
  onSessionChange() {
    return () => {};
  }
  async signOut() {
    this.signedOut = true;
  }
}

describe('toOtpDestination', () => {
  it('normalises Indian phone numbers', () => {
    expect(toOtpDestination('phone', '98765 43210')).toEqual({ kind: 'phone', phoneE164: '+919876543210' });
  });
  it('rejects invalid input', () => {
    expect(() => toOtpDestination('phone', '12345')).toThrow(AuthInputError);
    expect(() => toOtpDestination('email', 'not-an-email')).toThrow(AuthInputError);
  });
  it('lower-cases email', () => {
    expect(toOtpDestination('email', ' Owner@Shop.IN ')).toEqual({ kind: 'email', email: 'owner@shop.in' });
  });
});

describe('auth use cases', () => {
  it('RequestOtp sends to the normalised destination', async () => {
    const repo = new FakeAuthRepository();
    await new RequestOtp(repo).execute('phone', '09876543210');
    expect(repo.requested).toEqual([{ kind: 'phone', phoneE164: '+919876543210' }]);
  });
  it('VerifyOtp rejects malformed codes without calling the server', async () => {
    const repo = new FakeAuthRepository();
    expect(() => new VerifyOtp(repo).execute({ kind: 'phone', phoneE164: '+919876543210' }, '12a')).toThrow(
      AuthInputError,
    );
    expect(repo.verified).toHaveLength(0);
  });
  it('SignOut clears local shop state before signing out', async () => {
    const order: string[] = [];
    const repo = new FakeAuthRepository();
    repo.signOut = async () => {
      order.push('auth');
    };
    await new SignOut(repo, async () => {
      order.push('local');
    }).execute();
    expect(order).toEqual(['local', 'auth']);
  });
});

describe('AuthRepositoryImpl', () => {
  it('translates Supabase auth error codes', async () => {
    const remote = {
      verifyOtp: async () => {
        throw { name: 'AuthApiError', code: 'otp_expired', message: 'Token has expired or is invalid' };
      },
    } as unknown as SupabaseAuthDataSource;
    await expect(
      new AuthRepositoryImpl(remote).verifyOtp({ kind: 'email', email: 'a@b.in' }, '123456'),
    ).rejects.toMatchObject({
      code: 'AUTH_OTP_INVALID',
    });
  });
  it('maps a session to E.164 phone', () => {
    const session = { user: { id: 'u1', phone: '919876543210', email: '' } } as unknown as Session;
    expect(toAuthSession(session)).toEqual({ userId: 'u1', phone: '+919876543210', email: null });
  });
});

describe('useLoginViewModel', () => {
  it('shows a validation error for a bad phone number', async () => {
    const { result } = await renderHook(() =>
      useLoginViewModel({ requestOtp: new RequestOtp(new FakeAuthRepository()) }),
    );
    await act(async () => result.current.actions.setValue('123'));
    let destination: OtpDestination | null = null;
    await act(async () => {
      destination = await result.current.actions.submit();
    });
    expect(destination).toBeNull();
    expect(result.current.state.errorKey).toBe('auth.errors.invalid_phone');
  });
  it('returns the destination when the code is sent', async () => {
    const repo = new FakeAuthRepository();
    const { result } = await renderHook(() => useLoginViewModel({ requestOtp: new RequestOtp(repo) }));
    await act(async () => result.current.actions.setValue('9876543210'));
    let destination: OtpDestination | null = null;
    await act(async () => {
      destination = await result.current.actions.submit();
    });
    expect(destination).toEqual({ kind: 'phone', phoneE164: '+919876543210' });
  });
  it('maps rate limiting to a message', async () => {
    const repo = new FakeAuthRepository();
    repo.requestError = new AppError('DS_RATE_LIMITED');
    const { result } = await renderHook(() => useLoginViewModel({ requestOtp: new RequestOtp(repo) }));
    await act(async () => result.current.actions.setValue('9876543210'));
    await act(async () => {
      await result.current.actions.submit();
    });
    expect(result.current.state.errorKey).toBe('errors.DS_RATE_LIMITED');
  });
});

describe('useOtpViewModel', () => {
  const destination: OtpDestination = { kind: 'phone', phoneE164: '+919876543210' };

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts down before allowing resend', async () => {
    const repo = new FakeAuthRepository();
    const deps = { verifyOtp: new VerifyOtp(repo), requestOtp: new RequestOtp(repo) };
    const { result } = await renderHook(() => useOtpViewModel(deps, destination));
    expect(result.current.state.resendInSeconds).toBe(RESEND_SECONDS);
    await act(async () => {
      await result.current.actions.resend();
    });
    expect(repo.requested).toHaveLength(0);
    for (let i = 0; i < RESEND_SECONDS; i++) {
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
    }
    expect(result.current.state.resendInSeconds).toBe(0);
    await act(async () => {
      await result.current.actions.resend();
    });
    expect(repo.requested).toEqual([destination]);
  });

  it('verifies the code and reports wrong codes', async () => {
    const repo = new FakeAuthRepository();
    repo.verifyError = new AppError('AUTH_OTP_INVALID');
    const deps = { verifyOtp: new VerifyOtp(repo), requestOtp: new RequestOtp(repo) };
    const { result } = await renderHook(() => useOtpViewModel(deps, destination));
    await act(async () => result.current.actions.setCode('12 34 56'));
    expect(result.current.state.code).toBe('123456');
    await act(async () => {
      await result.current.actions.verify();
    });
    expect(result.current.state.errorKey).toBe('errors.AUTH_OTP_INVALID');
    repo.verifyError = null;
    await act(async () => {
      await result.current.actions.verify();
    });
    expect(result.current.state.status).toBe('verified');
  });
});

describe('LoginScreen', () => {
  it('sends a code and reports the destination', async () => {
    const repo = new FakeAuthRepository();
    const onCodeSent = jest.fn();
    await renderWithProviders(
      <LoginScreen
        deps={{ requestOtp: new RequestOtp(repo) }}
        onCodeSent={onCodeSent}
        onOpenDiagnostics={jest.fn()}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText('Mobile number'), '9876543210');
    await fireEvent.press(screen.getByText('Send code'));
    await waitFor(() =>
      expect(onCodeSent).toHaveBeenCalledWith({ kind: 'phone', phoneE164: '+919876543210' }),
    );
  });
  it('switches to email', async () => {
    await renderWithProviders(
      <LoginScreen
        deps={{ requestOtp: new RequestOtp(new FakeAuthRepository()) }}
        onCodeSent={jest.fn()}
        onOpenDiagnostics={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByText('Email'));
    expect(screen.getByLabelText('Email address')).toBeOnTheScreen();
  });
});
