import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { SHOP_A } from '../../../../tests/fakes/shops';
import { renderWithProviders } from '../../../../tests/renderWithProviders';
import type {
  Announcement,
  NewTicketCommand,
  SupportMessage,
  SupportTicket,
} from '../domain/entities/Support';
import type { SupportRepository } from '../domain/repositories/SupportRepository';
import {
  CreateTicket,
  GetAnnouncements,
  GetTicketThread,
  ListTickets,
  localized,
  ReplyToTicket,
} from '../domain/usecases/supportUseCases';
import { AnnouncementBanner } from '../presentation/components/AnnouncementBanner';
import { NewTicketScreen } from '../presentation/screens/NewTicketScreen';
import { TicketScreen } from '../presentation/screens/TicketScreen';

const T1 = '0190f0f0-0000-7000-8000-0000000000c1';
const NOW = '2026-10-28T05:30:00.000Z';

class FakeSupportRepository implements SupportRepository {
  tickets: SupportTicket[] = [];
  messages: Record<string, SupportMessage[]> = {};
  news: Announcement[] = [];
  created: NewTicketCommand[] = [];
  private n = 0;
  private msg(authorKind: 'shop' | 'operator', body: string): SupportMessage {
    return {
      id: `0190f0f0-0000-7000-8000-${String(++this.n).padStart(12, '0')}`,
      authorKind,
      body,
      createdAt: NOW,
    };
  }
  async listTickets() {
    return this.tickets;
  }
  async getTicket(_shopId: string, id: string) {
    return this.tickets.find((t) => t.id === id)!;
  }
  async listMessages(_shopId: string, id: string) {
    return this.messages[id] ?? [];
  }
  async createTicket(c: NewTicketCommand) {
    this.created.push(c);
    if (this.tickets.some((t) => t.id === c.id)) return;
    this.tickets.push({
      id: c.id,
      subject: c.subject,
      category: c.category,
      status: 'waiting_support',
      lastMessageAt: NOW,
      createdAt: NOW,
    });
    this.messages[c.id] = [this.msg('shop', c.body)];
  }
  async addMessage(_shopId: string, id: string, body: string) {
    this.messages[id] = [...(this.messages[id] ?? []), this.msg('shop', body)];
    this.tickets = this.tickets.map((t) => (t.id === id ? { ...t, status: 'waiting_support' } : t));
  }
  async announcements() {
    return this.news;
  }
  reply(id: string, body: string) {
    this.messages[id] = [...(this.messages[id] ?? []), this.msg('operator', body)];
    this.tickets = this.tickets.map((t) => (t.id === id ? { ...t, status: 'waiting_shop' } : t));
  }
}

const deps = (repo: FakeSupportRepository) => ({
  listTickets: new ListTickets(repo),
  getThread: new GetTicketThread(repo),
  createTicket: new CreateTicket(repo),
  replyToTicket: new ReplyToTicket(repo),
  newId: () => T1,
});

describe('CreateTicket', () => {
  it('trims and validates subject and message', async () => {
    const repo = new FakeSupportRepository();
    const create = new CreateTicket(repo);
    const base = {
      id: T1,
      shopId: SHOP_A,
      category: 'sync' as const,
      subject: '  Bills not sent  ',
      body: ' Help ',
    };
    await expect(create.execute({ ...base, subject: 'ab' })).rejects.toMatchObject({
      reason: 'SUBJECT_REQUIRED',
    });
    await expect(create.execute({ ...base, body: '  ' })).rejects.toMatchObject({
      reason: 'MESSAGE_REQUIRED',
    });
    await expect(create.execute({ ...base, body: 'x'.repeat(2001) })).rejects.toMatchObject({
      reason: 'MESSAGE_TOO_LONG',
    });
    await create.execute(base);
    expect(repo.created).toEqual([{ ...base, subject: 'Bills not sent', body: 'Help' }]);
  });
});

describe('support screens', () => {
  it('opens a ticket and hands its id back', async () => {
    const repo = new FakeSupportRepository();
    const onSent = jest.fn();
    await renderWithProviders(<NewTicketScreen deps={deps(repo)} shopId={SHOP_A} onSent={onSent} />);
    await fireEvent.press(screen.getByText('Sync / offline'));
    await fireEvent.changeText(screen.getByLabelText('Short title'), 'Bills stuck');
    await fireEvent.changeText(
      screen.getByLabelText('Your question'),
      'Three bills are not sent since morning.',
    );
    await fireEvent.press(screen.getByText('Send'));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(T1));
    expect(repo.created[0]?.category).toBe('sync');
  });

  it('shows our reply and lets the shop answer', async () => {
    const repo = new FakeSupportRepository();
    await repo.createTicket({
      id: T1,
      shopId: SHOP_A,
      category: 'billing',
      subject: 'GST on bill',
      body: 'How?',
    });
    repo.reply(T1, 'Turn on GST in Settings.');
    await renderWithProviders(<TicketScreen deps={deps(repo)} shopId={SHOP_A} ticketId={T1} />);
    expect(await screen.findByText('Turn on GST in Settings.')).toBeTruthy();
    expect(screen.getByText('We replied')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Your reply'), 'Done, thanks');
    await fireEvent.press(screen.getByText('Send'));
    expect(await screen.findByText('Done, thanks')).toBeTruthy();
    expect(screen.getByText('Waiting for our reply')).toBeTruthy();
  });

  it('does not offer a reply on a closed ticket', async () => {
    const repo = new FakeSupportRepository();
    await repo.createTicket({ id: T1, shopId: SHOP_A, category: 'other', subject: 'Old one', body: 'x' });
    repo.tickets[0] = { ...repo.tickets[0]!, status: 'closed' };
    await renderWithProviders(<TicketScreen deps={deps(repo)} shopId={SHOP_A} ticketId={T1} />);
    expect(await screen.findByText(/This question is closed/)).toBeTruthy();
    expect(screen.queryByLabelText('Your reply')).toBeNull();
  });
});

describe('announcements', () => {
  const news = (over: Partial<Announcement>): Announcement => ({
    id: T1,
    title: { en: 'Maintenance tonight', hi: 'आज रात रखरखाव' },
    body: { en: '11 pm to 12 am' },
    severity: 'info',
    startsAt: null,
    endsAt: null,
    ...over,
  });

  it('falls back to English when there is no Hindi text', () => {
    expect(localized(news({}), 'hi')).toEqual({ title: 'आज रात रखरखाव', body: '11 pm to 12 am' });
  });

  it('can dismiss an info banner but not a critical one', async () => {
    const repo = new FakeSupportRepository();
    repo.news = [
      news({}),
      news({
        id: '0190f0f0-0000-7000-8000-0000000000c2',
        title: { en: 'Update the app' },
        severity: 'critical',
      }),
    ];
    await renderWithProviders(<AnnouncementBanner deps={{ getAnnouncements: new GetAnnouncements(repo) }} />);
    expect(await screen.findByText(/Maintenance tonight/)).toBeTruthy();
    expect(screen.getAllByText('Dismiss')).toHaveLength(1);
    await fireEvent.press(screen.getByText('Dismiss'));
    await waitFor(() => expect(screen.queryByText(/Maintenance tonight/)).toBeNull());
    expect(screen.getByText(/Update the app/)).toBeTruthy();
  });
});
