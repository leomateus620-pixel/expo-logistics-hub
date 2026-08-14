import type { JsonValue } from "./contracts.ts";

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export type MeetingJobRow = {
  id: string;
  session_id: string;
  org_id: string;
  event_id: string;
  transcript_version_id: string | null;
  kind: "assemble_transcript" | "analysis_generate";
  dedupe_key: string;
  status: string;
  attempts: number;
  max_attempts: number;
  available_at: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type SessionRow = {
  id: string;
  org_id: string;
  event_id: string;
  event_context: JsonValue;
};

type ReceiptRow = {
  id: string;
  session_id: string;
  segment_id: string;
  attempt_id: string;
  callback_token_hash: string | null;
  callback_token_expires_at: string | null;
  provider_request_id: string | null;
  capture_start_ms: number;
  capture_end_ms: number;
  sequence: number;
  status: string;
};

type TranscriptVersionRow = {
  id: string;
  session_id: string;
  kind: "canonical" | "manual_revision";
  missing_sequences: number[];
};

type TranscriptSegmentRow = {
  id: string;
  session_id: string;
  sequence: number;
  transcript_text: string;
};

type RevisionSegmentRow = {
  transcript_version_id: string;
  session_id: string;
  source_segment_id: string;
  sequence: number;
  revised_text: string;
};

type OrgMemberRow = {
  org_id: string;
  user_id: string;
  nome_exibicao: string | null;
  is_active: boolean;
};

export type MeetingDatabase = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agenda_meeting_sessions: Table<SessionRow>;
      agenda_meeting_segment_receipts: Table<ReceiptRow>;
      agenda_meeting_transcript_versions: Table<TranscriptVersionRow>;
      agenda_meeting_transcript_segments: Table<TranscriptSegmentRow>;
      agenda_meeting_transcript_revision_segments: Table<RevisionSegmentRow>;
      agenda_meeting_processing_jobs: Table<MeetingJobRow>;
      org_members: Table<OrgMemberRow>;
    };
    Views: Record<string, never>;
    Functions: {
      agenda_meeting_authorize: {
        Args: {
          p_action: string;
          p_org_id: string | null;
          p_event_id: string | null;
          p_session_id: string | null;
        };
        Returns: boolean;
      };
      agenda_meeting_control: {
        Args: {
          p_action: string;
          p_actor_user_id: string;
          p_org_id: string;
          p_event_id: string;
          p_session_id: string | null;
          p_mutation_id: string;
          p_expected_version: number | null;
          p_payload: JsonValue;
        };
        Returns: JsonValue;
      };
      agenda_meeting_prepare_segment: {
        Args: {
          p_actor_user_id: string;
          p_session_id: string;
          p_segment_id: string;
          p_sequence: number;
          p_capture_start_ms: number;
          p_capture_end_ms: number;
          p_mime_type: string;
          p_byte_size: number;
          p_sha256: string;
          p_mutation_id: string;
          p_callback_token_hash: string;
          p_callback_token_expires_at: string;
        };
        Returns: JsonValue;
      };
      agenda_meeting_accept_segment: {
        Args: { p_receipt_id: string; p_provider_request_id: string };
        Returns: JsonValue;
      };
      agenda_meeting_fail_segment: {
        Args: {
          p_receipt_id: string;
          p_error_code: string;
          p_terminal: boolean;
          p_retry_after_ms: number | null;
        };
        Returns: JsonValue;
      };
      agenda_meeting_complete_segment: {
        Args: {
          p_callback_token_hash: string;
          p_callback_digest: string;
          p_provider_request_id: string;
          p_attempt_id: string;
          p_transcript: string;
          p_words: JsonValue;
          p_duration_ms: number;
          p_confidence: number | null;
        };
        Returns: JsonValue;
      };
      agenda_meeting_claim_jobs: {
        Args: { p_batch_size: number; p_lease_seconds: number };
        Returns: MeetingJobRow[];
      };
      agenda_meeting_expire_stale_captures: {
        Args: { p_stale_seconds: number };
        Returns: number;
      };
      agenda_meeting_complete_assemble_job: {
        Args: { p_job_id: string; p_lease_token: string };
        Returns: JsonValue;
      };
      agenda_meeting_complete_analysis_job: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_transcript_version_id: string;
          p_result: JsonValue;
          p_provider_response_id: string;
          p_usage: JsonValue;
        };
        Returns: JsonValue;
      };
      agenda_meeting_fail_job: {
        Args: {
          p_job_id: string;
          p_lease_token: string;
          p_error_code: string;
          p_retry_after_seconds: number;
        };
        Returns: JsonValue;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
