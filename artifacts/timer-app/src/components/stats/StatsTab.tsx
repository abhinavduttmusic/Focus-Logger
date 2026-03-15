import { useMemo, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Clock, Flame, Target, Zap, BarChart2 } from "lucide-react";
import { useListSessions } from "@workspace/api-client-react";
import type { Session } from "@workspace/api-client-react/src/generated/api.schemas";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function isFocus(s: Session) {
  return s.type === "simple" || s.type === "pomodoro_focus";
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ─── derived stats ───────────────────────────────────────────────────────────

function computeStats(sessions: Session[]) {
  const now = new Date();
  const todayStart = startOfDay(now);

  // 1 — Today
  const todayFocus = sessions.filter(
    (s) => isFocus(s) && new Date(s.createdAt) >= todayStart
  );
  const totalFocusToday = todayFocus.reduce((a, s) => a + s.durationSeconds, 0);
  const sessionsToday = todayFocus.length;
  const longestToday = Math.max(0, ...todayFocus.map((s) => s.durationSeconds));

  // 2 — Weekly (Mon → Sun of current week)
  const weekStart = new Date(todayStart);
  const dow = (weekStart.getDay() + 6) % 7; // Mon=0
  weekStart.setDate(weekStart.getDate() - dow);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyData = DAYS.map((label, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const seconds = sessions
      .filter((s) => isFocus(s) && sameDay(new Date(s.createdAt), day))
      .reduce((a, s) => a + s.durationSeconds, 0);
    const isToday = sameDay(day, now);
    return { label, seconds, isToday };
  });

  // 3 — Time by project (all time, top 5)
  const focusSessions = sessions.filter(isFocus);
  const projectMap = new Map<string, number>();
  for (const s of focusSessions) {
    const key = s.projectName ?? s.taskName ?? "Independent Tasks";
    projectMap.set(key, (projectMap.get(key) ?? 0) + s.durationSeconds);
  }
  const projectData = [...projectMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, seconds]) => ({ name, seconds }));
  const maxProjectSeconds = Math.max(1, ...projectData.map((p) => p.seconds));

  // 4 — Insights
  const avgSession =
    focusSessions.length > 0
      ? Math.round(
          focusSessions.reduce((a, s) => a + s.durationSeconds, 0) /
            focusSessions.length
        )
      : 0;

  // Most productive hour: group by start-hour (createdAt − duration)
  const hourTotals = new Array(24).fill(0);
  for (const s of focusSessions) {
    const endMs = new Date(s.createdAt).getTime();
    const startMs = endMs - s.durationSeconds * 1000;
    const startHour = new Date(startMs).getHours();
    hourTotals[startHour] += s.durationSeconds;
  }
  let peakHour = -1;
  let peakTotal = 0;
  for (let h = 0; h < 24; h++) {
    if (hourTotals[h] > peakTotal) {
      peakTotal = hourTotals[h];
      peakHour = h;
    }
  }
  const mostProductiveTime =
    peakHour >= 0
      ? `${formatHour(peakHour)} – ${formatHour(peakHour + 1)}`
      : null;

  // Pomodoro completion rate
  const pomFocus = sessions.filter((s) => s.type === "pomodoro_focus").length;
  const pomBreak = sessions.filter((s) => s.type === "pomodoro_break").length;
  const pomTotal = pomFocus + pomBreak;
  const pomRate = pomTotal > 0 ? Math.round((pomFocus / pomTotal) * 100) : null;

  return {
    totalFocusToday,
    sessionsToday,
    longestToday,
    weeklyData,
    projectData,
    maxProjectSeconds,
    avgSession,
    mostProductiveTime,
    pomRate,
  };
}

// ─── animation constants ─────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  return (
    <motion.div
      ref={ref}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      transition={{ duration: 0.22, ease: EASE, delay }}
      className={cn(
        "bg-card rounded-[18px] border border-border/25 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-5",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-4">
      {children}
    </p>
  );
}

// Today's Focus — three metric tiles
function TodayFocusCard({
  totalFocusToday,
  sessionsToday,
  longestToday,
  delay,
}: {
  totalFocusToday: number;
  sessionsToday: number;
  longestToday: number;
  delay: number;
}) {
  const metrics = [
    {
      label: "Focus Time",
      value: formatDuration(totalFocusToday),
      Icon: Flame,
      color: "text-violet-500",
    },
    {
      label: "Sessions",
      value: sessionsToday === 0 ? "0" : String(sessionsToday),
      Icon: BarChart2,
      color: "text-blue-500",
    },
    {
      label: "Longest",
      value: longestToday > 0 ? formatDuration(longestToday) : "—",
      Icon: Clock,
      color: "text-emerald-500",
    },
  ];

  return (
    <StatCard delay={delay}>
      <SectionTitle>Today's Focus</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(({ label, value, Icon, color }) => (
          <div
            key={label}
            className="flex flex-col items-center gap-1.5 py-3 rounded-[14px] bg-secondary/40"
          >
            <Icon className={cn("w-4 h-4", color)} strokeWidth={2} />
            <span className="text-[22px] font-bold tracking-tight leading-none tabular-nums">
              {value}
            </span>
            <span className="text-[10px] font-medium text-muted-foreground/60 text-center leading-tight">
              {label}
            </span>
          </div>
        ))}
      </div>
    </StatCard>
  );
}

