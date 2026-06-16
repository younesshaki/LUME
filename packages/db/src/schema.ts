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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          status?: "active" | "suspended" | "trial";
        };
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>;
        Relationships: [];
      };
      tenant_members: {
        Row: {
          tenant_id: string;
          user_id: string;
          role: "owner" | "admin" | "editor" | "viewer";
          created_at: string;
        };
        Insert: {
          tenant_id: string;
          user_id: string;
          role?: "owner" | "admin" | "editor" | "viewer";
        };
        Update: Partial<Database["public"]["Tables"]["tenant_members"]["Insert"]>;
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
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["vehicles"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
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
          referrer: string | null;
          ip_addr: string | null;
          user_agent: string | null;
          lost_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["leads"]["Row"],
          "id" | "created_at" | "updated_at"
        > & { id?: string };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
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
    };
    Views: Record<string, never>;
    Functions: {
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
