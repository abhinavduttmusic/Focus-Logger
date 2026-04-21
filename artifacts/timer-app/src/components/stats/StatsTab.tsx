import { useMemo, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Clock, Flame, Target, Zap, BarChart2, ChevronLeft, ChevronRight, Sparkles, ChevronRight as ChevronRightIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useListSessions } from "@workspace/api-client-react";
import type { Session } from "@workspace/api-client-react/src/generated/api.schemas";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL;

interface DebriefRecord {
  id: number;
  date: string;
  summary: string;
  totalFocusSeconds: number;
  totalBreakSeconds: number;
  focusCount: number;
  breakCount: number;
  createdAt: string;
}

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

function isBreak(s: Session) {
  return s.type === "manual_break" || s.type === "pomodoro_break";
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfWeek(d: Date): Date {
  const c = new Date(d);
  const dow = (c.getDay() + 6) % 7;
  c.setDate(c.getDate() - dow);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfMonth(d: Date): Date {
  const c = new Date(d);
  c.setDate(1);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfQuarter(d: Date): Date {
  const c = new Date(d);
  const quarterFirstMonth = Math.floor(c.getMonth() / 3) * 3;
  c.setMonth(quarterFirstMonth, 1);
  c.setHours(0, 0, 0, 0);
  return c;
}

function startOfYear(d: Date): Date {
  const c = new Date(d);
  c.setMonth(0, 1);
  c.setHours(0, 0, 0, 0);
  return c;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

// ─── Period navigation ───────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month" | "quarter" | "year";

const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  day: "Daily",
  week: "Weekly",
  month: "Monthly",
  quarter: "Quarterly",
  year: "Yearly",
};

function getPeriodStart(mode: ViewMode, offset: number): Date {
  const now = new Date();
  switch (mode) {
    case "day": {
      const d = startOfDay(now);
      d.setDate(d.getDate() + offset);
      return d;
    }
    case "week": {
      const d = startOfWeek(now);
      d.setDate(d.getDate() + offset * 7);
      return d;
    }
    case "month": {
      const d = startOfMonth(now);
      d.setMonth(d.getMonth() + offset);
      return d;
    }
    case "quarter": {
      const d = startOfQuarter(now);
      d.setMonth(d.getMonth() + offset * 3);
      return d;
    }
    case "year": {
      const d = startOfYear(now);
      d.setFullYear(d.getFullYear() + offset);
      return d;
    }
  }
}

function getPeriodEnd(mode: ViewMode, start: Date): Date {
  const end = new Date(start);
  switch (mode) {
    case "day":
      end.setDate(end.getDate() + 1);
      break;
    case "week":
      end.setDate(end.getDate() + 7);
      break;
    case "month":
      end.setMonth(end.getMonth() + 1);
      break;
    case "quarter":
      end.setMonth(end.getMonth() + 3);
      break;
    case "year":
      end.setFullYear(end.getFullYear() + 1);
      break;
  }
  return end;
}

function getPeriodLabel(mode: ViewMode, start: Date): string {
  const now = new Date();
  switch (mode) {
    case "day":
      if (sameDay(start, now)) return "Today";
      if (sameDay(start, new Date(now.getTime() - 86400000))) return "Yesterday";
      return start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    case "week": {
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const isThisWeek = start <= now && now < getPeriodEnd("week", start);
      if (isThisWeek) return "This Week";
      return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    case "month": {
      const isThisMonth = start.getMonth() === now.getMonth() && start.getFullYear() === now.getFullYear();
      if (isThisMonth) return "This Month";
      return start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    }
    case "quarter": {
      const q = Math.floor(start.getMonth() / 3) + 1;
      const isThisQuarter = start <= now && now < getPeriodEnd("quarter", start);
      if (isThisQuarter) return "This Quarter";
      return `Q${q} ${start.getFullYear()}`;
    }
    case "year": {
      const isThisYear = start.getFullYear() === now.getFullYear();
      if (isThisYear) return "This Year";
      return String(start.getFullYear());
    }
  }
}

function getSessionsInPeriod(sessions: Session[], start: Date, end: Date): Session[] {
  return sessions.filter(s => {
    const d = new Date(s.createdAt);
    return d >= start && d < end;
  });
}

// ─── animation constants ──────────────────────────────────────────────────────

const EASE = [0.22, 1, 0.36, 1] as const;
const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

// ─── sub-components ───────────────────────────────────────────────────────────

function StatCard({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -40px 0px" });
  return (
    <motion.div
      ref={ref}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      transition={{ duration: 0.22, ease: EASE, delay }}
      className={cn("bg-card rounded-[18px] border border-border/25 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-5", className)}
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

// ─── View Mode Selector ───────────────────────────────────────────────────────

function ViewModeSelector({ value, onChange }: { value: ViewMode; onChange: (v: ViewMode) => void }) {
  const modes = Object.keys(VIEW_MODE_LABELS) as ViewMode[];
  return (
    <div className="relative flex items-center p-1 bg-secondary/40 rounded-full w-full">
      <motion.div
        className="absolute bg-card shadow-sm rounded-full"
        layoutId="view-mode-pill"
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        style={{
          width: `${100 / modes.length}%`,
          height: 'calc(100% - 8px)',
          top: '4px',
          left: `calc(${modes.indexOf(value)} * ${100 / modes.length}%)`,
        }}
      />
      {modes.map((mode) => (
        <button
          key={mode}
          onClick={() => {
            if (navigator.vibrate) navigator.vibrate(6);
            onChange(mode);
          }}
          className={cn(
            "relative z-10 flex-1 py-1.5 rounded-full text-[11px] font-medium transition-colors duration-200 whitespace-nowrap",
            value === mode ? "text-foreground" : "text-muted-foreground/60 hover:text-muted-foreground"
          )}
        >
          {VIEW_MODE_LABELS[mode]}
        </button>
      ))}
    </div>
  );
}

// ─── Period Navigator ─────────────────────────────────────────────────────────

function PeriodNavigator({ mode, offset, onPrev, onNext }: {
  mode: ViewMode;
  offset: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const start = getPeriodStart(mode, offset);
  const label = getPeriodLabel(mode, start);
  const isCurrentPeriod = offset === 0;

  return (
    <div className="flex items-center justify-between px-1">
      <motion.button
        onClick={() => { if (navigator.vibrate) navigator.vibrate(4); onPrev(); }}
        whileTap={{ scale: 0.88 }}
        className="p-2 rounded-xl hover:bg-secondary/60 text-muted-foreground/60 hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
      </motion.button>

      <div className="text-center">
        <p className="text-[15px] font-semibold text-foreground">{label}</p>
      </div>

      <motion.button
        onClick={() => { if (navigator.vibrate) navigator.vibrate(4); onNext(); }}
        whileTap={{ scale: 0.88 }}
        disabled={isCurrentPeriod}
        className={cn(
          "p-2 rounded-xl transition-colors",
          isCurrentPeriod
            ? "text-muted-foreground/20 cursor-not-allowed"
            : "hover:bg-secondary/60 text-muted-foreground/60 hover:text-foreground"
        )}
      >
        <ChevronRight className="w-5 h-5" />
      </motion.button>
    </div>
  );
}

// ─── Focus Summary Card ───────────────────────────────────────────────────────

function TodayFocusCard({ sessions, delay }: { sessions: Session[]; delay: number }) {
  const focusSessions = sessions.filter(isFocus);
  const totalFocus = focusSessions.reduce((a, s) => a + s.durationSeconds, 0);
  const sessionCount = focusSessions.length;
  const longest = Math.max(0, ...focusSessions.map(s => s.durationSeconds));

  const metrics = [
    { label: "Focus Time", value: formatDuration(totalFocus), Icon: Flame, color: "text-violet-500" },
    { label: "Sessions", value: sessionCount === 0 ? "0" : String(sessionCount), Icon: BarChart2, color: "text-blue-500" },
    { label: "Longest", value: longest > 0 ? formatDuration(longest) : "—", Icon: Clock, color: "text-emerald-500" },
  ];

  return (
    <StatCard delay={delay}>
      <SectionTitle>Focus Summary</SectionTitle>
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(({ label, value, Icon, color }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 py-3 rounded-[14px] bg-secondary/40">
            <Icon className={cn("w-4 h-4", color)} strokeWidth={2} />
            <span className="text-[22px] font-bold tracking-tight leading-none tabular-nums">{value}</span>
            <span className="text-[10px] font-medium text-muted-foreground/60 text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>
    </StatCard>
  );
}

// ─── Break Summary Card ──────────────────────────────────────────────────────

function BreakSummaryCard({ sessions, focusSessions, delay }: { sessions: Session[]; focusSessions: Session[]; delay: number }) {
  const breakSessions = sessions.filter(isBreak);
  const totalBreakTime = breakSessions.reduce((a, s) => a + s.durationSeconds, 0);
  const breakCount = breakSessions.length;
  const avgBreak = breakCount > 0 ? Math.round(totalBreakTime / breakCount) : 0;
  const totalFocusTime = focusSessions.reduce((a, s) => a + s.durationSeconds, 0);
  const ratio = totalBreakTime > 0 ? (totalFocusTime / totalBreakTime).toFixed(1) : null;

  const breakMap = new Map<string, number>();
  for (const s of breakSessions) {
    const label = s.type === "pomodoro_break"
      ? "Pomodoro Break"
      : (s.notes?.trim() || "Break");
    const key = label;
    breakMap.set(key, (breakMap.get(key) ?? 0) + s.durationSeconds);
  }
  const breakTypes = [...breakMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, seconds]) => ({ name, seconds }));

  if (breakCount === 0) return (
    <StatCard delay={delay}>
      <SectionTitle>Break Activity</SectionTitle>
      <p className="text-sm text-muted-foreground/50 text-center py-4">No breaks recorded yet</p>
    </StatCard>
  );

  return (
    <StatCard delay={delay}>
      <SectionTitle>Break Activity</SectionTitle>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {[
          { label: "Breaks", value: String(breakCount) },
          { label: "Total Time", value: formatDuration(totalBreakTime) },
          { label: "Avg Break", value: avgBreak > 0 ? formatDuration(avgBreak) : "—" },
        ].map(({ label, value }) => (
          <div key={label} className="flex flex-col items-center gap-1 py-2.5 rounded-[14px] bg-secondary/40">
            <span className="text-[18px] font-bold tracking-tight leading-none tabular-nums">{value}</span>
            <span className="text-[10px] font-medium text-muted-foreground/60 text-center leading-tight">{label}</span>
          </div>
        ))}
      </div>

      {ratio && (
        <div className="flex items-center gap-3 p-3 rounded-[12px] bg-secondary/30 mb-4">
          <div className="w-8 h-8 rounded-[10px] bg-blue-500/10 flex items-center justify-center shrink-0">
            <span className="text-blue-500 text-sm font-bold">{ratio}:1</span>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground/55 font-medium">Focus to Break Ratio</p>
            <p className="text-[13px] font-semibold leading-tight">
              {Number(ratio) >= 3
                ? "Great discipline — well balanced"
                : Number(ratio) >= 1.5
                ? "Good balance of work and rest"
                : "Consider longer focus blocks"}
            </p>
          </div>
        </div>
      )}

      {breakTypes.length > 0 && (
        <div className="space-y-2.5">
          {breakTypes.map(({ name, seconds }) => {
            const pct = totalBreakTime > 0 ? (seconds / totalBreakTime) * 100 : 0;
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[12px] font-medium text-foreground/80 truncate max-w-[65%]">{name}</span>
                  <span className="text-[11px] tabular-nums text-muted-foreground/60">{formatDuration(seconds)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(to right, #0ea5e9, #38bdf8)' }}
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.5, ease: "easeOut", delay: delay + 0.05 }}
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

// ─── Bar Chart Card ───────────────────────────────────────────────────────────

function BarChartCard({ sessions, mode, periodStart, delay }: {
  sessions: Session[];
  mode: ViewMode;
  periodStart: Date;
  delay: number;
}) {
  const focusSessions = sessions.filter(isFocus);
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  const bars = useMemo(() => {
    switch (mode) {
      case "day": {
        return Array.from({ length: 24 }, (_, h) => {
          const secs = focusSessions
            .filter(s => new Date(s.createdAt).getHours() === h)
            .reduce((a, s) => a + s.durationSeconds, 0);
          return { label: String(h).padStart(2, "0"), seconds: secs };
        });
      }
      case "week": {
        const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return DAYS.map((label, i) => {
          const day = new Date(periodStart);
          day.setDate(day.getDate() + i);
          const dayStart = new Date(day);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(day);
          dayEnd.setHours(23, 59, 59, 999);
          const secs = focusSessions
            .filter(s => {
              const d = new Date(s.createdAt);
              return d >= dayStart && d <= dayEnd;
            })
            .reduce((a, s) => a + s.durationSeconds, 0);
          return { label, seconds: secs };
        });
      }
      case "month": {
        const daysInMonth = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, i) => {
          const dayStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), i + 1, 0, 0, 0, 0);
          const dayEnd = new Date(periodStart.getFullYear(), periodStart.getMonth(), i + 1, 23, 59, 59, 999);
          const secs = focusSessions
            .filter(s => {
              const d = new Date(s.createdAt);
              return d >= dayStart && d <= dayEnd;
            })
            .reduce((a, s) => a + s.durationSeconds, 0);
          return { label: String(i + 1), seconds: secs };
        });
      }
      case "quarter": {
        const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return Array.from({ length: 3 }, (_, i) => {
          const month = periodStart.getMonth() + i;
          const secs = focusSessions
            .filter(s => new Date(s.createdAt).getMonth() === month && new Date(s.createdAt).getFullYear() === periodStart.getFullYear())
            .reduce((a, s) => a + s.durationSeconds, 0);
          return { label: MONTHS[month], seconds: secs };
        });
      }
      case "year": {
        const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return MONTHS.map((label, i) => {
          const secs = focusSessions
            .filter(s => new Date(s.createdAt).getMonth() === i && new Date(s.createdAt).getFullYear() === periodStart.getFullYear())
            .reduce((a, s) => a + s.durationSeconds, 0);
          return { label, seconds: secs };
        });
      }
    }
  }, [focusSessions, mode, periodStart]);

  const maxSec = Math.max(1, ...bars.map(b => b.seconds));
  const MAX_H = 100;
  const totalSeconds = bars.reduce((a, b) => a + b.seconds, 0);

  const title = {
    day: "Hourly Breakdown",
    week: "Daily Breakdown",
    month: "Daily Breakdown",
    quarter: "Monthly Breakdown",
    year: "Monthly Breakdown",
  }[mode];

  return (
    <StatCard delay={delay} className="overflow-visible">
      <SectionTitle>{title}</SectionTitle>
      {mode === "day" ? (
        <div className="flex items-stretch gap-0.5" style={{ height: MAX_H }}>
          {bars.map(({ label, seconds }, i) => {
            const fillH = seconds > 0 ? Math.max(3, Math.round((seconds / maxSec) * MAX_H)) : 0;
            return (
              <div
                key={i}
                className="flex-1 flex flex-col justify-between rounded-sm overflow-hidden relative"
                style={{ backgroundColor: '#F0EFED' }}
                onClick={() => setSelectedBar(selectedBar === i ? null : i)}
              >
                <span className="text-center font-medium leading-none pt-0.5" style={{ fontSize: '7px', color: '#6B7280' }}>
                  {label}
                </span>
                <motion.div
                  className="w-full rounded-sm"
                  style={{ backgroundColor: '#4A9FD4' }}
                  initial={{ height: 0 }}
                  animate={{ height: fillH }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: delay + i * 0.01 }}
                />
                {selectedBar === i && seconds > 0 && (
                  <span className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 text-[8px] font-semibold text-foreground bg-card shadow rounded px-1 py-0.5 whitespace-nowrap z-10">
                    {formatDuration(seconds)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: mode === "month" ? '2px' : '4px',
            overflowX: mode === "month" ? 'auto' : 'visible',
            height: '120px',
            paddingTop: '16px',
            boxSizing: 'border-box',
            touchAction: mode === "month" ? 'pan-x' : 'none',
          }}
          onTouchStart={(e) => { if (mode === "month") e.stopPropagation(); }}
          onTouchMove={(e) => { if (mode === "month") e.stopPropagation(); }}
          onTouchEnd={(e) => { if (mode === "month") e.stopPropagation(); }}
        >
          {bars.map(({ label, seconds }, i) => {
            const barH = seconds > 0 ? Math.max(3, Math.round((seconds / maxSec) * 88)) : 0;
            return (
              <div
                key={i}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(4);
                  setSelectedBar(selectedBar === i ? null : i);
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  minWidth: mode === "month" ? '18px' : undefined,
                  flex: mode === "month" ? 'none' : 1,
                  cursor: 'pointer',
                }}
              >
                <motion.div
                  style={{
                    width: '100%',
                    borderRadius: '4px',
                    backgroundColor: 'hsl(152 45% 38%)',
                    height: barH,
                  }}
                  initial={{ height: 0 }}
                  animate={{ height: barH }}
                  transition={{ duration: 0.4, ease: "easeOut", delay: delay + i * 0.02 }}
                />
                <span style={{
                  fontSize: '9px',
                  color: selectedBar === i && seconds > 0 ? '#374151' : '#9ca3af',
                  fontWeight: selectedBar === i && seconds > 0 ? 600 : 400,
                  width: '100%',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {selectedBar === i && seconds > 0 ? formatDuration(seconds) : label}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-3 text-right">
        <span className="text-[10px] text-muted-foreground/40">
          {formatDuration(totalSeconds)} total
        </span>
      </div>
    </StatCard>
  );
}

// ─── Time by Project Card ─────────────────────────────────────────────────────

function TimeByProjectCard({ sessions, delay }: { sessions: Session[]; delay: number }) {
  const focusSessions = sessions.filter(isFocus);
  const projectMap = new Map<string, number>();
  for (const s of focusSessions) {
    const key = s.projectName ?? s.taskName ?? "Independent Tasks";
    projectMap.set(key, (projectMap.get(key) ?? 0) + s.durationSeconds);
  }
  const projectData = [...projectMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, seconds]) => ({ name, seconds }));
  const maxSec = Math.max(1, ...projectData.map(p => p.seconds));

  return (
    <StatCard delay={delay}>
      <SectionTitle>Time by Project</SectionTitle>
      {projectData.length === 0 ? (
        <p className="text-sm text-muted-foreground/50 text-center py-4">No sessions recorded yet</p>
      ) : (
        <div className="space-y-3.5">
          {projectData.map(({ name, seconds }, i) => {
            const pct = (seconds / maxSec) * 100;
            return (
              <div key={name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-medium text-foreground/80 truncate max-w-[65%]">{name}</span>
                  <span className="text-[12px] font-semibold tabular-nums text-muted-foreground/70">{formatDuration(seconds)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: 'linear-gradient(to right, #4f46e5, #7c3aed)', opacity: Math.max(0.4, 1 - i * 0.12) }}
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

// ─── Average by Day Card ──────────────────────────────────────────────────────

function AvgByDayCard({ sessions, delay }: { sessions: Session[]; delay: number }) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const focusSessions = sessions.filter(isFocus);

  const dayTotals = DAYS.map((label, i) => {
    const daySessions = focusSessions.filter(s => (new Date(s.createdAt).getDay() + 6) % 7 === i);
    const total = daySessions.reduce((a, s) => a + s.durationSeconds, 0);
    return { label, seconds: total };
  });

  const maxSec = Math.max(1, ...dayTotals.map(d => d.seconds));

  return (
    <StatCard delay={delay}>
      <SectionTitle>By Day of Week</SectionTitle>
      <div className="space-y-2">
        {dayTotals.map(({ label, seconds }) => {
          const pct = (seconds / maxSec) * 100;
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground/60 w-8 shrink-0">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-secondary/60 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(to right, #d97706, #f59e0b)" }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, ease: "easeOut", delay: delay + 0.05 }}
                />
              </div>
              <span className="text-[11px] font-medium tabular-nums text-muted-foreground/70 w-12 text-right shrink-0">
                {formatDuration(seconds)}
              </span>
            </div>
          );
        })}
      </div>
    </StatCard>
  );
}

// ─── Insights Card ────────────────────────────────────────────────────────────

function InsightsCard({ sessions, delay }: { sessions: Session[]; delay: number }) {
  const focusSessions = sessions.filter(isFocus);
  const avgSession = focusSessions.length > 0
    ? Math.round(focusSessions.reduce((a, s) => a + s.durationSeconds, 0) / focusSessions.length)
    : 0;

  const hourTotals = new Array(24).fill(0);
  for (const s of focusSessions) {
    const endMs = new Date(s.createdAt).getTime();
    const startMs = endMs - s.durationSeconds * 1000;

    // Distribute session time across all hours it spans
    let cursor = startMs;
    while (cursor < endMs) {
      const cursorDate = new Date(cursor);
      const hour = cursorDate.getHours();
      const nextHourMs = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate(), hour + 1, 0, 0, 0).getTime();
      const sliceEnd = Math.min(nextHourMs, endMs);
      const sliceSecs = (sliceEnd - cursor) / 1000;
      hourTotals[hour] += sliceSecs;
      cursor = sliceEnd;
    }
  }
  let peakHour = -1;
  let peakTotal = 0;
  for (let h = 0; h < 24; h++) {
    if (hourTotals[h] > peakTotal) { peakTotal = hourTotals[h]; peakHour = h; }
  }
  const mostProductiveTime = peakHour >= 0 ? `${formatHour(peakHour)} – ${formatHour(peakHour + 1)}` : null;

  const pomFocus = sessions.filter(s => s.type === "pomodoro_focus").length;
  const pomBreak = sessions.filter(s => s.type === "pomodoro_break").length;
  const pomTotal = pomFocus + pomBreak;
  const pomRate = pomTotal > 0 ? Math.round((pomFocus / pomTotal) * 100) : null;

  const insights = [
    { label: "Avg Session", value: avgSession > 0 ? formatDuration(avgSession) : "—", Icon: Clock, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Peak Hours", value: mostProductiveTime ?? "—", Icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Pomodoro Rate", value: pomRate !== null ? `${pomRate}%` : "—", Icon: Target, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  return (
    <StatCard delay={delay}>
      <SectionTitle>Focus Insights</SectionTitle>
      <div className="space-y-3">
        {insights.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-3 p-3 rounded-[12px] bg-secondary/30">
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

// ─── Debrief History Card ────────────────────────────────────────────────────

function DebriefHistoryCard({ delay, onView }: { delay: number; onView: (dateKey: string) => void }) {
  const { data: debriefs, error } = useQuery<DebriefRecord[]>({
    queryKey: ["daily-debriefs"],
    queryFn: async () => {
      const r = await fetch(`${BASE}api/daily-debriefs`);
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      return r.json();
    },
  });

  const formatDate = (key: string) => {
    const d = new Date(key + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(d, today)) return "Today";
    if (sameDay(d, yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <StatCard delay={delay}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Debrief History
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive/80 text-center py-4">Couldn't load debriefs.</p>
      )}

      {!error && debriefs === undefined && (
        <p className="text-sm text-muted-foreground/50 text-center py-4">Loading…</p>
      )}

      {!error && debriefs?.length === 0 && (
        <p className="text-sm text-muted-foreground/50 text-center py-4">
          No debriefs saved yet. Generate one from the timer screen.
        </p>
      )}

      {!error && debriefs && debriefs.length > 0 && (
        <div className="space-y-2">
          {debriefs.slice(0, 30).map((d) => {
            const preview = d.summary.replace(/\s+/g, " ").trim().slice(0, 90);
            return (
              <button
                key={d.id}
                onClick={() => {
                  if (navigator.vibrate) navigator.vibrate(4);
                  onView(d.date);
                }}
                className="w-full text-left flex items-center gap-3 p-3 rounded-[12px] bg-secondary/30 hover:bg-secondary/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-foreground/85">
                    {formatDate(d.date)}
                  </p>
                  <p className="text-[11px] text-muted-foreground/60 truncate">
                    {preview}{d.summary.length > 90 ? "…" : ""}
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5 tabular-nums">
                    {formatDuration(d.totalFocusSeconds)} focus · {d.focusCount} {d.focusCount === 1 ? "session" : "sessions"}
                  </p>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </StatCard>
  );
}

// ─── Main StatsTab ────────────────────────────────────────────────────────────

export function StatsTab({ onViewDebrief }: { onViewDebrief?: (dateKey: string) => void } = {}) {
  const { data: sessions = [] } = useListSessions();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [offset, setOffset] = useState(0);

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    setOffset(0);
  };

  const periodStart = useMemo(() => getPeriodStart(viewMode, offset), [viewMode, offset]);
  const periodEnd = useMemo(() => getPeriodEnd(viewMode, periodStart), [viewMode, periodStart]);
  const periodSessions = useMemo(() => getSessionsInPeriod(sessions, periodStart, periodEnd), [sessions, periodStart, periodEnd]);

  const swipeStartX = useRef<number | null>(null);
  const handleSwipeStart = (e: React.TouchEvent) => { swipeStartX.current = e.touches[0].clientX; };
  const handleSwipeEnd = (e: React.TouchEvent) => {
    if (swipeStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(dx) < 50) return;
    if (navigator.vibrate) navigator.vibrate(6);
    if (dx < 0 && offset < 0) setOffset(o => o + 1);
    else if (dx > 0) setOffset(o => o - 1);
  };

  return (
    <div
      className="absolute inset-0 overflow-y-auto"
      onTouchStart={handleSwipeStart}
      onTouchEnd={handleSwipeEnd}
    >
      <div className="w-full max-w-lg mx-auto pt-4 pb-10 px-4 sm:px-6 space-y-4">

        <ViewModeSelector value={viewMode} onChange={handleViewModeChange} />

        <PeriodNavigator
          mode={viewMode}
          offset={offset}
          onPrev={() => setOffset(o => o - 1)}
          onNext={() => setOffset(o => Math.min(0, o + 1))}
        />

        <TodayFocusCard sessions={periodSessions} delay={0} />
        <BreakSummaryCard
          sessions={periodSessions}
          focusSessions={periodSessions.filter(isFocus)}
          delay={0.06}
        />
        <BarChartCard sessions={periodSessions} mode={viewMode} periodStart={periodStart} delay={0.12} />
        <TimeByProjectCard sessions={periodSessions} delay={0.18} />
        <AvgByDayCard sessions={periodSessions} delay={0.22} />
        <InsightsCard sessions={periodSessions} delay={0.26} />
        {onViewDebrief && <DebriefHistoryCard delay={0.3} onView={onViewDebrief} />}

      </div>
    </div>
  );
}
