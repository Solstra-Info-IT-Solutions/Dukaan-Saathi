import type { CreateOnboardingRequestInput } from '@ds/contracts';
import type { OnboardingPhoto, OnboardingRequest } from '../entities/Onboarding';

export interface OnboardingRepository {
  /** The shop's most recent request, or null. */
  latest(shopId: string): Promise<OnboardingRequest | null>;
  /** Safe to repeat: the request id is the idempotency key. */
  create(input: CreateOnboardingRequestInput): Promise<OnboardingRequest>;
  /** Uploads to "<shop>/<request>/<name>" and records the file; repeating the same name does nothing new. */
  addPhoto(
    shopId: string,
    requestId: string,
    name: string,
    photo: OnboardingPhoto,
  ): Promise<OnboardingRequest>;
}
