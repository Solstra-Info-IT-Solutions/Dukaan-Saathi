import type { CreateOnboardingRequestInput } from '@ds/contracts';
import { translateError } from '@/core/errors/translateError';
import type { OnboardingPhoto } from '../../domain/entities/Onboarding';
import type { OnboardingRepository } from '../../domain/repositories/OnboardingRepository';
import type { SupabaseOnboardingDataSource } from '../datasources/remote/SupabaseOnboardingDataSource';

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    throw translateError(e);
  }
}

export class OnboardingRepositoryImpl implements OnboardingRepository {
  constructor(private readonly remote: SupabaseOnboardingDataSource) {}

  latest = (shopId: string) => translated(() => this.remote.latest(shopId));
  create = (input: CreateOnboardingRequestInput) => translated(() => this.remote.create(input));
  addPhoto = (shopId: string, requestId: string, name: string, photo: OnboardingPhoto) =>
    translated(() => this.remote.addPhoto(shopId, requestId, name, photo));
}
