// BEI trading hours (WIB). Mon–Thu: Sesi I 09:00–12:00, Sesi II 13:00–15:59;
// Fri: Sesi I 09:00–11:30, Sesi II 14:00–15:59. Minutes from midnight.
export const SESSIONS = {
  weekday: [[540, 720], [780, 959]],
  friday: [[540, 690], [840, 959]],
};
const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const hhmm = (minutes) => String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');

export function jakartaNow(ms = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

export const sessionsFor = (weekday) => (weekday === 5 ? SESSIONS.friday : SESSIONS.weekday);

// Share of the day's trading minutes already elapsed at a given WIB time.
export function sessionProgress(date, time) {
  const blocks = sessionsFor(new Date(date + 'T00:00:00Z').getUTCDay());
  const [h, m] = time.split(':').map(Number);
  const now = h * 60 + m;
  const total = blocks.reduce((sum, [a, b]) => sum + b - a, 0);
  const elapsed = blocks.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(now, b) - a), 0);
  return Math.min(1, elapsed / total);
}

// { state: 'open' | 'break' | 'pre' | 'closed' | 'holiday', label }
// holiday: the BEI live feed has not moved today although a session should be on.
export function marketStatus({ holiday = false } = {}, ms = Date.now()) {
  const now = jakartaNow(ms);
  const nextOpenDay = () => {
    let d = now.weekday;
    for (let i = 1; i <= 7; i++) {
      d = (now.weekday + i) % 7;
      if (d >= 1 && d <= 5) return i === 1 ? 'besok' : DAYS[d];
    }
    return 'Senin';
  };
  const until = (minutes) => {
    const left = minutes - now.minutes;
    return left >= 60 ? Math.floor(left / 60) + ' j ' + (left % 60) + ' mnt lagi' : left + ' mnt lagi';
  };
  if (now.weekday === 0 || now.weekday === 6) return { state: 'closed', label: 'Pasar tutup · buka ' + nextOpenDay() + ' 09:00' };
  const [[s1, e1], [s2, e2]] = sessionsFor(now.weekday);
  if (holiday && now.minutes >= s1 && now.minutes < e2) return { state: 'holiday', label: 'Libur bursa · buka ' + nextOpenDay() + ' 09:00' };
  if (now.minutes < s1) return { state: 'pre', label: 'Belum buka · Sesi I ' + hhmm(s1) + ' · ' + until(s1) };
  if (now.minutes < e1) return { state: 'open', label: 'Sesi I berjalan · tutup ' + hhmm(e1) };
  if (now.minutes < s2) return { state: 'break', label: 'Istirahat · Sesi II buka ' + hhmm(s2) + ' · ' + until(s2) };
  if (now.minutes < e2) return { state: 'open', label: 'Sesi II berjalan · tutup ' + hhmm(e2) };
  return { state: 'closed', label: 'Pasar tutup · buka ' + nextOpenDay() + ' 09:00' };
}
