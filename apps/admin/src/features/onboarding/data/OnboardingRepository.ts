import 'server-only';
import { rpc } from '@/core/admin/rpc';
import type { AdminSupabaseClient } from '@/core/supabase/server';
import type { ImportRowInput } from '@ds/domain-core';
import type { OnboardingStatus } from '../domain/onboarding';

export interface OnboardingFile {
  id: string;
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface OnboardingRequest {
  id: string;
  shopId: string;
  shopName: string;
  city?: string | null;
  method: 'photos' | 'spreadsheet' | 'call';
  contactPhone: string | null;
  preferredTime: string | null;
  note: string | null;
  operatorMayCommit: boolean;
  status: OnboardingStatus;
  statusNote: string | null;
  importJobId: string | null;
  assignedToEmail: string | null;
  createdAt: string;
  updatedAt: string;
  files: OnboardingFile[];
  importJob?: {
    jobId: string;
    status: string;
    rowCount: number;
    validCount: number;
    errorCount: number;
    createCount: number;
    updateCount: number;
  } | null;
}

export const ONBOARDING_BUCKET = 'onboarding-files';

/** Onboarding queue and workbench (super_admin, onboarding_operator). */
export class OnboardingRepository {
  constructor(private readonly client: AdminSupabaseClient) {}

  list(status: OnboardingStatus | null) {
    return rpc<OnboardingRequest[]>(this.client, 'admin_list_onboarding', { p_status: status });
  }

  get(id: string) {
    return rpc<OnboardingRequest>(this.client, 'admin_get_onboarding', { p_id: id });
  }

  update(id: string, patch: { status?: OnboardingStatus; assignTo?: 'me' | 'none'; statusNote?: string }) {
    return rpc<OnboardingRequest>(this.client, 'admin_update_onboarding', { p_id: id, p_patch: patch });
  }

  createImportJob(id: string, fileName: string, clientOperationId: string) {
    return rpc(this.client, 'admin_create_import_job', {
      p_onboarding_id: id,
      p_file_name: fileName,
      p_client_operation_id: clientOperationId,
    });
  }

  stageRows(id: string, rows: ImportRowInput[]) {
    return rpc(this.client, 'admin_stage_import_rows', { p_onboarding_id: id, p_rows: rows });
  }

  /** Short-lived links (5 minutes) to the shop's photos and files; storage checks the operator's role. */
  async signedUrls(files: OnboardingFile[]): Promise<Record<string, string>> {
    if (files.length === 0) return {};
    const { data } = await this.client.storage.from(ONBOARDING_BUCKET).createSignedUrls(
      files.map((f) => f.path),
      300,
    );
    return Object.fromEntries(
      (data ?? []).flatMap((d) => (d.signedUrl && d.path ? [[d.path, d.signedUrl] as const] : [])),
    );
  }
}
