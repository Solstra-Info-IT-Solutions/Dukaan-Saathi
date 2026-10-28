import { chunk, type ImportRowInput, mapImportTable, parseCsv } from '@ds/domain-core';

export type OnboardingStatus =
  'new' | 'assigned' | 'in_progress' | 'awaiting_owner' | 'completed' | 'cancelled';

export const STATUS_LABEL: Record<OnboardingStatus, string> = {
  new: 'New',
  assigned: 'Assigned',
  in_progress: 'In progress',
  awaiting_owner: 'Waiting for owner',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Steps an operator may take (same table as admin_update_onboarding). "Completed" is never chosen here: it happens
 * when the owner commits the import in the app.
 */
export const NEXT_STEPS: Record<OnboardingStatus, OnboardingStatus[]> = {
  new: ['assigned', 'cancelled'],
  assigned: ['in_progress', 'new', 'cancelled'],
  in_progress: ['awaiting_owner', 'cancelled'],
  awaiting_owner: ['in_progress'],
  completed: [],
  cancelled: [],
};

export const STEP_LABEL: Partial<Record<OnboardingStatus, string>> = {
  assigned: 'Take it (assign to me)',
  in_progress: 'Start work',
  new: 'Put back in the queue',
  awaiting_owner: 'Send to owner for approval',
  cancelled: 'Cancel request',
};

export interface CsvImport {
  /** Batches of at most 1000 rows for admin_stage_import_rows. */
  batches: ImportRowInput[][];
  rowCount: number;
  missingRequired: string[];
  unmappedHeaders: string[];
}

/** A CSV typed by the operator (same headers as the shop's own import) → staging batches. */
export function csvToImport(text: string): CsvImport {
  const mapped = mapImportTable(parseCsv(text.replace(/^﻿/, '')));
  return {
    batches: chunk(mapped.rows, 1000),
    rowCount: mapped.rows.length,
    missingRequired: mapped.missingRequired,
    unmappedHeaders: mapped.unmappedHeaders,
  };
}
