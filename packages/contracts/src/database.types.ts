// GENERATED FILE — do not edit by hand.
// Regenerate with `npm run db:types` (requires the local Supabase stack). CI fails if it is stale.
// Until the first generation run, this mirrors supabase/migrations/*_p01_baseline.sql by hand.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      get_my_platform_role: {
        Args: Record<PropertyKey, never>;
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
