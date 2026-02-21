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
      electric_carts: {
        Row: {
          codigo: string
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
          created_at: string
          id: string
          is_active: boolean
          nome_exibicao: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          telefone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_color?: string | null
          cargo?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nome_exibicao?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["org_role"]
          telefone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_color?: string | null
          cargo?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          nome_exibicao?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
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
      transports: {
        Row: {
          created_at: string
          destino: string
          fim_em: string | null
          guest_id: string | null
          id: string
          inicio_em: string
          motorista_user_id: string | null
          observacoes: string | null
          org_id: string
          origem: string
          passageiros_qtd: number | null
          prioridade: Database["public"]["Enums"]["priority_level"] | null
          status: Database["public"]["Enums"]["transport_status"]
          tipo: string | null
          titulo: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          destino: string
          fim_em?: string | null
          guest_id?: string | null
          id?: string
          inicio_em: string
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id: string
          origem: string
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          destino?: string
          fim_em?: string | null
          guest_id?: string | null
          id?: string
          inicio_em?: string
          motorista_user_id?: string | null
          observacoes?: string | null
          org_id?: string
          origem?: string
          passageiros_qtd?: number | null
          prioridade?: Database["public"]["Enums"]["priority_level"] | null
          status?: Database["public"]["Enums"]["transport_status"]
          tipo?: string | null
          titulo?: string | null
          updated_at?: string
          vehicle_id?: string | null
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
      vehicles: {
        Row: {
          ano: number | null
          categoria: string | null
          cor: string | null
          created_at: string
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
      [_ in never]: never
    }
    Functions: {
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
    }
    Enums: {
      app_role: "admin" | "user"
      assignment_status: "confirmado" | "pendente" | "cancelado"
      audit_action: "create" | "update" | "delete" | "status_change" | "import"
      cart_action: "retirada" | "devolucao" | "mudanca_status" | "nota"
      cart_status: "disponivel" | "em_uso" | "manutencao" | "inativo"
      org_role: "admin" | "gestor" | "operador" | "leitura"
      priority_level: "baixa" | "media" | "alta" | "urgente"
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
      org_role: ["admin", "gestor", "operador", "leitura"],
      priority_level: ["baixa", "media", "alta", "urgente"],
      schedule_status: ["rascunho", "ativa", "encerrada"],
      task_recurrence: ["nenhuma", "diaria", "semanal", "mensal"],
      task_status_enum: ["pendente", "concluida"],
      transport_status: ["pendente", "em_andamento", "concluido", "cancelado"],
      vehicle_status: ["disponivel", "em_uso", "manutencao", "inativo"],
    },
  },
} as const
