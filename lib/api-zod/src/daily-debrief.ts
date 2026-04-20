import * as zod from "zod";

export const FocusSessionInput = zod.object({
  label: zod.string(),
  durationSeconds: zod.number().int().nonnegative(),
  startedAtLabel: zod.string(),
  endedAtLabel: zod.string(),
});

export const BreakSessionInput = zod.object({
  label: zod.string(),
  durationSeconds: zod.number().int().nonnegative(),
});

export const DailyDebriefBody = zod.object({
  date: zod.string().min(1),
  dateKey: zod.string().min(1),
  dayStartedAtLabel: zod.string().nullable(),
  totalFocusSeconds: zod.number().int().nonnegative(),
  totalBreakSeconds: zod.number().int().nonnegative(),
  focusCount: zod.number().int().nonnegative(),
  breakCount: zod.number().int().nonnegative(),
  focusSessions: zod.array(FocusSessionInput),
  breakSessions: zod.array(BreakSessionInput),
  notes: zod.string(),
  regenerate: zod.boolean().optional(),
});

export type DailyDebriefBody = zod.infer<typeof DailyDebriefBody>;
