// schema.org openingHours strings, e.g. "Mo-Th 09:00-22:00; Fr 14:00-23:00".
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function parseHours(spec = '') {
  const out = [];
  for (const part of spec.split(/[;,](?=\s*[A-Z][a-z])/)) {
    const m = /^\s*([A-Za-z,\-\s]+?)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*$/.exec(part);
    if (!m) continue;
    const days = new Set();
    for (const token of m[1].split(',').map((t) => t.trim())) {
      const [from, to] = token.split('-').map((d) => DAYS.indexOf(d));
      if (from < 0) continue;
      for (let i = from; ; i = (i + 1) % 7) {
        days.add(DAYS[i]);
        if (to === undefined || to < 0 || i === to) break;
      }
    }
    out.push({ days: [...days], opens: m[2], closes: m[3] });
  }
  return out;
}

// Local day and time in the UAE (no daylight saving).
function local(at, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(at).map((p) => [p.type, p.value]),
  );
  return { day: parts.weekday.slice(0, 2), time: `${parts.hour === '24' ? '00' : parts.hour}:${parts.minute}` };
}

export function isOpen(spec, at = new Date(), timeZone = 'Asia/Dubai') {
  const { day, time } = local(at, timeZone);
  return parseHours(spec).some((r) => r.days.includes(day) && (r.closes > r.opens ? time >= r.opens && time < r.closes : time >= r.opens || time < r.closes));
}
