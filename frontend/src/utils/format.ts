/** Returns date in Vietnamese format: dd/MM/yyyy */
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day   = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/** Returns datetime in Vietnamese format: dd/MM/yyyy HH:mm */
export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day    = String(d.getDate()).padStart(2, '0');
  const month  = String(d.getMonth() + 1).padStart(2, '0');
  const year   = d.getFullYear();
  const hour   = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/** Returns month/year in Vietnamese format: Tháng MM/yyyy */
export function formatMonthYear(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  return `Tháng ${month}/${year}`;
}

/** Returns date string for filenames: dd-MM-yyyy */
export function formatDateFile(date: Date = new Date()): string {
  const day   = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year  = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function capitalise(str?: string | null): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function formatHours(hours?: number | string | null): string {
  if (hours == null) return '—';
  const n = Number(hours);
  if (isNaN(n)) return '—';
  return `${n.toFixed(1)} h`;
}

/** Returns the number of calendar days from today to dateStr (negative = past). */
export function daysUntil(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const end = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
