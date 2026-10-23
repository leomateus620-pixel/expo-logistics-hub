import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommercialReportRpcFunctions, CommercialReportServiceRpcFunctions } from './generated/commercialReportRpcTypes';
import type { Database, Json } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';

// Additive schema defined by the workers migration; keep the generated core schema intact.
export type WorkerConversationRow = {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  worker_id: string;
  created_at: string;
  updated_at: string;
};

export type WorkerMessageRow = {
  id: string;
  org_id: string;
  user_id: string;
  conversation_id: string;
  request_id: string;
  message_seq: number;
  role: 'user' | 'assistant';
  worker_id: string;
  content: string;
  citations: Json;
  state: 'pending' | 'complete' | 'failed';
  created_at: string;
};

type ReadTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };
type WorkersDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Functions'> & {
    Functions: Omit<Database['public']['Functions'], keyof CommercialReportServiceRpcFunctions | 'workers_validate_commercial_report_spec'> & CommercialReportRpcFunctions & {
      ai_workers_read_history: { Args: { _org_id: string; _conversation_id: string; _before_sequence?: number; _turn_limit?: number }; Returns: WorkerMessageRow[] };
    };
    Tables: Database['public']['Tables'] & {
      ai_conversations: ReadTable<WorkerConversationRow>;
      ai_messages: ReadTable<WorkerMessageRow>;
    };
  };
};

/** Same authenticated client, same session and RLS; never a separate privileged client. */
export const workersDatabase = supabase as unknown as SupabaseClient<WorkersDatabase>;
