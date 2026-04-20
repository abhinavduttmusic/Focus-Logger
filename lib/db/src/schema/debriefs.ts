import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const debriefsTable = pgTable("debriefs", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  summary: text("summary").notNull(),
  totalFocusSeconds: integer("total_focus_seconds").notNull().default(0),
  totalBreakSeconds: integer("total_break_seconds").notNull().default(0),
  focusCount: integer("focus_count").notNull().default(0),
  breakCount: integer("break_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDebriefSchema = createInsertSchema(debriefsTable).omit({ id: true, createdAt: true });
export type InsertDebrief = z.infer<typeof insertDebriefSchema>;
export type Debrief = typeof debriefsTable.$inferSelect;
