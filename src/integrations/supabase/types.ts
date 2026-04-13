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
    PostgrestVersion: "14.1"
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
      commissions: {
        Row: {
          created_at: string
          id: string
          nome: string
          org_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          org_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          org_id?: string
        }
        Relationships: []
      }
      electric_carts: {
        Row: {
          codigo: string
          comissao: string | null
          created_at: string
          devolucao_em: string | null
          devolucao_prevista_em: string | null
          id: string
          nome: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          retirada_em: string | null
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
        }
        Insert: {
          codigo: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
        }
        Update: {
          codigo?: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
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
      scooters: {
        Row: {
          codigo: string
          comissao: string | null
          created_at: string
          devolucao_em: string | null
          devolucao_prevista_em: string | null
          id: string
          nome: string | null
          observacoes: string | null
          org_id: string
          responsavel_user_id: string | null
          retirada_em: string | null
          status: Database["public"]["Enums"]["cart_status"]
          updated_at: string
        }
        Insert: {
          codigo: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          org_id: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
          updated_at?: string
        }
        Update: {
          codigo?: string
          comissao?: string | null
          created_at?: string
          devolucao_em?: string | null
          devolucao_prevista_em?: string | null
          id?: string
          nome?: string | null
          observacoes?: string | null
          org_id?: string
          responsavel_user_id?: string | null
          retirada_em?: string | null
          status?: Database["public"]["Enums"]["cart_status"]
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
      transports: {
        Row: {
          created_at: string
          destino: string
          destino_lat: number | null
          destino_lng: number | null
          distancia_estimada_km: number | null
          duracao_estimada_min: number | null
          fim_em: string | null
          fim_real_em: string | null
          guest_id: string | null
          horario_saida: string | null
          id: string
          inicio_em: string
          inicio_real_em: string | null
          km_devolucao: number | null
          km_retirada: number | null
          motorista_user_id: string | null
          observacoes: string | null
          org_id: string
          origem: string
          passageiros_qtd: number | null
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline: string | null
          status: Database["public"]["Enums"]["transport_status"]
          tipo: string | null
          titulo: string | null
          updated_at: string
          vehicle_id: string | null
          voo_checkin: string | null
          voo_chegada: string | null
          voo_cidade: string | null
          voo_numero: string | null
        }
        Insert: {
          created_at?: string
          destino: string
          destino_lat?: number | null
          destino_lng?: number | null
          distancia_estimada_km?: number | null
          duracao_estimada_min?: number | null
          fim_em?: string | null
          fim_real_em?: string | null
          guest_id?: string | null
          horario_saida?: string | null
          id?: string
          inicio_em: string
          inicio_real_em?: string | null
          km_devolucao?: number | null
          km_retirada?: number | null
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id: string
          origem: string
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline?: string | null
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
          updated_at?: string
          vehicle_id?: string | null
          voo_checkin?: string | null
          voo_chegada?: string | null
          voo_cidade?: string | null
          voo_numero?: string | null
        }
        Update: {
          created_at?: string
          destino?: string
          destino_lat?: number | null
          destino_lng?: number | null
          distancia_estimada_km?: number | null
          duracao_estimada_min?: number | null
          fim_em?: string | null
          fim_real_em?: string | null
          guest_id?: string | null
          horario_saida?: string | null
          id?: string
          inicio_em?: string
          inicio_real_em?: string | null
          km_devolucao?: number | null
          km_retirada?: number | null
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id?: string
          origem?: string
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          rota_polyline?: string | null
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
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
          marca: string | null
          modelo: string | null
          org_id: string
          placa: string
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
          marca?: string | null
          modelo?: string | null
          org_id: string
          placa: string
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
          marca?: string | null
          modelo?: string | null
          org_id?: string
          placa?: string
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
    }
    Views: {
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
      get_user_org_ids: { Args: { _user_id: string }; Returns: string[] }
      get_user_org_role: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["org_role"]
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
      set_transport_guests: {
        Args: { _guest_ids: string[]; _org_id: string; _transport_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      assignment_status: "confirmado" | "pendente" | "cancelado"
      audit_action: "create" | "update" | "delete" | "status_change" | "import"
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
      org_role: "admin" | "gestor" | "operador" | "leitura"
      pix_key_type: "cpf" | "telefone" | "email" | "aleatoria"
      priority_level: "baixa" | "media" | "alta" | "urgente"
      reimbursement_status: "pendente" | "aprovado" | "pago" | "recusado"
      schedule_status: "rascunho" | "ativa" | "encerrada"
      task_recurrence: "nenhuma" | "diaria" | "semanal" | "mensal"
      task_status_enum: "pendente" | "concluida"
      transport_status: "pendente" | "em_andamento" | "concluido" | "cancelado"
      vehicle_status: "disponivel" | "em_uso" | "manutencao" | "inativo"
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
      audit_action: ["create", "update", "delete", "status_change", "import"],
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
      org_role: ["admin", "gestor", "operador", "leitura"],
      pix_key_type: ["cpf", "telefone", "email", "aleatoria"],
      priority_level: ["baixa", "media", "alta", "urgente"],
      reimbursement_status: ["pendente", "aprovado", "pago", "recusado"],
      schedule_status: ["rascunho", "ativa", "encerrada"],
      task_recurrence: ["nenhuma", "diaria", "semanal", "mensal"],
      task_status_enum: ["pendente", "concluida"],
      transport_status: ["pendente", "em_andamento", "concluido", "cancelado"],
      vehicle_status: ["disponivel", "em_uso", "manutencao", "inativo"],
    },
  },
} as const
