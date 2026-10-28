import type { OnboardingMethod, OnboardingRequestDto, OnboardingStatus } from '@ds/contracts';

export type OnboardingRequest = OnboardingRequestDto;
export type { OnboardingMethod, OnboardingStatus };

export interface OnboardingPhoto {
  uri: string;
  mimeType: string;
}

/** Camera / gallery access for photos of the shop's item list (core/files implements it). */
export interface OnboardingPhotoPicker {
  fromCamera(): Promise<OnboardingPhoto | null>;
  fromLibrary(): Promise<OnboardingPhoto | null>;
}

/** Requests still being worked on by us or waiting for the owner. */
export const isOpen = (status: OnboardingStatus) => status !== 'completed' && status !== 'cancelled';
