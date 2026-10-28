import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import { translateError } from '@/core/errors/translateError';
import type { TicketCategory } from '../../domain/entities/Support';
import {
  type CreateTicket,
  type GetAnnouncements,
  type GetTicketThread,
  localized,
  type ListTickets,
  type ReplyToTicket,
  SupportInputError,
} from '../../domain/usecases/supportUseCases';

export interface SupportViewModelDeps {
  listTickets: ListTickets;
  getThread: GetTicketThread;
  createTicket: CreateTicket;
  replyToTicket: ReplyToTicket;
  newId: () => string;
}

export interface AnnouncementsViewModelDeps {
  getAnnouncements: GetAnnouncements;
}

export const supportKeys = {
  all: (shopId: string) => ['support', shopId] as const,
  list: (shopId: string) => ['support', shopId, 'list'] as const,
  thread: (shopId: string, ticketId: string) => ['support', shopId, 'thread', ticketId] as const,
  announcements: ['announcements'] as const,
};

const messageKey = (error: unknown) =>
  error instanceof SupportInputError ? `support.errors.${error.reason}` : translateError(error).messageKey;

/** The shop's tickets, latest activity first. */
export function useTicketsViewModel(deps: SupportViewModelDeps, shopId: string) {
  const list = useQuery({
    queryKey: supportKeys.list(shopId),
    queryFn: () => deps.listTickets.execute(shopId),
  });
  return {
    state: {
      tickets: list.data ?? [],
      loading: list.isPending,
      loadErrorKey: list.error ? translateError(list.error).messageKey : null,
    },
    actions: { reload: () => void list.refetch() },
  };
}

/** New ticket: category, subject, first message. The ticket id is fixed for the form. */
export function useNewTicketViewModel(
  deps: SupportViewModelDeps,
  shopId: string,
  onSent: (id: string) => void,
) {
  const queryClient = useQueryClient();
  const [id] = useState(() => deps.newId());
  const [category, setCategory] = useState<TicketCategory>('other');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const send = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setErrorKey(null);
    try {
      await deps.createTicket.execute({ id, shopId, category, subject, body });
      await queryClient.invalidateQueries({ queryKey: supportKeys.all(shopId) });
      onSent(id);
    } catch (error) {
      setErrorKey(messageKey(error));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, [body, category, deps, id, onSent, queryClient, shopId, subject]);

  return {
    state: { category, subject, body, sending, errorKey },
    actions: { setCategory, setSubject, setBody, send },
  };
}

/** One ticket's messages and a reply box. Replying to a resolved ticket reopens it; closed tickets are read-only. */
export function useTicketThreadViewModel(deps: SupportViewModelDeps, shopId: string, ticketId: string) {
  const queryClient = useQueryClient();
  const thread = useQuery({
    queryKey: supportKeys.thread(shopId, ticketId),
    queryFn: () => deps.getThread.execute(shopId, ticketId),
  });
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const busy = useRef(false);

  const send = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setSending(true);
    setErrorKey(null);
    try {
      await deps.replyToTicket.execute(shopId, ticketId, reply);
      setReply('');
      await queryClient.invalidateQueries({ queryKey: supportKeys.all(shopId) });
    } catch (error) {
      setErrorKey(messageKey(error));
    } finally {
      busy.current = false;
      setSending(false);
    }
  }, [deps, queryClient, reply, shopId, ticketId]);

  return {
    state: {
      ticket: thread.data?.ticket ?? null,
      messages: thread.data?.messages ?? [],
      loading: thread.isPending,
      loadErrorKey: thread.error ? translateError(thread.error).messageKey : null,
      canReply: !!thread.data && thread.data.ticket.status !== 'closed',
      reply,
      sending,
      errorKey,
    },
    actions: { setReply, send, reload: () => void thread.refetch() },
  };
}

/** Announcements for the banner. Dismissing hides a non-critical one until the app restarts. */
export function useAnnouncementsViewModel(deps: AnnouncementsViewModelDeps, lang: 'en' | 'hi') {
  const list = useQuery({
    queryKey: supportKeys.announcements,
    queryFn: () => deps.getAnnouncements.execute(),
    staleTime: 10 * 60_000,
  });
  const [dismissed, setDismissed] = useState<string[]>([]);
  return {
    state: {
      announcements: (list.data ?? [])
        .filter((a) => a.severity === 'critical' || !dismissed.includes(a.id))
        .map((a) => ({ id: a.id, severity: a.severity, ...localized(a, lang) })),
    },
    actions: { dismiss: (id: string) => setDismissed((d) => [...d, id]) },
  };
}
