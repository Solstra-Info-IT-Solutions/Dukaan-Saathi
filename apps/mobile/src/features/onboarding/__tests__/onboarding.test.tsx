import type { CreateOnboardingRequestInput } from '@ds/contracts';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type { OnboardingPhoto, OnboardingRequest } from '../domain/entities/Onboarding';
import type { OnboardingRepository } from '../domain/repositories/OnboardingRepository';
import {
  GetLatestOnboarding,
  OnboardingInputError,
  RequestOnboarding,
  toIndianMobile,
} from '../domain/usecases/onboardingUseCases';
import { OnboardingStatusCard } from '../presentation/components/OnboardingStatusCard';
import { OnboardingRequestScreen } from '../presentation/screens/OnboardingRequestScreen';

const REQ = '0190f0f0-0000-7000-8000-0000000000e1';
const JOB = '0190f0f0-0000-7000-8000-0000000000e2';
const NOW = '2026-10-28T05:30:00.000Z';
const PHOTO: OnboardingPhoto = { uri: 'file:///list.jpg', mimeType: 'image/jpeg' };

const request = (over: Partial<OnboardingRequest> = {}): OnboardingRequest => ({
  id: REQ,
  shopId: SHOP_A,
  method: 'photos',
  contactPhone: null,
  preferredTime: null,
  note: null,
  operatorMayCommit: false,
  status: 'new',
  statusNote: null,
  importJobId: null,
  createdAt: NOW,
  updatedAt: NOW,
  files: [],
  ...over,
});

class FakeOnboardingRepository implements OnboardingRepository {
  current: OnboardingRequest | null = null;
  created: CreateOnboardingRequestInput[] = [];
  photoNames: string[] = [];
  async latest() {
    return this.current;
  }
  async create(input: CreateOnboardingRequestInput) {
    this.created.push(input);
    this.current ??= request({
      id: input.id,
      method: input.method,
      contactPhone: input.contactPhone ?? null,
    });
    return this.current;
  }
  async addPhoto(shopId: string, requestId: string, name: string, photo: OnboardingPhoto) {
    if (!this.photoNames.includes(name)) this.photoNames.push(name);
    const path = `${shopId}/${requestId}/${name}`;
    this.current = {
      ...this.current!,
      files: this.photoNames.map((n, i) => ({
        id: `0190f0f0-0000-7000-8000-${String(i + 1).padStart(12, '0')}`,
        path: n === name ? path : `${shopId}/${requestId}/${n}`,
        fileName: n,
        mimeType: photo.mimeType,
        sizeBytes: 1000,
      })),
    };
    return this.current;
  }
}

