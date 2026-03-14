export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
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
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          bull_job_id: string | null
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          job_type: string
          payload: Json | null
          result: Json | null
          site_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          bull_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_type: string
          payload?: Json | null
          result?: Json | null
          site_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          bull_job_id?: string | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          job_type?: string
          payload?: Json | null
          result?: Json | null
          site_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily: {
        Row: {
          affiliate_clicks: number
          date: string
          id: string
          page_path: string
          pageviews: number
          site_id: string
          top_countries: Json | null
          top_referrers: Json | null
          unique_visitors: number
        }
        Insert: {
          affiliate_clicks?: number
          date: string
          id?: string
          page_path: string
          pageviews?: number
          site_id: string
          top_countries?: Json | null
          top_referrers?: Json | null
          unique_visitors?: number
        }
        Update: {
          affiliate_clicks?: number
          date?: string
          id?: string
          page_path?: string
          pageviews?: number
          site_id?: string
          top_countries?: Json | null
          top_referrers?: Json | null
          unique_visitors?: number
        }
        Relationships: [
          {
            foreignKeyName: "analytics_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          country: string | null
          created_at: string
          event_type: string
          id: string
          language: string | null
          page_path: string | null
          referrer: string | null
          site_id: string
          visitor_hash: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          event_type: string
          id?: string
          language?: string | null
          page_path?: string | null
          referrer?: string | null
          site_id: string
          visitor_hash?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          event_type?: string
          id?: string
          language?: string | null
          page_path?: string | null
          referrer?: string | null
          site_id?: string
          visitor_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      category_products: {
        Row: {
          category_id: string
          position: number
          product_id: string
        }
        Insert: {
          category_id: string
          position?: number
          product_id: string
        }
        Update: {
          category_id?: string
          position?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "category_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tsa_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "category_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "tsa_products"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          site_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          site_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          site_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          name: string
          slug: string
        }
        Insert: {
          name: string
          slug: string
        }
        Update: {
          name?: string
          slug?: string
        }
        Relationships: []
      }
      costs: {
        Row: {
          amount: number
          category_slug: string
          created_at: string
          currency: string
          date: string
          description: string | null
          id: string
          period: string | null
          site_id: string | null
        }
        Insert: {
          amount: number
          category_slug: string
          created_at?: string
          currency?: string
          date: string
          description?: string | null
          id?: string
          period?: string | null
          site_id?: string | null
        }
        Update: {
          amount?: number
          category_slug?: string
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          id?: string
          period?: string | null
          site_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "costs_category_slug_fkey"
            columns: ["category_slug"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "costs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      deployments: {
        Row: {
          build_id: string | null
          created_at: string
          deployed_at: string | null
          duration_ms: number | null
          error: string | null
          id: string
          metadata: Json | null
          site_id: string
          status: string
        }
        Insert: {
          build_id?: string | null
          created_at?: string
          deployed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          site_id: string
          status?: string
        }
        Update: {
          build_id?: string | null
          created_at?: string
          deployed_at?: string | null
          duration_ms?: number | null
          error?: string | null
          id?: string
          metadata?: Json | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deployments_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      domains: {
        Row: {
          cf_nameservers: string[] | null
          cf_zone_id: string | null
          created_at: string
          dns_status: string
          domain: string
          expires_at: string | null
          id: string
          registered_at: string | null
          registrar: string | null
          site_id: string
          spaceship_id: string | null
          updated_at: string
        }
        Insert: {
          cf_nameservers?: string[] | null
          cf_zone_id?: string | null
          created_at?: string
          dns_status?: string
          domain: string
          expires_at?: string | null
          id?: string
          registered_at?: string | null
          registrar?: string | null
          site_id: string
          spaceship_id?: string | null
          updated_at?: string
        }
        Update: {
          cf_nameservers?: string[] | null
          cf_zone_id?: string | null
          created_at?: string
          dns_status?: string
          domain?: string
          expires_at?: string | null
          id?: string
          registered_at?: string | null
          registrar?: string | null
          site_id?: string
          spaceship_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "domains_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      product_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json | null
          id: string
          product_id: string | null
          resolved_at: string | null
          site_id: string
          status: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          details?: Json | null
          id?: string
          product_id?: string | null
          resolved_at?: string | null
          site_id: string
          status?: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json | null
          id?: string
          product_id?: string | null
          resolved_at?: string | null
          site_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "tsa_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_alerts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      research_results: {
        Row: {
          content: Json
          created_at: string
          id: string
          result_type: string
          session_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          result_type: string
          session_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          result_type?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "research_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      research_sessions: {
        Row: {
          created_at: string
          id: string
          market: string | null
          niche_idea: string | null
          report: Json | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          market?: string | null
          niche_idea?: string | null
          report?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          market?: string | null
          niche_idea?: string | null
          report?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      revenue_adsense: {
        Row: {
          clicks: number
          created_at: string
          currency: string
          date: string
          earnings: number
          id: string
          impressions: number
          rpm: number | null
          site_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          currency?: string
          date: string
          earnings?: number
          id?: string
          impressions?: number
          rpm?: number | null
          site_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          currency?: string
          date?: string
          earnings?: number
          id?: string
          impressions?: number
          rpm?: number | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_adsense_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_amazon: {
        Row: {
          clicks: number
          created_at: string
          currency: string
          date: string
          earnings: number
          id: string
          items_ordered: number
          market: string | null
          site_id: string
        }
        Insert: {
          clicks?: number
          created_at?: string
          currency?: string
          date: string
          earnings?: number
          id?: string
          items_ordered?: number
          market?: string | null
          site_id: string
        }
        Update: {
          clicks?: number
          created_at?: string
          currency?: string
          date?: string
          earnings?: number
          id?: string
          items_ordered?: number
          market?: string | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "revenue_amazon_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_daily: {
        Row: {
          breakdown: Json | null
          created_at: string
          date: string
          id: string
          site_id: string
          total_revenue: number
        }
        Insert: {
          breakdown?: Json | null
          created_at?: string
          date: string
          id?: string
          site_id: string
          total_revenue?: number
        }
        Update: {
          breakdown?: Json | null
          created_at?: string
          date?: string
          id?: string
          site_id?: string
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "revenue_daily_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_manual: {
        Row: {
          amount: number
          created_at: string
          currency: string
          date: string
          id: string
          notes: string | null
          site_id: string | null
          source: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          date: string
          id?: string
          notes?: string | null
          site_id?: string | null
          source?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          date?: string
          id?: string
          notes?: string | null
          site_id?: string | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_manual_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_scores: {
        Row: {
          build_id: string | null
          content_quality_score: number | null
          created_at: string
          factors: Json | null
          grade: string | null
          id: string
          links_score: number | null
          media_score: number | null
          meta_elements_score: number | null
          overall_score: number | null
          page_path: string
          page_type: string | null
          schema_score: number | null
          site_id: string
          social_score: number | null
          structure_score: number | null
          suggestions: Json | null
          technical_score: number | null
        }
        Insert: {
          build_id?: string | null
          content_quality_score?: number | null
          created_at?: string
          factors?: Json | null
          grade?: string | null
          id?: string
          links_score?: number | null
          media_score?: number | null
          meta_elements_score?: number | null
          overall_score?: number | null
          page_path: string
          page_type?: string | null
          schema_score?: number | null
          site_id: string
          social_score?: number | null
          structure_score?: number | null
          suggestions?: Json | null
          technical_score?: number | null
        }
        Update: {
          build_id?: string | null
          content_quality_score?: number | null
          created_at?: string
          factors?: Json | null
          grade?: string | null
          id?: string
          links_score?: number | null
          media_score?: number | null
          meta_elements_score?: number | null
          overall_score?: number | null
          page_path?: string
          page_type?: string | null
          schema_score?: number | null
          site_id?: string
          social_score?: number | null
          structure_score?: number | null
          suggestions?: Json | null
          technical_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_scores_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      site_templates: {
        Row: {
          description: string | null
          name: string
          slug: string
        }
        Insert: {
          description?: string | null
          name: string
          slug: string
        }
        Update: {
          description?: string | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      site_types: {
        Row: {
          description: string
          name: string
          slug: string
        }
        Insert: {
          description: string
          name: string
          slug: string
        }
        Update: {
          description?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          affiliate_tag: string | null
          company_name: string | null
          contact_email: string | null
          created_at: string
          currency: string | null
          customization: Json | null
          domain: string | null
          focus_keyword: string | null
          id: string
          language: string | null
          market: string | null
          name: string
          niche: string | null
          site_type_slug: string
          status: string
          template_slug: string
          updated_at: string
        }
        Insert: {
          affiliate_tag?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string | null
          customization?: Json | null
          domain?: string | null
          focus_keyword?: string | null
          id?: string
          language?: string | null
          market?: string | null
          name: string
          niche?: string | null
          site_type_slug: string
          status?: string
          template_slug: string
          updated_at?: string
        }
        Update: {
          affiliate_tag?: string | null
          company_name?: string | null
          contact_email?: string | null
          created_at?: string
          currency?: string | null
          customization?: Json | null
          domain?: string | null
          focus_keyword?: string | null
          id?: string
          language?: string | null
          market?: string | null
          name?: string
          niche?: string | null
          site_type_slug?: string
          status?: string
          template_slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_site_type_slug_fkey"
            columns: ["site_type_slug"]
            isOneToOne: false
            referencedRelation: "site_types"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "sites_template_slug_fkey"
            columns: ["template_slug"]
            isOneToOne: false
            referencedRelation: "site_templates"
            referencedColumns: ["slug"]
          },
        ]
      }
      tsa_categories: {
        Row: {
          category_image: string | null
          created_at: string
          description: string | null
          focus_keyword: string | null
          id: string
          keywords: string[] | null
          name: string
          seo_text: string | null
          site_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          category_image?: string | null
          created_at?: string
          description?: string | null
          focus_keyword?: string | null
          id?: string
          keywords?: string[] | null
          name: string
          seo_text?: string | null
          site_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          category_image?: string | null
          created_at?: string
          description?: string | null
          focus_keyword?: string | null
          id?: string
          keywords?: string[] | null
          name?: string
          seo_text?: string | null
          site_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tsa_categories_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      tsa_products: {
        Row: {
          asin: string
          availability: string | null
          condition: string | null
          created_at: string
          current_price: number | null
          detailed_description: string | null
          focus_keyword: string | null
          id: string
          images: string[] | null
          is_prime: boolean
          last_checked_at: string | null
          original_price: number | null
          price_history: Json | null
          pros_cons: Json | null
          rating: number | null
          review_count: number | null
          site_id: string
          slug: string | null
          title: string | null
          updated_at: string
          user_opinions_summary: string | null
        }
        Insert: {
          asin: string
          availability?: string | null
          condition?: string | null
          created_at?: string
          current_price?: number | null
          detailed_description?: string | null
          focus_keyword?: string | null
          id?: string
          images?: string[] | null
          is_prime?: boolean
          last_checked_at?: string | null
          original_price?: number | null
          price_history?: Json | null
          pros_cons?: Json | null
          rating?: number | null
          review_count?: number | null
          site_id: string
          slug?: string | null
          title?: string | null
          updated_at?: string
          user_opinions_summary?: string | null
        }
        Update: {
          asin?: string
          availability?: string | null
          condition?: string | null
          created_at?: string
          current_price?: number | null
          detailed_description?: string | null
          focus_keyword?: string | null
          id?: string
          images?: string[] | null
          is_prime?: boolean
          last_checked_at?: string | null
          original_price?: number | null
          price_history?: Json | null
          pros_cons?: Json | null
          rating?: number | null
          review_count?: number | null
          site_id?: string
          slug?: string | null
          title?: string | null
          updated_at?: string
          user_opinions_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tsa_products_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

