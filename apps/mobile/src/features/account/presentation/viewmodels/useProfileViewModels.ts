import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { type AppearanceMode, setAppearance, useAppearanceStore } from '@/core/appearance/appearance';
import { translateError } from '@/core/errors/translateError';
import { setLanguage } from '@/core/localization/i18n';
import { type GetMyProfile, ProfileInputError, type UpdateMyProfile } from '../../domain/profile';

export interface ProfileViewModelDeps {
  getProfile: GetMyProfile;
  updateProfile: UpdateMyProfile;
}

export interface ChangePasswordViewModelDeps {
  /** Checks the current password, then sets the new one (authentication's ChangePassword). */
  changePassword: { execute(email: string, current: string, next: string, confirm: string): Promise<void> };
  /** Maps the authentication feature's input errors to message keys. */
  errorKey: (error: unknown) => string;
}

export const profileKey = ['profile'] as const;

const messageKey = (error: unknown) =>
  error instanceof ProfileInputError ? `profile.errors.${error.reason}` : translateError(error).messageKey;

/** My profile: name, sign-in contact (read only), language and appearance. */
export function useProfileViewModel(deps: ProfileViewModelDeps) {
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: profileKey, queryFn: () => deps.getProfile.execute() });
  // null until the user edits: the field then shows the saved name.
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mode = useAppearanceStore((s) => s.mode);
  const busy = useRef(false);

  const name = draft ?? profile.data?.displayName ?? '';

  const saveName = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setErrorKey(null);
    setSaved(false);
    try {
      await deps.updateProfile.execute({ displayName: name });
      await queryClient.invalidateQueries({ queryKey: profileKey });
      setDraft(null);
      setSaved(true);
    } catch (error) {
      setErrorKey(messageKey(error));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [deps, name, queryClient]);

  const chooseLanguage = useCallback(
    async (language: 'en' | 'hi') => {
      await setLanguage(language);
      try {
        await deps.updateProfile.execute({ preferredLanguage: language });
        await queryClient.invalidateQueries({ queryKey: profileKey });
      } catch (error) {
        setErrorKey(messageKey(error));
      }
    },
    [deps, queryClient],
  );

  return {
    state: {
      profile: profile.data ?? null,
      loading: profile.isPending,
      loadErrorKey: profile.error ? translateError(profile.error).messageKey : null,
      name,
      saving,
      saved,
      errorKey,
      appearance: mode,
      nameChanged: !!profile.data && name.trim() !== (profile.data.displayName ?? ''),
    },
    actions: {
      setName: (v: string) => {
        setDraft(v);
        setSaved(false);
        setErrorKey(null);
      },
      saveName,
      chooseLanguage,
      chooseAppearance: (m: AppearanceMode) => setAppearance(m),
      reload: () => void profile.refetch(),
    },
  };
}

/** Change password: current, new, new again. */
export function useChangePasswordViewModel(
  deps: ChangePasswordViewModelDeps,
  email: string,
  onDone: () => void,
) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const running = useRef(false);

  const submit = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await deps.changePassword.execute(email, form.current, form.next, form.confirm);
      onDone();
    } catch (error) {
      setErrorKey(deps.errorKey(error));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, [deps, email, form, onDone]);

  const set = (field: keyof typeof form) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrorKey(null);
  };
  return {
    state: { ...form, busy, errorKey },
    actions: { setCurrent: set('current'), setNext: set('next'), setConfirm: set('confirm'), submit },
  };
}
