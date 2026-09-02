/**
 * Conversions between an ISO-8601 instant (what the API stores) and the local
 * value expected by `<input type="datetime-local">` / `type="date"`.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant → `YYYY-MM-DDTHH:mm` in the viewer's local time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ISO instant → `YYYY-MM-DD` in the viewer's local time. */
export function isoToDateInput(iso: string | null | undefined): string {
  return isoToLocalInput(iso).slice(0, 10);
}

/** `datetime-local` / `date` string → ISO instant, or `null` when empty/invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
