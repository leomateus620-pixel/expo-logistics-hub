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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity: string
          entity_id: string
          id: string
          org_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity: string
          entity_id: string
          id?: string
          org_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity?: string
          entity_id?: string
          id?: string
          org_id?: string
        }
        Relationships: []
      }
      cart_history: {
        Row: {
          action: Database["public"]["Enums"]["cart_action"]
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          cart_id: string
          created_at: string
          id: string
          org_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["cart_action"]
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          cart_id: string
          created_at?: string
          id?: string
          org_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["cart_action"]
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          cart_id?: string
          created_at?: string
          id?: string
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_history_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "electric_carts"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_reservations: {
        Row: {
          cart_id: string
          comissao: string | null
          created_at: string
          created_by_user_id: string
          empresa_slug: string | null
          fim_em: string
          id: string
          inicio_em: string
          nome_externo: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          status: string
          telefone_externo: string | null
          tipo_responsavel: string
          updated_at: string
        }
        Insert: {
          cart_id: string
          comissao?: string | null
          created_at?: string
          created_by_user_id: string
          empresa_slug?: string | null
          fim_em: string
          id?: string
          inicio_em: string
          nome_externo?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          status?: string
          telefone_externo?: string | null
          tipo_responsavel: string
          updated_at?: string
        }
        Update: {
          cart_id?: string
          comissao?: string | null
          created_at?: string
          created_by_user_id?: string
          empresa_slug?: string | null
          fim_em?: string
          id?: string
          inicio_em?: string
          nome_externo?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          status?: string
          telefone_externo?: string | null
          tipo_responsavel?: string
          updated_at?: string
        }
        Relationships: []
      }
      commissions: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          nome: string
          org_id: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          nome: string
          org_id: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          nome?: string
          org_id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      committee_mobility_forms: {
        Row: {
          committee_id: string
          committee_name_snapshot: string
          created_at: string
          id: string
          needs_electric_car: boolean
          needs_scooter: boolean
          operational_responsible_email: string | null
          operational_responsible_name: string | null
          operational_responsible_phone: string | null
          org_id: string
          president_name_snapshot: string
          submission_status: string
          submitted_at: string | null
          submitted_by_user_id: string | null
          updated_at: string
        }
        Insert: {
          committee_id: string
          committee_name_snapshot: string
          created_at?: string
          id?: string
          needs_electric_car?: boolean
          needs_scooter?: boolean
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id: string
          president_name_snapshot: string
          submission_status?: string
          submitted_at?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Update: {
          committee_id?: string
          committee_name_snapshot?: string
          created_at?: string
          id?: string
          needs_electric_car?: boolean
          needs_scooter?: boolean
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id?: string
          president_name_snapshot?: string
          submission_status?: string
          submitted_at?: string | null
          submitted_by_user_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_mobility_forms_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_mobility_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      committee_mobility_members: {
        Row: {
          access_electric_car: boolean
          access_scooter: boolean
          access_status: string
          committee_id: string
          created_at: string
          form_id: string
          id: string
          member_identifier: string | null
          member_name: string
          member_role: string | null
          notes: string | null
          org_id: string
          qr_access_free: boolean
          updated_at: string
        }
        Insert: {
          access_electric_car?: boolean
          access_scooter?: boolean
          access_status?: string
          committee_id: string
          created_at?: string
          form_id: string
          id?: string
          member_identifier?: string | null
          member_name: string
          member_role?: string | null
          notes?: string | null
          org_id: string
          qr_access_free?: boolean
          updated_at?: string
        }
        Update: {
          access_electric_car?: boolean
          access_scooter?: boolean
          access_status?: string
          committee_id?: string
          created_at?: string
          form_id?: string
          id?: string
          member_identifier?: string | null
          member_name?: string
          member_role?: string | null
          notes?: string | null
          org_id?: string
          qr_access_free?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "committee_mobility_members_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_mobility_members_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "committee_mobility_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "committee_mobility_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_evento_comissoes: {
        Row: {
          commission_id: string | null
          commission_name_snapshot: string | null
          commission_slug: string | null
          created_at: string
          event_id: string
          id: string
          org_id: string
          relation_role: string
          updated_at: string
        }
        Insert: {
          commission_id?: string | null
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          event_id: string
          id?: string
          org_id: string
          relation_role?: string
          updated_at?: string
        }
        Update: {
          commission_id?: string | null
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          event_id?: string
          id?: string
          org_id?: string
          relation_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_evento_comissoes_commission_org_fkey"
            columns: ["commission_id", "org_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cronograma_evento_comissoes_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cronograma_evento_comissoes_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      cronograma_evento_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string
          id: string
          new_value: Json | null
          previous_value: Json | null
          request_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          request_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string
          id?: string
          new_value?: Json | null
          previous_value?: Json | null
          request_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_evento_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cronograma_evento_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_evento_responsaveis: {
        Row: {
          created_at: string
          event_id: string
          id: string
          is_primary: boolean
          name_snapshot: string | null
          org_id: string
          org_member_user_id: string | null
          responsible_type: string
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          is_primary?: boolean
          name_snapshot?: string | null
          org_id: string
          org_member_user_id?: string | null
          responsible_type?: string
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          is_primary?: boolean
          name_snapshot?: string | null
          org_id?: string
          org_member_user_id?: string | null
          responsible_type?: string
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_evento_responsaveis_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cronograma_evento_responsaveis_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      cronograma_eventos: {
        Row: {
          category: string
          category_key: string | null
          commission_name: string | null
          commission_slug: string | null
          created_at: string
          created_by_user_id: string | null
          days_remaining: number | null
          decision_needed: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          event_time: string | null
          event_type: string
          has_exact_date: boolean
          id: string
          is_official_seed: boolean
          linked_commissions: Json
          location: string | null
          lock_version: number
          month_label: string | null
          org_id: string
          pending_reason: string | null
          priority: string
          responsible_name: string | null
          source_cell: string | null
          source_key: string
          source_note: string | null
          source_row: string | null
          source_sheet: string
          source_year: number
          start_date: string | null
          start_time: string | null
          status: string
          subevents: Json
          title: string
          updated_at: string
          week_label: string | null
        }
        Insert: {
          category?: string
          category_key?: string | null
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          created_by_user_id?: string | null
          days_remaining?: number | null
          decision_needed?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_time?: string | null
          event_type?: string
          has_exact_date?: boolean
          id?: string
          is_official_seed?: boolean
          linked_commissions?: Json
          location?: string | null
          lock_version?: number
          month_label?: string | null
          org_id: string
          pending_reason?: string | null
          priority?: string
          responsible_name?: string | null
          source_cell?: string | null
          source_key: string
          source_note?: string | null
          source_row?: string | null
          source_sheet?: string
          source_year?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          subevents?: Json
          title: string
          updated_at?: string
          week_label?: string | null
        }
        Update: {
          category?: string
          category_key?: string | null
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          created_by_user_id?: string | null
          days_remaining?: number | null
          decision_needed?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_time?: string | null
          event_type?: string
          has_exact_date?: boolean
          id?: string
          is_official_seed?: boolean
          linked_commissions?: Json
          location?: string | null
          lock_version?: number
          month_label?: string | null
          org_id?: string
          pending_reason?: string | null
          priority?: string
          responsible_name?: string | null
          source_cell?: string | null
          source_key?: string
          source_note?: string | null
          source_row?: string | null
          source_sheet?: string
          source_year?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          subevents?: Json
          title?: string
          updated_at?: string
          week_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_eventos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_subevento_comissoes: {
        Row: {
          commission_id: string | null
          commission_name_snapshot: string | null
          commission_slug: string | null
          created_at: string
          id: string
          org_id: string
          relation_role: string
          subevent_id: string
          updated_at: string
        }
        Insert: {
          commission_id?: string | null
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          id?: string
          org_id: string
          relation_role?: string
          subevent_id: string
          updated_at?: string
        }
        Update: {
          commission_id?: string | null
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          id?: string
          org_id?: string
          relation_role?: string
          subevent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subevento_comissoes_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_subevento_responsaveis: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          name_snapshot: string | null
          org_id: string
          org_member_user_id: string | null
          responsible_type: string
          role: string | null
          subevent_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name_snapshot?: string | null
          org_id: string
          org_member_user_id?: string | null
          responsible_type?: string
          role?: string | null
          subevent_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          name_snapshot?: string | null
          org_id?: string
          org_member_user_id?: string | null
          responsible_type?: string
          role?: string | null
          subevent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subevento_responsaveis_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_subeventos: {
        Row: {
          commission_name_snapshot: string | null
          commission_slug: string | null
          created_at: string
          description: string | null
          end_date: string | null
          end_time: string | null
          id: string
          legacy_key: string | null
          lock_version: number
          org_id: string
          parent_event_id: string
          priority: string
          responsible_name: string | null
          responsible_name_snapshot: string | null
          sort_order: number
          start_date: string | null
          start_time: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          legacy_key?: string | null
          lock_version?: number
          org_id: string
          parent_event_id: string
          priority?: string
          responsible_name?: string | null
          responsible_name_snapshot?: string | null
          sort_order?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          commission_name_snapshot?: string | null
          commission_slug?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          id?: string
          legacy_key?: string | null
          lock_version?: number
          org_id?: string
          parent_event_id?: string
          priority?: string
          responsible_name?: string | null
          responsible_name_snapshot?: string | null
          sort_order?: number
          start_date?: string | null
          start_time?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subeventos_parent_org_fkey"
            columns: ["parent_event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "cronograma_subeventos_parent_org_fkey"
            columns: ["parent_event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      electric_carts: {
        Row: {
          codigo: string
          comissao: string | null
          created_at: string
          devolucao_em: string | null
          devolucao_prevista_em: string | null
          empresa_slug: string | null
          id: string
          nome: string | null
          nome_externo: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          retirada_em: string | null
          status: Database["public"]["Enums"]["cart_status"]
          tipo_responsavel: string
          updated_at: string
        }
        Insert: {
          codigo: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          empresa_slug?: string | null
          id?: string
          nome?: string | null
          nome_externo?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          tipo_responsavel?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          empresa_slug?: string | null
          id?: string
          nome?: string | null
          nome_externo?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          tipo_responsavel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "electric_carts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminder_deliveries: {
        Row: {
          channel: string
          created_at: string
          event_id: string
          event_version: number
          id: string
          idempotency_key: string
          last_error: string | null
          offset_minutes: number
          org_id: string
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          event_id: string
          event_version: number
          id?: string
          idempotency_key: string
          last_error?: string | null
          offset_minutes: number
          org_id: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          event_id?: string
          event_version?: number
          id?: string
          idempotency_key?: string
          last_error?: string | null
          offset_minutes?: number
          org_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminder_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_deliveries_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminder_deliveries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by_user_id: string
          descricao: string | null
          external_id: string | null
          fim_em: string
          id: string
          inicio_em: string
          local: string | null
          org_id: string
          origem: string | null
          responsavel_user_id: string | null
          tipo_tag: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          descricao?: string | null
          external_id?: string | null
          fim_em: string
          id?: string
          inicio_em: string
          local?: string | null
          org_id: string
          origem?: string | null
          responsavel_user_id?: string | null
          tipo_tag?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          descricao?: string | null
          external_id?: string | null
          fim_em?: string
          id?: string
          inicio_em?: string
          local?: string | null
          org_id?: string
          origem?: string | null
          responsavel_user_id?: string | null
          tipo_tag?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_approvals: {
        Row: {
          acted_at: string
          acted_by: string
          action: string
          expense_id: string
          id: string
          new_status: Database["public"]["Enums"]["expense_status"]
          org_id: string
          previous_status: Database["public"]["Enums"]["expense_status"] | null
          reason: string | null
        }
        Insert: {
          acted_at?: string
          acted_by: string
          action: string
          expense_id: string
          id?: string
          new_status: Database["public"]["Enums"]["expense_status"]
          org_id: string
          previous_status?: Database["public"]["Enums"]["expense_status"] | null
          reason?: string | null
        }
        Update: {
          acted_at?: string
          acted_by?: string
          action?: string
          expense_id?: string
          id?: string
          new_status?: Database["public"]["Enums"]["expense_status"]
          org_id?: string
          previous_status?: Database["public"]["Enums"]["expense_status"] | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_approvals_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          id: string
          name: string
          org_id: string
          requires_document: boolean
          requires_transport: boolean
          requires_vehicle: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          org_id: string
          requires_document?: boolean
          requires_transport?: boolean
          requires_vehicle?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          org_id?: string
          requires_document?: boolean
          requires_transport?: boolean
          requires_vehicle?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_documents: {
        Row: {
          access_key: string | null
          created_at: string
          document_type: string | null
          expense_id: string
          extracted_payload_json: Json | null
          extracted_total: number | null
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          file_type: string | null
          file_url: string | null
          id: string
          invoice_number: string | null
          invoice_series: string | null
          issue_datetime: string | null
          issuer_document: string | null
          issuer_name: string | null
          org_id: string
          qr_raw: string | null
          qr_url: string | null
          validation_status: string | null
        }
        Insert: {
          access_key?: string | null
          created_at?: string
          document_type?: string | null
          expense_id: string
          extracted_payload_json?: Json | null
          extracted_total?: number | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          file_type?: string | null
          file_url?: string | null
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_datetime?: string | null
          issuer_document?: string | null
          issuer_name?: string | null
          org_id: string
          qr_raw?: string | null
          qr_url?: string | null
          validation_status?: string | null
        }
        Update: {
          access_key?: string | null
          created_at?: string
          document_type?: string | null
          expense_id?: string
          extracted_payload_json?: Json | null
          extracted_total?: number | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          file_type?: string | null
          file_url?: string | null
          id?: string
          invoice_number?: string | null
          invoice_series?: string | null
          issue_datetime?: string | null
          issuer_document?: string | null
          issuer_name?: string | null
          org_id?: string
          qr_raw?: string | null
          qr_url?: string | null
          validation_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_documents_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          created_by_user_id: string
          description: string | null
          event_id: string | null
          expense_date: string
          id: string
          member_user_id: string | null
          org_id: string
          origem_lancamento: string
          paid_by_name: string | null
          paid_by_user_id: string | null
          payment_method: string | null
          pix_key: string | null
          pix_key_type: Database["public"]["Enums"]["pix_key_type"] | null
          status: Database["public"]["Enums"]["expense_status"]
          title: string
          transport_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by_user_id: string
          description?: string | null
          event_id?: string | null
          expense_date?: string
          id?: string
          member_user_id?: string | null
          org_id: string
          origem_lancamento?: string
          paid_by_name?: string | null
          paid_by_user_id?: string | null
          payment_method?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          status?: Database["public"]["Enums"]["expense_status"]
          title: string
          transport_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          created_by_user_id?: string
          description?: string | null
          event_id?: string | null
          expense_date?: string
          id?: string
          member_user_id?: string | null
          org_id?: string
          origem_lancamento?: string
          paid_by_name?: string | null
          paid_by_user_id?: string | null
          payment_method?: string | null
          pix_key?: string | null
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"] | null
          status?: Database["public"]["Enums"]["expense_status"]
          title?: string
          transport_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: false
            referencedRelation: "transports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fenasoja_events: {
        Row: {
          commission_id: string | null
          cover_color: string | null
          created_at: string
          created_by_user_id: string | null
          descricao: string | null
          fim_em: string
          id: string
          inicio_em: string
          local: string | null
          org_id: string
          responsavel_user_id: string | null
          tipo_tag: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          commission_id?: string | null
          cover_color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          descricao?: string | null
          fim_em: string
          id?: string
          inicio_em: string
          local?: string | null
          org_id: string
          responsavel_user_id?: string | null
          tipo_tag?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          commission_id?: string | null
          cover_color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          descricao?: string | null
          fim_em?: string
          id?: string
          inicio_em?: string
          local?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          tipo_tag?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fenasoja_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_records: {
        Row: {
          created_at: string
          cupom_fiscal_url: string | null
          id: string
          km_abastecimento: number | null
          litros: number | null
          observacoes: string | null
          org_id: string
          posto: string | null
          registrado_por_user_id: string | null
          updated_at: string
          valor: number | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          cupom_fiscal_url?: string | null
          id?: string
          km_abastecimento?: number | null
          litros?: number | null
          observacoes?: string | null
          org_id: string
          posto?: string | null
          registrado_por_user_id?: string | null
          updated_at?: string
          valor?: number | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          cupom_fiscal_url?: string | null
          id?: string
          km_abastecimento?: number | null
          litros?: number | null
          observacoes?: string | null
          org_id?: string
          posto?: string | null
          registrado_por_user_id?: string | null
          updated_at?: string
          valor?: number | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fuel_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          backfill_done: number
          backfill_total: number
          connected_at: string
          connection_key: string | null
          created_at: string
          google_email: string | null
          last_error: string | null
          last_sync_at: string | null
          org_id: string
          scopes_granted: string[]
          secondary_calendar_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          backfill_done?: number
          backfill_total?: number
          connected_at?: string
          connection_key?: string | null
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          org_id: string
          scopes_granted?: string[]
          secondary_calendar_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          backfill_done?: number
          backfill_total?: number
          connected_at?: string
          connection_key?: string | null
          created_at?: string
          google_email?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          org_id?: string
          scopes_granted?: string[]
          secondary_calendar_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_event_map: {
        Row: {
          content_hash: string | null
          created_at: string
          deleted_at: string | null
          event_id: string
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          last_synced_at: string | null
          subevent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          subevent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          event_id?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          subevent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_event_map_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_event_map_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_event_map_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_sync_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          event_id: string | null
          id: string
          is_initial_backfill: boolean
          last_error: string | null
          next_attempt_at: string
          operation: string
          org_id: string
          payload_hash: string | null
          status: string
          subevent_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          event_id?: string | null
          id?: string
          is_initial_backfill?: boolean
          last_error?: string | null
          next_attempt_at?: string
          operation: string
          org_id: string
          payload_hash?: string | null
          status?: string
          subevent_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          event_id?: string | null
          id?: string
          is_initial_backfill?: boolean
          last_error?: string | null
          next_attempt_at?: string
          operation?: string
          org_id?: string
          payload_hash?: string | null
          status?: string
          subevent_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_sync_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_sync_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_sync_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_sync_outbox_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
            referencedColumns: ["id"]
          },
        ]
      }
      guests: {
        Row: {
          checkin_em: string | null
          checkout_em: string | null
          created_at: string
          email: string | null
          hotel_nome: string | null
          id: string
          nome: string
          observacoes: string | null
          org_id: string
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          telefone: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          checkin_em?: string | null
          checkout_em?: string | null
          created_at?: string
          email?: string | null
          hotel_nome?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          org_id: string
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          checkin_em?: string | null
          checkout_em?: string | null
          created_at?: string
          email?: string | null
          hotel_nome?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          org_id?: string
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mobility_authorizations: {
        Row: {
          access_status: string
          authorization_type: Database["public"]["Enums"]["mobility_authorization_type"]
          committee_id: string
          committee_name_snapshot: string
          created_at: string
          id: string
          internal_form_id: string | null
          internal_member_id: string | null
          member_identifier: string | null
          member_name: string
          member_role: string | null
          notes: string | null
          operational_responsible_email: string | null
          operational_responsible_name: string | null
          operational_responsible_phone: string | null
          org_id: string
          president_name_snapshot: string
          qr_access_free: boolean
          source_form_id: string | null
          source_link_id: string | null
          source_member_id: string | null
          source_origin: string
          submitted_at: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          access_status?: string
          authorization_type: Database["public"]["Enums"]["mobility_authorization_type"]
          committee_id: string
          committee_name_snapshot: string
          created_at?: string
          id?: string
          internal_form_id?: string | null
          internal_member_id?: string | null
          member_identifier?: string | null
          member_name: string
          member_role?: string | null
          notes?: string | null
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id: string
          president_name_snapshot: string
          qr_access_free?: boolean
          source_form_id?: string | null
          source_link_id?: string | null
          source_member_id?: string | null
          source_origin?: string
          submitted_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          access_status?: string
          authorization_type?: Database["public"]["Enums"]["mobility_authorization_type"]
          committee_id?: string
          committee_name_snapshot?: string
          created_at?: string
          id?: string
          internal_form_id?: string | null
          internal_member_id?: string | null
          member_identifier?: string | null
          member_name?: string
          member_role?: string | null
          notes?: string | null
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id?: string
          president_name_snapshot?: string
          qr_access_free?: boolean
          source_form_id?: string | null
          source_link_id?: string | null
          source_member_id?: string | null
          source_origin?: string
          submitted_at?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobility_authorizations_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_internal_form_id_fkey"
            columns: ["internal_form_id"]
            isOneToOne: false
            referencedRelation: "committee_mobility_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_internal_member_id_fkey"
            columns: ["internal_member_id"]
            isOneToOne: false
            referencedRelation: "committee_mobility_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_source_form_id_fkey"
            columns: ["source_form_id"]
            isOneToOne: false
            referencedRelation: "public_mobility_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_source_link_id_fkey"
            columns: ["source_link_id"]
            isOneToOne: false
            referencedRelation: "public_form_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobility_authorizations_source_member_id_fkey"
            columns: ["source_member_id"]
            isOneToOne: false
            referencedRelation: "public_mobility_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_recipients: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          message_template: string
          nome: string
          notify_on_start: boolean
          org_id: string
          telefone: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          message_template: string
          nome: string
          notify_on_start?: boolean
          org_id: string
          telefone: string
          tipo?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          message_template?: string
          nome?: string
          notify_on_start?: boolean
          org_id?: string
          telefone?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_session_seen: {
        Row: {
          id: string
          session_id: string
          shown_at: string
          user_id: string
        }
        Insert: {
          id?: string
          session_id: string
          shown_at?: string
          user_id: string
        }
        Update: {
          id?: string
          session_id?: string
          shown_at?: string
          user_id?: string
        }
        Relationships: []
      }
      official_committees: {
        Row: {
          committee_name: string
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          president_name: string
          updated_at: string
        }
        Insert: {
          committee_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          president_name: string
          updated_at?: string
        }
        Update: {
          committee_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          president_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "official_committees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          avatar_color: string | null
          cargo: string | null
          commission_id: string | null
          created_at: string
          id: string
          is_active: boolean
          nome_exibicao: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          status: Database["public"]["Enums"]["member_status"]
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_color?: string | null
          cargo?: string | null
          commission_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nome_exibicao?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_color?: string | null
          cargo?: string | null
          commission_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nome_exibicao?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          status?: Database["public"]["Enums"]["member_status"]
          telefone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          nome: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      public_form_audit: {
        Row: {
          actor_scope: string
          created_at: string
          event_type: string
          form_id: string | null
          id: string
          link_id: string
          org_id: string
          payload: Json
        }
        Insert: {
          actor_scope?: string
          created_at?: string
          event_type: string
          form_id?: string | null
          id?: string
          link_id: string
          org_id: string
          payload?: Json
        }
        Update: {
          actor_scope?: string
          created_at?: string
          event_type?: string
          form_id?: string | null
          id?: string
          link_id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "public_form_audit_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "public_mobility_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_form_audit_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "public_form_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_form_audit_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_form_links: {
        Row: {
          committee_id: string
          committee_name_snapshot: string
          created_at: string
          current_token: string | null
          id: string
          is_active: boolean
          org_id: string
          president_name_snapshot: string
          token_hash: string
          token_hint: string
          updated_at: string
        }
        Insert: {
          committee_id: string
          committee_name_snapshot: string
          created_at?: string
          current_token?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          president_name_snapshot: string
          token_hash: string
          token_hint: string
          updated_at?: string
        }
        Update: {
          committee_id?: string
          committee_name_snapshot?: string
          created_at?: string
          current_token?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          president_name_snapshot?: string
          token_hash?: string
          token_hint?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_form_links_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_form_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_mobility_forms: {
        Row: {
          committee_id: string
          committee_name_snapshot: string
          created_at: string
          id: string
          last_public_access_at: string | null
          last_synced_at: string | null
          link_id: string
          needs_electric_car: boolean
          needs_scooter: boolean
          operational_responsible_email: string | null
          operational_responsible_name: string | null
          operational_responsible_phone: string | null
          org_id: string
          president_name_snapshot: string
          submission_status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          committee_id: string
          committee_name_snapshot: string
          created_at?: string
          id?: string
          last_public_access_at?: string | null
          last_synced_at?: string | null
          link_id: string
          needs_electric_car?: boolean
          needs_scooter?: boolean
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id: string
          president_name_snapshot: string
          submission_status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          committee_id?: string
          committee_name_snapshot?: string
          created_at?: string
          id?: string
          last_public_access_at?: string | null
          last_synced_at?: string | null
          link_id?: string
          needs_electric_car?: boolean
          needs_scooter?: boolean
          operational_responsible_email?: string | null
          operational_responsible_name?: string | null
          operational_responsible_phone?: string | null
          org_id?: string
          president_name_snapshot?: string
          submission_status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_mobility_forms_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_mobility_forms_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: true
            referencedRelation: "public_form_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_mobility_forms_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      public_mobility_members: {
        Row: {
          access_electric_car: boolean
          access_scooter: boolean
          committee_id: string
          created_at: string
          form_id: string
          id: string
          member_identifier: string | null
          member_name: string
          member_role: string | null
          notes: string | null
          org_id: string
          qr_access_free: boolean
          updated_at: string
        }
        Insert: {
          access_electric_car?: boolean
          access_scooter?: boolean
          committee_id: string
          created_at?: string
          form_id: string
          id?: string
          member_identifier?: string | null
          member_name: string
          member_role?: string | null
          notes?: string | null
          org_id: string
          qr_access_free?: boolean
          updated_at?: string
        }
        Update: {
          access_electric_car?: boolean
          access_scooter?: boolean
          committee_id?: string
          created_at?: string
          form_id?: string
          id?: string
          member_identifier?: string | null
          member_name?: string
          member_role?: string | null
          notes?: string | null
          org_id?: string
          qr_access_free?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "public_mobility_members_committee_id_fkey"
            columns: ["committee_id"]
            isOneToOne: false
            referencedRelation: "official_committees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_mobility_members_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "public_mobility_forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "public_mobility_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reimbursements: {
        Row: {
          approved_amount: number | null
          approved_at: string | null
          approved_by: string | null
          beneficiary_name: string
          beneficiary_user_id: string | null
          created_at: string
          expense_id: string
          id: string
          notes: string | null
          org_id: string
          paid_amount: number | null
          paid_at: string | null
          paid_by: string | null
          payment_receipt_url: string | null
          pix_key: string
          pix_key_type: Database["public"]["Enums"]["pix_key_type"]
          requested_amount: number
          requested_at: string
          status: Database["public"]["Enums"]["reimbursement_status"]
        }
        Insert: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_name: string
          beneficiary_user_id?: string | null
          created_at?: string
          expense_id: string
          id?: string
          notes?: string | null
          org_id: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_receipt_url?: string | null
          pix_key: string
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"]
          requested_amount?: number
          requested_at?: string
          status?: Database["public"]["Enums"]["reimbursement_status"]
        }
        Update: {
          approved_amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_name?: string
          beneficiary_user_id?: string | null
          created_at?: string
          expense_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_amount?: number | null
          paid_at?: string | null
          paid_by?: string | null
          payment_receipt_url?: string | null
          pix_key?: string
          pix_key_type?: Database["public"]["Enums"]["pix_key_type"]
          requested_amount?: number
          requested_at?: string
          status?: Database["public"]["Enums"]["reimbursement_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reimbursements_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reimbursements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_shifts: {
        Row: {
          created_at: string
          fim_em: string
          id: string
          inicio_em: string
          local: string | null
          observacoes: string | null
          org_id: string
          schedule_id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fim_em: string
          id?: string
          inicio_em: string
          local?: string | null
          observacoes?: string | null
          org_id: string
          schedule_id: string
          titulo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fim_em?: string
          id?: string
          inicio_em?: string
          local?: string | null
          observacoes?: string | null
          org_id?: string
          schedule_id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_shifts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_shifts_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedules: {
        Row: {
          created_at: string
          created_by_user_id: string
          data_fim: string
          data_inicio: string
          id: string
          nome: string
          org_id: string
          status: Database["public"]["Enums"]["schedule_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          data_fim: string
          data_inicio: string
          id?: string
          nome: string
          org_id: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          nome?: string
          org_id?: string
          status?: Database["public"]["Enums"]["schedule_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      scooter_history: {
        Row: {
          action: Database["public"]["Enums"]["cart_action"]
          actor_user_id: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          org_id: string
          scooter_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["cart_action"]
          actor_user_id: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          org_id: string
          scooter_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["cart_action"]
          actor_user_id?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          org_id?: string
          scooter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scooter_history_scooter_id_fkey"
            columns: ["scooter_id"]
            isOneToOne: false
            referencedRelation: "scooters"
            referencedColumns: ["id"]
          },
        ]
      }
      scooter_reservations: {
        Row: {
          comissao: string | null
          created_at: string
          created_by_user_id: string
          empresa_slug: string | null
          fim_em: string
          id: string
          inicio_em: string
          nome_externo: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          scooter_id: string
          status: string
          telefone_externo: string | null
          tipo_responsavel: string
          updated_at: string
        }
        Insert: {
          comissao?: string | null
          created_at?: string
          created_by_user_id: string
          empresa_slug?: string | null
          fim_em: string
          id?: string
          inicio_em: string
          nome_externo?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          scooter_id: string
          status?: string
          telefone_externo?: string | null
          tipo_responsavel: string
          updated_at?: string
        }
        Update: {
          comissao?: string | null
          created_at?: string
          created_by_user_id?: string
          empresa_slug?: string | null
          fim_em?: string
          id?: string
          inicio_em?: string
          nome_externo?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          scooter_id?: string
          status?: string
          telefone_externo?: string | null
          tipo_responsavel?: string
          updated_at?: string
        }
        Relationships: []
      }
      scooters: {
        Row: {
          codigo: string
          comissao: string | null
          created_at: string
          devolucao_em: string | null
          devolucao_prevista_em: string | null
          empresa_slug: string | null
          id: string
          nome: string | null
          nome_externo: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          retirada_em: string | null
          status: Database["public"]["Enums"]["cart_status"]
          telefone_externo: string | null
          tipo_responsavel: string
          updated_at: string
        }
        Insert: {
          codigo: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          empresa_slug?: string | null
          id?: string
          nome?: string | null
          nome_externo?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          telefone_externo?: string | null
          tipo_responsavel?: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          empresa_slug?: string | null
          id?: string
          nome?: string | null
          nome_externo?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          telefone_externo?: string | null
          tipo_responsavel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scooters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_reports: {
        Row: {
          created_at: string
          findings: Json
          id: string
          metadata: Json
          org_id: string
          run_by_user_id: string
          scope: string
          summary: Json
        }
        Insert: {
          created_at?: string
          findings: Json
          id?: string
          metadata: Json
          org_id: string
          run_by_user_id: string
          scope?: string
          summary: Json
        }
        Update: {
          created_at?: string
          findings?: Json
          id?: string
          metadata?: Json
          org_id?: string
          run_by_user_id?: string
          scope?: string
          summary?: Json
        }
        Relationships: []
      }
      shift_assignments: {
        Row: {
          created_at: string
          created_by_user_id: string
          funcao: string | null
          id: string
          member_user_id: string
          org_id: string
          schedule_shift_id: string
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          funcao?: string | null
          id?: string
          member_user_id: string
          org_id: string
          schedule_shift_id: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          funcao?: string | null
          id?: string
          member_user_id?: string
          org_id?: string
          schedule_shift_id?: string
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_schedule_shift_id_fkey"
            columns: ["schedule_shift_id"]
            isOneToOne: false
            referencedRelation: "schedule_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by_user_id: string
          descricao: string | null
          due_em: string | null
          id: string
          org_id: string
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          recorrencia: Database["public"]["Enums"]["task_recurrence"] | null
          recorrencia_regra: Json | null
          status: Database["public"]["Enums"]["task_status_enum"]
          titulo: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id: string
          descricao?: string | null
          due_em?: string | null
          id?: string
          org_id: string
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          recorrencia?: Database["public"]["Enums"]["task_recurrence"] | null
          recorrencia_regra?: Json | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          titulo: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          descricao?: string | null
          due_em?: string | null
          id?: string
          org_id?: string
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          recorrencia?: Database["public"]["Enums"]["task_recurrence"] | null
          recorrencia_regra?: Json | null
          status?: Database["public"]["Enums"]["task_status_enum"]
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_guests: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          org_id: string
          transport_id: string
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          org_id: string
          transport_id: string
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          org_id?: string
          transport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_guests_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_guests_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_guests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_guests_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: false
            referencedRelation: "transports"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_user_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          org_id: string
          speed: number | null
          transport_id: string
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_user_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          org_id: string
          speed?: number | null
          transport_id: string
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_user_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          org_id?: string
          speed?: number | null
          transport_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_locations_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: true
            referencedRelation: "transports"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_weather_alerts: {
        Row: {
          alert_type: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          org_id: string
          severity: string | null
          snapshot_id: string
          source_uri: string | null
          starts_at: string | null
          title: string
          transport_id: string
        }
        Insert: {
          alert_type?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          org_id: string
          severity?: string | null
          snapshot_id: string
          source_uri?: string | null
          starts_at?: string | null
          title: string
          transport_id: string
        }
        Update: {
          alert_type?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          org_id?: string
          severity?: string | null
          snapshot_id?: string
          source_uri?: string | null
          starts_at?: string | null
          title?: string
          transport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_weather_alerts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "transport_weather_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_weather_snapshots: {
        Row: {
          alert_count: number
          alerts_summary_jsonb: Json
          city_key: string
          city_name: string | null
          cloud_cover_pct: number | null
          created_at: string
          current_condition_code: string | null
          current_condition_label: string | null
          current_icon_uri: string | null
          feels_like_c: number | null
          fetched_at: string
          forecast_period_label: string | null
          humidity_pct: number | null
          id: string
          is_latest: boolean
          latitude: number
          longitude: number
          operational_risk_level: Database["public"]["Enums"]["weather_risk_level"]
          operational_risk_reason: string | null
          org_id: string
          place_id: string | null
          precipitation_probability_pct: number | null
          precipitation_type: string | null
          raw_payload_jsonb: Json | null
          temperature_c: number | null
          thunderstorm_probability_pct: number | null
          transport_id: string
          updated_at: string
          uv_index: number | null
          valid_until: string
          visibility_km: number | null
          weather_source: Database["public"]["Enums"]["weather_source"]
          wind_gust_kph: number | null
          wind_speed_kph: number | null
        }
        Insert: {
          alert_count?: number
          alerts_summary_jsonb?: Json
          city_key: string
          city_name?: string | null
          cloud_cover_pct?: number | null
          created_at?: string
          current_condition_code?: string | null
          current_condition_label?: string | null
          current_icon_uri?: string | null
          feels_like_c?: number | null
          fetched_at?: string
          forecast_period_label?: string | null
          humidity_pct?: number | null
          id?: string
          is_latest?: boolean
          latitude: number
          longitude: number
          operational_risk_level?: Database["public"]["Enums"]["weather_risk_level"]
          operational_risk_reason?: string | null
          org_id: string
          place_id?: string | null
          precipitation_probability_pct?: number | null
          precipitation_type?: string | null
          raw_payload_jsonb?: Json | null
          temperature_c?: number | null
          thunderstorm_probability_pct?: number | null
          transport_id: string
          updated_at?: string
          uv_index?: number | null
          valid_until?: string
          visibility_km?: number | null
          weather_source?: Database["public"]["Enums"]["weather_source"]
          wind_gust_kph?: number | null
          wind_speed_kph?: number | null
        }
        Update: {
          alert_count?: number
          alerts_summary_jsonb?: Json
          city_key?: string
          city_name?: string | null
          cloud_cover_pct?: number | null
          created_at?: string
          current_condition_code?: string | null
          current_condition_label?: string | null
          current_icon_uri?: string | null
          feels_like_c?: number | null
          fetched_at?: string
          forecast_period_label?: string | null
          humidity_pct?: number | null
          id?: string
          is_latest?: boolean
          latitude?: number
          longitude?: number
          operational_risk_level?: Database["public"]["Enums"]["weather_risk_level"]
          operational_risk_reason?: string | null
          org_id?: string
          place_id?: string | null
          precipitation_probability_pct?: number | null
          precipitation_type?: string | null
          raw_payload_jsonb?: Json | null
          temperature_c?: number | null
          thunderstorm_probability_pct?: number | null
          transport_id?: string
          updated_at?: string
          uv_index?: number | null
          valid_until?: string
          visibility_km?: number | null
          weather_source?: Database["public"]["Enums"]["weather_source"]
          wind_gust_kph?: number | null
          wind_speed_kph?: number | null
        }
        Relationships: []
      }
      transports: {
        Row: {
          chegada_destino_em: string | null
          created_at: string
          destino: string
          destino_lat: number | null
          destino_lat_chegada: number | null
          destino_lng: number | null
          destino_lng_chegada: number | null
          distancia_estimada_km: number | null
          duracao_estimada_min: number | null
          fase_atual: string
          fim_em: string | null
          fim_real_em: string | null
          fim_retorno_em: string | null
          guest_id: string | null
          horario_saida: string | null
          id: string
          inicio_em: string
          inicio_real_em: string | null
          inicio_retorno_em: string | null
          km_devolucao: number | null
          km_retirada: number | null
          motorista_user_id: string | null
          observacoes: string | null
          org_id: string
          origem: string
          origem_lat: number | null
          origem_lng: number | null
          passageiros_qtd: number | null
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline: string | null
          rota_polyline_volta: string | null
          somente_ida: boolean
          status: Database["public"]["Enums"]["transport_status"]
          tipo: string | null
          titulo: string | null
          tracking_device_id: string | null
          tracking_started_at: string | null
          tracking_started_by_user_id: string | null
          tracking_user_agent: string | null
          updated_at: string
          vehicle_id: string | null
          voo_checkin: string | null
          voo_chegada: string | null
          voo_cidade: string | null
          voo_numero: string | null
        }
        Insert: {
          chegada_destino_em?: string | null
          created_at?: string
          destino: string
          destino_lat?: number | null
          destino_lat_chegada?: number | null
          destino_lng?: number | null
          destino_lng_chegada?: number | null
          distancia_estimada_km?: number | null
          duracao_estimada_min?: number | null
          fase_atual?: string
          fim_em?: string | null
          fim_real_em?: string | null
          fim_retorno_em?: string | null
          guest_id?: string | null
          horario_saida?: string | null
          id?: string
          inicio_em: string
          inicio_real_em?: string | null
          inicio_retorno_em?: string | null
          km_devolucao?: number | null
          km_retirada?: number | null
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id: string
          origem: string
          origem_lat?: number | null
          origem_lng?: number | null
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline?: string | null
          rota_polyline_volta?: string | null
          somente_ida?: boolean
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
          tracking_device_id?: string | null
          tracking_started_at?: string | null
          tracking_started_by_user_id?: string | null
          tracking_user_agent?: string | null
          updated_at?: string
          vehicle_id?: string | null
          voo_checkin?: string | null
          voo_chegada?: string | null
          voo_cidade?: string | null
          voo_numero?: string | null
        }
        Update: {
          chegada_destino_em?: string | null
          created_at?: string
          destino?: string
          destino_lat?: number | null
          destino_lat_chegada?: number | null
          destino_lng?: number | null
          destino_lng_chegada?: number | null
          distancia_estimada_km?: number | null
          duracao_estimada_min?: number | null
          fase_atual?: string
          fim_em?: string | null
          fim_real_em?: string | null
          fim_retorno_em?: string | null
          guest_id?: string | null
          horario_saida?: string | null
          id?: string
          inicio_em?: string
          inicio_real_em?: string | null
          inicio_retorno_em?: string | null
          km_devolucao?: number | null
          km_retirada?: number | null
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id?: string
          origem?: string
          origem_lat?: number | null
          origem_lng?: number | null
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline?: string | null
          rota_polyline_volta?: string | null
          somente_ida?: boolean
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
          tracking_device_id?: string | null
          tracking_started_at?: string | null
          tracking_started_by_user_id?: string | null
          tracking_user_agent?: string | null
          updated_at?: string
          vehicle_id?: string | null
          voo_checkin?: string | null
          voo_chegada?: string | null
          voo_cidade?: string | null
          voo_numero?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transports_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transports_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "guests_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transports_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capabilities: {
        Row: {
          capability: string
          created_at: string
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capabilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_usage: {
        Row: {
          created_at: string
          devolucao_em: string | null
          id: string
          km_chegada: number | null
          km_rodados: number | null
          km_saida: number
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          retirada_em: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          devolucao_em?: string | null
          id?: string
          km_chegada?: number | null
          km_rodados?: number | null
          km_saida: number
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          retirada_em?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          devolucao_em?: string | null
          id?: string
          km_chegada?: number | null
          km_rodados?: number | null
          km_saida?: number
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          retirada_em?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_usage_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          ano: number | null
          categoria: string | null
          cor: string | null
          created_at: string
          documento_url: string | null
          id: string
          km_atual: number | null
          km_final_evento: number | null
          km_inicial_evento: number | null
          marca: string | null
          modelo: string | null
          org_id: string
          placa: string | null
          renavam: string | null
          responsavel_user_id: string | null
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
        }
        Insert: {
          ano?: number | null
          categoria?: string | null
          cor?: string | null
          created_at?: string
          documento_url?: string | null
          id?: string
          km_atual?: number | null
          km_final_evento?: number | null
          km_inicial_evento?: number | null
          marca?: string | null
          modelo?: string | null
          org_id: string
          placa?: string | null
          renavam?: string | null
          responsavel_user_id?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Update: {
          ano?: number | null
          categoria?: string | null
          cor?: string | null
          created_at?: string
          documento_url?: string | null
          id?: string
          km_atual?: number | null
          km_final_evento?: number | null
          km_inicial_evento?: number | null
          marca?: string | null
          modelo?: string | null
          org_id?: string
          placa?: string | null
          renavam?: string | null
          responsavel_user_id?: string | null
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_city_cache: {
        Row: {
          city_key: string
          city_name: string | null
          expires_at: string
          fetched_at: string
          id: string
          latitude: number
          longitude: number
          payload_jsonb: Json
          time_bucket: string
        }
        Insert: {
          city_key: string
          city_name?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude: number
          longitude: number
          payload_jsonb: Json
          time_bucket: string
        }
        Update: {
          city_key?: string
          city_name?: string | null
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude?: number
          longitude?: number
          payload_jsonb?: Json
          time_bucket?: string
        }
        Relationships: []
      }
      weather_sync_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          meta_jsonb: Json
          org_id: string | null
          requested_at: string
          scope_reference: string | null
          scope_type: string
          started_at: string | null
          status: Database["public"]["Enums"]["weather_sync_status"]
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta_jsonb?: Json
          org_id?: string | null
          requested_at?: string
          scope_reference?: string | null
          scope_type: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["weather_sync_status"]
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          meta_jsonb?: Json
          org_id?: string | null
          requested_at?: string
          scope_reference?: string | null
          scope_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["weather_sync_status"]
        }
        Relationships: []
      }
    }
    Views: {
      cronograma_eventos_full: {
        Row: {
          category: string | null
          category_key: string | null
          commission_name: string | null
          commission_slug: string | null
          commissions_rel: Json | null
          created_at: string | null
          created_by_user_id: string | null
          days_remaining: number | null
          decision_needed: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          event_time: string | null
          event_type: string | null
          has_exact_date: boolean | null
          id: string | null
          is_official_seed: boolean | null
          linked_commissions: Json | null
          location: string | null
          lock_version: number | null
          month_label: string | null
          org_id: string | null
          pending_reason: string | null
          priority: string | null
          responsible_name: string | null
          responsibles_rel: Json | null
          source_cell: string | null
          source_key: string | null
          source_note: string | null
          source_row: string | null
          source_sheet: string | null
          source_year: number | null
          start_date: string | null
          start_time: string | null
          status: string | null
          subevents: Json | null
          subevents_rel: Json | null
          title: string | null
          updated_at: string | null
          week_label: string | null
        }
        Insert: {
          category?: string | null
          category_key?: string | null
          commission_name?: string | null
          commission_slug?: string | null
          commissions_rel?: never
          created_at?: string | null
          created_by_user_id?: string | null
          days_remaining?: number | null
          decision_needed?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_time?: string | null
          event_type?: string | null
          has_exact_date?: boolean | null
          id?: string | null
          is_official_seed?: boolean | null
          linked_commissions?: Json | null
          location?: string | null
          lock_version?: number | null
          month_label?: string | null
          org_id?: string | null
          pending_reason?: string | null
          priority?: string | null
          responsible_name?: string | null
          responsibles_rel?: never
          source_cell?: string | null
          source_key?: string | null
          source_note?: string | null
          source_row?: string | null
          source_sheet?: string | null
          source_year?: number | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          subevents?: Json | null
          subevents_rel?: never
          title?: string | null
          updated_at?: string | null
          week_label?: string | null
        }
        Update: {
          category?: string | null
          category_key?: string | null
          commission_name?: string | null
          commission_slug?: string | null
          commissions_rel?: never
          created_at?: string | null
          created_by_user_id?: string | null
          days_remaining?: number | null
          decision_needed?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_time?: string | null
          event_type?: string | null
          has_exact_date?: boolean | null
          id?: string | null
          is_official_seed?: boolean | null
          linked_commissions?: Json | null
          location?: string | null
          lock_version?: number | null
          month_label?: string | null
          org_id?: string | null
          pending_reason?: string | null
          priority?: string | null
          responsible_name?: string | null
          responsibles_rel?: never
          source_cell?: string | null
          source_key?: string | null
          source_note?: string | null
          source_row?: string | null
          source_sheet?: string | null
          source_year?: number | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          subevents?: Json | null
          subevents_rel?: never
          title?: string | null
          updated_at?: string | null
          week_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_eventos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      guests_safe: {
        Row: {
          checkin_em: string | null
          checkout_em: string | null
          created_at: string | null
          email: string | null
          hotel_nome: string | null
          id: string | null
          nome: string | null
          observacoes: string | null
          org_id: string | null
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          telefone: string | null
          tipo: string | null
          updated_at: string | null
        }
        Insert: {
          checkin_em?: string | null
          checkout_em?: string | null
          created_at?: string | null
          email?: never
          hotel_nome?: string | null
          id?: string | null
          nome?: string | null
          observacoes?: string | null
          org_id?: string | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          telefone?: never
          tipo?: string | null
          updated_at?: string | null
        }
        Update: {
          checkin_em?: string | null
          checkout_em?: string | null
          created_at?: string | null
          email?: never
          hotel_nome?: string | null
          id?: string | null
          nome?: string | null
          observacoes?: string | null
          org_id?: string | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          telefone?: never
          tipo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members_safe: {
        Row: {
          avatar_color: string | null
          cargo: string | null
          commission_id: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          nome_exibicao: string | null
          org_id: string | null
          role: Database["public"]["Enums"]["org_role"] | null
          status: Database["public"]["Enums"]["member_status"] | null
          telefone: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_color?: string | null
          cargo?: string | null
          commission_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          nome_exibicao?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          status?: Database["public"]["Enums"]["member_status"] | null
          telefone?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_color?: string | null
          cargo?: string | null
          commission_id?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          nome_exibicao?: string | null
          org_id?: string | null
          role?: Database["public"]["Enums"]["org_role"] | null
          status?: Database["public"]["Enums"]["member_status"] | null
          telefone?: never
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _cronograma_apply_event_commissions: {
        Args: { _event_id: string; _items: Json; _org_id: string }
        Returns: undefined
      }
      _cronograma_apply_event_responsibles: {
        Args: { _event_id: string; _items: Json; _org_id: string }
        Returns: undefined
      }
      _cronograma_apply_subevent_commissions: {
        Args: { _items: Json; _org_id: string; _subevent_id: string }
        Returns: undefined
      }
      _cronograma_apply_subevent_responsibles: {
        Args: { _items: Json; _org_id: string; _subevent_id: string }
        Returns: undefined
      }
      _cronograma_log: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _event_id: string
          _next: Json
          _prev: Json
          _request_id: string
        }
        Returns: undefined
      }
      _cronograma_require_writer: {
        Args: { _org_id: string }
        Returns: undefined
      }
      audit_check_rls_status: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
        }[]
      }
      audit_count_policies: {
        Args: never
        Returns: {
          policy_count: number
          table_name: string
        }[]
      }
      create_org_with_member: { Args: { org_nome: string }; Returns: string }
      cronograma_delete_subevent: {
        Args: { expected_lock_version?: number; subevent_id: string }
        Returns: Json
      }
      cronograma_reorder_subevents: {
        Args: { event_id: string; ordered_ids: string[] }
        Returns: Json
      }
      cronograma_save_event: {
        Args: { expected_lock_version?: number; payload: Json }
        Returns: Json
      }
      cronograma_save_subevent: {
        Args: { expected_lock_version?: number; payload: Json }
        Returns: Json
      }
      enqueue_google_sync: {
        Args: { _event_id: string; _operation: string }
        Returns: undefined
      }
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
      }
      google_sync_affected_users: {
        Args: { _event_id: string }
        Returns: {
          org_id: string
          user_id: string
        }[]
      }
      has_capability: {
        Args: { _capability: string; _org_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      publish_transport_location:
        | {
            Args: {
              _accuracy?: number
              _heading?: number
              _latitude: number
              _longitude: number
              _speed?: number
              _transport_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _accuracy?: number
              _device_id?: string
              _heading?: number
              _latitude: number
              _longitude: number
              _speed?: number
              _transport_id: string
              _user_agent?: string
            }
            Returns: undefined
          }
      reset_transport_tracking: {
        Args: { _transport_id: string }
        Returns: undefined
      }
      set_transport_guests: {
        Args: { _guest_ids: string[]; _org_id: string; _transport_id: string }
        Returns: undefined
      }
      submit_public_mobility_form: {
        Args: {
          _members?: Json
          _needs_electric_car?: boolean
          _needs_scooter?: boolean
          _operational_responsible_email?: string
          _operational_responsible_name?: string
          _operational_responsible_phone?: string
          _token_hash: string
        }
        Returns: string
      }
      sync_internal_mobility_form: {
        Args: { _form_id: string }
        Returns: undefined
      }
      sync_public_mobility_form: {
        Args: { _form_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      assignment_status: "confirmado" | "pendente" | "cancelado"
      audit_action:
        | "create"
        | "update"
        | "delete"
        | "status_change"
        | "import"
        | "arrive_destination"
        | "start_return"
        | "complete_return"
      cart_action: "retirada" | "devolucao" | "mudanca_status" | "nota"
      cart_status: "disponivel" | "em_uso" | "manutencao" | "inativo"
      expense_status:
        | "rascunho"
        | "pendente_comprovante"
        | "pendente_validacao"
        | "aprovado"
        | "ressarcimento_solicitado"
        | "ressarcido"
        | "recusado"
        | "cancelado"
      extraction_status: "pendente" | "sucesso" | "falha" | "manual"
      member_status: "disponivel" | "em_deslocamento"
      mobility_authorization_type: "carro_eletrico" | "patinete"
      org_role: "admin" | "gestor" | "operador" | "leitura"
      pix_key_type: "cpf" | "telefone" | "email" | "aleatoria"
      priority_level: "baixa" | "media" | "alta" | "urgente"
      reimbursement_status: "pendente" | "aprovado" | "pago" | "recusado"
      schedule_status: "rascunho" | "ativa" | "encerrada"
      task_recurrence: "nenhuma" | "diaria" | "semanal" | "mensal"
      task_status_enum: "pendente" | "concluida"
      transport_status:
        | "pendente"
        | "em_andamento"
        | "concluido"
        | "cancelado"
        | "chegou_destino"
        | "em_retorno"
      vehicle_status: "disponivel" | "em_uso" | "manutencao" | "inativo"
      weather_risk_level: "favoravel" | "atencao" | "alerta" | "critico"
      weather_source: "google_weather_api"
      weather_sync_status:
        | "pendente"
        | "em_andamento"
        | "sucesso"
        | "erro"
        | "parcial"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      assignment_status: ["confirmado", "pendente", "cancelado"],
      audit_action: [
        "create",
        "update",
        "delete",
        "status_change",
        "import",
        "arrive_destination",
        "start_return",
        "complete_return",
      ],
      cart_action: ["retirada", "devolucao", "mudanca_status", "nota"],
      cart_status: ["disponivel", "em_uso", "manutencao", "inativo"],
      expense_status: [
        "rascunho",
        "pendente_comprovante",
        "pendente_validacao",
        "aprovado",
        "ressarcimento_solicitado",
        "ressarcido",
        "recusado",
        "cancelado",
      ],
      extraction_status: ["pendente", "sucesso", "falha", "manual"],
      member_status: ["disponivel", "em_deslocamento"],
      mobility_authorization_type: ["carro_eletrico", "patinete"],
      org_role: ["admin", "gestor", "operador", "leitura"],
      pix_key_type: ["cpf", "telefone", "email", "aleatoria"],
      priority_level: ["baixa", "media", "alta", "urgente"],
      reimbursement_status: ["pendente", "aprovado", "pago", "recusado"],
      schedule_status: ["rascunho", "ativa", "encerrada"],
      task_recurrence: ["nenhuma", "diaria", "semanal", "mensal"],
      task_status_enum: ["pendente", "concluida"],
      transport_status: [
        "pendente",
        "em_andamento",
        "concluido",
        "cancelado",
        "chegou_destino",
        "em_retorno",
      ],
      vehicle_status: ["disponivel", "em_uso", "manutencao", "inativo"],
      weather_risk_level: ["favoravel", "atencao", "alerta", "critico"],
      weather_source: ["google_weather_api"],
      weather_sync_status: [
        "pendente",
        "em_andamento",
        "sucesso",
        "erro",
        "parcial",
      ],
    },
  },
} as const
