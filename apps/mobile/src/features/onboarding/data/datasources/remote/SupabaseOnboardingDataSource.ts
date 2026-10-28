import {
  type CreateOnboardingRequestInput,
  ONBOARDING_METHODS,
  ONBOARDING_STATUSES,
  OnboardingRequestSchema,
} from '@ds/contracts';
import { z } from 'zod';
import type { TypedSupabaseClient } from '@/core/network/supabaseClient';

export const ONBOARDING_BUCKET = 'onboarding-files';

const RowSchema = z.object({
  id: z.uuid(),
  shop_id: z.uuid(),
  method: z.enum(ONBOARDING_METHODS),
  contact_phone: z.string().nullable(),
  preferred_time: z.string().nullable(),
  note: z.string().nullable(),
  operator_may_commit: z.boolean(),
  status: z.enum(ONBOARDING_STATUSES),
  status_note: z.string().nullable(),
  import_job_id: z.uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  onboarding_files: z.array(
    z.object({
      id: z.uuid(),
      storage_path: z.string(),
      file_name: z.string(),
      mime_type: z.string(),
      size_bytes: z.number().int(),
    }),
  ),
});

/** Managed onboarding: RLS read of the shop's requests, RPC writes, private bucket for photos. */
export class SupabaseOnboardingDataSource {
  constructor(
    private readonly client: TypedSupabaseClient,
    private readonly readBytes: (uri: string) => Promise<ArrayBuffer>,
  ) {}

  async latest(shopId: string) {
    const { data, error } = await this.client
      .from('onboarding_requests')
      .select(
        'id, shop_id, method, contact_phone, preferred_time, note, operator_may_commit, status, status_note, ' +
          'import_job_id, created_at, updated_at, onboarding_files(id, storage_path, file_name, mime_type, size_bytes)',
      )
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    const [r] = z.array(RowSchema).parse(data);
    return r
      ? OnboardingRequestSchema.parse({
          id: r.id,
          shopId: r.shop_id,
          method: r.method,
          contactPhone: r.contact_phone,
          preferredTime: r.preferred_time,
          note: r.note,
          operatorMayCommit: r.operator_may_commit,
          status: r.status,
          statusNote: r.status_note,
          importJobId: r.import_job_id,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          files: r.onboarding_files.map((f) => ({
            id: f.id,
            path: f.storage_path,
            fileName: f.file_name,
            mimeType: f.mime_type,
            sizeBytes: f.size_bytes,
          })),
        })
      : null;
  }

  async create(input: CreateOnboardingRequestInput) {
    const { data, error } = await this.client.rpc('create_onboarding_request', { p_input: { ...input } });
    if (error) throw error;
    return OnboardingRequestSchema.parse(data);
  }

  async addPhoto(shopId: string, requestId: string, name: string, photo: { uri: string; mimeType: string }) {
    const bytes = await this.readBytes(photo.uri);
    const path = `${shopId}/${requestId}/${name}`;
    const upload = await this.client.storage
      .from(ONBOARDING_BUCKET)
      .upload(path, bytes, { contentType: photo.mimeType, upsert: true });
    if (upload.error) throw upload.error;
    const { data, error } = await this.client.rpc('add_onboarding_file', {
      p_input: {
        shopId,
        requestId,
        path,
        fileName: name,
        mimeType: photo.mimeType,
        sizeBytes: bytes.byteLength,
      },
    });
    if (error) throw error;
    return OnboardingRequestSchema.parse(data);
  }
}
