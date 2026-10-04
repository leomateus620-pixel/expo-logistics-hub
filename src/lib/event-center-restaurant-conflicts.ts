export interface RestaurantEventAlert {
  event_date: string;
  event_end_date: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
}

const DAY = 86400000;
function dateNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}
export function restaurantAlertWindow(start: string | null | undefined, end: string | null | undefined) {
  const first = start ? dateNumber(start) : NaN;
  const last = end ? dateNumber(end) : first;
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 366 * DAY) return null;
  return { start: new Date(first - DAY).toISOString().slice(0, 10), end: new Date(last + DAY).toISOString().slice(0, 10) };
}
export function classifyRestaurantAlert(eventDate: string, eventEnd: string, start: string, end: string): string {
  const first = dateNumber(start);
  const last = dateNumber(end);
  const eventFirst = dateNumber(eventDate);
  const eventLast = dateNumber(eventEnd);
  if (eventLast < first) return '1 dia antes';
  if (eventFirst > last) return '1 dia depois';
  return first === last ? 'no mesmo dia' : 'durante o evento';
}