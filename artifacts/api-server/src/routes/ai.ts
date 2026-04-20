import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { db, debriefsTable } from "@workspace/db";
import { DailyDebriefBody } from "@workspace/api-zod";
import { desc, eq } from "drizzle-orm";
import { ZodError } from "zod";

const router: IRouter = Router();

const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

if (!anthropicBaseURL || !anthropicApiKey) {
  throw new Error(
    "Missing required Anthropic env vars: AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY must both be set.",
  );
}

const anthropic = new Anthropic({
  baseURL: anthropicBaseURL,
  apiKey: anthropicApiKey,
});

function formatMins(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

router.get("/daily-debriefs", async (_req, res) => {
  const rows = await db
    .select()
    .from(debriefsTable)
    .orderBy(desc(debriefsTable.date));
  res.json(rows);
});

router.get("/daily-debriefs/:dateKey", async (req, res) => {
  const { dateKey } = req.params;
  const [row] = await db
    .select()
    .from(debriefsTable)
    .where(eq(debriefsTable.date, dateKey));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.delete("/daily-debriefs/:dateKey", async (req, res) => {
  const { dateKey } = req.params;
  await db.delete(debriefsTable).where(eq(debriefsTable.date, dateKey));
  res.status(204).send();
});

router.post("/daily-debrief", async (req, res) => {
  let body: DailyDebriefBody;
  try {
    body = DailyDebriefBody.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({
        error: "Invalid daily debrief request body",
        issues: err.issues,
      });
      return;
    }
    throw err;
  }

  try {
    if (!body.regenerate) {
      const [existing] = await db
        .select()
        .from(debriefsTable)
        .where(eq(debriefsTable.date, body.dateKey));
      if (existing) {
        res.json({ summary: existing.summary, cached: true, debrief: existing });
        return;
      }
    }

    const ratio =
      body.totalBreakSeconds > 0
        ? (body.totalFocusSeconds / body.totalBreakSeconds).toFixed(1) + ":1"
        : "No breaks taken";

    const sessionDetails =
      body.focusSessions
        .map(
          (s) =>
            `- ${s.label}: ${formatMins(s.durationSeconds)} (started ${s.startedAtLabel}, ended ${s.endedAtLabel})`
        )
        .join("\n") || "None";

    const breakDetails =
      body.breakSessions
        .map((s) => `- ${s.label}: ${formatMins(s.durationSeconds)}`)
        .join("\n") || "None";

    const prompt = `You are a Chief of Staff AI coach for a high-performing executive. Based on the session data below, write a daily debrief summary.

Voice: Professional, insightful, energized. Like a senior CoS briefing a C-suite executive.
Tone: Encouraging but grounded in reality. Call out what worked, what didn't, and give one sharp forward-looking directive.
Style: Short punchy sentences. Growth-mindset vocabulary. Collaborative "we" occasionally.

Guidelines:
- Lead with the most significant insight, not chronology
- Acknowledge genuine effort without empty praise
- Call out honestly: late starts (first session after 10am is late), long breaks (over 30 mins), task switching (4+ different projects), skewed focus/break ratio (less than 2:1 is concerning)
- Recognize momentum when sessions stack on the same task
- End with ONE specific actionable directive for tomorrow — make it a challenge not a compliment. Format it exactly like this: **Tomorrow's directive:** followed by the directive text on the same line.
- Never use "great job", "keep it up", or corporate clichés
- Write in 3-4 paragraphs maximum
- Do NOT include a heading or title line at the start — go straight into the summary content
- Do NOT write the date in your response at all

Data for ${body.date}:

Day started: ${body.dayStartedAtLabel ?? "No sessions recorded"}
Total focus time: ${formatMins(body.totalFocusSeconds)}
Total break time: ${formatMins(body.totalBreakSeconds)}
Focus to break ratio: ${ratio}
Number of focus sessions: ${body.focusCount}
Number of breaks: ${body.breakCount}

Focus sessions:
${sessionDetails}

Breaks taken:
${breakDetails}

Session notes from the user:
${body.notes || "No notes recorded"}

Write the debrief now.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const summary = block && block.type === "text" ? block.text : "Unable to generate summary.";

    const values = {
      date: body.dateKey,
      summary,
      totalFocusSeconds: body.totalFocusSeconds,
      totalBreakSeconds: body.totalBreakSeconds,
      focusCount: body.focusCount,
      breakCount: body.breakCount,
    };

    const [saved] = await db
      .insert(debriefsTable)
      .values(values)
      .onConflictDoUpdate({
        target: debriefsTable.date,
        set: {
          summary: values.summary,
          totalFocusSeconds: values.totalFocusSeconds,
          totalBreakSeconds: values.totalBreakSeconds,
          focusCount: values.focusCount,
          breakCount: values.breakCount,
          createdAt: new Date(),
        },
      })
      .returning();

    res.json({ summary, cached: false, debrief: saved });
  } catch (err) {
    console.error("[daily-debrief]", err);
    const msg = err instanceof Error ? err.message : "Failed to generate summary";
    res.status(500).json({ error: msg });
  }
});

export default router;
