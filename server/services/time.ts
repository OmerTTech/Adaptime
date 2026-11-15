/**
 * Saat dilimi yardımcıları.
 * Sunucu hangi ülkeden çalışırsa çalışsın, kullanıcının saat diliminde
 * (varsayılan Asia/Baku) hesap yapar. DST değişimleri Intl üzerinden
 * otomatik doğru sonuç verir.
 */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24, // bazı runtime'larda gece yarısı "24" döner
    minute: get("minute"),
    second: get("second"),
  };
}

export function dateKeyInTz(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function timeLabelInTz(date: Date, timeZone: string): string {
  const { hour, minute } = zonedParts(date, timeZone);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Bir sonraki kontrol zamanı: kullanıcının saat diliminde, `hours` listesindeki
 * bir saatin tam başlangıcı. En fazla 2 gün ileriye bakar.
 */
export function nextCheckAt(
  hours: number[],
  timeZone: string,
  now: number = Date.now(),
): { at: number; hour: number } | null {
  if (hours.length === 0) return null;
  const sorted = new Set(hours);

  for (let offset = 0; offset <= 2 * 24 * 60; offset += 1) {
    const candidate = new Date(now + offset * 60_000);
    const { hour, minute } = zonedParts(candidate, timeZone);
    if (minute === 0 && sorted.has(hour) && candidate.getTime() > now - 60_000) {
      return { at: candidate.getTime(), hour };
    }
  }
  return null;
}

/** "11:00" gibi bir etiketi, kullanıcının saat diliminde bugünün ms'ine çevirir. */
export function localTimeToTimestamp(
  dateKey: string,
  time: string,
  timeZone: string,
): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const targetHour = Number(match[1]);
  const targetMinute = Number(match[2]);
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return null;

  // Hedef günün 00:00'ını kullanıcının saat diliminde bul.
  const guess = Date.UTC(y, m - 1, d, targetHour, targetMinute, 0, 0);
  for (let delta = -14 * 60; delta <= 14 * 60; delta += 15) {
    const candidate = new Date(guess + delta * 60_000);
    const p = zonedParts(candidate, timeZone);
    if (
      p.year === y &&
      p.month === m &&
      p.day === d &&
      p.hour === targetHour &&
      p.minute === targetMinute
    ) {
      return candidate.getTime();
    }
  }
  return null;
}
