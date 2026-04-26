import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, FileText, Flame } from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = "month" | "week" | "day";

interface DebriefDay {
  date: string;
  hasDebrief: boolean;
  debrief?: { id: number; text: string; updatedAt: string };
  focusRatio?: number;
  totalFocusMinutes?: number;
  totalBreakMinutes?: number;
  sessionCount?: number;
  aiScore?: number | null;
  aiScoreStale?: boolean;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); const day = r.getDay(); const diff = day === 0 ? -6 : 1 - day; r.setDate(r.getDate()+diff); r.setHours(0,0,0,0); return r; }
function endOfWeek(d: Date) { return addDays(startOfWeek(d), 6); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function isCurrentPeriod(d: Date, mode: ViewMode): boolean {
  const now = new Date();
  if (mode === "day") return toKey(d) === toKey(now);
  if (mode === "week") return toKey(startOfWeek(d)) === toKey(startOfWeek(now));
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function formatLabel(d: Date, mode: ViewMode) {
  const now = new Date();
  if (mode === "day") {
    if (toKey(d) === toKey(now)) return "Today";
    return `${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
  }
  if (mode === "week") {
    const ws = startOfWeek(d), we = endOfWeek(d), nws = startOfWeek(now);
    if (toKey(ws) === toKey(nws)) return "This Week";
    return `${MONTHS[ws.getMonth()].slice(0,3)} ${ws.getDate()} – ${MONTHS[we.getMonth()].slice(0,3)} ${we.getDate()}`;
  }
  if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) return "This Month";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function scoreAccent(score: number | null | undefined): string {
  if (score == null) return "bg-muted/60";
  if (score >= 80) return "bg-emerald-100 border-emerald-200";
  if (score >= 60) return "bg-emerald-50 border-emerald-100";
  if (score >= 40) return "bg-amber-50 border-amber-100";
  return "bg-rose-50 border-rose-100";
}

function scoreDot(score: number | null | undefined): string {
  if (score == null) return "bg-border";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-emerald-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-rose-400";
}

function ScorePip({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#34d399" : score >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0">
      <circle cx="18" cy="18" r="14" fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle cx="18" cy="18" r="14" fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${(score/100)*87.96} 87.96`} strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x="18" y="22" textAnchor="middle" fontSize="10" fill={color} fontWeight="700">{score}</text>
    </svg>
  );
}

function DebriefSheet({ day, onClose, onRefreshScore, refreshingScore }: {
  day: DebriefDay; onClose: () => void; onRefreshScore: (id: number) => void; refreshingScore: boolean;
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-card border border-border/30 rounded-t-[24px] p-5 pb-10 z-10 max-h-[85vh] overflow-y-auto shadow-[0_-8px_32px_rgba(0,0,0,0.12)]"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
      >
        <div className="w-10 h-1 bg-border rounded-full mx-auto mb-5" />
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            
            <h3 className="text-[18px] font-semibold text-foreground mt-0.5">{new Date(day.date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 mb-4">
          {[
           { label: "Focus", value: day.totalFocusMinutes != null ? `${Math.floor(day.totalFocusMinutes / 60)}h ${day.totalFocusMinutes % 60}m` : null },
            { label: "Breaks", value: day.totalBreakMinutes != null ? `${Math.floor(day.totalBreakMinutes / 60)}h ${day.totalBreakMinutes % 60}m` : null },
            { label: "Ratio", value: day.totalBreakMinutes != null && day.totalBreakMinutes > 0 && day.totalFocusMinutes != null ? `${(day.totalFocusMinutes / day.totalBreakMinutes).toFixed(1)}:1` : "—" },
            ].filter(s => s.value != null).map(({ label, value }) => (
            <div key={label} className="flex-1 bg-muted/40 rounded-[14px] p-3 border border-border/20 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className="text-foreground text-[15px] font-semibold">{value}</p>
            </div>
          ))}
        </div>

        {/* AI Score row */}
        <div className="flex items-center justify-between bg-muted/30 rounded-[14px] px-4 py-3 border border-border/20 mb-4">
          <div className="flex items-center gap-3">
            <Flame size={15} className="text-amber-400" />
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Performance Score</p>
              <p className="text-foreground text-[15px] font-semibold">{day.aiScore != null ? `${day.aiScore} / 100` : "Not computed"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {day.aiScore != null && <ScorePip score={day.aiScore} />}
            {day.debrief && (
              <button
                onClick={() => day.debrief && onRefreshScore(day.debrief.id)}
                disabled={refreshingScore}
                className={cn("text-[11px] px-3 py-1.5 rounded-full border transition-all font-medium",
                  day.aiScoreStale
                    ? "border-amber-300 text-amber-600 bg-amber-50 hover:bg-amber-100"
                    : "border-border text-muted-foreground hover:bg-muted/60"
                )}
              >
                {refreshingScore ? "Scoring…" : day.aiScore == null ? "Generate" : day.aiScoreStale ? "↻ Refresh" : "↻ Rescore"}
              </button>
            )}
          </div>
        </div>

        {/* Debrief text */}
        {day.debrief ? (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText size={12} className="text-muted-foreground" />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Debrief</p>
            </div>
            <p className="text-foreground/80 text-[14px] leading-relaxed" dangerouslySetInnerHTML={{ __html: day.debrief.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br/>') }}/>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm italic">No debrief written for this day.</p>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function DebriefsCalendar({ apiBase = "/api" }: { apiBase?: string }) {
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(new Date());
  const [days, setDays] = useState<DebriefDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DebriefDay | null>(null);
  const [refreshingScore, setRefreshingScore] = useState(false);

  const fetchRange = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/debriefs/calendar?start=${start}&end=${end}`);
      setDays(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [apiBase]);

  useEffect(() => {
    let start: string, end: string;
    if (viewMode === "month") { start = toKey(startOfMonth(cursor)); end = toKey(endOfMonth(cursor)); }
    else if (viewMode === "week") { start = toKey(startOfWeek(cursor)); end = toKey(endOfWeek(cursor)); }
    else { start = end = toKey(cursor); }
    fetchRange(start, end);
  }, [cursor, viewMode, fetchRange]);

  const goBack = () => {
    if (viewMode === "month") setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth()-1); return d; });
    else if (viewMode === "week") setCursor(c => addDays(c, -7));
    else setCursor(c => addDays(c, -1));
  };
  const goForward = () => {
    if (viewMode === "month") setCursor(c => { const d = new Date(c); d.setMonth(d.getMonth()+1); return d; });
    else if (viewMode === "week") setCursor(c => addDays(c, 7));
    else setCursor(c => addDays(c, 1));
  };

  const dayMap = new Map(days.map(d => [d.date, d]));
  const today = toKey(new Date());

  const handleRefreshScore = async (debriefId: number) => {
    setRefreshingScore(true);
    try {
      const res = await fetch(`${apiBase}/debriefs/${debriefId}/score`, { method: "POST" });
      const { score, stale } = await res.json();
      setDays(prev => prev.map(d => d.debrief?.id === debriefId ? { ...d, aiScore: score, aiScoreStale: stale } : d));
      setSelected(prev => prev?.debrief?.id === debriefId ? { ...prev, aiScore: score, aiScoreStale: stale } : prev);
    } catch (e) { console.error(e); } finally { setRefreshingScore(false); }
  };

  const renderMonth = () => {
    const ms = startOfMonth(cursor);
    const gridStart = startOfWeek(ms);
    const cells: Date[] = [];
    for (let d = new Date(gridStart); cells.length < 42; d = addDays(d, 1)) cells.push(new Date(d));
    const weekLabels = ["Mo","Tu","We","Th","Fr","Sa","Su"];
    return (
      <div>
        <div className="grid grid-cols-7 mb-2">
          {weekLabels.map(l => <div key={l} className="text-center text-[11px] text-muted-foreground/60 font-medium py-1">{l}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            const key = toKey(cell);
            const data = dayMap.get(key);
            const inMonth = cell.getMonth() === cursor.getMonth();
            const isToday = key === today;
            const hasData = !!data?.hasDebrief || (data?.sessionCount ?? 0) > 0;
            return (
              <motion.button
                key={key}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.006, type: "spring", stiffness: 400, damping: 28 }}
                onClick={() => data && hasData && setSelected(data)}
                className={cn(
                  "relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all duration-150 border",
                  !inMonth && "opacity-25",
                  hasData
                    ? cn(scoreAccent(data?.aiScore), "cursor-pointer hover:brightness-95 active:scale-95")
                    : "bg-transparent border-transparent cursor-default",
                  isToday && "ring-2 ring-emerald-400 ring-offset-1"
                )}
              >
                <span className={cn(
                  "text-[12px] font-medium leading-none",
                  isToday ? "text-emerald-600 font-bold" : hasData ? "text-foreground" : "text-muted-foreground/50"
                )}>
                  {cell.getDate()}
                </span>
                {hasData && data?.aiScore != null && (
                  <div className={cn("w-1.5 h-1.5 rounded-full mt-0.5", scoreDot(data.aiScore))} />
                )}
                {data?.aiScoreStale && (
                  <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
              </motion.button>
            );
          })}
        </div>
        <div className="flex items-center gap-4 mt-4 px-1">
          {[
            { color: "bg-emerald-500", label: "Great (80+)" },
            { color: "bg-amber-400", label: "OK (40–79)" },
            { color: "bg-rose-400", label: "Low (<40)" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", color)} />
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const ws = startOfWeek(cursor);
    const cells = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    return (
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((cell, i) => {
          const key = toKey(cell);
          const data = dayMap.get(key);
          const hasData = !!data?.hasDebrief || (data?.sessionCount ?? 0) > 0;
          const isToday = key === today;
          return (
            <motion.button
              key={key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: "spring", stiffness: 350, damping: 28 }}
              onClick={() => data && hasData && setSelected(data)}
              className={cn(
                "rounded-[14px] p-2.5 flex flex-col items-center gap-1.5 border transition-all",
                hasData
                  ? cn(scoreAccent(data?.aiScore), "cursor-pointer hover:brightness-95 active:scale-95")
                  : "bg-muted/30 border-border/20 cursor-default",
                isToday && "ring-2 ring-emerald-400 ring-offset-1"
              )}
            >
              <p className="text-[10px] text-muted-foreground font-medium uppercase">{DAYS_SHORT[cell.getDay()]}</p>
              <p className={cn("text-[15px] font-semibold", isToday ? "text-emerald-600" : "text-foreground")}>{cell.getDate()}</p>
              {hasData && <div className={cn("w-1.5 h-1.5 rounded-full", scoreDot(data?.aiScore))} />}
              {data?.aiScoreStale && <div className="w-1 h-1 rounded-full bg-amber-400" />}
            </motion.button>
          );
        })}
      </div>
    );
  };

  const renderDay = () => {
    const key = toKey(cursor);
    const data = dayMap.get(key);
    if (!data?.hasDebrief && !data?.sessionCount) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <FileText size={24} className="text-muted-foreground/30" />
          <p className="text-muted-foreground/50 text-sm">No data for {formatLabel(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()), "day")}</p>
        </div>
      );
    }
    return (
      <motion.div key={key} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
        {data?.aiScore != null && (
          <div className="bg-muted/30 rounded-[14px] p-4 border border-border/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Performance Score</span>
              <span className="text-foreground font-semibold text-[15px]">{data.aiScore} / 100</span>
            </div>
            <div className="w-full bg-border/40 rounded-full h-1.5">
              <motion.div
                className={cn("h-1.5 rounded-full", data.aiScore >= 70 ? "bg-emerald-500" : data.aiScore >= 40 ? "bg-amber-400" : "bg-rose-400")}
                initial={{ width: 0 }}
                animate={{ width: `${data.aiScore}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Focus", value: data?.totalFocusMinutes != null ? `${Math.round(data.totalFocusMinutes)}m` : "—" },
            { label: "Ratio", value: data?.focusRatio != null ? `${Math.round(data.focusRatio * 100)}%` : "—" },
            { label: "Sessions", value: data?.sessionCount ?? "—" },
          ].map(({ label, value }) => (
            <div key={label} className="bg-muted/30 rounded-[14px] p-3 border border-border/20 text-center">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className="text-foreground text-[15px] font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {data?.debrief && (
          <div className="bg-muted/20 rounded-[14px] p-4 border border-border/20">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Debrief</p>
            <p className="text-foreground/80 text-[14px] leading-relaxed">{data.debrief.text}</p>
          </div>
        )}
      </motion.div>
    );
  };

  return (
    <div className="bg-card rounded-[18px] border border-border/25 shadow-[0_4px_16px_rgba(0,0,0,0.06)] p-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-1">
          <button onClick={goBack} className="p-1.5 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft size={16} />
          </button>
          <AnimatePresence mode="wait">
            <motion.span key={formatLabel(cursor, viewMode)} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 3 }}
              className="text-[15px] font-semibold text-foreground w-48 text-center">
              {formatLabel(cursor, viewMode)}
            </motion.span>
          </AnimatePresence>
          <button onClick={goForward} disabled={isCurrentPeriod(cursor, viewMode)} className="p-1.5 rounded-xl hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="flex bg-muted/60 rounded-full p-0.5 gap-0.5">
          {(["month","week","day"] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={cn("px-3 py-1 rounded-full text-[12px] font-medium transition-all capitalize",
                viewMode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-48 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-border border-t-emerald-500 rounded-full animate-spin" />
          </motion.div>
        ) : (
          <motion.div key={`${viewMode}-${toKey(cursor)}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }}>
            {viewMode === "month" && renderMonth()}
            {viewMode === "week" && renderWeek()}
            {viewMode === "day" && renderDay()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debrief sheet */}
      <AnimatePresence>
        {selected && <DebriefSheet day={selected} onClose={() => setSelected(null)} onRefreshScore={handleRefreshScore} refreshingScore={refreshingScore} />}
      </AnimatePresence>
    </div>
  );
}
