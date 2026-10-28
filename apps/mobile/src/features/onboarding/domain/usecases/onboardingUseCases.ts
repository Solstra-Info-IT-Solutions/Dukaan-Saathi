import { MAX_ONBOARDING_FILES } from '@ds/contracts';
import type { OnboardingMethod, OnboardingPhoto, OnboardingRequest } from '../entities/Onboarding';
import type { OnboardingRepository } from '../repositories/OnboardingRepository';

export class OnboardingInputError extends Error {
  constructor(readonly reason: 'PHONE_INVALID' | 'PHOTOS_REQUIRED' | 'TOO_MANY_PHOTOS') {
    super(reason);
    this.name = 'OnboardingInputError';
  }
}

/** "98765 43210", "098765…", "+91 98765…" → "+919876543210"; null when it is not an Indian mobile number. */
export function toIndianMobile(text: string): string | null {
  const digits = text.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

const extension = (mimeType: string) =>
  mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';

/**
 * Asks us to set up the item list. The request id is fixed per form and each photo has a fixed name, so a retry after
 * a dropped connection neither creates a second request nor duplicates photos.
 */
export class RequestOnboarding {
  constructor(private readonly onboarding: OnboardingRepository) {}

  async execute(input: {
    id: string;
    shopId: string;
    method: OnboardingMethod;
    phoneText: string;
    preferredTime: string;
    note: string;
    photos: readonly OnboardingPhoto[];
  }): Promise<OnboardingRequest> {
    const phone = input.phoneText.trim() ? toIndianMobile(input.phoneText) : null;
    if (input.phoneText.trim() && !phone) throw new OnboardingInputError('PHONE_INVALID');
    if (input.method === 'photos' && input.photos.length === 0)
      throw new OnboardingInputError('PHOTOS_REQUIRED');
    if (input.photos.length > MAX_ONBOARDING_FILES) throw new OnboardingInputError('TOO_MANY_PHOTOS');

    let request = await this.onboarding.create({
      id: input.id,
      shopId: input.shopId,
      method: input.method,
      ...(phone ? { contactPhone: phone } : {}),
      ...(input.preferredTime.trim() ? { preferredTime: input.preferredTime.trim() } : {}),
      ...(input.note.trim() ? { note: input.note.trim() } : {}),
    });
    for (const [i, photo] of input.photos.entries()) {
      request = await this.onboarding.addPhoto(
        input.shopId,
        input.id,
        `photo-${String(i + 1).padStart(2, '0')}.${extension(photo.mimeType)}`,
        photo,
      );
    }
    return request;
  }
}

export class GetLatestOnboarding {
  constructor(private readonly onboarding: OnboardingRepository) {}
  execute(shopId: string): Promise<OnboardingRequest | null> {
    return this.onboarding.latest(shopId);
  }
}
