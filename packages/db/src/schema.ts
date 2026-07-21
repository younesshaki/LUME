/**
 * Hand-written shape that mirrors `supabase/migrations/011_multi_tenant_foundation.sql`.
 *
 * Replace with `supabase gen types typescript` output when the schema stabilizes —
 * for now this is the source of truth the application code compiles against.
 */
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          status: "active" | "suspended" | "trial";
          theme: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: "active" | "suspended" | "trial";
          theme?: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [];
      };
      tenant_members: {
        Row: {
          tenant_id: string;
          user_id: string;
          role: "owner" | "admin" | "editor" | "viewer";
          sales_enabled: boolean;
          out_of_office: boolean;
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          user_id: string;
          role?: "owner" | "admin" | "editor" | "viewer";
          sales_enabled?: boolean;
          out_of_office?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_members"]["Insert"]>;
        Relationships: [];
      };
      tenant_member_preferences: {
        Row: {
          tenant_id: string;
          user_id: string;
          sidebar_single_expand: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_member_preferences"]["Row"],
          "sidebar_single_expand" | "created_at" | "updated_at"
        > & {
          sidebar_single_expand?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_member_preferences"]["Insert"]>;
        Relationships: [];
      };
      tenant_settings: {
        Row: {
          tenant_id: string;
          lead_assignment_mode: "manual" | "round_robin";
          last_lead_assignee_id: string | null;
          email_from_address: string | null;
          lead_email_enabled: boolean;
          lead_email_roles: Array<"owner" | "admin" | "editor" | "viewer">;
          lead_email_mode: "instant" | "hourly";
          lead_email_unassigned_address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_settings"]["Row"],
          | "lead_assignment_mode"
          | "last_lead_assignee_id"
          | "email_from_address"
          | "lead_email_enabled"
          | "lead_email_roles"
          | "lead_email_mode"
          | "lead_email_unassigned_address"
          | "created_at"
          | "updated_at"
        > & {
          lead_assignment_mode?: "manual" | "round_robin";
          last_lead_assignee_id?: string | null;
          email_from_address?: string | null;
          lead_email_enabled?: boolean;
          lead_email_roles?: Array<"owner" | "admin" | "editor" | "viewer">;
          lead_email_mode?: "instant" | "hourly";
          lead_email_unassigned_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_settings"]["Insert"]>;
        Relationships: [];
      };
      admin_notifications: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string | null;
          type: "lead.created" | "domain.verified" | "storage.quota_warning" | "csv_import.completed";
          body: string;
          link: string | null;
          dedupe_key: string | null;
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["admin_notifications"]["Row"],
          "id" | "user_id" | "link" | "dedupe_key" | "read_at" | "created_at"
        > & {
          id?: string;
          user_id?: string | null;
          link?: string | null;
          dedupe_key?: string | null;
          read_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_notifications"]["Insert"]>;
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          monthly_price_cents: number;
          limits: Record<string, unknown>;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["plans"]["Row"],
          "id" | "monthly_price_cents" | "limits" | "created_at"
        > & {
          id?: string;
          monthly_price_cents?: number;
          limits?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["plans"]["Insert"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_id: string;
          status: "inactive" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";
          current_period_start: string | null;
          current_period_end: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["subscriptions"]["Row"],
          | "id"
          | "status"
          | "current_period_start"
          | "current_period_end"
          | "stripe_subscription_id"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          status?: "inactive" | "trialing" | "active" | "past_due" | "canceled" | "incomplete";
          current_period_start?: string | null;
          current_period_end?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Insert"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          tenant_id: string;
          subscription_id: string;
          amount_cents: number;
          status: "draft" | "open" | "paid" | "void" | "uncollectible";
          stripe_invoice_id: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["invoices"]["Row"],
          "id" | "status" | "stripe_invoice_id" | "paid_at" | "created_at"
        > & {
          id?: string;
          status?: "draft" | "open" | "paid" | "void" | "uncollectible";
          stripe_invoice_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Insert"]>;
        Relationships: [];
      };
      usage_events: {
        Row: {
          tenant_id: string;
          event_type:
            | "chat_requests"
            | "vehicle_requests"
            | "bot_action_requests"
            | "lead_requests";
          period_start: string;
          count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["usage_events"]["Row"],
          "count" | "created_at" | "updated_at"
        > & {
          count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_events"]["Insert"]>;
        Relationships: [];
      };
      usage_snapshots: {
        Row: {
          tenant_id: string;
          metric: "r2_storage_bytes";
          captured_on: string;
          value: number;
          object_count: number;
          source: string;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["usage_snapshots"]["Row"],
          "captured_on" | "object_count" | "metadata" | "created_at" | "updated_at"
        > & {
          captured_on?: string;
          object_count?: number;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_snapshots"]["Insert"]>;
        Relationships: [];
      };
      tenant_storage_usage: {
        Row: {
          tenant_id: string;
          captured_on: string;
          captured_at: string;
          total_bytes: number;
          supabase_bytes: number;
          r2_bytes: number;
          total_object_count: number;
          supabase_object_count: number;
          r2_object_count: number;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_storage_usage"]["Row"],
          "captured_on" | "captured_at" | "metadata" | "created_at" | "updated_at"
        > & {
          captured_on?: string;
          captured_at?: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_storage_usage"]["Insert"]>;
        Relationships: [];
      };
      storage_upload_reservations: {
        Row: {
          id: string;
          tenant_id: string;
          reservation_key: string;
          byte_size: number;
          upload_expires_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["storage_upload_reservations"]["Row"],
          "id" | "created_at"
        > & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["storage_upload_reservations"]["Insert"]>;
        Relationships: [];
      };
      tenant_email_events: {
        Row: {
          id: string;
          tenant_id: string;
          provider: "resend";
          provider_event_id: string;
          provider_email_id: string;
          event_type: "email.delivered" | "email.bounced" | "email.complained";
          recipients: string[];
          template_key: string | null;
          bounce_type: string | null;
          bounce_subtype: string | null;
          bounce_message: string | null;
          occurred_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_email_events"]["Row"],
          "id" | "provider" | "template_key" | "bounce_type" | "bounce_subtype" |
          "bounce_message" | "created_at"
        > & {
          id?: string;
          provider?: "resend";
          template_key?: string | null;
          bounce_type?: string | null;
          bounce_subtype?: string | null;
          bounce_message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_email_events"]["Insert"]>;
        Relationships: [];
      };
      tenant_email_suppressions: {
        Row: {
          tenant_id: string;
          recipient_email: string;
          reason: "hard_bounce";
          source_event_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_email_suppressions"]["Row"],
          "reason" | "created_at" | "updated_at"
        > & {
          reason?: "hard_bounce";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_email_suppressions"]["Insert"]>;
        Relationships: [];
      };
      lead_email_digest_batches: {
        Row: {
          id: string;
          tenant_id: string;
          window_start: string;
          lead_ids: string[];
          status: "pending" | "delivering" | "retrying" | "sent" | "failed";
          attempt_count: number;
          next_attempt_at: string;
          last_error: string | null;
          sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["lead_email_digest_batches"]["Row"],
          "id" | "status" | "attempt_count" | "last_error" | "sent_at" |
          "created_at" | "updated_at"
        > & {
          id?: string;
          status?: "pending" | "delivering" | "retrying" | "sent" | "failed";
          attempt_count?: number;
          last_error?: string | null;
          sent_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_email_digest_batches"]["Insert"]>;
        Relationships: [];
      };
      tenant_webhooks: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          endpoint_url: string;
          events: string[];
          enabled: boolean;
          integration_kind: "hubspot" | "pipedrive" | "custom";
          retry_delays_seconds: number[];
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_webhooks"]["Row"],
          "id" | "events" | "enabled" | "integration_kind" |
          "retry_delays_seconds" | "created_at" | "updated_at"
        > & {
          id?: string;
          events?: string[];
          enabled?: boolean;
          integration_kind?: "hubspot" | "pipedrive" | "custom";
          retry_delays_seconds?: number[];
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_webhooks"]["Insert"]>;
        Relationships: [];
      };
      tenant_webhook_credentials: {
        Row: {
          webhook_id: string;
          tenant_id: string;
          signing_secret_ciphertext: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_webhook_credentials"]["Row"],
          "created_at" | "updated_at"
        > & { created_at?: string; updated_at?: string };
        Update: Partial<Database["public"]["Tables"]["tenant_webhook_credentials"]["Insert"]>;
        Relationships: [];
      };
      webhook_deliveries: {
        Row: {
          id: string;
          tenant_id: string;
          webhook_id: string;
          event_type: "lead.created" | "lead.status_changed" | "vehicle.sold" | "test_drive.scheduled";
          event_id: string;
          payload: Record<string, unknown>;
          status: "pending" | "delivering" | "retrying" | "succeeded" | "dead_letter";
          attempt_count: number;
          next_attempt_at: string;
          response_status: number | null;
          last_error: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["webhook_deliveries"]["Row"],
          | "id"
          | "status"
          | "attempt_count"
          | "next_attempt_at"
          | "response_status"
          | "last_error"
          | "delivered_at"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          status?: "pending" | "delivering" | "retrying" | "succeeded" | "dead_letter";
          attempt_count?: number;
          next_attempt_at?: string;
          response_status?: number | null;
          last_error?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["webhook_deliveries"]["Insert"]>;
        Relationships: [];
      };
      csv_imports: {
        Row: {
          id: string;
          tenant_id: string;
          import_type: "vehicle_inventory";
          mode: "add" | "replace" | "sync";
          status: "pending" | "running" | "succeeded" | "failed" | "partial";
          source_file_name: string;
          source_object_path: string | null;
          total_rows: number;
          processed_rows: number;
          succeeded_rows: number;
          failed_rows: number;
          skipped_rows: number;
          errors: Array<{ line: number | null; message: string }>;
          attempt_count: number;
          created_by: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["csv_imports"]["Row"],
          | "id"
          | "import_type"
          | "mode"
          | "status"
          | "source_object_path"
          | "total_rows"
          | "processed_rows"
          | "succeeded_rows"
          | "failed_rows"
          | "skipped_rows"
          | "errors"
          | "attempt_count"
          | "created_by"
          | "started_at"
          | "completed_at"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          import_type?: "vehicle_inventory";
          mode?: "add" | "replace" | "sync";
          status?: "pending" | "running" | "succeeded" | "failed" | "partial";
          source_object_path?: string | null;
          total_rows?: number;
          processed_rows?: number;
          succeeded_rows?: number;
          failed_rows?: number;
          skipped_rows?: number;
          errors?: Array<{ line: number | null; message: string }>;
          attempt_count?: number;
          created_by?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["csv_imports"]["Insert"]>;
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          tenant_id: string;
          external_id: string | null;
          feed_vin: string | null;
          feed_image_urls: string[];
          feed_updated_at: string | null;
          stock_type: string | null;
          year: number;
          make: string;
          model: string;
          trim: string;
          price: number;
          mileage: number | null;
          body_style: string;
          exterior_color: string;
          interior_color: string;
          drivetrain: string;
          fuel_type: string;
          image_src: string;
          seller_city: string;
          seller_state: string;
          is_special: boolean;
          special_image_src: string | null;
          search_vector: string | null;
          status: "draft" | "live" | "sold" | "archived";
          sold_at: string | null;
          sold_price: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicles"]["Row"],
          | "id"
          | "search_vector"
          | "status"
          | "sold_at"
          | "sold_price"
          | "feed_vin"
          | "feed_image_urls"
          | "feed_updated_at"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          status?: "draft" | "live" | "sold" | "archived";
          feed_vin?: string | null;
          feed_image_urls?: string[];
          feed_updated_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
        Relationships: [];
      };
      vehicle_images: {
        Row: {
          id: string;
          tenant_id: string;
          vehicle_id: string;
          r2_key: string;
          source_url: string | null;
          content_type: "image/jpeg" | "image/png" | "image/webp";
          byte_size: number;
          width: number | null;
          height: number | null;
          sort_order: number;
          is_primary: boolean;
          ai_description: string | null;
          ai_description_status: "pending" | "processing" | "completed" | "failed" | null;
          ai_description_model: string | null;
          ai_description_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicle_images"]["Row"],
          "id" | "sort_order" | "is_primary" | "ai_description" |
          "ai_description_status" | "ai_description_model" |
          "ai_description_updated_at" | "source_url" | "created_at" | "updated_at"
        > & {
          id?: string;
          sort_order?: number;
          is_primary?: boolean;
          ai_description?: string | null;
          ai_description_status?: "pending" | "processing" | "completed" | "failed" | null;
          ai_description_model?: string | null;
          ai_description_updated_at?: string | null;
          source_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicle_images"]["Insert"]>;
        Relationships: [];
      };
      tenant_inventory_versions: {
        Row: {
          tenant_id: string;
          version: number;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          version?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_inventory_versions"]["Insert"]>;
        Relationships: [];
      };
      vehicle_image_description_jobs: {
        Row: {
          id: string;
          tenant_id: string;
          image_id: string;
          status: "pending" | "delivering" | "retrying" | "completed" | "dead_letter";
          attempt_count: number;
          next_attempt_at: string;
          last_error: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicle_image_description_jobs"]["Row"],
          "id" | "status" | "attempt_count" | "next_attempt_at" | "last_error" |
          "completed_at" | "created_at" | "updated_at"
        > & {
          id?: string;
          status?: "pending" | "delivering" | "retrying" | "completed" | "dead_letter";
          attempt_count?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["vehicle_image_description_jobs"]["Insert"]>;
        Relationships: [];
      };
      rag_documents: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          category: string;
          source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["rag_documents"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["rag_documents"]["Insert"]>;
        Relationships: [];
      };
      rag_chunks: {
        Row: {
          id: string;
          tenant_id: string;
          document_id: string;
          external_id: string | null;
          text: string;
          category: string;
          embedding: number[] | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["rag_chunks"]["Row"],
          "id" | "created_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["rag_chunks"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          tenant_id: string;
          source: "chat" | "contact-form" | "test-drive" | "csv-import" | "api";
          status: "new" | "contacted" | "qualified" | "won" | "lost";
          assigned_to: string | null;
          first_name: string;
          last_name: string;
          email: string | null;
          phone: string | null;
          message: string | null;
          vehicle_id: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          referrer: string | null;
          source_context: Record<string, unknown> | null;
          ip_addr: string | null;
          user_agent: string | null;
          lost_reason: string | null;
          visitor_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["leads"]["Row"],
          "id" | "created_at" | "updated_at" | "visitor_id"
        > & { id?: string; visitor_id?: string | null };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      lead_lost_reason_options: {
        Row: {
          id: string;
          tenant_id: string;
          key: string;
          label: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["lead_lost_reason_options"]["Row"],
          "id" | "sort_order" | "is_active" | "created_at" | "updated_at"
        > & {
          id?: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["lead_lost_reason_options"]["Insert"]
        >;
        Relationships: [];
      };
      lead_activities: {
        Row: {
          id: string;
          lead_id: string;
          tenant_id: string;
          actor_user_id: string | null;
          type: "note" | "call" | "email" | "status_change" | "assignment";
          body: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["lead_activities"]["Row"],
          "id" | "created_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["lead_activities"]["Insert"]>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          tenant_id: string;
          actor_user_id: string | null;
          action: string;
          resource_type: string;
          resource_id: string | null;
          metadata: Record<string, unknown>;
          ip_addr: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["audit_log"]["Row"],
          "id" | "created_at" | "metadata"
        > & { id?: string; metadata?: Record<string, unknown> };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Insert"]>;
        Relationships: [];
      };
      price_history: {
        Row: {
          id: string;
          tenant_id: string;
          vehicle_id: string;
          old_price: number | null;
          new_price: number;
          changed_by: string | null;
          changed_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["price_history"]["Row"],
          "id" | "changed_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["price_history"]["Insert"]>;
        Relationships: [];
      };
      pages: {
        Row: {
          id: string;
          tenant_id: string;
          slug: string;
          title: string;
          nav_order: number;
          is_reserved: boolean;
          seo_meta: Record<string, unknown>;
          draft_revision_id: string | null;
          published_revision_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["pages"]["Row"],
          "id" | "archived_at" | "created_at" | "updated_at"
        > & { id?: string; archived_at?: string | null };
        Update: Partial<Database["public"]["Tables"]["pages"]["Insert"]> & {
          updated_at?: string;
        };
        Relationships: [];
      };
      page_revisions: {
        Row: {
          id: string;
          page_id: string;
          tenant_id: string;
          kind: "draft" | "published" | "autosave";
          blocks: { version: number; blocks: Array<{ id: string; type: string; props: Record<string, unknown> }> };
          created_by: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["page_revisions"]["Row"],
          "id" | "created_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["page_revisions"]["Insert"]>;
        Relationships: [];
      };
      tenant_domains: {
        Row: {
          id: string;
          tenant_id: string;
          domain: string;
          verified: boolean;
          verification_token: string;
          vercel_config: Record<string, unknown>;
          verification_status: "pending" | "verified" | "failed" | null;
          verification_checked_at: string | null;
          verification_failed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_domains"]["Row"],
          "id" | "verified" | "verification_token" | "vercel_config" |
          "verification_status" | "verification_checked_at" | "verification_failed_at" |
          "created_at"
        > & {
          id?: string;
          verified?: boolean;
          verification_token?: string;
          vercel_config?: Record<string, unknown>;
          verification_status?: "pending" | "verified" | "failed" | null;
          verification_checked_at?: string | null;
          verification_failed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_domains"]["Insert"]>;
        Relationships: [];
      };
      tenant_asset_scans: {
        Row: {
          id: string;
          tenant_id: string;
          bucket_id: string;
          object_key: string;
          content_type: string | null;
          byte_size: number | null;
          status: "pending" | "clean" | "infected" | "error" | "skipped" | "unavailable";
          scanner: string | null;
          signature: string | null;
          quarantine_key: string | null;
          scanned_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_asset_scans"]["Row"],
          "id" | "status" | "scanner" | "signature" | "quarantine_key" |
          "scanned_at" | "created_at" | "updated_at"
        > & {
          id?: string;
          status?: "pending" | "clean" | "infected" | "error" | "skipped" | "unavailable";
          scanner?: string | null;
          signature?: string | null;
          quarantine_key?: string | null;
          scanned_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_asset_scans"]["Insert"]>;
        Relationships: [];
      };
      bot_personas: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          tone: "cinematic" | "concise" | "warm" | "formal" | "technical";
          system_prompt: string;
          capabilities: Record<string, unknown>;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["bot_personas"]["Row"],
          | "id"
          | "name"
          | "tone"
          | "system_prompt"
          | "capabilities"
          | "is_active"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          name?: string;
          tone?: "cinematic" | "concise" | "warm" | "formal" | "technical";
          system_prompt?: string;
          capabilities?: Record<string, unknown>;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bot_personas"]["Insert"]>;
        Relationships: [];
      };
      tenant_bot_config: {
        Row: {
          tenant_id: string;
          persona: Record<string, unknown>;
          allowed_tools: string[];
          model: string;
          temperature: number;
          max_iterations: number;
          system_prompt_override: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_bot_config"]["Row"],
          | "persona"
          | "allowed_tools"
          | "model"
          | "temperature"
          | "max_iterations"
          | "system_prompt_override"
          | "created_at"
          | "updated_at"
        > & {
          persona?: Record<string, unknown>;
          allowed_tools?: string[];
          model?: string;
          temperature?: number;
          max_iterations?: number;
          system_prompt_override?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_bot_config"]["Insert"]>;
        Relationships: [];
      };
      concierge_targets: {
        Row: {
          id: string;
          tenant_id: string;
          key: string;
          label: string;
          kind: "route" | "section-anchor" | "form" | "modal";
          destination: string;
          ai_description: string;
          is_conversion: boolean;
          enabled: boolean;
          example_prompts: string[];
          sort_order: number;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["concierge_targets"]["Row"],
          | "id"
          | "is_conversion"
          | "enabled"
          | "example_prompts"
          | "sort_order"
          | "created_by"
          | "updated_by"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          is_conversion?: boolean;
          enabled?: boolean;
          example_prompts?: string[];
          sort_order?: number;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["concierge_targets"]["Insert"]>;
        Relationships: [];
      };
      loyalty_accounts: {
        Row: {
          id: string;
          tenant_id: string;
          lead_id: string | null;
          visitor_id: string | null;
          external_customer_id: string | null;
          email: string | null;
          phone: string | null;
          points_balance: number;
          tier: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loyalty_accounts"]["Row"],
          | "id"
          | "lead_id"
          | "visitor_id"
          | "external_customer_id"
          | "email"
          | "phone"
          | "points_balance"
          | "tier"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          lead_id?: string | null;
          visitor_id?: string | null;
          external_customer_id?: string | null;
          email?: string | null;
          phone?: string | null;
          points_balance?: number;
          tier?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loyalty_accounts"]["Insert"]>;
        Relationships: [];
      };
      loyalty_transactions: {
        Row: {
          id: string;
          tenant_id: string;
          account_id: string;
          lead_id: string | null;
          source: "manual" | "lead" | "purchase" | "redemption" | "adjustment" | "expiration";
          points_delta: number;
          balance_after: number;
          description: string | null;
          metadata: Record<string, unknown>;
          occurred_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loyalty_transactions"]["Row"],
          | "id"
          | "lead_id"
          | "source"
          | "description"
          | "metadata"
          | "occurred_at"
          | "created_at"
        > & {
          id?: string;
          lead_id?: string | null;
          source?: "manual" | "lead" | "purchase" | "redemption" | "adjustment" | "expiration";
          description?: string | null;
          metadata?: Record<string, unknown>;
          occurred_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loyalty_transactions"]["Insert"]>;
        Relationships: [];
      };
      loyalty_accrual_events: {
        Row: {
          id: string;
          tenant_id: string;
          account_id: string;
          visitor_id: string | null;
          event_type: "chat_session" | "saved_vehicle" | "submitted_lead" | "referral";
          points_delta: number;
          idempotency_key: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loyalty_accrual_events"]["Row"],
          "id" | "visitor_id" | "metadata" | "created_at"
        > & {
          id?: string;
          visitor_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loyalty_accrual_events"]["Insert"]>;
        Relationships: [];
      };
      loyalty_tiers: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          threshold: number;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["loyalty_tiers"]["Row"],
          "id" | "threshold" | "sort_order" | "created_at" | "updated_at"
        > & {
          id?: string;
          threshold?: number;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["loyalty_tiers"]["Insert"]>;
        Relationships: [];
      };
      visitors: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          password_hash: string;
          first_name: string;
          last_name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["visitors"]["Row"],
          "id" | "first_name" | "last_name" | "created_at" | "updated_at"
        > & {
          id?: string;
          first_name?: string;
          last_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["visitors"]["Insert"]>;
        Relationships: [];
      };
      visitor_saved_vehicles: {
        Row: {
          id: string;
          tenant_id: string;
          visitor_id: string;
          vehicle_id: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["visitor_saved_vehicles"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["visitor_saved_vehicles"]["Insert"]>;
        Relationships: [];
      };
      visitor_profiles: {
        Row: {
          visitor_id: string;
          tenant_id: string;
          preferences: Record<string, unknown>;
          learned_session_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["visitor_profiles"]["Row"],
          "preferences" | "learned_session_count" | "created_at" | "updated_at"
        > & {
          preferences?: Record<string, unknown>;
          learned_session_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["visitor_profiles"]["Insert"]>;
        Relationships: [];
      };
      visitor_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          visitor_id: string;
          token_hash: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["visitor_sessions"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["visitor_sessions"]["Insert"]>;
        Relationships: [];
      };
      chat_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          visitor_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["chat_sessions"]["Row"],
          "id" | "visitor_id" | "created_at" | "updated_at"
        > & {
          id?: string;
          visitor_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["chat_sessions"]["Insert"]>;
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          tenant_id: string;
          session_id: string;
          role: "user" | "assistant" | "system";
          content: string;
          is_server_observed: boolean;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["chat_messages"]["Row"],
          "id" | "is_server_observed" | "created_at"
        > & { id?: string; is_server_observed?: boolean; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["chat_messages"]["Insert"]>;
        Relationships: [];
      };
      tenant_invites: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: "owner" | "admin" | "editor" | "viewer";
          token: string;
          status: "pending" | "accepted" | "revoked" | "expired";
          expires_at: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_invites"]["Row"],
          | "id"
          | "role"
          | "token"
          | "status"
          | "expires_at"
          | "created_by"
          | "created_at"
          | "updated_at"
        > & {
          id?: string;
          role?: "owner" | "admin" | "editor" | "viewer";
          token?: string;
          status?: "pending" | "accepted" | "revoked" | "expired";
          expires_at?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_invites"]["Insert"]>;
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: { user_id: string; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["platform_admins"]["Insert"]>;
        Relationships: [];
      };
      consent_events: {
        Row: {
          id: string;
          tenant_id: string;
          choice: "accepted" | "rejected";
          consent_version: number;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["consent_events"]["Row"],
          "id" | "consent_version" | "created_at"
        > & { id?: string; consent_version?: number; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["consent_events"]["Insert"]>;
        Relationships: [];
      };
      conversion_events: {
        Row: {
          id: string;
          event_id: string;
          tenant_id: string;
          visitor_id: string | null;
          anonymous_session_id: string | null;
          vehicle_id: string | null;
          vehicle_title: string | null;
          event_name: "inventory_view" | "search_performed" | "filter_applied" | "vehicle_view" | "vehicle_saved" | "vehicle_unsaved" | "compare_added" | "compare_removed" | "inquiry_opened" | "inquiry_started" | "inquiry_submitted" | "chat_started" | "account_created";
          event_category: "analytics" | "operational";
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_content: string | null;
          referrer: string | null;
          metadata: Record<string, unknown>;
          occurred_at: string;
          created_at: string;
        };
        Insert: Omit<Database["public"]["Tables"]["conversion_events"]["Row"], "id" | "event_id" | "visitor_id" | "anonymous_session_id" | "vehicle_id" | "vehicle_title" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "referrer" | "metadata" | "occurred_at" | "created_at"> & {
          id?: string;
          event_id?: string;
          visitor_id?: string | null;
          anonymous_session_id?: string | null;
          vehicle_id?: string | null;
          vehicle_title?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_content?: string | null;
          referrer?: string | null;
          metadata?: Record<string, unknown>;
          occurred_at?: string;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      site_design_revisions: {
        Row: {
          id: string;
          tenant_id: string;
          design: Record<string, unknown>;
          template_key: string;
          template_version: number;
          published_by: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["site_design_revisions"]["Row"],
          "id" | "published_by" | "created_at"
        > & {
          id?: string;
          published_by?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      site_design_drafts: {
        Row: {
          id: string;
          tenant_id: string;
          template_key: string;
          design: Record<string, unknown>;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["site_design_drafts"]["Row"],
          "id" | "updated_by" | "created_at" | "updated_at"
        > & {
          id?: string;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["site_design_drafts"]["Insert"]>;
        Relationships: [];
      };
      tenant_api_keys: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          scopes: string[];
          created_by: string | null;
          last_used_at: string | null;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_api_keys"]["Row"],
          "id" | "scopes" | "created_by" | "last_used_at" | "revoked_at" | "created_at"
        > & {
          id?: string;
          scopes?: string[];
          created_by?: string | null;
          last_used_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_api_keys"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      tenant_by_slug: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          slug: string;
          name: string;
          status: "active" | "suspended" | "trial";
        }[];
      };
      tenant_ids_for_current_user: {
        Args: Record<string, never>;
        Returns: string[];
      };
      vehicle_facets: {
        Args: { p_tenant_id: string; p_make?: string | null; p_state?: string | null };
        Returns: {
          makes: string[];
          models: string[];
          states: string[];
          cities: string[];
        }[];
      };
      vehicle_facets_v2: {
        Args: { p_tenant_id: string; p_make?: string | null; p_state?: string | null };
        Returns: {
          makes: string[];
          models: string[];
          states: string[];
          cities: string[];
          year_min: number | null;
          year_max: number | null;
          price_min: number | null;
          price_max: number | null;
          mileage_min: number | null;
          mileage_max: number | null;
          catalog_version: number;
        }[];
      };
      vehicle_facets_by_slug: {
        Args: { p_slug: string; p_make?: string | null; p_state?: string | null };
        Returns: {
          makes: string[];
          models: string[];
          states: string[];
          cities: string[];
          year_min: number | null;
          year_max: number | null;
          price_min: number | null;
          price_max: number | null;
          mileage_min: number | null;
          mileage_max: number | null;
          catalog_version: number;
        }[];
      };
      public_vehicle_inventory: {
        Args: { p_tenant_id: string };
        Returns: {
          id: string;
          tenant_id: string;
          external_id: string | null;
          stock_type: string | null;
          year: number;
          make: string;
          model: string;
          trim: string;
          price: number;
          mileage: number | null;
          body_style: string;
          exterior_color: string;
          interior_color: string;
          drivetrain: string;
          fuel_type: string;
          image_src: string;
          seller_city: string;
          seller_state: string;
          is_special: boolean;
          special_image_src: string | null;
          search_vector: string | null;
          status: "live";
          sold_at: string | null;
          sold_price: number | null;
          created_at: string;
          primary_image_r2_key: string | null;
          primary_image_alt: string | null;
          catalog_version: number;
        }[];
      };
      public_vehicle_inventory_by_slug: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          tenant_id: string;
          external_id: string | null;
          stock_type: string | null;
          year: number;
          make: string;
          model: string;
          trim: string;
          price: number;
          mileage: number | null;
          body_style: string;
          exterior_color: string;
          interior_color: string;
          drivetrain: string;
          fuel_type: string;
          image_src: string;
          seller_city: string;
          seller_state: string;
          is_special: boolean;
          special_image_src: string | null;
          search_vector: string | null;
          status: "live";
          sold_at: string | null;
          sold_price: number | null;
          created_at: string;
          primary_image_r2_key: string | null;
          primary_image_alt: string | null;
          catalog_version: number;
        }[];
      };
      user_has_tenant_role: {
        Args: { p_tenant_id: string; p_roles: string[] };
        Returns: boolean;
      };
      match_rag_chunks_for_tenant: {
        Args: {
          p_tenant_id: string;
          p_query_embedding: number[];
          p_match_count?: number;
        };
        Returns: {
          id: string;
          document_id: string;
          text: string;
          category: string;
          similarity: number;
        }[];
      };
      get_published_page: {
        Args: { p_tenant_id: string; p_slug: string };
        Returns: {
          id: string;
          slug: string;
          title: string;
          seo_meta: Record<string, unknown>;
          blocks: { version: number; blocks: Array<{ id: string; type: string; props: Record<string, unknown> }> };
          published_revision_id: string | null;
        }[];
      };
      get_tenant_theme: {
        Args: { p_slug: string };
        Returns: {
          theme: Record<string, unknown>;
        }[];
      };
      list_published_nav_pages: {
        Args: { p_tenant_id: string };
        Returns: {
          slug: string;
          title: string;
          nav_order: number;
        }[];
      };
      accrue_loyalty_points: {
        Args: {
          p_tenant_id: string;
          p_visitor_id: string;
          p_event_type: "chat_session" | "saved_vehicle" | "submitted_lead" | "referral";
          p_idempotency_key: string;
          p_description?: string | null;
          p_metadata?: Record<string, unknown>;
        };
        Returns: {
          applied: boolean;
          points_delta: number;
          balance_after: number;
          transaction_id: string | null;
        }[];
      };
      mutate_visitor_saved_vehicle: {
        Args: {
          p_tenant_id: string;
          p_visitor_id: string;
          p_vehicle_id: string;
          p_operation: "save" | "unsave";
        };
        Returns: {
          changed: boolean;
          saved_id: string | null;
          vehicle_id: string;
          saved_at: string | null;
          operational_event_id: string | null;
        }[];
      };
      publish_site_design: {
        Args: {
          p_tenant_id: string;
          p_design: Record<string, unknown>;
          p_actor: string;
          p_max_revisions: number;
        };
        Returns: Record<string, unknown>;
      };
      tenant_conversion_funnel: {
        Args: { p_tenant_id: string; p_since: string };
        Returns: Array<{ event_name: string; event_count: number; session_count: number }>;
      };
      tenant_conversion_report: {
        Args: { p_tenant_id: string; p_since: string };
        Returns: Record<string, unknown>;
      };
      archive_due_sold_vehicles: {
        Args: { p_cutoff: string; p_limit?: number };
        Returns: { vehicle_id: string }[];
      };
      bulk_update_vehicle_prices: {
        Args: {
          p_tenant_id: string;
          p_vehicle_ids: string[];
          p_rule: "percent" | "fixed" | "set";
          p_value: number;
        };
        Returns: number;
      };
      set_public_vehicle_price_signal: {
        Args: { p_tenant_id: string; p_enabled: boolean };
        Returns: boolean;
      };
      get_public_vehicle_price_signal: {
        Args: { p_tenant_id: string; p_vehicle_id: string };
        Returns: { enabled: boolean; reductions: number }[];
      };
      reorder_vehicle_images: {
        Args: { p_tenant_id: string; p_vehicle_id: string; p_image_ids: string[] };
        Returns: boolean;
      };
      set_primary_vehicle_image: {
        Args: { p_tenant_id: string; p_vehicle_id: string; p_image_id: string };
        Returns: boolean;
      };
      delete_vehicle_image: {
        Args: { p_tenant_id: string; p_vehicle_id: string; p_image_id: string };
        Returns: { r2_key: string; promoted_image_id: string | null }[];
      };
      increment_usage_event: {
        Args: {
          p_tenant_id: string;
          p_event_type:
            | "chat_requests"
            | "vehicle_requests"
            | "bot_action_requests"
            | "lead_requests";
          p_period_start?: string | null;
          p_increment?: number;
        };
        Returns: number;
      };
      consume_usage_event: {
        Args: {
          p_tenant_id: string;
          p_event_type:
            | "chat_requests"
            | "vehicle_requests"
            | "bot_action_requests"
            | "lead_requests";
          p_limit: number | null;
          p_period_start?: string | null;
        };
        Returns: {
          allowed: boolean;
          usage_count: number;
          period_start: string;
        }[];
      };
      measure_tenant_supabase_storage: {
        Args: { p_tenant_id: string };
        Returns: {
          bucket_id: "tenant-logos" | "tenant-media" | "tenant-csvs" | "tenant-3d-models";
          bytes: number;
          object_count: number;
          invalid_object_count: number;
        }[];
      };
      tenant_storage_limit_bytes: {
        Args: { p_tenant_id: string };
        Returns: number | null;
      };
      reserve_tenant_storage_upload: {
        Args: {
          p_tenant_id: string;
          p_reservation_key: string;
          p_byte_size: number;
          p_upload_expires_at: string;
        };
        Returns: {
          allowed: boolean;
          reason: string;
          current_bytes: number | null;
          projected_bytes: number | null;
          limit_bytes: number | null;
          warning: boolean;
        }[];
      };
      tenant_storage_upload_allowed: {
        Args: {
          p_tenant_id_text: string;
          p_bucket_id: string;
          p_object_name: string;
          p_candidate_bytes_text: string;
        };
        Returns: boolean;
      };
      record_resend_email_event: {
        Args: {
          p_tenant_id: string;
          p_provider_event_id: string;
          p_provider_email_id: string;
          p_event_type: "email.delivered" | "email.bounced" | "email.complained";
          p_recipients: string[];
          p_template_key: string | null;
          p_bounce_type: string | null;
          p_bounce_subtype: string | null;
          p_bounce_message: string | null;
          p_occurred_at: string;
        };
        Returns: "recorded" | "duplicate" | "unknown_tenant";
      };
      enqueue_lead_email_digest: {
        Args: { p_tenant_id: string; p_lead_id: string; p_created_at: string };
        Returns: string | null;
      };
      claim_lead_email_digests: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          tenant_id: string;
          window_start: string;
          lead_ids: string[];
          attempt_count: number;
        }[];
      };
      claim_tenant_domains_for_verification: {
        Args: { p_limit?: number };
        Returns: Database["public"]["Tables"]["tenant_domains"]["Row"][];
      };
      tenant_custom_domain_limit: {
        Args: { p_tenant_id: string };
        Returns: number;
      };
      create_tenant_domain_with_limit: {
        Args: {
          p_tenant_id: string;
          p_domain: string;
          p_vercel_config?: Record<string, unknown>;
          p_verification_status?: "pending" | "verified";
          p_verified?: boolean;
          p_verification_checked_at?: string | null;
        };
        Returns: {
          outcome: string;
          domain_id: string | null;
          domain_limit: number;
          domain_count: number;
        }[];
      };
      create_tenant_crm_webhook: {
        Args: {
          p_tenant_id: string;
          p_name: string;
          p_endpoint_url: string;
          p_integration_kind: "hubspot" | "pipedrive" | "custom";
          p_retry_delays_seconds: number[];
          p_signing_secret_ciphertext: string;
        };
        Returns: string;
      };
      claim_webhook_deliveries: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          tenant_id: string;
          webhook_id: string;
          endpoint_url: string;
          event_type: "lead.created" | "lead.status_changed" | "vehicle.sold" | "test_drive.scheduled";
          event_id: string;
          payload: Record<string, unknown>;
          attempt_count: number;
          signing_secret_ciphertext: string;
          retry_delays_seconds: number[];
        }[];
      };
      enqueue_vehicle_image_description: {
        Args: { p_tenant_id: string; p_image_id: string };
        Returns: string | null;
      };
      claim_vehicle_image_description_jobs: {
        Args: { p_limit?: number };
        Returns: {
          id: string;
          tenant_id: string;
          image_id: string;
          r2_key: string;
          content_type: "image/jpeg" | "image/png" | "image/webp";
          byte_size: number;
          attempt_count: number;
          vehicle_year: number;
          vehicle_make: string;
          vehicle_model: string;
          vehicle_trim: string | null;
        }[];
      };
      complete_vehicle_image_description_job: {
        Args: {
          p_job_id: string;
          p_attempt_count: number;
          p_description: string;
          p_model: string;
        };
        Returns: boolean;
      };
      fail_vehicle_image_description_job: {
        Args: {
          p_job_id: string;
          p_attempt_count: number;
          p_next_attempt_at: string | null;
          p_error: string;
        };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
