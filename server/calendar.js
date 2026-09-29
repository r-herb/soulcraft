// The Soulcraft calendar, shared by the game and the API. Soulcraft time
// runs 24 times faster than real time from the epoch (27 September 2026,
// midnight UTC): a Soulcraft day is one real hour, a month (24 days) is one
// real day, and a year (12 months) is twelve real days. The city pays
// salaries and draws the lottery when a month ends (midnight UTC).
export const EPOCH = Date.UTC(2026, 8, 27);
const HOUR = 3600e3;
export const MONTH_MS = 24 * HOUR;

export function monthIndex(now = Date.now()) { return Math.floor((now - EPOCH) / MONTH_MS); }
export function monthStart(m) { return EPOCH + m * MONTH_MS; }
export function scDate(now = Date.now()) {
  const t = now - EPOCH;
  const m = Math.floor(t / MONTH_MS);
  const inMonth = t - m * MONTH_MS;
  const day = Math.floor(inMonth / HOUR);
  const mins = Math.floor(((inMonth % HOUR) / HOUR) * 24 * 60);
  return { year: Math.floor(m / 12) + 1, month: ((m % 12) + 12) % 12, index: m, day: day + 1, hour: Math.floor(mins / 60), minute: mins % 60, endsIn: monthStart(m + 1) - now };
}

// salary for a month of quests: daily tasks, guardians and treasure-quest levels
export const PAY = { daily: 6, boss: 40, treasure: 8 };
export const SALARY_CAP = 300;
export const TICKET = 5;
export const MAX_TICKETS = 10;
