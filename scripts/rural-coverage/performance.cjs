// Reuse the existing warmed A/B/B/A protocol against this task's exact inventory.
process.env.LOT_BASE_URL ||= 'http://127.0.0.1:4251';
process.env.LOT_CANDIDATE_URL ||= 'http://127.0.0.1:4252';
process.env.LOT_PERF_OUTPUT ||= 'docs/validation/rural-coverage/performance';
require('../external-lots/performance.cjs');
