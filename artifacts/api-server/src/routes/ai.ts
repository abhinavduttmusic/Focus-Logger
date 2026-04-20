import { Router, type IRouter } from "express";
import Anthropic from "@anthropic-ai/sdk";

const router: IRouter = Router();

const anthropic = new Anthropic({
  baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
});

interface FocusSessionInput {
  label: string;
  durationSeconds: number;
  /** Pre-formatted in the user's local timezone by the client. */
  startedAtLabel: string;
  /** Pre-formatted in the user's local timezone by the client. */
  endedAtLabel: string;
}

interface BreakSessionInput {
  label: string;
  durationSeconds: number;
}

interface DailyDebriefBody {
  date: string;
  /** Pre-formatted in the user's local timezone by the client. */
  dayStartedAtLabel: string | null;
  totalFocusSeconds: number;
  totalBreakSeconds: number;
  focusCount: number;
  breakCount: number;
  focusSessions: FocusSessionInput[];
  breakSessions: BreakSessionInput[];
  notes: string;
}

function formatMins(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

router.post("/daily-debrief", async (req, res) => {
  try {
    const body = req.body as DailyDebriefBody;

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
- End with ONE specific actionable directive for tomorrow — make it a challenge not a compliment
- Never use "great job", "keep it up", or corporate clichés
- Write in 3-4 paragraphs maximum

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

    res.json({ summary });
  } catch (err) {
    console.error("[daily-debrief]", err);
    const msg = err instanceof Error ? err.message : "Failed to generate summary";
    res.status(500).json({ error: msg });
  }
});

export default router;
