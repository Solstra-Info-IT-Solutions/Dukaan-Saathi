import { MAX_ONBOARDING_FILES } from '@ds/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type {
  OnboardingMethod,
  OnboardingPhoto,
  OnboardingPhotoPicker,
} from '../../domain/entities/Onboarding';
import { OnboardingInputError, type RequestOnboarding } from '../../domain/usecases/onboardingUseCases';
import { onboardingKeys } from './useOnboardingStatusViewModel';

export interface OnboardingRequestViewModelDeps {
  requestOnboarding: RequestOnboarding;
  photos: OnboardingPhotoPicker;
  newId: () => string;
}

/** "Set up my items for me": how we should get the list, how to reach the owner, photos of the list. */
export function useOnboardingRequestViewModel(
  deps: OnboardingRequestViewModelDeps,
  shopId: string,
  onSent: () => void,
) {
  const queryClient = useQueryClient();
  const [id] = useState(() => deps.newId());
  const [method, setMethod] = useState<OnboardingMethod>('photos');
  const [phoneText, setPhoneText] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<OnboardingPhoto[]>([]);
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const pick = useCallback(
    async (source: 'camera' | 'library') => {
      setErrorKey(null);
      if (photos.length >= MAX_ONBOARDING_FILES) {
        setErrorKey('onboarding.errors.TOO_MANY_PHOTOS');
        return;
      }
      try {
        const picked = source === 'camera' ? await deps.photos.fromCamera() : await deps.photos.fromLibrary();
        if (picked) setPhotos((p) => [...p, picked]);
      } catch {
        setErrorKey('onboarding.errors.PHOTO_FAILED');
      }
    },
    [deps, photos.length],
  );

  const send = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setErrorKey(null);
    try {
      await deps.requestOnboarding.execute({ id, shopId, method, phoneText, preferredTime, note, photos });
      await queryClient.invalidateQueries({ queryKey: onboardingKeys.all(shopId) });
      onSent();
    } catch (error) {
      setErrorKey(
        error instanceof OnboardingInputError
          ? `onboarding.errors.${error.reason}`
          : translateError(error).messageKey,
      );
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, [deps, id, method, note, onSent, phoneText, photos, preferredTime, queryClient, shopId]);

  return {
    state: { method, phoneText, preferredTime, note, photos, sending, errorKey },
    actions: {
      setMethod,
      setPhoneText,
      setPreferredTime,
      setNote,
      takePhoto: () => pick('camera'),
      choosePhoto: () => pick('library'),
      removePhoto: (index: number) => setPhotos((p) => p.filter((_, i) => i !== index)),
      send,
    },
  };
}
