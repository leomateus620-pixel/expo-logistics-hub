-- Additive ordering and turn-based keyset pagination. Existing conversations remain readable.
-- Legacy transaction ties have no persisted admission sequence. Physical question-row position
-- is used once for that unrecoverable tie; UUIDs never determine semantic precedence.
BEGIN;
LOCK TABLE public.ai_messages IN ACCESS EXCLUSIVE MODE;
CREATE SEQUENCE public.ai_messages_order_seq AS bigint;
ALTER TABLE public.ai_messages ADD COLUMN message_seq bigint;
WITH turns AS (
  SELECT user_id, request_id, min(created_at) AS started_at,
    min(ctid::text) FILTER (WHERE role = 'user') AS original_question_position
  FROM public.ai_messages GROUP BY user_id, request_id
), ordered AS (
  SELECT m.id, row_number() OVER (ORDER BY t.started_at,
    t.original_question_position::tid NULLS LAST,
    CASE m.role WHEN 'user' THEN 0 ELSE 1 END, m.ctid) AS ordinal
  FROM public.ai_messages m JOIN turns t USING (user_id, request_id)
)
UPDATE public.ai_messages m SET message_seq = o.ordinal FROM ordered o WHERE m.id = o.id;
SELECT setval('public.ai_messages_order_seq', coalesce(max(message_seq), 1), count(*) > 0) FROM public.ai_messages;
ALTER TABLE public.ai_messages ALTER COLUMN message_seq SET DEFAULT nextval('public.ai_messages_order_seq');
ALTER TABLE public.ai_messages ALTER COLUMN message_seq SET NOT NULL;
ALTER SEQUENCE public.ai_messages_order_seq OWNED BY public.ai_messages.message_seq;
CREATE UNIQUE INDEX ai_messages_sequence_idx ON public.ai_messages(message_seq);
CREATE INDEX ai_messages_turn_page_idx ON public.ai_messages(conversation_id, message_seq DESC);
REVOKE ALL ON SEQUENCE public.ai_messages_order_seq FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.ai_workers_read_history(
  _org_id uuid, _conversation_id uuid, _before_sequence bigint DEFAULT NULL, _turn_limit integer DEFAULT 50
) RETURNS SETOF public.ai_messages LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(public.ai_workers_can_access(_org_id), false) THEN
    RAISE EXCEPTION 'WORKERS_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  IF _turn_limit IS NULL OR _turn_limit NOT BETWEEN 1 AND 50 OR (_before_sequence IS NOT NULL AND _before_sequence < 1) THEN
    RAISE EXCEPTION 'WORKERS_INVALID_REQUEST' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY WITH page AS (
    SELECT m.request_id, min(m.message_seq) AS first_sequence
    FROM public.ai_messages m
    WHERE m.org_id = _org_id AND m.user_id = auth.uid() AND m.conversation_id = _conversation_id
    GROUP BY m.request_id
    HAVING _before_sequence IS NULL OR min(m.message_seq) < _before_sequence
    ORDER BY min(m.message_seq) DESC LIMIT _turn_limit
  ) SELECT m.* FROM public.ai_messages m JOIN page p USING (request_id)
    WHERE m.org_id = _org_id AND m.user_id = auth.uid() AND m.conversation_id = _conversation_id
    ORDER BY m.message_seq;
END $$;
REVOKE ALL ON FUNCTION public.ai_workers_read_history(uuid,uuid,bigint,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_workers_read_history(uuid,uuid,bigint,integer) TO authenticated;
COMMENT ON FUNCTION public.ai_workers_read_history(uuid,uuid,bigint,integer) IS
  'Caller JWT + existing message RLS. Cursor is first message_seq of prior page; pages never split a turn.';
COMMIT;
