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
      agenda_meeting_action_items: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          confirmed_user_id: string | null
          created_at: string
          description: string
          due_date: string | null
          due_date_confirmed: boolean
          due_date_text: string | null
          event_id: string
          evidence: Json
          id: string
          minutes_version_id: string
          org_id: string
          position: number
          responsible_text: string | null
          session_id: string
          status: string
          suggested_user_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_user_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          due_date_confirmed?: boolean
          due_date_text?: string | null
          event_id: string
          evidence?: Json
          id?: string
          minutes_version_id: string
          org_id: string
          position?: number
          responsible_text?: string | null
          session_id: string
          status?: string
          suggested_user_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          confirmed_user_id?: string | null
          created_at?: string
          description?: string
          due_date?: string | null
          due_date_confirmed?: boolean
          due_date_text?: string | null
          event_id?: string
          evidence?: Json
          id?: string
          minutes_version_id?: string
          org_id?: string
          position?: number
          responsible_text?: string | null
          session_id?: string
          status?: string
          suggested_user_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_action_items_minutes_version_id_fkey"
            columns: ["minutes_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_meeting_actions_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
      agenda_meeting_administrative_tombstones: {
        Row: {
          actor_user_id: string | null
          capture_state: string
          deleted_at: string
          deletion_scope: string
          event_context_hash: string
          event_id: string
          id: string
          latest_minutes_hash: string | null
          latest_transcript_hash: string | null
          minutes_version_count: number
          org_id: string
          processing_state: string
          receipt_count: number
          session_created_at: string
          session_id: string
          session_version: number
          transcript_segment_count: number
          transcript_version_count: number
        }
        Insert: {
          actor_user_id?: string | null
          capture_state: string
          deleted_at?: string
          deletion_scope: string
          event_context_hash: string
          event_id: string
          id?: string
          latest_minutes_hash?: string | null
          latest_transcript_hash?: string | null
          minutes_version_count?: number
          org_id: string
          processing_state: string
          receipt_count?: number
          session_created_at: string
          session_id: string
          session_version: number
          transcript_segment_count?: number
          transcript_version_count?: number
        }
        Update: {
          actor_user_id?: string | null
          capture_state?: string
          deleted_at?: string
          deletion_scope?: string
          event_context_hash?: string
          event_id?: string
          id?: string
          latest_minutes_hash?: string | null
          latest_transcript_hash?: string | null
          minutes_version_count?: number
          org_id?: string
          processing_state?: string
          receipt_count?: number
          session_created_at?: string
          session_id?: string
          session_version?: number
          transcript_segment_count?: number
          transcript_version_count?: number
        }
        Relationships: []
      }
      agenda_meeting_audit_events: {
        Row: {
          action: string
          actor_kind: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_id: string
          id: string
          metadata: Json
          mutation_id: string | null
          org_id: string
          session_id: string
        }
        Insert: {
          action: string
          actor_kind: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_id: string
          id?: string
          metadata?: Json
          mutation_id?: string | null
          org_id: string
          session_id: string
        }
        Update: {
          action?: string
          actor_kind?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_id?: string
          id?: string
          metadata?: Json
          mutation_id?: string | null
          org_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_audit_session_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
      agenda_meeting_insights: {
        Row: {
          confidence: number | null
          created_at: string
          description: string
          event_id: string
          evidence: Json
          id: string
          insight_type: string
          minutes_version_id: string
          org_id: string
          position: number
          review_state: string
          session_id: string
          title: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          description: string
          event_id: string
          evidence?: Json
          id?: string
          insight_type: string
          minutes_version_id: string
          org_id: string
          position?: number
          review_state?: string
          session_id: string
          title: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          description?: string
          event_id?: string
          evidence?: Json
          id?: string
          insight_type?: string
          minutes_version_id?: string
          org_id?: string
          position?: number
          review_state?: string
          session_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_insights_minutes_version_id_fkey"
            columns: ["minutes_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_minutes_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_meeting_insights_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
      agenda_meeting_minutes_versions: {
        Row: {
          analysis_model: string
          created_at: string
          event_id: string
          id: string
          minutes_markdown: string
          org_id: string
          prompt_version: string
          provider_response_id: string | null
          provider_usage: Json
          reasoning_effort: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: string
          session_id: string
          status: string
          summary: string
          title: string
          transcript_coverage: string
          transcript_version_id: string
          version: number
        }
        Insert: {
          analysis_model?: string
          created_at?: string
          event_id: string
          id?: string
          minutes_markdown: string
          org_id: string
          prompt_version: string
          provider_response_id?: string | null
          provider_usage?: Json
          reasoning_effort?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version: string
          session_id: string
          status?: string
          summary: string
          title: string
          transcript_coverage: string
          transcript_version_id: string
          version: number
        }
        Update: {
          analysis_model?: string
          created_at?: string
          event_id?: string
          id?: string
          minutes_markdown?: string
          org_id?: string
          prompt_version?: string
          provider_response_id?: string | null
          provider_usage?: Json
          reasoning_effort?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: string
          session_id?: string
          status?: string
          summary?: string
          title?: string
          transcript_coverage?: string
          transcript_version_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_minutes_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
          {
            foreignKeyName: "agenda_meeting_minutes_versions_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_meeting_mutation_receipts: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          event_id: string
          id: string
          mutation_id: string
          org_id: string
          response: Json
          session_id: string | null
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          event_id: string
          id?: string
          mutation_id: string
          org_id: string
          response: Json
          session_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          event_id?: string
          id?: string
          mutation_id?: string
          org_id?: string
          response?: Json
          session_id?: string | null
        }
        Relationships: []
      }
      agenda_meeting_processing_jobs: {
        Row: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dedupe_key: string
          event_id: string
          id: string
          kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          org_id: string
          session_id: string
          status: string
          transcript_version_id: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          dedupe_key: string
          event_id: string
          id?: string
          kind: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          org_id: string
          session_id: string
          status?: string
          transcript_version_id?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          dedupe_key?: string
          event_id?: string
          id?: string
          kind?: string
          last_error_code?: string | null
          lease_expires_at?: string | null
          lease_token?: string | null
          max_attempts?: number
          org_id?: string
          session_id?: string
          status?: string
          transcript_version_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_jobs_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
          {
            foreignKeyName: "agenda_meeting_processing_jobs_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_transcript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_meeting_segment_receipts: {
        Row: {
          attempt_count: number
          attempt_id: string
          byte_size: number | null
          callback_digest: string | null
          callback_received_at: string | null
          callback_token_expires_at: string | null
          callback_token_hash: string | null
          capture_end_ms: number
          capture_start_ms: number
          created_at: string
          error_code: string | null
          event_id: string
          id: string
          lost_at: string | null
          mime_type: string | null
          mutation_id: string
          org_id: string
          provider_accepted_at: string | null
          provider_request_id: string | null
          retry_after_ms: number | null
          segment_id: string
          sequence: number
          session_id: string
          sha256: string | null
          status: string
          transcribed_at: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          attempt_id?: string
          byte_size?: number | null
          callback_digest?: string | null
          callback_received_at?: string | null
          callback_token_expires_at?: string | null
          callback_token_hash?: string | null
          capture_end_ms: number
          capture_start_ms: number
          created_at?: string
          error_code?: string | null
          event_id: string
          id?: string
          lost_at?: string | null
          mime_type?: string | null
          mutation_id: string
          org_id: string
          provider_accepted_at?: string | null
          provider_request_id?: string | null
          retry_after_ms?: number | null
          segment_id: string
          sequence: number
          session_id: string
          sha256?: string | null
          status?: string
          transcribed_at?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          attempt_id?: string
          byte_size?: number | null
          callback_digest?: string | null
          callback_received_at?: string | null
          callback_token_expires_at?: string | null
          callback_token_hash?: string | null
          capture_end_ms?: number
          capture_start_ms?: number
          created_at?: string
          error_code?: string | null
          event_id?: string
          id?: string
          lost_at?: string | null
          mime_type?: string | null
          mutation_id?: string
          org_id?: string
          provider_accepted_at?: string | null
          provider_request_id?: string | null
          retry_after_ms?: number | null
          segment_id?: string
          sequence?: number
          session_id?: string
          sha256?: string | null
          status?: string
          transcribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_receipts_session_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
      agenda_meeting_sessions: {
        Row: {
          active_duration_ms: number
          analysis_model: string
          analysis_provider: string
          analysis_reasoning_effort: string
          capture_state: string
          client_session_key: string
          closed_sequence: number | null
          completed_at: string | null
          consent_confirmed: boolean
          consent_confirmed_at: string | null
          consent_policy_version: string | null
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          event_context: Json
          event_id: string
          finalized_at: string | null
          heartbeat_at: string | null
          id: string
          language: string
          last_contiguous_sequence: number
          last_error_at: string | null
          last_error_code: string | null
          last_received_sequence: number
          missing_sequences: number[]
          org_id: string
          partial_analysis_confirmed: boolean
          paused_at: string | null
          processing_state: string
          started_at: string | null
          started_by: string
          stt_model: string
          stt_provider: string
          unresolved_sequences: number[]
          updated_at: string
          version: number
        }
        Insert: {
          active_duration_ms?: number
          analysis_model?: string
          analysis_provider?: string
          analysis_reasoning_effort?: string
          capture_state?: string
          client_session_key: string
          closed_sequence?: number | null
          completed_at?: string | null
          consent_confirmed?: boolean
          consent_confirmed_at?: string | null
          consent_policy_version?: string | null
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          event_context?: Json
          event_id: string
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          language?: string
          last_contiguous_sequence?: number
          last_error_at?: string | null
          last_error_code?: string | null
          last_received_sequence?: number
          missing_sequences?: number[]
          org_id: string
          partial_analysis_confirmed?: boolean
          paused_at?: string | null
          processing_state?: string
          started_at?: string | null
          started_by: string
          stt_model?: string
          stt_provider?: string
          unresolved_sequences?: number[]
          updated_at?: string
          version?: number
        }
        Update: {
          active_duration_ms?: number
          analysis_model?: string
          analysis_provider?: string
          analysis_reasoning_effort?: string
          capture_state?: string
          client_session_key?: string
          closed_sequence?: number | null
          completed_at?: string | null
          consent_confirmed?: boolean
          consent_confirmed_at?: string | null
          consent_policy_version?: string | null
          created_at?: string
          deleted_at?: string | null
          ended_at?: string | null
          event_context?: Json
          event_id?: string
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          language?: string
          last_contiguous_sequence?: number
          last_error_at?: string | null
          last_error_code?: string | null
          last_received_sequence?: number
          missing_sequences?: number[]
          org_id?: string
          partial_analysis_confirmed?: boolean
          paused_at?: string | null
          processing_state?: string
          started_at?: string | null
          started_by?: string
          stt_model?: string
          stt_provider?: string
          unresolved_sequences?: number[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_sessions_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "agenda_meeting_sessions_event_org_fkey"
            columns: ["event_id", "org_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "agenda_meeting_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_meeting_transcript_revision_segments: {
        Row: {
          created_at: string
          event_id: string
          id: string
          org_id: string
          revised_content_hash: string
          revised_text: string
          sequence: number
          session_id: string
          source_content_hash: string
          source_segment_id: string
          transcript_version_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          org_id: string
          revised_content_hash: string
          revised_text: string
          sequence: number
          session_id: string
          source_content_hash: string
          source_segment_id: string
          transcript_version_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          org_id?: string
          revised_content_hash?: string
          revised_text?: string
          sequence?: number
          session_id?: string
          source_content_hash?: string
          source_segment_id?: string
          transcript_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_revision_segments_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
          {
            foreignKeyName: "agenda_meeting_transcript_revision_s_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_transcript_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_meeting_transcript_revision_segme_source_segment_id_fkey"
            columns: ["source_segment_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_transcript_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_meeting_transcript_segments: {
        Row: {
          confidence: number | null
          content_hash: string
          created_at: string
          duration_ms: number | null
          event_id: string
          id: string
          org_id: string
          provider_language: string
          provider_model: string
          provider_request_id: string
          receipt_id: string
          segment_id: string
          sequence: number
          session_id: string
          transcript_text: string
          words: Json
        }
        Insert: {
          confidence?: number | null
          content_hash: string
          created_at?: string
          duration_ms?: number | null
          event_id: string
          id?: string
          org_id: string
          provider_language?: string
          provider_model?: string
          provider_request_id: string
          receipt_id: string
          segment_id: string
          sequence: number
          session_id: string
          transcript_text: string
          words?: Json
        }
        Update: {
          confidence?: number | null
          content_hash?: string
          created_at?: string
          duration_ms?: number | null
          event_id?: string
          id?: string
          org_id?: string
          provider_language?: string
          provider_model?: string
          provider_request_id?: string
          receipt_id?: string
          segment_id?: string
          sequence?: number
          session_id?: string
          transcript_text?: string
          words?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_segments_session_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
          {
            foreignKeyName: "agenda_meeting_transcript_segments_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: true
            referencedRelation: "agenda_meeting_segment_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      agenda_meeting_transcript_versions: {
        Row: {
          content_hash: string
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          is_complete: boolean
          kind: string
          missing_sequences: number[]
          org_id: string
          parent_version_id: string | null
          revision_reason: string | null
          session_id: string
          transcript_text: string
          version: number
        }
        Insert: {
          content_hash: string
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          is_complete?: boolean
          kind: string
          missing_sequences?: number[]
          org_id: string
          parent_version_id?: string | null
          revision_reason?: string | null
          session_id: string
          transcript_text: string
          version: number
        }
        Update: {
          content_hash?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          is_complete?: boolean
          kind?: string
          missing_sequences?: number[]
          org_id?: string
          parent_version_id?: string | null
          revision_reason?: string | null
          session_id?: string
          transcript_text?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_transcript_versions_parent_version_id_fkey"
            columns: ["parent_version_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_transcript_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agenda_meeting_transcript_versions_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
      agenda_meeting_user_consents: {
        Row: {
          consent_version: number
          decision: string
          event_id: string
          id: string
          org_id: string
          policy_version: string
          recorded_at: string
          recorded_by: string
          session_id: string
          user_id: string
        }
        Insert: {
          consent_version: number
          decision: string
          event_id: string
          id?: string
          org_id: string
          policy_version: string
          recorded_at?: string
          recorded_by: string
          session_id: string
          user_id: string
        }
        Update: {
          consent_version?: number
          decision?: string
          event_id?: string
          id?: string
          org_id?: string
          policy_version?: string
          recorded_at?: string
          recorded_by?: string
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agenda_meeting_consents_scope_fkey"
            columns: ["session_id", "org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "agenda_meeting_sessions"
            referencedColumns: ["id", "org_id", "event_id"]
          },
        ]
      }
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
      commercial_lots: {
        Row: {
          accessibility_notes: string | null
          archived_at: string | null
          area_validation_status: string
          block: string | null
          calculated_area_sqm: number | null
          commercial_notes: string | null
          created_at: string
          created_by: string | null
          depth_meters: number | null
          description: string | null
          display_name: string
          entity_id: string
          frontage_meters: number | null
          has_electricity: boolean
          has_internet: boolean
          has_water: boolean
          id: string
          infrastructure: Json
          internal_notes: string | null
          is_corner: boolean
          is_covered: boolean
          level_label: string | null
          lot_number: string | null
          official_area_sqm: number | null
          project_id: string
          public_identifier: string
          status: string
          superseded_by_lot_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          accessibility_notes?: string | null
          archived_at?: string | null
          area_validation_status?: string
          block?: string | null
          calculated_area_sqm?: number | null
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          depth_meters?: number | null
          description?: string | null
          display_name: string
          entity_id: string
          frontage_meters?: number | null
          has_electricity?: boolean
          has_internet?: boolean
          has_water?: boolean
          id?: string
          infrastructure?: Json
          internal_notes?: string | null
          is_corner?: boolean
          is_covered?: boolean
          level_label?: string | null
          lot_number?: string | null
          official_area_sqm?: number | null
          project_id: string
          public_identifier: string
          status?: string
          superseded_by_lot_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          accessibility_notes?: string | null
          archived_at?: string | null
          area_validation_status?: string
          block?: string | null
          calculated_area_sqm?: number | null
          commercial_notes?: string | null
          created_at?: string
          created_by?: string | null
          depth_meters?: number | null
          description?: string | null
          display_name?: string
          entity_id?: string
          frontage_meters?: number | null
          has_electricity?: boolean
          has_internet?: boolean
          has_water?: boolean
          id?: string
          infrastructure?: Json
          internal_notes?: string | null
          is_corner?: boolean
          is_covered?: boolean
          level_label?: string | null
          lot_number?: string | null
          official_area_sqm?: number | null
          project_id?: string
          public_identifier?: string
          status?: string
          superseded_by_lot_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_lots_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: true
            referencedRelation: "map_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_lots_entity_project_fk"
            columns: ["entity_id", "project_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "commercial_lots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_lots_superseded_by_lot_id_fkey"
            columns: ["superseded_by_lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_responsibles: {
        Row: {
          active: boolean
          commission_id: string
          created_at: string
          display_name: string
          display_order: number
          id: string
          is_primary: boolean
          normalized_name: string | null
          org_id: string
          relationship_role: string
          responsible_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          commission_id: string
          created_at?: string
          display_name: string
          display_order?: number
          id?: string
          is_primary?: boolean
          normalized_name?: string | null
          org_id: string
          relationship_role?: string
          responsible_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          commission_id?: string
          created_at?: string
          display_name?: string
          display_order?: number
          id?: string
          is_primary?: boolean
          normalized_name?: string | null
          org_id?: string
          relationship_role?: string
          responsible_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_responsibles_commission_org_fkey"
            columns: ["commission_id", "org_id"]
            isOneToOne: false
            referencedRelation: "commissions"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "commission_responsibles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_legacy: boolean
          is_official: boolean
          nome: string
          normalized_name: string | null
          org_id: string
          slug: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          is_official?: boolean
          nome: string
          normalized_name?: string | null
          org_id: string
          slug: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          is_official?: boolean
          nome?: string
          normalized_name?: string | null
          org_id?: string
          slug?: string
          unit_type?: string
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
      cronograma_evento_anexos: {
        Row: {
          caption: string | null
          created_at: string
          event_id: string
          file_name: string
          file_path: string
          id: string
          kind: string
          mime_type: string
          org_id: string
          size_bytes: number
          updated_at: string
          uploaded_by: string | null
          uploader_name: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          event_id: string
          file_name: string
          file_path: string
          id?: string
          kind?: string
          mime_type: string
          org_id: string
          size_bytes?: number
          updated_at?: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          event_id?: string
          file_name?: string
          file_path?: string
          id?: string
          kind?: string
          mime_type?: string
          org_id?: string
          size_bytes?: number
          updated_at?: string
          uploaded_by?: string | null
          uploader_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_evento_anexos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cronograma_evento_anexos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "cronograma_eventos_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cronograma_evento_anexos_org_id_fkey"
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
      cronograma_evento_tombstones: {
        Row: {
          deleted_at: string
          deleted_by_user_id: string
          deleted_event_id: string | null
          id: string
          org_id: string
          source_key: string
        }
        Insert: {
          deleted_at?: string
          deleted_by_user_id: string
          deleted_event_id?: string | null
          id?: string
          org_id: string
          source_key: string
        }
        Update: {
          deleted_at?: string
          deleted_by_user_id?: string
          deleted_event_id?: string | null
          id?: string
          org_id?: string
          source_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_evento_tombstones_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      cronograma_subevento_acoes: {
        Row: {
          commission_name: string | null
          commission_slug: string | null
          created_at: string
          id: string
          is_done: boolean
          notes: string | null
          org_id: string
          responsible_name: string | null
          responsible_user_id: string | null
          sort_order: number
          start_time: string | null
          subevent_id: string
          title: string
          updated_at: string
        }
        Insert: {
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          notes?: string | null
          org_id: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          start_time?: string | null
          subevent_id: string
          title: string
          updated_at?: string
        }
        Update: {
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          id?: string
          is_done?: boolean
          notes?: string | null
          org_id?: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          start_time?: string | null
          subevent_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subevento_acoes_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
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
      cronograma_subevento_convidados: {
        Row: {
          category: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          sort_order: number
          subevent_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          sort_order?: number
          subevent_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          sort_order?: number
          subevent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subevento_convidados_subevent_id_fkey"
            columns: ["subevent_id"]
            isOneToOne: false
            referencedRelation: "cronograma_subeventos"
            referencedColumns: ["id"]
          },
        ]
      }
      cronograma_subevento_providencias: {
        Row: {
          commission_name: string | null
          commission_slug: string | null
          created_at: string
          description: string
          id: string
          is_done: boolean
          note: string | null
          org_id: string
          responsible_name: string | null
          responsible_user_id: string | null
          sort_order: number
          subevent_id: string
          updated_at: string
        }
        Insert: {
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          description: string
          id?: string
          is_done?: boolean
          note?: string | null
          org_id: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          subevent_id: string
          updated_at?: string
        }
        Update: {
          commission_name?: string | null
          commission_slug?: string | null
          created_at?: string
          description?: string
          id?: string
          is_done?: boolean
          note?: string | null
          org_id?: string
          responsible_name?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          subevent_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cronograma_subevento_providencias_subevent_id_fkey"
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
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
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
          access_token_ciphertext: string | null
          access_token_iv: string | null
          access_token_tag: string | null
          active_oauth_attempt_id: string | null
          backfill_done: number
          backfill_total: number
          connected_at: string | null
          connection_generation: string | null
          connection_key: string | null
          created_at: string
          error_code: string | null
          google_email: string | null
          google_subject: string | null
          last_error: string | null
          last_sync_at: string | null
          oauth_provider: string
          org_id: string
          refresh_token_ciphertext: string | null
          refresh_token_iv: string | null
          refresh_token_tag: string | null
          scopes_granted: string[]
          secondary_calendar_id: string | null
          status: string
          sync_scope: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          access_token_tag?: string | null
          active_oauth_attempt_id?: string | null
          backfill_done?: number
          backfill_total?: number
          connected_at?: string | null
          connection_generation?: string | null
          connection_key?: string | null
          created_at?: string
          error_code?: string | null
          google_email?: string | null
          google_subject?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          oauth_provider?: string
          org_id: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          scopes_granted?: string[]
          secondary_calendar_id?: string | null
          status?: string
          sync_scope?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          access_token_ciphertext?: string | null
          access_token_iv?: string | null
          access_token_tag?: string | null
          active_oauth_attempt_id?: string | null
          backfill_done?: number
          backfill_total?: number
          connected_at?: string | null
          connection_generation?: string | null
          connection_key?: string | null
          created_at?: string
          error_code?: string | null
          google_email?: string | null
          google_subject?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          oauth_provider?: string
          org_id?: string
          refresh_token_ciphertext?: string | null
          refresh_token_iv?: string | null
          refresh_token_tag?: string | null
          scopes_granted?: string[]
          secondary_calendar_id?: string | null
          status?: string
          sync_scope?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_active_oauth_attempt_id_fkey"
            columns: ["active_oauth_attempt_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_oauth_attempts"
            referencedColumns: ["id"]
          },
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
        Relationships: []
      }
      google_calendar_oauth_attempts: {
        Row: {
          callback_observation: Json | null
          callback_path: string
          consumed_at: string | null
          created_at: string
          error_code: string | null
          exchange_code_hash: string | null
          expires_at: string
          id: string
          next_path: string
          oauth_session_id_hash: string | null
          org_id: string
          prior_connection_status: string | null
          prior_error_code: string | null
          provider_state_hash: string | null
          return_origin: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          callback_observation?: Json | null
          callback_path: string
          consumed_at?: string | null
          created_at?: string
          error_code?: string | null
          exchange_code_hash?: string | null
          expires_at: string
          id?: string
          next_path: string
          oauth_session_id_hash?: string | null
          org_id: string
          prior_connection_status?: string | null
          prior_error_code?: string | null
          provider_state_hash?: string | null
          return_origin: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          callback_observation?: Json | null
          callback_path?: string
          consumed_at?: string | null
          created_at?: string
          error_code?: string | null
          exchange_code_hash?: string | null
          expires_at?: string
          id?: string
          next_path?: string
          oauth_session_id_hash?: string | null
          org_id?: string
          prior_connection_status?: string | null
          prior_error_code?: string | null
          provider_state_hash?: string | null
          return_origin?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_oauth_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_sync_preferences: {
        Row: {
          created_at: string
          id: string
          org_id: string
          sync_scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          sync_scope?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          sync_scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_sync_preferences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      google_sync_outbox: {
        Row: {
          attempts: number
          connection_generation: string | null
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
          connection_generation?: string | null
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
          connection_generation?: string | null
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
            foreignKeyName: "google_sync_outbox_org_id_fkey"
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
      internal_worker_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      lot_contract_versions: {
        Row: {
          contract_id: string
          file_size: number
          id: string
          mime_type: string
          original_name: string
          storage_path: string
          superseded_at: string | null
          uploaded_at: string
          uploaded_by: string
          version: number
        }
        Insert: {
          contract_id: string
          file_size: number
          id?: string
          mime_type: string
          original_name: string
          storage_path: string
          superseded_at?: string | null
          uploaded_at?: string
          uploaded_by: string
          version: number
        }
        Update: {
          contract_id?: string
          file_size?: number
          id?: string
          mime_type?: string
          original_name?: string
          storage_path?: string
          superseded_at?: string | null
          uploaded_at?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "lot_contract_versions_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "lot_contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_contracts: {
        Row: {
          active_version: number
          contract_number: string | null
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          lot_id: string
          updated_at: string
        }
        Insert: {
          active_version?: number
          contract_number?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          lot_id: string
          updated_at?: string
        }
        Update: {
          active_version?: number
          contract_number?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          lot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_contracts_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_negotiations: {
        Row: {
          company_name: string
          contact_name: string | null
          created_at: string
          document_number: string | null
          id: string
          lot_id: string
          notes: string | null
          proposed_value: number | null
          responsible_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_name: string
          contact_name?: string | null
          created_at?: string
          document_number?: string | null
          id?: string
          lot_id: string
          notes?: string | null
          proposed_value?: number | null
          responsible_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          contact_name?: string | null
          created_at?: string
          document_number?: string | null
          id?: string
          lot_id?: string
          notes?: string | null
          proposed_value?: number | null
          responsible_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_negotiations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_prices: {
        Row: {
          asking_price: number | null
          base_price: number | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          lot_id: string
          minimum_price: number | null
          price_per_sqm: number | null
          pricing_mode: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          asking_price?: number | null
          base_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          lot_id: string
          minimum_price?: number | null
          price_per_sqm?: number | null
          pricing_mode: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          asking_price?: number | null
          base_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          lot_id?: string
          minimum_price?: number | null
          price_per_sqm?: number | null
          pricing_mode?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_prices_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_reservations: {
        Row: {
          cancelled_at: string | null
          company_name: string
          contact_name: string
          created_at: string
          document_number: string | null
          email: string | null
          expires_at: string
          id: string
          lot_id: string
          notes: string | null
          phone: string | null
          reserved_at: string
          responsible_name: string | null
          responsible_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          company_name: string
          contact_name: string
          created_at?: string
          document_number?: string | null
          email?: string | null
          expires_at: string
          id?: string
          lot_id: string
          notes?: string | null
          phone?: string | null
          reserved_at?: string
          responsible_name?: string | null
          responsible_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          company_name?: string
          contact_name?: string
          created_at?: string
          document_number?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          lot_id?: string
          notes?: string | null
          phone?: string | null
          reserved_at?: string
          responsible_name?: string | null
          responsible_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_reservations_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_sales: {
        Row: {
          buyer_name: string
          contract_number: string | null
          created_at: string
          document_number: string | null
          id: string
          internal_notes: string | null
          lot_id: string
          negotiated_value: number
          payment_status: string
          reverted_at: string | null
          reverted_by: string | null
          sale_date: string
          salesperson_name: string
          salesperson_user_id: string
          status: string
        }
        Insert: {
          buyer_name: string
          contract_number?: string | null
          created_at?: string
          document_number?: string | null
          id?: string
          internal_notes?: string | null
          lot_id: string
          negotiated_value: number
          payment_status?: string
          reverted_at?: string | null
          reverted_by?: string | null
          sale_date: string
          salesperson_name: string
          salesperson_user_id: string
          status?: string
        }
        Update: {
          buyer_name?: string
          contract_number?: string | null
          created_at?: string
          document_number?: string | null
          id?: string
          internal_notes?: string | null
          lot_id?: string
          negotiated_value?: number
          payment_status?: string
          reverted_at?: string | null
          reverted_by?: string | null
          sale_date?: string
          salesperson_name?: string
          salesperson_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lot_sales_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      lot_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          lot_id: string
          new_status: string
          previous_status: string | null
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          lot_id: string
          new_status: string
          previous_status?: string | null
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          lot_id?: string
          new_status?: string
          previous_status?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lot_status_history_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      map_activity_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          id: string
          lot_id: string | null
          org_id: string
          project_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          id?: string
          lot_id?: string | null
          org_id: string
          project_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          id?: string
          lot_id?: string | null
          org_id?: string
          project_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_activity_logs_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_activity_logs_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_activity_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_activity_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_calibrations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          image_offset_x: number
          image_offset_y: number
          image_rotation_degrees: number
          image_scale_x: number
          image_scale_y: number
          invalidated_reason: string | null
          is_locked: boolean
          known_distance_meters: number | null
          map_units_per_meter: number | null
          opacity: number
          point_a: Json | null
          point_b: Json | null
          project_id: string
          reference_image_path: string | null
          status: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_offset_x?: number
          image_offset_y?: number
          image_rotation_degrees?: number
          image_scale_x?: number
          image_scale_y?: number
          invalidated_reason?: string | null
          is_locked?: boolean
          known_distance_meters?: number | null
          map_units_per_meter?: number | null
          opacity?: number
          point_a?: Json | null
          point_b?: Json | null
          project_id: string
          reference_image_path?: string | null
          status?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          image_offset_x?: number
          image_offset_y?: number
          image_rotation_degrees?: number
          image_scale_x?: number
          image_scale_y?: number
          invalidated_reason?: string | null
          is_locked?: boolean
          known_distance_meters?: number | null
          map_units_per_meter?: number | null
          opacity?: number
          point_a?: Json | null
          point_b?: Json | null
          project_id?: string
          reference_image_path?: string | null
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_calibrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_entities: {
        Row: {
          classification: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_sellable: boolean
          layer_id: string
          metadata: Json
          name: string
          parent_entity_id: string | null
          project_id: string
          public_identifier: string
          segment_id: string | null
          updated_at: string
          updated_by: string | null
          verification_status: string
        }
        Insert: {
          classification: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_sellable?: boolean
          layer_id: string
          metadata?: Json
          name: string
          parent_entity_id?: string | null
          project_id: string
          public_identifier: string
          segment_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
        }
        Update: {
          classification?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_sellable?: boolean
          layer_id?: string
          metadata?: Json
          name?: string
          parent_entity_id?: string | null
          project_id?: string
          public_identifier?: string
          segment_id?: string | null
          updated_at?: string
          updated_by?: string | null
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_entities_layer_id_fkey"
            columns: ["layer_id"]
            isOneToOne: false
            referencedRelation: "map_layers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_entities_layer_project_fk"
            columns: ["layer_id", "project_id"]
            isOneToOne: false
            referencedRelation: "map_layers"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "map_entities_parent_entity_id_fkey"
            columns: ["parent_entity_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_entities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_entities_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "map_segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_entities_segment_project_fk"
            columns: ["segment_id", "project_id"]
            isOneToOne: false
            referencedRelation: "map_segments"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      map_entity_geometries: {
        Row: {
          calibration_version: number | null
          change_reason: string
          created_at: string
          created_by: string | null
          elevation: number
          entity_id: string
          extrusion_height: number
          geometry: Json
          id: string
          is_current: boolean
          native_geometry: unknown
          project_id: string
          rotation: number
          updated_at: string
          version: number
        }
        Insert: {
          calibration_version?: number | null
          change_reason: string
          created_at?: string
          created_by?: string | null
          elevation?: number
          entity_id: string
          extrusion_height?: number
          geometry: Json
          id?: string
          is_current?: boolean
          native_geometry?: unknown
          project_id: string
          rotation?: number
          updated_at?: string
          version?: number
        }
        Update: {
          calibration_version?: number | null
          change_reason?: string
          created_at?: string
          created_by?: string | null
          elevation?: number
          entity_id?: string
          extrusion_height?: number
          geometry?: Json
          id?: string
          is_current?: boolean
          native_geometry?: unknown
          project_id?: string
          rotation?: number
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_entity_geometries_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_entity_geometries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_geometries_entity_project_fk"
            columns: ["entity_id", "project_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id", "project_id"]
          },
        ]
      }
      map_geometry_versions: {
        Row: {
          calibration_version: number | null
          change_reason: string
          created_at: string
          created_by: string | null
          elevation: number
          entity_id: string
          extrusion_height: number
          geometry: Json
          geometry_id: string
          id: string
          project_id: string
          rotation: number
          superseded_at: string
          version: number
        }
        Insert: {
          calibration_version?: number | null
          change_reason: string
          created_at: string
          created_by?: string | null
          elevation: number
          entity_id: string
          extrusion_height: number
          geometry: Json
          geometry_id: string
          id?: string
          project_id: string
          rotation: number
          superseded_at?: string
          version: number
        }
        Update: {
          calibration_version?: number | null
          change_reason?: string
          created_at?: string
          created_by?: string | null
          elevation?: number
          entity_id?: string
          extrusion_height?: number
          geometry?: Json
          geometry_id?: string
          id?: string
          project_id?: string
          rotation?: number
          superseded_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_geometry_versions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "map_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_geometry_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_layers: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          is_locked: boolean
          is_visible: boolean
          layer_key: string
          name: string
          opacity: number
          project_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          layer_key: string
          name: string
          opacity?: number
          project_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_locked?: boolean
          is_visible?: boolean
          layer_key?: string
          name?: string
          opacity?: number
          project_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_lot_lineage: {
        Row: {
          created_at: string
          created_by: string
          id: string
          relationship: string
          source_lot_id: string
          target_lot_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          relationship: string
          source_lot_id: string
          target_lot_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          relationship?: string
          source_lot_id?: string
          target_lot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_lot_lineage_source_lot_id_fkey"
            columns: ["source_lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_lot_lineage_target_lot_id_fkey"
            columns: ["target_lot_id"]
            isOneToOne: false
            referencedRelation: "commercial_lots"
            referencedColumns: ["id"]
          },
        ]
      }
      map_projects: {
        Row: {
          active_version: number
          coordinate_system: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          name: string
          org_id: string
          reference_height: number
          reference_revision: string | null
          reference_width: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_version?: number
          coordinate_system?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          name: string
          org_id: string
          reference_height?: number
          reference_revision?: string | null
          reference_width?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_version?: number
          coordinate_system?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          name?: string
          org_id?: string
          reference_height?: number
          reference_revision?: string | null
          reference_width?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      map_reference_migration_snapshots: {
        Row: {
          applied_at: string | null
          apply_result: Json
          area_code: string
          created_at: string
          created_by: string | null
          id: string
          org_id: string
          payload_hash: string
          project_id: string
          rollback_reason: string | null
          rolled_back_at: string | null
          rolled_back_by: string | null
          snapshot: Json
          source_revision: string
          status: string
        }
        Insert: {
          applied_at?: string | null
          apply_result?: Json
          area_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id: string
          payload_hash: string
          project_id: string
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          snapshot: Json
          source_revision: string
          status?: string
        }
        Update: {
          applied_at?: string | null
          apply_result?: Json
          area_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          org_id?: string
          payload_hash?: string
          project_id?: string
          rollback_reason?: string | null
          rolled_back_at?: string | null
          rolled_back_by?: string | null
          snapshot?: Json
          source_revision?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_reference_migration_snapshots_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      map_segments: {
        Row: {
          boundary_data: Json
          camera_config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          name: string
          project_id: string
          required_capability: string
          slug: string
          source_reference: string
          updated_at: string
          visual_config: Json
        }
        Insert: {
          boundary_data?: Json
          camera_config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          name: string
          project_id: string
          required_capability: string
          slug: string
          source_reference: string
          updated_at?: string
          visual_config?: Json
        }
        Update: {
          boundary_data?: Json
          camera_config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          name?: string
          project_id?: string
          required_capability?: string
          slug?: string
          source_reference?: string
          updated_at?: string
          visual_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "map_segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "map_projects"
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
          data_nascimento: string | null
          id: string
          is_active: boolean
          is_core_team: boolean
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
          data_nascimento?: string | null
          id?: string
          is_active?: boolean
          is_core_team?: boolean
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
          data_nascimento?: string | null
          id?: string
          is_active?: boolean
          is_core_team?: boolean
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
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
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
      venue_booking_units: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          org_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          org_id: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_booking_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deadline_offset_hours: number | null
          event_type: string | null
          id: string
          org_id: string
          phase: string
          required: boolean
          sort_order: number
          space_id: string | null
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deadline_offset_hours?: number | null
          event_type?: string | null
          id?: string
          org_id: string
          phase?: string
          required?: boolean
          sort_order?: number
          space_id?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deadline_offset_hours?: number | null
          event_type?: string | null
          id?: string
          org_id?: string
          phase?: string
          required?: boolean
          sort_order?: number
          space_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_checklist_templates_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_counterpart_agreements: {
        Row: {
          allowed_event_types: string[]
          benefit_type: string
          contract_reference: string
          created_at: string
          created_by: string
          document_path: string | null
          granted_quantity: number
          id: string
          no_show_consumes_allowance: boolean
          notes: string | null
          org_id: string
          requires_approval: boolean
          responsible_approver_id: string | null
          restrictions: string[]
          space_id: string | null
          stakeholder_id: string
          status: string
          unit_type: string
          updated_at: string
          updated_by: string
          valid_from: string
          valid_until: string
          value_per_excess_unit: number | null
          version: number
        }
        Insert: {
          allowed_event_types?: string[]
          benefit_type: string
          contract_reference: string
          created_at?: string
          created_by: string
          document_path?: string | null
          granted_quantity: number
          id?: string
          no_show_consumes_allowance?: boolean
          notes?: string | null
          org_id: string
          requires_approval?: boolean
          responsible_approver_id?: string | null
          restrictions?: string[]
          space_id?: string | null
          stakeholder_id: string
          status?: string
          unit_type: string
          updated_at?: string
          updated_by: string
          valid_from: string
          valid_until: string
          value_per_excess_unit?: number | null
          version?: number
        }
        Update: {
          allowed_event_types?: string[]
          benefit_type?: string
          contract_reference?: string
          created_at?: string
          created_by?: string
          document_path?: string | null
          granted_quantity?: number
          id?: string
          no_show_consumes_allowance?: boolean
          notes?: string | null
          org_id?: string
          requires_approval?: boolean
          responsible_approver_id?: string | null
          restrictions?: string[]
          space_id?: string | null
          stakeholder_id?: string
          status?: string
          unit_type?: string
          updated_at?: string
          updated_by?: string
          valid_from?: string
          valid_until?: string
          value_per_excess_unit?: number | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_counterpart_agreements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_counterpart_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholder_directory"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholders"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_counterpart_ledger: {
        Row: {
          actor_user_id: string
          agreement_id: string
          consumed_delta: number
          created_at: string
          event_id: string
          excess_delta: number
          id: string
          movement_type: string
          org_id: string
          reason: string
          request_id: string
          reserved_delta: number
          usage_id: string
        }
        Insert: {
          actor_user_id: string
          agreement_id: string
          consumed_delta?: number
          created_at?: string
          event_id: string
          excess_delta?: number
          id?: string
          movement_type: string
          org_id: string
          reason: string
          request_id: string
          reserved_delta?: number
          usage_id: string
        }
        Update: {
          actor_user_id?: string
          agreement_id?: string
          consumed_delta?: number
          created_at?: string
          event_id?: string
          excess_delta?: number
          id?: string
          movement_type?: string
          org_id?: string
          reason?: string
          request_id?: string
          reserved_delta?: number
          usage_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_counterpart_ledger_agreement_fk"
            columns: ["org_id", "agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_agreements"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_ledger_agreement_fk"
            columns: ["org_id", "agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_balances"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_ledger_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_ledger_integrity_fk"
            columns: ["org_id", "usage_id", "agreement_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_usage"
            referencedColumns: ["org_id", "id", "agreement_id", "event_id"]
          },
          {
            foreignKeyName: "venue_counterpart_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_counterpart_ledger_usage_fk"
            columns: ["org_id", "usage_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_usage"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_counterpart_usage: {
        Row: {
          agreement_id: string
          approved_at: string | null
          approved_by: string | null
          approved_excess_quantity: number
          created_at: string
          event_id: string
          excess_approval_status: string
          excess_quantity: number
          id: string
          observation: string | null
          org_id: string
          requested_quantity: number
          superseded_at: string | null
          updated_at: string
          usage_state: string
        }
        Insert: {
          agreement_id: string
          approved_at?: string | null
          approved_by?: string | null
          approved_excess_quantity?: number
          created_at?: string
          event_id: string
          excess_approval_status?: string
          excess_quantity?: number
          id?: string
          observation?: string | null
          org_id: string
          requested_quantity?: number
          superseded_at?: string | null
          updated_at?: string
          usage_state?: string
        }
        Update: {
          agreement_id?: string
          approved_at?: string | null
          approved_by?: string | null
          approved_excess_quantity?: number
          created_at?: string
          event_id?: string
          excess_approval_status?: string
          excess_quantity?: number
          id?: string
          observation?: string | null
          org_id?: string
          requested_quantity?: number
          superseded_at?: string | null
          updated_at?: string
          usage_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_counterpart_usage_agreement_fk"
            columns: ["org_id", "agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_agreements"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_usage_agreement_fk"
            columns: ["org_id", "agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_balances"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_usage_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_approvals: {
        Row: {
          approver_id: string
          created_at: string
          decision: string
          event_id: string
          id: string
          new_status: string
          observation: string | null
          org_id: string
          previous_status: string
          reason: string | null
        }
        Insert: {
          approver_id: string
          created_at?: string
          decision: string
          event_id: string
          id?: string
          new_status: string
          observation?: string | null
          org_id: string
          previous_status: string
          reason?: string | null
        }
        Update: {
          approver_id?: string
          created_at?: string
          decision?: string
          event_id?: string
          id?: string
          new_status?: string
          observation?: string | null
          org_id?: string
          previous_status?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_approvals_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_approvals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_checklist_items: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          deadline: string | null
          event_id: string
          id: string
          note: string | null
          org_id: string
          phase: string
          required: boolean
          responsible_user_id: string | null
          sort_order: number
          status: string
          template_id: string | null
          title: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          event_id: string
          id?: string
          note?: string | null
          org_id: string
          phase?: string
          required?: boolean
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          event_id?: string
          id?: string
          note?: string | null
          org_id?: string
          phase?: string
          required?: boolean
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_checklist_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_checklist_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_event_checklist_template_fk"
            columns: ["org_id", "template_id"]
            isOneToOne: false
            referencedRelation: "venue_checklist_templates"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_event_documents: {
        Row: {
          created_at: string
          document_type: string
          event_id: string
          file_name: string
          id: string
          mime_type: string
          org_id: string
          sensitive: boolean
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_type: string
          event_id: string
          file_name: string
          id?: string
          mime_type: string
          org_id: string
          sensitive?: boolean
          size_bytes: number
          storage_path: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_type?: string
          event_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          org_id?: string
          sensitive?: boolean
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_documents_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_resources: {
        Row: {
          completion_status: string
          confirmation_status: string
          created_at: string
          created_by: string
          event_id: string
          id: string
          notes: string | null
          org_id: string
          quantity: number
          required_at: string | null
          resource_type: string
          responsible_team: string | null
          responsible_user_id: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          completion_status?: string
          confirmation_status?: string
          created_at?: string
          created_by: string
          event_id: string
          id?: string
          notes?: string | null
          org_id: string
          quantity?: number
          required_at?: string | null
          resource_type: string
          responsible_team?: string | null
          responsible_user_id?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          completion_status?: string
          confirmation_status?: string
          created_at?: string
          created_by?: string
          event_id?: string
          id?: string
          notes?: string | null
          org_id?: string
          quantity?: number
          required_at?: string | null
          resource_type?: string
          responsible_team?: string | null
          responsible_user_id?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_resources_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_responsibles: {
        Row: {
          created_at: string
          event_id: string
          id: string
          org_id: string
          responsibility_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          org_id: string
          responsibility_role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          org_id?: string
          responsibility_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_responsibles_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_responsibles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_spaces: {
        Row: {
          blocks_availability: boolean
          conflict_override: boolean
          created_at: string
          end_at: string | null
          event_id: string
          id: string
          org_id: string
          requested_area: string | null
          setup_start_at: string | null
          space_id: string
          start_at: string | null
          teardown_end_at: string | null
          updated_at: string
        }
        Insert: {
          blocks_availability?: boolean
          conflict_override?: boolean
          created_at?: string
          end_at?: string | null
          event_id: string
          id?: string
          org_id: string
          requested_area?: string | null
          setup_start_at?: string | null
          space_id: string
          start_at?: string | null
          teardown_end_at?: string | null
          updated_at?: string
        }
        Update: {
          blocks_availability?: boolean
          conflict_override?: boolean
          created_at?: string
          end_at?: string | null
          event_id?: string
          id?: string
          org_id?: string
          requested_area?: string | null
          setup_start_at?: string | null
          space_id?: string
          start_at?: string | null
          teardown_end_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_event_spaces_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_event_spaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_event_spaces_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_events: {
        Row: {
          approval_status: string
          cancellation_reason: string | null
          cleaning_fee: number | null
          cleaning_responsibility: string | null
          completed_at: string | null
          confirmation_status: string
          confirmed_audience: number | null
          conflict_override_fingerprint: string | null
          conflict_override_reason: string | null
          conflict_status: string
          contact_name: string | null
          contact_phone: string | null
          contract_status: string
          counterpart_agreement_id: string | null
          counterpart_requested_quantity: number | null
          created_at: string
          created_by: string
          electricity_fee: string | null
          end_at: string | null
          estimated_audience: number | null
          event_result: string | null
          event_type: string
          executive_description: string | null
          fee_amount: number | null
          fee_quantity: number | null
          fee_type: string | null
          id: string
          import_batch_id: string | null
          internal_notes: string | null
          observations: string | null
          operational_notes: string | null
          org_id: string
          payment_status: string
          pending_date: boolean
          preparation_end_date: string | null
          preparation_notes: string | null
          preparation_start_date: string | null
          priority: string
          requested_area: string | null
          requester_name: string
          requester_user_id: string | null
          requires_review: boolean
          reservation_end_date: string | null
          reservation_start_date: string | null
          responsible_organization_id: string | null
          responsible_user_id: string | null
          review_reasons: string[]
          setup_start_at: string | null
          shift: string | null
          source_document: string | null
          source_fingerprint: string | null
          source_row: number | null
          sponsor_id: string | null
          start_at: string | null
          status: string
          target_audience: string | null
          teardown_deadline_note: string | null
          teardown_end_at: string | null
          title: string
          updated_at: string
          updated_by: string
          version: number
          visibility: string
        }
        Insert: {
          approval_status?: string
          cancellation_reason?: string | null
          cleaning_fee?: number | null
          cleaning_responsibility?: string | null
          completed_at?: string | null
          confirmation_status?: string
          confirmed_audience?: number | null
          conflict_override_fingerprint?: string | null
          conflict_override_reason?: string | null
          conflict_status?: string
          contact_name?: string | null
          contact_phone?: string | null
          contract_status?: string
          counterpart_agreement_id?: string | null
          counterpart_requested_quantity?: number | null
          created_at?: string
          created_by: string
          electricity_fee?: string | null
          end_at?: string | null
          estimated_audience?: number | null
          event_result?: string | null
          event_type: string
          executive_description?: string | null
          fee_amount?: number | null
          fee_quantity?: number | null
          fee_type?: string | null
          id?: string
          import_batch_id?: string | null
          internal_notes?: string | null
          observations?: string | null
          operational_notes?: string | null
          org_id: string
          payment_status?: string
          pending_date?: boolean
          preparation_end_date?: string | null
          preparation_notes?: string | null
          preparation_start_date?: string | null
          priority?: string
          requested_area?: string | null
          requester_name: string
          requester_user_id?: string | null
          requires_review?: boolean
          reservation_end_date?: string | null
          reservation_start_date?: string | null
          responsible_organization_id?: string | null
          responsible_user_id?: string | null
          review_reasons?: string[]
          setup_start_at?: string | null
          shift?: string | null
          source_document?: string | null
          source_fingerprint?: string | null
          source_row?: number | null
          sponsor_id?: string | null
          start_at?: string | null
          status?: string
          target_audience?: string | null
          teardown_deadline_note?: string | null
          teardown_end_at?: string | null
          title: string
          updated_at?: string
          updated_by: string
          version?: number
          visibility?: string
        }
        Update: {
          approval_status?: string
          cancellation_reason?: string | null
          cleaning_fee?: number | null
          cleaning_responsibility?: string | null
          completed_at?: string | null
          confirmation_status?: string
          confirmed_audience?: number | null
          conflict_override_fingerprint?: string | null
          conflict_override_reason?: string | null
          conflict_status?: string
          contact_name?: string | null
          contact_phone?: string | null
          contract_status?: string
          counterpart_agreement_id?: string | null
          counterpart_requested_quantity?: number | null
          created_at?: string
          created_by?: string
          electricity_fee?: string | null
          end_at?: string | null
          estimated_audience?: number | null
          event_result?: string | null
          event_type?: string
          executive_description?: string | null
          fee_amount?: number | null
          fee_quantity?: number | null
          fee_type?: string | null
          id?: string
          import_batch_id?: string | null
          internal_notes?: string | null
          observations?: string | null
          operational_notes?: string | null
          org_id?: string
          payment_status?: string
          pending_date?: boolean
          preparation_end_date?: string | null
          preparation_notes?: string | null
          preparation_start_date?: string | null
          priority?: string
          requested_area?: string | null
          requester_name?: string
          requester_user_id?: string | null
          requires_review?: boolean
          reservation_end_date?: string | null
          reservation_start_date?: string | null
          responsible_organization_id?: string | null
          responsible_user_id?: string | null
          review_reasons?: string[]
          setup_start_at?: string | null
          shift?: string | null
          source_document?: string | null
          source_fingerprint?: string | null
          source_row?: number | null
          sponsor_id?: string | null
          start_at?: string | null
          status?: string
          target_audience?: string | null
          teardown_deadline_note?: string | null
          teardown_end_at?: string | null
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_events_counterpart_fk"
            columns: ["org_id", "counterpart_agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_agreements"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_events_counterpart_fk"
            columns: ["org_id", "counterpart_agreement_id"]
            isOneToOne: false
            referencedRelation: "venue_counterpart_balances"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_events_responsible_org_fk"
            columns: ["org_id", "responsible_organization_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholder_directory"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_events_responsible_org_fk"
            columns: ["org_id", "responsible_organization_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholders"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_events_sponsor_fk"
            columns: ["org_id", "sponsor_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholder_directory"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_events_sponsor_fk"
            columns: ["org_id", "sponsor_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholders"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_import_batches: {
        Row: {
          created_at: string
          created_count: number
          error_message: string | null
          executed_by: string | null
          id: string
          matched_count: number
          merged_count: number
          not_event_count: number
          org_id: string
          review_count: number
          skipped_count: number
          source_document: string
          status: string
          total_rows: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_count?: number
          error_message?: string | null
          executed_by?: string | null
          id?: string
          matched_count?: number
          merged_count?: number
          not_event_count?: number
          org_id: string
          review_count?: number
          skipped_count?: number
          source_document: string
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_count?: number
          error_message?: string | null
          executed_by?: string | null
          id?: string
          matched_count?: number
          merged_count?: number
          not_event_count?: number
          org_id?: string
          review_count?: number
          skipped_count?: number
          source_document?: string
          status?: string
          total_rows?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_import_batches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_import_rows: {
        Row: {
          batch_id: string
          created_at: string
          disposition: string
          event_id: string | null
          fingerprint: string | null
          id: string
          org_id: string
          raw_text: string
          reason: string | null
          source_document: string
          source_row: number
          source_year: number | null
        }
        Insert: {
          batch_id: string
          created_at?: string
          disposition: string
          event_id?: string | null
          fingerprint?: string | null
          id?: string
          org_id: string
          raw_text: string
          reason?: string | null
          source_document: string
          source_row: number
          source_year?: number | null
        }
        Update: {
          batch_id?: string
          created_at?: string
          disposition?: string
          event_id?: string | null
          fingerprint?: string | null
          id?: string
          org_id?: string
          raw_text?: string
          reason?: string | null
          source_document?: string
          source_row?: number
          source_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "venue_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_mutation_receipts: {
        Row: {
          actor_user_id: string
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          org_id: string
          request_hash: string
          result: Json | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          org_id: string
          request_hash: string
          result?: Json | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          org_id?: string
          request_hash?: string
          result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_mutation_receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_occupancies: {
        Row: {
          active: boolean
          booking_unit_id: string
          conflict_override: boolean
          created_at: string
          event_id: string
          event_space_id: string
          id: string
          occupied_during: unknown
          org_id: string
          override_reason: string | null
          setup_start_at: string
          teardown_end_at: string
        }
        Insert: {
          active?: boolean
          booking_unit_id: string
          conflict_override?: boolean
          created_at?: string
          event_id: string
          event_space_id: string
          id?: string
          occupied_during?: unknown
          org_id: string
          override_reason?: string | null
          setup_start_at: string
          teardown_end_at: string
        }
        Update: {
          active?: boolean
          booking_unit_id?: string
          conflict_override?: boolean
          created_at?: string
          event_id?: string
          event_space_id?: string
          id?: string
          occupied_during?: unknown
          org_id?: string
          override_reason?: string | null
          setup_start_at?: string
          teardown_end_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_occupancies_event_fk"
            columns: ["org_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_occupancies_event_space_fk"
            columns: ["org_id", "event_space_id", "event_id"]
            isOneToOne: false
            referencedRelation: "venue_event_spaces"
            referencedColumns: ["org_id", "id", "event_id"]
          },
          {
            foreignKeyName: "venue_occupancies_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_occupancies_unit_fk"
            columns: ["org_id", "booking_unit_id"]
            isOneToOne: false
            referencedRelation: "venue_booking_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_space_blocks: {
        Row: {
          active: boolean
          block_type: string
          created_at: string
          created_by: string
          ends_at: string
          id: string
          org_id: string
          reason: string
          space_id: string
          stakeholder_id: string | null
          starts_at: string
          title: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          active?: boolean
          block_type: string
          created_at?: string
          created_by: string
          ends_at: string
          id?: string
          org_id: string
          reason: string
          space_id: string
          stakeholder_id?: string | null
          starts_at: string
          title: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          active?: boolean
          block_type?: string
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          org_id?: string
          reason?: string
          space_id?: string
          stakeholder_id?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_space_blocks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_space_blocks_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_space_blocks_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholder_directory"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_space_blocks_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholders"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_space_booking_units: {
        Row: {
          booking_unit_id: string
          created_at: string
          org_id: string
          space_id: string
        }
        Insert: {
          booking_unit_id: string
          created_at?: string
          org_id: string
          space_id: string
        }
        Update: {
          booking_unit_id?: string
          created_at?: string
          org_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_space_booking_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_space_booking_units_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_space_booking_units_unit_fk"
            columns: ["org_id", "booking_unit_id"]
            isOneToOne: false
            referencedRelation: "venue_booking_units"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_spaces: {
        Row: {
          active: boolean
          allowed_event_types: string[]
          available_areas: string[]
          available_resources: string[]
          capacity: number | null
          created_at: string
          created_by: string | null
          default_responsible_team: string | null
          description: string | null
          id: string
          internal_notes: string | null
          location: string | null
          name: string
          org_id: string
          parent_space_id: string | null
          required_setup_minutes: number
          required_teardown_minutes: number
          restrictions: string[]
          slug: string
          standard_opening_hours: Json
          type: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          active?: boolean
          allowed_event_types?: string[]
          available_areas?: string[]
          available_resources?: string[]
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          default_responsible_team?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          location?: string | null
          name: string
          org_id: string
          parent_space_id?: string | null
          required_setup_minutes?: number
          required_teardown_minutes?: number
          restrictions?: string[]
          slug: string
          standard_opening_hours?: Json
          type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          allowed_event_types?: string[]
          available_areas?: string[]
          available_resources?: string[]
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          default_responsible_team?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          location?: string | null
          name?: string
          org_id?: string
          parent_space_id?: string | null
          required_setup_minutes?: number
          required_teardown_minutes?: number
          restrictions?: string[]
          slug?: string
          standard_opening_hours?: Json
          type?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_spaces_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_spaces_parent_fk"
            columns: ["org_id", "parent_space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_stakeholders: {
        Row: {
          active: boolean
          active_from: string | null
          active_until: string | null
          contact_name: string | null
          contract_reference: string | null
          created_at: string
          created_by: string
          document_identifier: string | null
          email: string | null
          id: string
          legal_name: string
          normalized_name: string | null
          notes: string | null
          org_id: string
          phone: string | null
          relationship_type: string
          sponsor_category: string | null
          trade_name: string | null
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          contact_name?: string | null
          contract_reference?: string | null
          created_at?: string
          created_by: string
          document_identifier?: string | null
          email?: string | null
          id?: string
          legal_name: string
          normalized_name?: string | null
          notes?: string | null
          org_id: string
          phone?: string | null
          relationship_type: string
          sponsor_category?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          active?: boolean
          active_from?: string | null
          active_until?: string | null
          contact_name?: string | null
          contract_reference?: string | null
          created_at?: string
          created_by?: string
          document_identifier?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          normalized_name?: string | null
          notes?: string | null
          org_id?: string
          phone?: string | null
          relationship_type?: string
          sponsor_category?: string | null
          trade_name?: string | null
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "venue_stakeholders_org_id_fkey"
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
      google_calendar_connections_public: {
        Row: {
          backfill_done: number | null
          backfill_total: number | null
          connected_at: string | null
          connection_generation: string | null
          error_code: string | null
          google_email: string | null
          last_sync_at: string | null
          oauth_provider: string | null
          org_id: string | null
          secondary_calendar_id: string | null
          status: string | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          backfill_done?: number | null
          backfill_total?: number | null
          connected_at?: string | null
          connection_generation?: string | null
          error_code?: string | null
          google_email?: string | null
          last_sync_at?: string | null
          oauth_provider?: string | null
          org_id?: string | null
          secondary_calendar_id?: string | null
          status?: string | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          backfill_done?: number | null
          backfill_total?: number | null
          connected_at?: string | null
          connection_generation?: string | null
          error_code?: string | null
          google_email?: string | null
          last_sync_at?: string | null
          oauth_provider?: string | null
          org_id?: string | null
          secondary_calendar_id?: string | null
          status?: string | null
          user_id?: string | null
          verified_at?: string | null
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
      venue_counterpart_balances: {
        Row: {
          confirmed_excess_quantity: number | null
          consumed_quantity: number | null
          contract_reference: string | null
          granted_quantity: number | null
          id: string | null
          org_id: string | null
          pending_quantity: number | null
          projected_excess_quantity: number | null
          remaining_quantity: number | null
          reserved_quantity: number | null
          space_id: string | null
          stakeholder_id: string | null
          unit_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_counterpart_agreements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_counterpart_space_fk"
            columns: ["org_id", "space_id"]
            isOneToOne: false
            referencedRelation: "venue_spaces"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholder_directory"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "venue_counterpart_stakeholder_fk"
            columns: ["org_id", "stakeholder_id"]
            isOneToOne: false
            referencedRelation: "venue_stakeholders"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      venue_stakeholder_directory: {
        Row: {
          active: boolean | null
          active_from: string | null
          active_until: string | null
          contact_name: string | null
          contract_reference: string | null
          created_at: string | null
          document_identifier: string | null
          email: string | null
          id: string | null
          legal_name: string | null
          normalized_name: string | null
          notes: string | null
          org_id: string | null
          phone: string | null
          relationship_type: string | null
          sponsor_category: string | null
          trade_name: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          active?: boolean | null
          active_from?: string | null
          active_until?: string | null
          contact_name?: string | null
          contract_reference?: never
          created_at?: string | null
          document_identifier?: never
          email?: never
          id?: string | null
          legal_name?: string | null
          normalized_name?: string | null
          notes?: never
          org_id?: string | null
          phone?: never
          relationship_type?: string | null
          sponsor_category?: string | null
          trade_name?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          active?: boolean | null
          active_from?: string | null
          active_until?: string | null
          contact_name?: string | null
          contract_reference?: never
          created_at?: string | null
          document_identifier?: never
          email?: never
          id?: string | null
          legal_name?: string | null
          normalized_name?: string | null
          notes?: never
          org_id?: string | null
          phone?: never
          relationship_type?: string | null
          sponsor_category?: string | null
          trade_name?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_stakeholders_org_id_fkey"
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
      _cronograma_apply_subevent_actions: {
        Args: { _items: Json; _org_id: string; _subevent_id: string }
        Returns: undefined
      }
      _cronograma_apply_subevent_commissions: {
        Args: { _items: Json; _org_id: string; _subevent_id: string }
        Returns: undefined
      }
      _cronograma_apply_subevent_guests: {
        Args: { _items: Json; _org_id: string; _subevent_id: string }
        Returns: undefined
      }
      _cronograma_apply_subevent_provisions: {
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
      agenda_meeting_accept_segment: {
        Args: { p_provider_request_id: string; p_receipt_id: string }
        Returns: Json
      }
      agenda_meeting_actor_allowed: {
        Args: {
          p_action: string
          p_event_id: string
          p_org_id: string
          p_session_id?: string
          p_user_id: string
        }
        Returns: boolean
      }
      agenda_meeting_analysis_evidence: {
        Args: { p_segment_ids: Json; p_session_id: string }
        Returns: Json
      }
      agenda_meeting_authorize: {
        Args: {
          p_action: string
          p_event_id: string
          p_org_id: string
          p_session_id?: string
        }
        Returns: boolean
      }
      agenda_meeting_capture_tombstone: {
        Args: {
          p_actor_user_id?: string
          p_deletion_scope: string
          p_session_id: string
        }
        Returns: undefined
      }
      agenda_meeting_claim_jobs: {
        Args: { p_batch_size?: number; p_lease_seconds?: number }
        Returns: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          dedupe_key: string
          event_id: string
          id: string
          kind: string
          last_error_code: string | null
          lease_expires_at: string | null
          lease_token: string | null
          max_attempts: number
          org_id: string
          session_id: string
          status: string
          transcript_version_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agenda_meeting_processing_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      agenda_meeting_complete_analysis_job: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_provider_response_id: string
          p_result: Json
          p_transcript_version_id: string
          p_usage?: Json
        }
        Returns: Json
      }
      agenda_meeting_complete_assemble_job: {
        Args: { p_job_id: string; p_lease_token: string }
        Returns: Json
      }
      agenda_meeting_complete_segment: {
        Args: {
          p_attempt_id: string
          p_callback_digest: string
          p_callback_token_hash: string
          p_confidence?: number
          p_duration_ms?: number
          p_provider_request_id: string
          p_transcript: string
          p_words?: Json
        }
        Returns: Json
      }
      agenda_meeting_control: {
        Args: {
          p_action: string
          p_actor_user_id: string
          p_event_id: string
          p_expected_version?: number
          p_mutation_id?: string
          p_org_id: string
          p_payload?: Json
          p_session_id?: string
        }
        Returns: Json
      }
      agenda_meeting_detail_json: {
        Args: { p_session_id: string }
        Returns: Json
      }
      agenda_meeting_enqueue_job: {
        Args: {
          p_dedupe_key: string
          p_kind: string
          p_session_id: string
          p_transcript_version_id?: string
        }
        Returns: string
      }
      agenda_meeting_event_accessible: {
        Args: { p_event_id: string; p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      agenda_meeting_expire_stale_captures: {
        Args: { p_stale_seconds?: number }
        Returns: number
      }
      agenda_meeting_fail_job: {
        Args: {
          p_error_code: string
          p_job_id: string
          p_lease_token: string
          p_retry_after_seconds?: number
        }
        Returns: Json
      }
      agenda_meeting_fail_segment: {
        Args: {
          p_error_code: string
          p_receipt_id: string
          p_retry_after_ms?: number
          p_terminal: boolean
        }
        Returns: Json
      }
      agenda_meeting_has_explicit_capability: {
        Args: { p_capability: string; p_org_id: string; p_user_id: string }
        Returns: boolean
      }
      agenda_meeting_ingest_text_segment: {
        Args: {
          p_actor_user_id: string
          p_capture_end_ms: number
          p_capture_start_ms: number
          p_confidence?: number
          p_mutation_id: string
          p_segment_id: string
          p_sequence: number
          p_session_id: string
          p_transcript: string
        }
        Returns: Json
      }
      agenda_meeting_prepare_segment: {
        Args: {
          p_actor_user_id: string
          p_byte_size: number
          p_callback_token_expires_at: string
          p_callback_token_hash: string
          p_capture_end_ms: number
          p_capture_start_ms: number
          p_mime_type: string
          p_mutation_id: string
          p_segment_id: string
          p_sequence: number
          p_session_id: string
          p_sha256: string
        }
        Returns: Json
      }
      agenda_meeting_refresh_sequence_state: {
        Args: { p_session_id: string }
        Returns: {
          active_duration_ms: number
          analysis_model: string
          analysis_provider: string
          analysis_reasoning_effort: string
          capture_state: string
          client_session_key: string
          closed_sequence: number | null
          completed_at: string | null
          consent_confirmed: boolean
          consent_confirmed_at: string | null
          consent_policy_version: string | null
          created_at: string
          deleted_at: string | null
          ended_at: string | null
          event_context: Json
          event_id: string
          finalized_at: string | null
          heartbeat_at: string | null
          id: string
          language: string
          last_contiguous_sequence: number
          last_error_at: string | null
          last_error_code: string | null
          last_received_sequence: number
          missing_sequences: number[]
          org_id: string
          partial_analysis_confirmed: boolean
          paused_at: string | null
          processing_state: string
          started_at: string | null
          started_by: string
          stt_model: string
          stt_provider: string
          unresolved_sequences: number[]
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "agenda_meeting_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agenda_meeting_session_readable: {
        Args: {
          p_event_id: string
          p_org_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      agenda_meeting_session_summary_json: {
        Args: { p_session_id: string }
        Returns: Json
      }
      agenda_meeting_strip_text_overlap: {
        Args: { p_current: string; p_previous: string }
        Returns: string
      }
      agenda_meeting_write_audit: {
        Args: {
          p_action: string
          p_actor_kind: string
          p_actor_user_id: string
          p_entity_id?: string
          p_entity_type: string
          p_metadata?: Json
          p_mutation_id?: string
          p_session_id: string
        }
        Returns: undefined
      }
      apply_exporural_reference_2026: {
        Args: {
          p_entities: Json
          p_lots: Json
          p_org_id: string
          p_source_revision: string
        }
        Returns: Json
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
      bootstrap_commercial_map: {
        Args: {
          p_calibration: Json
          p_entities: Json
          p_layers: Json
          p_org_id: string
          p_project: Json
        }
        Returns: string
      }
      can_view_commercial_map: { Args: { _org_id: string }; Returns: boolean }
      claim_google_sync_batch: {
        Args: { batch_size?: number }
        Returns: {
          attempts: number
          connection_generation: string | null
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
        }[]
        SetofOptions: {
          from: "*"
          to: "google_sync_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_google_sync_task: {
        Args: {
          target_is_initial_backfill: boolean
          target_task_id: string
          target_user_id: string
        }
        Returns: boolean
      }
      create_commercial_lot: {
        Args: {
          p_area_validation_status: string
          p_asking_price: number
          p_block: string
          p_calibration_version: number
          p_classification: string
          p_depth_meters: number
          p_description: string
          p_display_name: string
          p_elevation: number
          p_extrusion_height: number
          p_fixed_total: number
          p_frontage_meters: number
          p_geometry: Json
          p_layer_id: string
          p_level_label: string
          p_lot_number: string
          p_minimum_price: number
          p_official_area_sqm: number
          p_parent_entity_id: string
          p_price_per_sqm: number
          p_pricing_mode: string
          p_project_id: string
          p_public_identifier: string
          p_reason: string
        }
        Returns: string
      }
      create_org_with_member: { Args: { org_nome: string }; Returns: string }
      cronograma_delete_event: {
        Args: {
          event_id: string
          event_org_id: string
          event_source_key: string
        }
        Returns: Json
      }
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
      cronograma_save_subevent_plan: { Args: { payload: Json }; Returns: Json }
      cronograma_scoped_event_visible: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      enqueue_google_sync: {
        Args: { _event_id: string; _operation: string }
        Returns: undefined
      }
      ensure_commission_map_segments: {
        Args: { _project_id: string }
        Returns: undefined
      }
      expire_commercial_reservations: {
        Args: { p_org_id: string }
        Returns: number
      }
      expire_commission_segment_reservations: {
        Args: { p_segment_id: string }
        Returns: number
      }
      get_commission_map_segment_inventory: {
        Args: { p_segment_id: string }
        Returns: {
          expected_entity_count: number
          expected_lot_count: number
          lineage_delta: number
        }[]
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
      google_user_eligible_for_event: {
        Args: { _event_id: string; _org_id: string; _user_id: string }
        Returns: boolean
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
      has_scoped_cronograma_access: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      invoke_agenda_meeting_worker: { Args: never; Returns: number }
      invoke_google_sync_worker: { Args: never; Returns: number }
      is_org_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      list_org_login_members: {
        Args: { _org_id: string }
        Returns: {
          cargo: string
          last_sign_in_at: string
          nome_exibicao: string
          role: string
          user_id: string
        }[]
      }
      map_can_access_segment: {
        Args: { _segment_id: string }
        Returns: boolean
      }
      map_can_view_any_segment: {
        Args: { _project_id: string }
        Returns: boolean
      }
      map_entity_inherits_segment: {
        Args: { _entity_id: string; _segment_id: string }
        Returns: boolean
      }
      map_geometry_overlaps_sellable: {
        Args: {
          _excluded_entity_ids?: string[]
          _geometry: Json
          _project_id: string
        }
        Returns: boolean
      }
      map_has_explicit_capability: {
        Args: { _capability: string; _org_id: string }
        Returns: boolean
      }
      map_polygon_from_geojson: { Args: { _geometry: Json }; Returns: unknown }
      map_segment_baseline_count: {
        Args: { _boundary_data: Json; _key: string }
        Returns: number
      }
      map_segment_is_complete: {
        Args: { _segment_id: string }
        Returns: boolean
      }
      map_segment_lineage_baseline: {
        Args: { _boundary_data: Json }
        Returns: string
      }
      map_segment_lineage_inventory_delta: {
        Args: { _segment_id: string }
        Returns: number
      }
      merge_commercial_lots: {
        Args: {
          p_display_name: string
          p_geometry: Json
          p_public_identifier: string
          p_reason: string
          p_source_lot_ids: string[]
        }
        Returns: Json
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      publish_commercial_map: {
        Args: { p_project_id: string; p_reason: string }
        Returns: number
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
      queue_google_sync_for_user: {
        Args: {
          _event_id: string
          _initial_backfill?: boolean
          _operation: string
          _org_id: string
          _payload_hash?: string
          _user_id: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      reconcile_commission_map_lineage: {
        Args: { _project_id: string }
        Returns: undefined
      }
      reconcile_google_sync_event: {
        Args: { _event_id: string; _org_id: string }
        Returns: undefined
      }
      reconcile_google_sync_user: {
        Args: { _org_id: string; _user_id: string }
        Returns: undefined
      }
      register_commercial_sale: {
        Args: {
          p_buyer_name: string
          p_contract_number: string
          p_document_number: string
          p_lot_id: string
          p_negotiated_value: number
          p_notes: string
          p_payment_status: string
          p_sale_date: string
          p_salesperson_name: string
        }
        Returns: string
      }
      register_lot_contract_version: {
        Args: {
          p_contract_number: string
          p_file_size: number
          p_lot_id: string
          p_mime_type: string
          p_original_name: string
          p_storage_path: string
        }
        Returns: string
      }
      reserve_commercial_lot: {
        Args: {
          p_company_name: string
          p_contact_name: string
          p_document_number: string
          p_email: string
          p_expires_at: string
          p_lot_id: string
          p_notes: string
          p_phone: string
        }
        Returns: string
      }
      reset_transport_tracking: {
        Args: { _transport_id: string }
        Returns: undefined
      }
      resolve_commission_map_segment_slug: {
        Args: { _metadata: Json; _public_identifier: string }
        Returns: string
      }
      rollback_exporural_reference_2026: {
        Args: { p_org_id: string; p_reason: string; p_snapshot_id: string }
        Returns: Json
      }
      save_map_calibration: {
        Args: {
          p_image_offset_x: number
          p_image_offset_y: number
          p_image_rotation_degrees: number
          p_image_scale_x: number
          p_image_scale_y: number
          p_is_locked: boolean
          p_known_distance_meters: number
          p_map_units_per_meter: number
          p_opacity: number
          p_point_a: Json
          p_point_b: Json
          p_project_id: string
          p_reason: string
          p_reference_image_path: string
          p_status: string
        }
        Returns: number
      }
      save_map_geometry: {
        Args: {
          p_change_reason: string
          p_elevation: number
          p_expected_version: number
          p_extrusion_height: number
          p_geometry: Json
          p_geometry_id: string
          p_rotation: number
        }
        Returns: number
      }
      set_map_entity_verification: {
        Args: { p_entity_id: string; p_reason: string; p_status: string }
        Returns: string
      }
      set_map_layer_lock: {
        Args: { p_is_locked: boolean; p_layer_id: string; p_reason: string }
        Returns: boolean
      }
      set_transport_guests: {
        Args: { _guest_ids: string[]; _org_id: string; _transport_id: string }
        Returns: undefined
      }
      split_commercial_lot: {
        Args: {
          p_first_geometry: Json
          p_first_identifier: string
          p_first_name: string
          p_reason: string
          p_second_geometry: Json
          p_second_identifier: string
          p_second_name: string
          p_source_lot_id: string
        }
        Returns: Json
      }
      start_commercial_negotiation: {
        Args: {
          p_company_name: string
          p_contact_name: string
          p_document_number: string
          p_lot_id: string
          p_notes: string
          p_proposed_value: number
        }
        Returns: string
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
      sync_commercial_map_reference_2026: {
        Args: {
          p_calibration: Json
          p_entities: Json
          p_layers: Json
          p_lots: Json
          p_org_id: string
          p_project: Json
        }
        Returns: string
      }
      sync_internal_mobility_form: {
        Args: { _form_id: string }
        Returns: undefined
      }
      sync_official_units_2028: { Args: { _org_id: string }; Returns: Json }
      sync_public_mobility_form: {
        Args: { _form_id: string }
        Returns: undefined
      }
      update_commercial_lot: {
        Args: {
          p_expected_updated_at: string
          p_lot_id: string
          p_patch: Json
          p_reason: string
        }
        Returns: string
      }
      validate_commercial_map_segments: {
        Args: { _project_id: string }
        Returns: Json
      }
      venue_assert_capability: {
        Args: { _capability: string; _org_id: string }
        Returns: string
      }
      venue_begin_mutation: {
        Args: {
          _idempotency_key: string
          _operation: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_calculate_usage_quantity: {
        Args: {
          _audience: number
          _end_at: string
          _explicit_quantity: number
          _start_at: string
          _unit_type: string
        }
        Returns: number
      }
      venue_can_delete_orphan_storage_object: {
        Args: { _object_name: string }
        Returns: boolean
      }
      venue_can_view_event: {
        Args: { _event_id: string; _org_id: string }
        Returns: boolean
      }
      venue_check_availability: {
        Args: {
          _audience?: number
          _event_end_at?: string
          _event_start_at?: string
          _event_type?: string
          _exclude_event_id?: string
          _org_id: string
          _setup_start_at: string
          _space_ids: string[]
          _teardown_end_at: string
        }
        Returns: {
          conflict_id: string
          conflict_kind: string
          detail: string
          ends_at: string
          evidence_token: string
          space_id: string
          starts_at: string
          title: string
        }[]
      }
      venue_clear_usage_excess_approval: {
        Args: { _reason: string; _request_id: string; _usage_id: string }
        Returns: undefined
      }
      venue_delete_event: {
        Args: {
          _event_id: string
          _expected_version?: number
          _reason?: string
        }
        Returns: Json
      }
      venue_finish_mutation: {
        Args: {
          _idempotency_key: string
          _operation: string
          _org_id: string
          _result: Json
        }
        Returns: Json
      }
      venue_get_audit_history: {
        Args: {
          _before?: string
          _before_id?: string
          _event_id?: string
          _limit?: number
          _org_id: string
        }
        Returns: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_user_id: string
          after_data: Json
          before_data: Json
          created_at: string
          entity: string
          entity_id: string
          id: string
          org_id: string
        }[]
      }
      venue_get_permissions: { Args: { _org_id: string }; Returns: Json }
      venue_has_capability: {
        Args: { _capability: string; _org_id: string }
        Returns: boolean
      }
      venue_log_audit: {
        Args: {
          _action: Database["public"]["Enums"]["audit_action"]
          _after: Json
          _before: Json
          _entity: string
          _entity_id: string
          _org_id: string
          _reason: string
          _request_id: string
          _venue_action: string
        }
        Returns: undefined
      }
      venue_normalize_name: { Args: { value: string }; Returns: string }
      venue_recalculate_agreement_excess: {
        Args: { _agreement_id: string; _reason: string; _request_id: string }
        Returns: undefined
      }
      venue_redact_document_snapshot: {
        Args: { _snapshot: Json }
        Returns: Json
      }
      venue_redact_stakeholder_snapshot: {
        Args: { _snapshot: Json }
        Returns: Json
      }
      venue_refresh_occupancies: {
        Args: { _event_id: string }
        Returns: undefined
      }
      venue_register_document: {
        Args: {
          _event_id: string
          _idempotency_key: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_save_event: {
        Args: {
          _event_id: string
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_save_event_agenda: {
        Args: { _event_id: string; _org_id: string; _payload: Json }
        Returns: Json
      }
      venue_seed_org_defaults: { Args: { _org_id: string }; Returns: undefined }
      venue_sync_event_counterpart: {
        Args: { _event_id: string; _reason: string; _request_id: string }
        Returns: undefined
      }
      venue_transition_event: {
        Args: {
          _event_id: string
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload?: Json
          _reason: string
          _transition: string
        }
        Returns: Json
      }
      venue_update_checklist_item: {
        Args: {
          _expected_version: number
          _idempotency_key: string
          _item_id: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_update_resource: {
        Args: {
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
          _resource_id: string
        }
        Returns: Json
      }
      venue_upsert_agreement: {
        Args: {
          _agreement_id: string
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_upsert_space: {
        Args: {
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
          _space_id: string
        }
        Returns: Json
      }
      venue_upsert_space_block: {
        Args: {
          _block_id: string
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
        }
        Returns: Json
      }
      venue_upsert_stakeholder: {
        Args: {
          _expected_version: number
          _idempotency_key: string
          _org_id: string
          _payload: Json
          _stakeholder_id: string
        }
        Returns: Json
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