describe('toIndianMobile', () => {
  it.each([
    ['98765 43210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
  ])('accepts %s', (text, phone) => expect(toIndianMobile(text)).toBe(phone));
  it.each(['12345', '5876543210', '98765432101'])('rejects %s', (text) =>
    expect(toIndianMobile(text)).toBeNull(),
  );
});

describe('RequestOnboarding', () => {
  const input = {
    id: REQ,
    shopId: SHOP_A,
    method: 'photos' as const,
    phoneText: '98765 43210',
    preferredTime: ' after 4 pm ',
    note: '',
    photos: [PHOTO, { uri: 'file:///b.png', mimeType: 'image/png' }],
  };

  it('creates the request and attaches photos with fixed names, so a retry adds nothing new', async () => {
    const repo = new FakeOnboardingRepository();
    await new RequestOnboarding(repo).execute(input);
    const again = await new RequestOnboarding(repo).execute(input);
    expect(repo.created[0]).toEqual({
      id: REQ,
      shopId: SHOP_A,
      method: 'photos',
      contactPhone: '+919876543210',
      preferredTime: 'after 4 pm',
    });
    expect(repo.photoNames).toEqual(['photo-01.jpg', 'photo-02.png']);
    expect(again.files).toHaveLength(2);
  });

  it('needs photos for the photo method and a valid phone when one is typed', async () => {
    const repo = new FakeOnboardingRepository();
    await expect(new RequestOnboarding(repo).execute({ ...input, photos: [] })).rejects.toMatchObject({
      reason: 'PHOTOS_REQUIRED',
    });
    await expect(new RequestOnboarding(repo).execute({ ...input, phoneText: '123' })).rejects.toBeInstanceOf(
      OnboardingInputError,
    );
    await expect(
      new RequestOnboarding(repo).execute({ ...input, method: 'call', photos: [], phoneText: '' }),
    ).resolves.toMatchObject({ method: 'call' });
  });
});

function cardDeps(repo: FakeOnboardingRepository, enabled = true) {
  return { getLatestOnboarding: new GetLatestOnboarding(repo), isEnabled: async () => enabled };
}

describe('OnboardingStatusCard', () => {
  const handlers = { onRequest: jest.fn(), onReview: jest.fn() };

  it('offers help when the plan includes it and nothing was asked yet', async () => {
    const repo = new FakeOnboardingRepository();
    await renderWithProviders(
      <OnboardingStatusCard deps={cardDeps(repo)} shopId={SHOP_A} canReview {...handlers} />,
    );
    await fireEvent.press(await screen.findByText('Ask us to set it up'));
    expect(handlers.onRequest).toHaveBeenCalled();
  });

  it('shows nothing when the plan does not include managed onboarding', async () => {
    const repo = new FakeOnboardingRepository();
    await renderWithProviders(
      <OnboardingStatusCard deps={cardDeps(repo, false)} shopId={SHOP_A} canReview {...handlers} />,
    );
    await waitFor(() => expect(screen.queryByText('Too many items to type?')).toBeNull());
  });

  it('shows progress while our team works', async () => {
    const repo = new FakeOnboardingRepository();
    repo.current = request({ status: 'in_progress' });
    await renderWithProviders(
      <OnboardingStatusCard deps={cardDeps(repo)} shopId={SHOP_A} canReview {...handlers} />,
    );
    expect(await screen.findByText('Our team is typing in your items.')).toBeTruthy();
  });

  it('opens the prepared list to check', async () => {
    const repo = new FakeOnboardingRepository();
    repo.current = request({ status: 'awaiting_owner', importJobId: JOB, statusNote: '212 items ready' });
    await renderWithProviders(
      <OnboardingStatusCard deps={cardDeps(repo)} shopId={SHOP_A} canReview {...handlers} />,
    );
    expect(await screen.findByText('212 items ready')).toBeTruthy();
    await fireEvent.press(screen.getByText('Check and add items'));
    expect(handlers.onReview).toHaveBeenCalledWith(JOB);
  });

  it('hides the review button from members who cannot manage items', async () => {
    const repo = new FakeOnboardingRepository();
    repo.current = request({ status: 'awaiting_owner', importJobId: JOB });
    await renderWithProviders(
      <OnboardingStatusCard deps={cardDeps(repo)} shopId={SHOP_A} canReview={false} {...handlers} />,
    );
    expect(await screen.findByText('Your item list is ready')).toBeTruthy();
    expect(screen.queryByText('Check and add items')).toBeNull();
  });
});

describe('OnboardingRequestScreen', () => {
  it('sends photos and shows a validation message first', async () => {
    const repo = new FakeOnboardingRepository();
    const onSent = jest.fn();
    await renderWithProviders(
      <OnboardingRequestScreen
        deps={{
          requestOnboarding: new RequestOnboarding(repo),
          photos: { fromCamera: async () => PHOTO, fromLibrary: async () => null },
          newId: () => REQ,
        }}
        shopId={SHOP_A}
        onSent={onSent}
      />,
    );
    await fireEvent.press(screen.getByText('Send request'));
    expect(await screen.findByText('Add at least one photo of your item list.')).toBeTruthy();

    await fireEvent.press(screen.getByText('Take photo'));
    expect(await screen.findByText('1 photo')).toBeTruthy();
    await fireEvent.press(screen.getByText('Send request'));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(repo.photoNames).toEqual(['photo-01.jpg']);
  });
});
