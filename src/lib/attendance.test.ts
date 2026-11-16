import { expect, it } from 'vitest';
import { attendanceEntry, attendanceValue } from './attendance';
it('overtime is a full day plus the entered additional hours', () => {
  expect(attendanceEntry('overtime', 2.5)).toEqual({ status: 'full', overtime_hours: 2.5 });
  expect(attendanceValue('full', 2.5)).toBe('overtime');
});
it('half and full days clear additional hours', () => {
  expect(attendanceEntry('half', 2)).toEqual({ status: 'half', overtime_hours: 0 });
  expect(attendanceEntry('full', 2)).toEqual({ status: 'full', overtime_hours: 0 });
});
it('overtime requires positive additional hours', () => {
  expect(() => attendanceEntry('overtime', 0)).toThrow();
  expect(() => attendanceEntry('overtime', -1)).toThrow();
});