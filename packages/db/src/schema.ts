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
      tenant_settings: {
        Row: {
          tenant_id: string;
          lead_assignment_mode: "manual" | "round_robin";
          last_lead_assignee_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_settings"]["Row"],
          "lead_assignment_mode" | "last_lead_assignee_id" | "created_at" | "updated_at"
        > & {
          lead_assignment_mode?: "manual" | "round_robin";
          last_lead_assignee_id?: string | null;
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
          read_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["admin_notifications"]["Row"],
          "id" | "user_id" | "link" | "read_at" | "created_at"
        > & {
          id?: string;
          user_id?: string | null;
          link?: string | null;
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
      tenant_webhooks: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          endpoint_url: string;
          events: string[];
          enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_webhooks"]["Row"],
          "id" | "events" | "enabled" | "created_at" | "updated_at"
        > & {
          id?: string;
          events?: string[];
          enabled?: boolean;
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
          mode: "add" | "replace";
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
          mode?: "add" | "replace";
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
          | "created_at"
          | "updated_at"
        > & { id?: string; status?: "draft" | "live" | "sold" | "archived" };
        Update: Partial<Database["public"]["Tables"]["vehicles"]["Insert"]>;
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
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["tenant_domains"]["Row"],
          "id" | "verified" | "verification_token" | "created_at"
        > & {
          id?: string;
          verified?: boolean;
          verification_token?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tenant_domains"]["Insert"]>;
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
          created_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["chat_messages"]["Row"],
          "id" | "created_at"
        > & { id?: string; created_at?: string };
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
      archive_due_sold_vehicles: {
        Args: { p_cutoff: string; p_limit?: number };
        Returns: { vehicle_id: string }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
