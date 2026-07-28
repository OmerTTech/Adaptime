const COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FFEAA7",
  "#DDA0DD",
  "#98D8C8",
  "#F7DC6F",
  "#BB8FCE",
  "#85C1E9",
  "#F1948A",
  "#82E0AA",
  "#F8C471",
  "#AED6F1",
  "#D7BDE2",
  "#A3E4D7",
];

let colorIndex = 0;

export function getRandomColor(): string {
  const color = COLORS[colorIndex % COLORS.length];
  colorIndex++;
  return color;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}dk`;
  if (minutes === 0) return `${hours}sa`;
  return `${hours}sa ${minutes}dk`;
}

export function getTodayString(dayOffset?: number): string {
  const d = new Date();
  if (dayOffset) d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split("T")[0];
}

export function timeToTimestamp(timeStr: string, dateStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const date = new Date(dateStr + "T00:00:00");
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}

export function timestampToTime(ts: number): string {
  const date = new Date(ts);
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
