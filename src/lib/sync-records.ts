/**
 * The shape of a shared record, as the app and the server both see it (21 Nov 2026). Kept apart
 * from sync.ts, which knows the app's data model, so the server functions need nothing else.
 */

/** One record as stored on the server: the list it belongs to, its key, where it sits, and the record. */
export type StoredRecord = { list: string; id: string; pos: number; data: unknown };

/** A change to send or to apply: a record written, or a record deleted. */
export type RecordChange = StoredRecord | { list: string; id: string; deleted: true };
