import { QueryClient } from '@tanstack/react-query';
import { isAppError } from '@/core/errors/AppError';

/**
 * Query defaults: reads retry only on retryable errors; mutations never retry automatically —
 * financial writes are retried explicitly with the same client_operation_id (MVVM_ARCHITECTURE.md §6).
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < 2 && (!isAppError(error) || error.retryable),
      },
      mutations: { retry: false },
    },
  });
}
