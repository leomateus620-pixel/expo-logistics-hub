import { z } from "zod";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const instant = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
});
const id = z.string().uuid();

export function readOperationalFilters(params: URLSearchParams) {
  const start = isoDay.nullable().catch(null).parse(params.get("inicio"));
  const end = isoDay.nullable().catch(null).parse(params.get("fim"));
  return {
    _start: start && end && start > end ? null : start,
    _end: start && end && start > end ? null : end,
    _location_id: id.nullable().catch(null).parse(params.get("local")),
  };
}
