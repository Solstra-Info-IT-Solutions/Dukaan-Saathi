// GENERATED FILE — do not edit by hand.
// Source: `supabase gen types typescript` (Insert/Update of RPC-only tables narrowed to `never`) against dukaan-saathi-dev after migration 20261024143159.
// Regenerate with `npm run db:types` (local stack) whenever a migration changes the public schema.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          name_hi: string | null
          shop_id: string
          sort_order: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      import_job_rows: {
        Row: {
          action: string
          errors: string[]
          id: string
          job_id: string
          matched_product_id: string | null
          normalized: Json | null
          raw: Json
          row_number: number
          shop_id: string
          skipped_by_user: boolean
        }
        Insert: never
        Update: never
        Relationships: []
      }
      import_jobs: {
        Row: {
          client_operation_id: string
          committed_at: string | null
          create_count: number
          created_at: string
          created_by: string
          error_count: number
          file_name: string
          id: string
          kind: string
          row_count: number
          shop_id: string
          skip_count: number
          status: string
          update_count: number
          updated_at: string
          valid_count: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      product_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          product_id: string
          shop_id: string
          source: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      product_barcodes: {
        Row: {
          barcode: string
          created_at: string
          id: string
          product_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      product_price_history: {
        Row: {
          changed_by: string | null
          effective_from: string
          id: number
          price_paise: number
          product_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      products: {
        Row: {
          archived_at: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          hsn_code: string | null
          id: string
          is_active: boolean
          last_cost_paise: number | null
          low_stock_threshold_milli: number | null
          mrp_paise: number | null
          name: string
          name_hi: string | null
          price_paise: number
          search_text: string
          shop_id: string
          stock_on_hand_milli: number
          tax_rate_code: string | null
          track_stock: boolean
          unit_code: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      customer_ledger_entries: {
        Row: {
          amount_paise: number
          balance_after_paise: number
          business_date: string
          client_operation_id: string | null
          created_at: string
          created_by: string
          customer_id: string
          device_id: string | null
          id: string
          kind: string
          method: string | null
          note: string | null
          return_id: string | null
          sale_id: string | null
          seq: number
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      customers: {
        Row: {
          archived_at: string | null
          balance_paise: number
          created_at: string
          created_by: string
          credit_limit_paise: number | null
          id: string
          last_activity_at: string | null
          name: string
          note: string | null
          phone_e164: string | null
          shop_id: string
          udhaar_since: string | null
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      day_closures: {
        Row: {
          breakdown: Json
          business_date: string
          client_operation_id: string
          closed_at: string
          closed_by: string
          counted_cash_paise: number
          device_id: string
          difference_paise: number
          expected_cash_paise: number
          id: string
          note: string | null
          opening_cash_paise: number
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      expenses: {
        Row: {
          amount_paise: number
          attachment_path: string | null
          business_date: string
          category: string
          created_at: string
          created_by: string
          device_id: string | null
          id: string
          method: string
          note: string | null
          shop_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      purchase_items: {
        Row: {
          amount_paise: number
          id: string
          line_no: number
          name: string
          product_id: string
          purchase_id: string
          quantity_milli: number
          shop_id: string
          unit_cost_paise: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      purchase_payments: {
        Row: {
          amount_paise: number
          id: string
          method: string
          purchase_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      purchases: {
        Row: {
          business_date: string
          client_operation_id: string
          created_at: string
          created_by: string
          device_id: string | null
          id: string
          note: string | null
          paid_paise: number
          shop_id: string
          supplier_id: string | null
          supplier_invoice_date: string | null
          supplier_invoice_no: string | null
          total_paise: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      report_exports: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sale_return_items: {
        Row: {
          id: string
          line_no: number
          quantity_milli: number
          refund_paise: number
          return_id: string
          sale_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sale_returns: {
        Row: {
          business_date: string
          client_operation_id: string
          created_at: string
          created_by: string
          device_id: string
          id: string
          reason: string
          refund_method: string
          refund_paise: number
          sale_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sale_items: {
        Row: {
          bill_discount_share_paise: number
          entry_mode: string | null
          gross_paise: number
          id: string
          kind: string
          label: string | null
          line_discount_paise: number
          line_no: number
          hsn_code: string | null
          net_paise: number
          price_overridden: boolean
          product_id: string | null
          quantity_milli: number
          sale_id: string
          shop_id: string
          tax_paise: number
          tax_rate_bp: number
          unit_code: string | null
          unit_cost_paise: number | null
          unit_price_paise: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sale_payments: {
        Row: {
          amount_paise: number
          confirmation: string | null
          created_at: string
          id: string
          method: string
          reference: string | null
          sale_id: string
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      sales: {
        Row: {
          bill_discount_paise: number
          business_date: string
          client_operation_id: string
          created_at: string
          created_by: string
          customer_id: string | null
          device_id: string
          discount_paise: number
          fy: string
          id: string
          invoice_number: string
          note: string | null
          occurred_at: string
          origin: string
          paid_paise: number
          review_reasons: string[]
          round_off_paise: number
          seq: number
          shop_id: string
          source: string | null
          status: string
          subtotal_paise: number
          tax_mode: string
          tax_paise: number
          total_paise: number
          udhaar_paise: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          note: string | null
          product_id: string
          purchase_id: string | null
          quantity_milli: number
          reason: string | null
          return_id: string | null
          sale_id: string | null
          shop_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      supplier_ledger_entries: {
        Row: {
          amount_paise: number
          business_date: string
          client_operation_id: string | null
          created_at: string
          created_by: string
          device_id: string | null
          id: string
          kind: string
          method: string | null
          note: string | null
          purchase_id: string | null
          shop_id: string
          supplier_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      suppliers: {
        Row: {
          archived_at: string | null
          balance_paise: number
          created_at: string
          created_by: string
          gstin: string | null
          id: string
          name: string
          note: string | null
          phone_e164: string | null
          shop_id: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      tax_rates: {
        Row: {
          code: string
          effective_from: string
          effective_to: string | null
          label: string
          rate_bp: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      units: {
        Row: {
          allows_fraction: boolean
          code: string
          label: Json
          sort_order: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      entitlement_definitions: {
        Row: {
          default_value: Json
          description: string
          enforced_by: string
          key: string
          value_type: string
        }
        Insert: {
          default_value: Json
          description: string
          enforced_by: string
          key: string
          value_type: string
        }
        Update: {
          default_value?: Json
          description?: string
          enforced_by?: string
          key?: string
          value_type?: string
        }
        Relationships: []
      }
      invoice_series: {
        Row: {
          device_id: string
          fy: string
          last_seq: number
          prefix: string
          shop_id: string
        }
        Insert: {
          device_id: string
          fy: string
          last_seq?: number
          prefix: string
          shop_id: string
        }
        Update: {
          device_id?: string
          fy?: string
          last_seq?: number
          prefix?: string
          shop_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_series_shop_id_device_id_fkey"
            columns: ["shop_id", "device_id"]
            isOneToOne: false
            referencedRelation: "shop_devices"
            referencedColumns: ["shop_id", "id"]
          },
        ]
      }
      plan_entitlements: {
        Row: {
          entitlement_key: string
          plan_id: string
          value: Json
        }
        Insert: {
          entitlement_key: string
          plan_id: string
          value: Json
        }
        Update: {
          entitlement_key?: string
          plan_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlement_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          created_by: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_config: {
        Row: {
          key: string
          revision: number
          schema_version: number
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          revision?: number
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          revision?: number
          schema_version?: number
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          phone_e164: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          phone_e164?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          phone_e164?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          permission: string
          role: string
        }
        Insert: {
          permission: string
          role: string
        }
        Update: {
          permission?: string
          role?: string
        }
        Relationships: []
      }
      shop_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_code: string
          id: string
          installation_id: string
          label: string | null
          last_seen_at: string
          platform: string
          registered_by: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_code: string
          id?: string
          installation_id: string
          label?: string | null
          last_seen_at?: string
          platform: string
          registered_by: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_code?: string
          id?: string
          installation_id?: string
          label?: string | null
          last_seen_at?: string
          platform?: string
          registered_by?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_devices_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_entitlement_overrides: {
        Row: {
          created_at: string
          created_by: string | null
          entitlement_key: string
          expires_at: string | null
          id: string
          reason: string
          shop_id: string
          value: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entitlement_key: string
          expires_at?: string | null
          id?: string
          reason: string
          shop_id: string
          value: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entitlement_key?: string
          expires_at?: string | null
          id?: string
          reason?: string
          shop_id?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "shop_entitlement_overrides_entitlement_key_fkey"
            columns: ["entitlement_key"]
            isOneToOne: false
            referencedRelation: "entitlement_definitions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "shop_entitlement_overrides_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string | null
          expires_at: string
          id: string
          invited_by: string
          phone_e164: string | null
          role: string
          shop_id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by: string
          phone_e164?: string | null
          role: string
          shop_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          id?: string
          invited_by?: string
          phone_e164?: string | null
          role?: string
          shop_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_invitations_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_members: {
        Row: {
          created_at: string
          invited_by: string | null
          joined_at: string
          role: string
          shop_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          joined_at?: string
          role: string
          shop_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          joined_at?: string
          role?: string
          shop_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_members_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          cashier_discount_limit_bp: number
          cashier_sees_all_sales: boolean
          credit_limit_policy: string
          enabled_payment_methods: string[]
          gstin: string | null
          invoice_prefix: string
          manager_discount_limit_bp: number
          negative_stock_policy: string
          preferences: Json
          preferences_schema_version: number
          price_override_allowed: boolean
          prices_include_tax: boolean
          round_off_enabled: boolean
          shop_id: string
          tax_mode: string
          updated_at: string
          updated_by: string | null
          upi_vpa: string | null
          void_window_minutes: number
        }
        Insert: {
          cashier_discount_limit_bp?: number
          cashier_sees_all_sales?: boolean
          credit_limit_policy?: string
          enabled_payment_methods?: string[]
          gstin?: string | null
          invoice_prefix?: string
          manager_discount_limit_bp?: number
          negative_stock_policy?: string
          preferences?: Json
          preferences_schema_version?: number
          price_override_allowed?: boolean
          prices_include_tax?: boolean
          round_off_enabled?: boolean
          shop_id: string
          tax_mode?: string
          updated_at?: string
          updated_by?: string | null
          upi_vpa?: string | null
          void_window_minutes?: number
        }
        Update: {
          cashier_discount_limit_bp?: number
          cashier_sees_all_sales?: boolean
          credit_limit_policy?: string
          enabled_payment_methods?: string[]
          gstin?: string | null
          invoice_prefix?: string
          manager_discount_limit_bp?: number
          negative_stock_policy?: string
          preferences?: Json
          preferences_schema_version?: number
          price_override_allowed?: boolean
          prices_include_tax?: boolean
          round_off_enabled?: boolean
          shop_id?: string
          tax_mode?: string
          updated_at?: string
          updated_by?: string | null
          upi_vpa?: string | null
          void_window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: true
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          current_period_start: string
          id: string
          is_current: boolean
          plan_id: string
          provider: string
          provider_subscription_id: string | null
          shop_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          is_current?: boolean
          plan_id: string
          provider?: string
          provider_subscription_id?: string | null
          shop_id: string
          status: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          id?: string
          is_current?: boolean
          plan_id?: string
          provider?: string
          provider_subscription_id?: string | null
          shop_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shop_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shop_subscriptions_shop_id_fkey"
            columns: ["shop_id"]
            isOneToOne: false
            referencedRelation: "shops"
            referencedColumns: ["id"]
          },
        ]
      }
      shops: {
        Row: {
          address_line: string | null
          business_category: string
          city: string | null
          client_operation_id: string
          created_at: string
          created_by: string
          id: string
          name: string
          phone_e164: string | null
          pincode: string | null
          state_code: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          business_category: string
          city?: string | null
          client_operation_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
          phone_e164?: string | null
          pincode?: string | null
          state_code?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          business_category?: string
          city?: string | null
          client_operation_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          phone_e164?: string | null
          pincode?: string | null
          state_code?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_period: string
          code: string
          created_at: string
          id: string
          is_public: boolean
          name: Json
          price_paise: number
          revision: number
          status: string
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_period: string
          code: string
          created_at?: string
          id?: string
          is_public?: boolean
          name: Json
          price_paise?: number
          revision?: number
          status?: string
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_period?: string
          code?: string
          created_at?: string
          id?: string
          is_public?: boolean
          name?: Json
          price_paise?: number
          revision?: number
          status?: string
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_category: { Args: { p_id: string; p_shop_id: string }; Returns: undefined }
      archive_product: { Args: { p_product_id: string; p_shop_id: string }; Returns: undefined }
      cancel_import_job: { Args: { p_job_id: string }; Returns: undefined }
      commit_product_import: { Args: { p_client_operation_id: string; p_job_id: string }; Returns: Json }
      create_import_job: {
        Args: { p_client_operation_id: string; p_file_name: string; p_shop_id: string }
        Returns: Json
      }
      adjust_customer_balance: { Args: { p_input: Json }; Returns: Json }
      sync_pull: {
        Args: { p_cursors?: Json; p_device_id: string; p_limit?: number; p_shop_id: string }
        Returns: Json
      }
      sync_push: { Args: { p_input: Json }; Returns: Json }
      archive_customer: { Args: { p_customer_id: string; p_shop_id: string }; Returns: Json }
      check_customer_drift: { Args: { p_shop_id: string }; Returns: Json }
      get_customer_ledger: { Args: { p_customer_id: string; p_limit?: number; p_shop_id: string }; Returns: Json }
      list_customers: {
        Args: { p_limit?: number; p_query?: string; p_shop_id: string; p_sort?: string; p_udhaar_only?: boolean }
        Returns: Json
      }
      record_customer_repayment: { Args: { p_input: Json }; Returns: Json }
      save_customer: { Args: { p_input: Json }; Returns: Json }
      adjust_stock: { Args: { p_input: Json }; Returns: Json }
      begin_report_export: { Args: { p_shop_id: string }; Returns: Json }
      check_stock_drift: { Args: { p_shop_id: string }; Returns: Json }
      list_stock: { Args: { p_low_only?: boolean; p_query?: string; p_shop_id: string }; Returns: Json }
      receive_purchase: { Args: { p_input: Json }; Returns: Json }
      record_supplier_payment: { Args: { p_input: Json }; Returns: Json }
      save_supplier: { Args: { p_input: Json }; Returns: Json }
      submit_stock_count: { Args: { p_input: Json }; Returns: Json }
      close_day: { Args: { p_input: Json }; Returns: Json }
      create_sale: { Args: { p_input: Json }; Returns: Json }
      create_sale_return: { Args: { p_input: Json }; Returns: Json }
      get_dashboard_snapshot: { Args: { p_business_date?: string; p_shop_id: string }; Returns: Json }
      get_day_close: {
        Args: { p_business_date?: string; p_device_id: string; p_shop_id: string }
        Returns: Json
      }
      get_sales_report: {
        Args: { p_from: string; p_group_by?: string; p_shop_id: string; p_to: string }
        Returns: Json
      }
      record_expense: { Args: { p_input: Json }; Returns: Json }
      void_expense: { Args: { p_expense_id: string; p_reason: string; p_shop_id: string }; Returns: Json }
      get_sale: { Args: { p_sale_id: string; p_shop_id: string }; Returns: Json }
      list_sales: {
        Args: {
          p_cursor?: string
          p_from?: string
          p_limit?: number
          p_query?: string
          p_shop_id: string
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      void_sale: { Args: { p_input: Json }; Returns: Json }
      get_catalogue_reference: { Args: { p_shop_id: string }; Returns: Json }
      get_product: { Args: { p_product_id: string; p_shop_id: string }; Returns: Json }
      save_category: {
        Args: { p_id: string | null; p_name: string; p_name_hi?: string; p_shop_id: string }
        Returns: Json
      }
      save_product: { Args: { p_input: Json; p_shop_id: string }; Returns: Json }
      search_products: {
        Args: { p_category_id?: string; p_limit?: number; p_offset?: number; p_query?: string; p_shop_id: string }
        Returns: Json
      }
      stage_import_rows: { Args: { p_job_id: string; p_rows: Json }; Returns: Json }
      update_import_row: { Args: { p_patch?: Json; p_row_id: string; p_skip?: boolean }; Returns: Json }
      accept_shop_invitation: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      create_shop: { Args: { p_input: Json }; Returns: Json }
      deactivate_member: {
        Args: { p_shop_id: string; p_user_id: string }
        Returns: undefined
      }
      get_client_config: {
        Args: { p_app_version?: string; p_platform?: string }
        Returns: Json
      }
      get_my_context: { Args: never; Returns: Json }
      get_my_platform_role: { Args: never; Returns: string }
      get_shop_entitlements: { Args: { p_shop_id: string }; Returns: Json }
      get_shop_settings: { Args: { p_shop_id: string }; Returns: Json }
      list_shop_members: { Args: { p_shop_id: string }; Returns: Json }
      invite_shop_member: {
        Args: {
          p_email?: string
          p_phone?: string
          p_role: string
          p_shop_id: string
        }
        Returns: Json
      }
      register_device: {
        Args: {
          p_app_version?: string
          p_installation_id: string
          p_label?: string
          p_platform: string
          p_shop_id: string
        }
        Returns: Json
      }
      revoke_device: {
        Args: { p_device_id: string; p_shop_id: string }
        Returns: undefined
      }
      revoke_shop_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      update_member_role: {
        Args: { p_role: string; p_shop_id: string; p_user_id: string }
        Returns: undefined
      }
      update_my_profile: { Args: { p_patch: Json }; Returns: Json }
      update_shop_profile: {
        Args: { p_patch: Json; p_shop_id: string }
        Returns: Json
      }
      update_shop_settings: {
        Args: { p_patch: Json; p_shop_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
