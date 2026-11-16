export function attendanceValue(status: string | null, hours: number) {
  return status === 'full' && hours > 0 ? 'overtime' : status ?? '';
}
export function attendanceEntry(value: string, hours = 0) {
  if (value === 'overtime') {
    if (!Number.isFinite(hours) || hours <= 0) throw new Error('Enter additional overtime hours');
    return { status: 'full', overtime_hours: hours };
  }
  return { status: value || null, overtime_hours: 0 };
}
export function attendanceLabel(status: string | null, hours = 0) {
  if (status === 'half') return 'Half day';
  return hours > 0 ? `Full day + ${hours}h overtime` : 'Full day';
}