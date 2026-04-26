import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, debriefsTable, sessionsTable, periodScoresTable } from "@workspace/db";
import { eq, and, gte, lte } from "drizzle-orm";
import { createHash } from "crypto";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";

const router: IRouter = Router();

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

function makeHash(data: unknown): string {
  return createHash("md5").update(JSON.stringify(data)).digest("hex");
}

// IST = UTC+5:30
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTDateKey(utcDate: Date): string {
  return new Date(utcDate.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function isFocusSession(type: string): boolean {
  return type === "simple" || type === "pomodoro_focus";
}

// For a given YYYY-MM-DD date in IST, return UTC range to query
function istDayToUTCRange(date: string): { from: Date; to: Date } {
  // IST midnight = UTC 18:30 previous day
  const from = new Date(date + "T00:00:00.000+05:30");
  const to = new Date(date + "T23:59:59.999+05:30");
  return { from, to };
}

// ── GET /debriefs/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD ──────────────────

router.get("/debriefs/calendar", async (req, res) => {
  try {
    const { start, end } = req.query as { start: string; end: string };
    if (!start || !end) {
      res.status(400).json({ error: "start and end query params required" });
      return;
    }

    const debriefRows = await db
      .select()
      .from(debriefsTable)
      .where(and(gte(debriefsTable.date, start), lte(debriefsTable.date, end)));

    // Fetch sessions for the full IST range (extend by 1 day on each side for safety)
    const { from: rangeFrom } = istDayToUTCRange(start);
    const { to: rangeTo } = istDayToUTCRange(end);

    const sessionRows = await db
      .select()
      .from(sessionsTable)
      .where(and(gte(sessionsTable.createdAt, rangeFrom), lte(sessionsTable.createdAt, rangeTo)));

    // Group sessions by IST date
    const sessionsByDate = new Map<string, { focusSecs: number; breakSecs: number; totalSecs: number; count: number; lastAt: Date | null }>();
    for (const s of sessionRows) {
      const key = toISTDateKey(s.createdAt);
      const existing = sessionsByDate.get(key) ?? { focusSecs: 0, breakSecs: 0, totalSecs: 0, count: 0, lastAt: null };
      if (isFocusSession(s.type)) existing.focusSecs += s.durationSeconds ?? 0;
      else existing.breakSecs += s.durationSeconds ?? 0;
      existing.totalSecs += s.durationSeconds ?? 0;
      existing.count += 1;
      if (!existing.lastAt || s.createdAt > existing.lastAt) existing.lastAt = s.createdAt;
      sessionsByDate.set(key, existing);
    }

    const debriefMap = new Map(debriefRows.map((d) => [d.date, d]));
    const allDates = new Set([...debriefMap.keys(), ...sessionsByDate.keys()]);

    const result = Array.from(allDates).sort().map((date) => {
      const debrief = debriefMap.get(date);
      const stats = sessionsByDate.get(date);
      const focusRatio = stats && stats.totalSecs > 0 ? stats.focusSecs / stats.totalSecs : undefined;
      const scoreComputedAt = debrief?.aiScoreComputedAt ? new Date(debrief.aiScoreComputedAt) : null;
      const lastSessionAt = stats?.lastAt ?? null;
      const stale = debrief?.aiScore != null && lastSessionAt != null && scoreComputedAt != null && lastSessionAt > scoreComputedAt;

      return {
        date,
        hasDebrief: !!debrief,
        debrief: debrief ? { id: debrief.id, text: debrief.summary, updatedAt: debrief.createdAt?.toISOString() ?? "" } : undefined,
        focusRatio,
        totalFocusMinutes: stats ? Math.round(stats.focusSecs / 60) : undefined,
        totalBreakMinutes: stats ? Math.round(stats.breakSecs / 60) : undefined,
        sessionCount: stats?.count,
        aiScore: debrief?.aiScore ?? null,
        aiScoreStale: !!stale,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("[GET /debriefs/calendar]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /debriefs/:id/score ─────────────────────────────────────────────────

router.post("/debriefs/:id/score", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [debrief] = await db.select().from(debriefsTable).where(eq(debriefsTable.id, id));
    if (!debrief) { res.status(404).json({ error: "Debrief not found" }); return; }

    const { from: dateStart, to: dateEnd } = istDayToUTCRange(debrief.date);
    const sessionRows = await db.select().from(sessionsTable).where(
      and(gte(sessionsTable.createdAt, dateStart), lte(sessionsTable.createdAt, dateEnd))
    );

    let focusSecs = 0, totalSecs = 0;
    const notes: string[] = [];
    let lastEndedAt: Date | null = null;
    for (const s of sessionRows) {
      if (isFocusSession(s.type)) focusSecs += s.durationSeconds ?? 0;
      totalSecs += s.durationSeconds ?? 0;
      if (s.notes) notes.push(s.notes);
      if (!lastEndedAt || s.createdAt > lastEndedAt) lastEndedAt = s.createdAt;
    }

    const focusRatio = totalSecs > 0 ? focusSecs / totalSecs : 0;
    const scoreInputs = { debriefText: debrief.summary, focusRatio: Math.round(focusRatio * 1000) / 1000, focusSecs, totalSecs, sessionCount: sessionRows.length, notes };
    const inputHash = makeHash(scoreInputs);

    if (debrief.aiScore != null && debrief.aiScoreInputHash === inputHash) {
      res.json({ score: debrief.aiScore, stale: false, cached: true });
      return;
    }

    const prompt = `You are a productivity coach scoring a person's focus day.

Data:
- Focus ratio: ${Math.round(focusRatio * 100)}% (${Math.round(focusSecs / 60)} of ${Math.round(totalSecs / 60)} minutes were focused)
- Sessions completed: ${sessionRows.length}
- Session notes: ${notes.length > 0 ? notes.map((n) => `"${n}"`).join("; ") : "None"}
- End-of-day debrief: "${debrief.summary}"

Score this day from 0 to 100. Return ONLY valid JSON with no preamble:
{"score": <integer 0-100>, "reasoning": "<one sentence, max 20 words>"}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    let score = 50, reasoning: string | undefined;
    try {
      const parsed = JSON.parse(raw);
      score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
      reasoning = parsed.reasoning;
    } catch {
      const match = raw.match(/\d+/);
      if (match) score = Math.min(100, parseInt(match[0]));
    }

    await db.update(debriefsTable).set({ aiScore: score, aiScoreComputedAt: new Date(), aiScoreInputHash: inputHash }).where(eq(debriefsTable.id, id));

    res.json({ score, reasoning, stale: false, cached: false });
  } catch (err) {
    console.error("[POST /debriefs/:id/score]", err);
    res.status(500).json({ error: "Scoring failed" });
  }
});

// ── POST /debriefs/period-score ──────────────────────────────────────────────

router.post("/debriefs/period-score", async (req, res) => {
  try {
    const { period, date } = req.body as { period: "day" | "week" | "month"; date: string };
    if (!period || !date) { res.status(400).json({ error: "period and date required" }); return; }

    const anchor = parseISO(date);
    let start: string, end: string;
    if (period === "day") { start = end = date; }
    else if (period === "week") {
      start = format(startOfWeek(anchor, { weekStartsOn: 1 }), "yyyy-MM-dd");
      end = format(endOfWeek(anchor, { weekStartsOn: 1 }), "yyyy-MM-dd");
    } else {
      start = format(startOfMonth(anchor), "yyyy-MM-dd");
      end = format(endOfMonth(anchor), "yyyy-MM-dd");
    }

    const debriefRows = await db.select().from(debriefsTable).where(and(gte(debriefsTable.date, start), lte(debriefsTable.date, end)));

    const { from: rangeFrom } = istDayToUTCRange(start);
    const { to: rangeTo } = istDayToUTCRange(end);
    const sessionRows = await db.select().from(sessionsTable).where(
      and(gte(sessionsTable.createdAt, rangeFrom), lte(sessionsTable.createdAt, rangeTo))
    );

    let focusSecs = 0, totalSecs = 0;
    const allNotes: string[] = [];
    let lastEndedAt: Date | null = null;
    for (const s of sessionRows) {
      if (isFocusSession(s.type)) focusSecs += s.durationSeconds ?? 0;
      totalSecs += s.durationSeconds ?? 0;
      if (s.notes) allNotes.push(s.notes);
      if (!lastEndedAt || s.createdAt > lastEndedAt) lastEndedAt = s.createdAt;
    }

    const debriefTexts = debriefRows.map((d) => `[${d.date}]: ${d.summary}`);
    const focusRatio = totalSecs > 0 ? focusSecs / totalSecs : 0;
    const scoreInputs = { period, start, end, focusRatio: Math.round(focusRatio * 1000) / 1000, focusSecs, totalSecs, sessionCount: sessionRows.length, notes: allNotes, debriefs: debriefTexts };
    const inputHash = makeHash(scoreInputs);

    const [cached] = await db.select().from(periodScoresTable).where(
      and(eq(periodScoresTable.period, period), eq(periodScoresTable.periodStart, start))
    );

    if (cached?.score != null && cached.inputHash === inputHash) {
      res.json({ score: cached.score, reasoning: cached.reasoning, stale: false, cached: true });
      return;
    }

    const stale = cached?.score != null && lastEndedAt != null && cached.lastSessionAtCompute != null && lastEndedAt > cached.lastSessionAtCompute;

    const prompt = `You are a productivity coach scoring a person's ${period} of focus work.

Summary (${start} to ${end}):
- Overall focus ratio: ${Math.round(focusRatio * 100)}%
- Total focused time: ${Math.round(focusSecs / 60)} minutes across ${sessionRows.length} sessions
- Session notes: ${allNotes.length > 0 ? allNotes.slice(0, 8).join("; ") : "None"}
- Debriefs: ${debriefTexts.length > 0 ? debriefTexts.join(" | ") : "None"}

Score this ${period} from 0 to 100. Return ONLY valid JSON:
{"score": <integer 0-100>, "reasoning": "<one sentence, max 25 words>"}`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 120,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content.filter((b) => b.type === "text").map((b: any) => b.text).join("");
    let score = 50, reasoning: string | undefined;
    try {
      const parsed = JSON.parse(raw);
      score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
      reasoning = parsed.reasoning;
    } catch {
      const match = raw.match(/\d+/);
      if (match) score = Math.min(100, parseInt(match[0]));
    }

    const now = new Date();
    await db.insert(periodScoresTable).values({
      period, periodStart: start, periodEnd: end, score, reasoning,
      computedAt: now, inputHash, lastSessionAtCompute: lastEndedAt,
    }).onConflictDoUpdate({
      target: [periodScoresTable.period, periodScoresTable.periodStart],
      set: { score, reasoning, computedAt: now, inputHash, lastSessionAtCompute: lastEndedAt },
    });

    res.json({ score, reasoning, stale: !!stale, cached: false });
  } catch (err) {
    console.error("[POST /debriefs/period-score]", err);
    res.status(500).json({ error: "Scoring failed" });
  }
});

export default router;