// Weekly bar chart
function WeeklyOverviewCard({
  weeklyData,
  delay,
}: {
  weeklyData: { label: string; seconds: number; isToday: boolean }[];
  delay: number;
}) {
  const maxSec = Math.max(1, ...weeklyData.map((d) => d.seconds));

  return (
    <StatCard delay={delay}>
      <SectionTitle>Weekly Overview</SectionTitle>
      <div className="flex items-end gap-1.5 h-28">
        {weeklyData.map(({ label, seconds, isToday }) => {
          const pct = seconds / maxSec;
          return (
            <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex-1 flex items-end rounded-t-sm overflow-hidden">
                <div className="w-full flex items-end rounded-[5px] overflow-hidden bg-secondary/40 h-full">
                  <motion.div
                    className={cn(
                      "w-full rounded-[5px]",
                      isToday
                        ? "bg-primary"
                        : "bg-primary/30"
                    )}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(pct * 100, seconds > 0 ? 4 : 0)}%` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: delay + 0.1 }}
                    style={{ minHeight: seconds > 0 ? 4 : 0 }}
                  />
                </div>
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium",
                  isToday ? "text-primary font-semibold" : "text-muted-foreground/50"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 text-right">
        <span className="text-[10px] text-muted-foreground/40">
          {formatDuration(weeklyData.reduce((a, d) => a + d.seconds, 0))} this week
        </span>
      </div>
    </StatCard>
  );
}

// Accent colors — one per row (matches project palette)
const BAR_COLORS = [
  "bg-indigo-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-blue-500",
];

// Time by project — horizontal progress bars
function TimeByProjectCard({
  projectData,
  maxProjectSeconds,
  delay,
}: {
  projectData: { name: string; seconds: number }[];
  maxProjectSeconds: number;
  delay: number;
}) {
  return (
    <StatCard delay={delay}>
      <SectionTitle>Time by Project</SectionTitle>
      {projectData.length === 0 ? (
        <p className="text-sm text-muted-foreground/50 text-center py-4">
          No sessions recorded yet
        </p>
      ) : (
        <div className="space-y-3.5">
          {projectData.map(({ name, seconds }, i) => {
            const pct = (seconds / maxProjectSeconds) * 100;
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-medium text-foreground/80 truncate max-w-[65%]">
                    {name}
                  </span>
                  <span className="text-[12px] font-semibold tabular-nums text-muted-foreground/70">
                    {formatDuration(seconds)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <motion.div
                    className={cn("h-full rounded-full", BAR_COLORS[i % BAR_COLORS.length])}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: delay + i * 0.04 }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}

// Focus Insights — key metric tiles with icons
function InsightsCard({
  avgSession,
  mostProductiveTime,
  pomRate,
  delay,
}: {
  avgSession: number;
  mostProductiveTime: string | null;
  pomRate: number | null;
  delay: number;
}) {
  const insights = [
    {
      label: "Avg Session",
      value: avgSession > 0 ? formatDuration(avgSession) : "—",
      Icon: Clock,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: "Peak Hours",
      value: mostProductiveTime ?? "—",
      Icon: Zap,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Pomodoro Rate",
      value: pomRate !== null ? `${pomRate}%` : "—",
      Icon: Target,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
  ];

  return (
    <StatCard delay={delay}>
      <SectionTitle>Focus Insights</SectionTitle>
      <div className="space-y-3">
        {insights.map(({ label, value, Icon, color, bg }) => (
          <div
            key={label}
            className="flex items-center gap-3 p-3 rounded-[12px] bg-secondary/30"
          >
            <div className={cn("w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0", bg)}>
              <Icon className={cn("w-4 h-4", color)} strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-muted-foreground/55 font-medium">{label}</p>
              <p className="text-[15px] font-semibold leading-tight tabular-nums">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </StatCard>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function StatsTab() {
  const { data: sessions = [] } = useListSessions();

  const stats = useMemo(() => computeStats(sessions), [sessions]);

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="w-full max-w-lg mx-auto pt-4 pb-10 px-4 sm:px-6 space-y-4">
        <TodayFocusCard
          totalFocusToday={stats.totalFocusToday}
          sessionsToday={stats.sessionsToday}
          longestToday={stats.longestToday}
          delay={0}
        />
        <WeeklyOverviewCard weeklyData={stats.weeklyData} delay={0.06} />
        <TimeByProjectCard
          projectData={stats.projectData}
          maxProjectSeconds={stats.maxProjectSeconds}
          delay={0.12}
        />
        <InsightsCard
          avgSession={stats.avgSession}
          mostProductiveTime={stats.mostProductiveTime}
          pomRate={stats.pomRate}
          delay={0.18}
        />
      </div>
    </div>
  );
}
