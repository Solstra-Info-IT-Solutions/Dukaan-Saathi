// Public API of the help & support feature (Phase 11): tickets and announcements.
export type { SupportRepository } from './domain/repositories/SupportRepository';
export {
  CreateTicket,
  GetAnnouncements,
  GetTicketThread,
  ListTickets,
  ReplyToTicket,
  SupportInputError,
  localized,
} from './domain/usecases/supportUseCases';
export { SupportRepositoryImpl } from './data/repositories/SupportRepositoryImpl';
export { SupabaseSupportDataSource } from './data/datasources/remote/SupabaseSupportDataSource';
export { SupportScreen } from './presentation/screens/SupportScreen';
export { NewTicketScreen } from './presentation/screens/NewTicketScreen';
export { TicketScreen } from './presentation/screens/TicketScreen';
export { AnnouncementBanner } from './presentation/components/AnnouncementBanner';
export type {
  AnnouncementsViewModelDeps,
  SupportViewModelDeps,
} from './presentation/viewmodels/useSupportViewModels';
