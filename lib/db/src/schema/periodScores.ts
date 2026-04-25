import { pgTable, text, integer, timestamp, varchar, uniqueIndex } from "drizzle-orm/pg-core";

export const periodScoresTable = pgTable(
  "period_scores",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull(),
    period: varchar("period", { length: 10 }).notNull(),
    periodStart: text("period_start").notNull(),
    periodEnd: text("period_end").notNull(),
    score: integer("score"),
    reasoning: text("reasoning"),
    computedAt: timestamp("computed_at", { withTimezone: true }),
    inputHash: text("input_hash"),
    lastSessionAtCompute: timestamp("last_session_at_compute", { withTimezone: true }),
  },
  (table) => ({
    uniqueUserPeriod: uniqueIndex("period_scores_user_period_idx").on(
      table.userId,
      table.period,
      table.periodStart
    ),
  })
);

export type PeriodScore = typeof periodScoresTable.$inferSelect;
