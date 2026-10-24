// GENERATED FILE — do not edit by hand.
// Regenerate with `npm run db:types` (requires the local Supabase stack). CI fails if it is stale.
// Phase 01 has no public tables yet, so the schema is empty.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
