import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { sessionsTable } from "./sessions";

export const recordingsTable = pgTable("recordings", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessionsTable.id, { onDelete: "cascade" }),
  objectPath: text("object_path").notNull(),
  label: text("label"),
  durationSeconds: integer("duration_seconds").notNull(),
  offsetSeconds: integer("offset_seconds").notNull(),
  noteTitle: text("note_title"),
  noteNotes: text("note_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Recording = typeof recordingsTable.$inferSelect;
