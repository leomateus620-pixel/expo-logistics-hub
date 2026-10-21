"""Compile the immutable, reviewed payload. Never executes SQL."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[3];s=root/'scripts/exporural/official-2026-10-20';out=root/'docs/exporural/2028-revisao-2026-10-20'
payload=json.load(open(out/'payload.json'))
assert payload.get('expected_fingerprint'),'Explicit preflight fingerprint required'
(root/'supabase/migrations/20261021120000_exporural_official_october.sql').write_text((s/'state.sql').read_text()+'\n'+(s/'apply-body.sql').read_text().replace('__PAYLOAD__',json.dumps(payload,ensure_ascii=False,separators=(',',':'))))
