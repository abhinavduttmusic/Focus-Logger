import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tasksTable } from "./tasks";

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  durationSeconds: integer("duration_seconds").notNull(),
  notes: text("notes").notNull().default(""),
  taskId: integer("task_id").references(() => tasksTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessionsTable).omit({ id: true, createdAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessionsTable.$inferSelect;
