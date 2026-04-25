import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, X, FileText, Flame } from "lucide-react";

type ViewMode = "month" | "week" | "day";

interface DebriefDay {
  date: string;
  hasDebrief: boolean;
  debrief?: { id: number; text: string; updatedAt: string };
  focusRatio?: number;
  totalFocusMinutes?: number;
  sessionCount?: number;
  aiScore?: number | null;
  aiScoreStale?: boolean;
}

function pad(n: number) { return String(n).padStart(2, "0"); }
function toKey(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function startOfWeek(d: Date) { const r = new Date(d); const day = r.getDay(); const diff = day === 0 ? -6 : 1 - day; r.setDate(r.getDate()+diff); return r; }
function endOfWeek(d: Date) { return addDays(startOfWeek(d), 6); }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth()+1, 0); }
function formatLabel(d: Date, mode: ViewMode) {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  if (mode === "month") return `${months[d.getMonth()]} ${d.getFullYear()}`;
  if (mode === "week") {
    const s = startOfWeek(d), e = endOfWeek(d);
    return `${months[s.getMonth()].slice(0,3)} ${s.getDate()} – ${months[e.getMonth()].slice(0,3)} ${e.getDate()}`;
  }
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  return `${days[d.getDay()]}, ${months[d.getMonth()].slice(0,3)} ${d.getDate()}`;
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return "bg-zinc-800/60";
  if (score >= 80) return "bg-emerald-500/80";
  if (score >= 60) return "bg-emerald-600/60";
  if (score >= 40) return "bg-amber-500/60";
  if (score >= 20) return "bg-orange-500/50";
  return "bg-rose-500/50";
}

function ScorePip({ score }: { score: number | null | undefined }) {
  if (score == null) return null;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#34d399" : score >= 40 ? "#f59e0b" : score >= 20 ? "#f97316" : "#ef4444";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" className="shrink-0">
      <circle cx="10" cy="10" r="8" fill="none" stroke="#27272a" strokeWidth="2.5" />
      <circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2.5"
        strokeDasharray={`${(score/100)*50.27} 50.27`} strokeLinecap="round" transform="rotate(-90 10 10)" />
      <text x="10" y="13.5" textAnchor="middle" fontSize="6" fill={color} fontWeight="700">{score}</text>
    </svg>
  );
}

function DebriefSheet({ day, onClose, onRefreshScore, refreshingScore }: {
  day: DebriefDay; onClose: () => void; onRefreshScore: (id: number) => void; refreshingScore: boolean;
}) {
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700/60 rounded-t-2xl p-5 pb-8 z-10"
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}>
        <div className="w-10 h-1 bg-zinc-600 rounded-full mx-auto mb-4" />
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-zinc-500 font-mono tracking-widest uppercase">{day.date}</p>
            <h3 className="text-lg text-zinc-100 font-semibold">{day.date}</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors mt-1"><X size={18} /></button>
        </div>
        <div className="flex gap-3 mb-5">
          {day.totalFocusMinutes != null && (
            <div className="flex-1 bg-zinc-800/70 rounded-xl p-3 border border-zinc-700/40">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Focus</p>
              <p className="text-zinc-100 text-sm font-semibold">{Math.round(day.totalFocusMinutes)}m</p>
            </div>
          )}
          {day.focusRatio != null && (
            <div className="flex-1 bg-zinc-800/70 rounded-xl p-3 border border-zinc-700/40">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Ratio</p>
              <p className="text-zinc-100 text-sm font-semibold">{Math.round(day.focusRatio * 100)}%</p>
            </div>
          )}
          {day.sessionCount != null && (
            <div className="flex-1 bg-zinc-800/70 rounded-xl p-3 border border-zinc-700/40">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Sessions</p>
              <p className="text-zinc-100 text-sm font-semibold">{day.sessionCount}</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between bg-zinc-800/50 rounded-xl px-4 py-3 border border-zinc-700/40 mb-5">
          <div className="flex items-center gap-3">
            <Flame size={15} className="text-amber-400" />
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">AI Score</p>
              <p className="text-zinc-100 text-sm font-semibold">{day.aiScore != null ? `${day.aiScore} / 100` : "Not computed"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {day.aiScore != null && <ScorePip score={day.aiScore} />}
            {day.debrief && (
              <button onClick={() => day.debrief && onRefreshScore(day.debrief.id)} disabled={refreshingScore}
                className={`text-[11px] px-3 py-1.5 rounded-lg border transition-all font-medium ${day.aiScoreStale ? "border-amber-500/50 text-amber-400 hover:bg-amber-500/10" : "border-zinc-600 text-zinc-400 hover:bg-zinc-700/40"}`}>
                {refreshingScore ? "Scoring…" : day.aiScore == null ? "Generate" : day.aiScoreStale ? "↻ Refresh" : "↻ Rescore"}
              </button>
            )}
          </div>
        </div>
        {day.debrief ? (
          <div>
            <div className="flex items-center gap-1.5 mb-2"><FileText size={12} className="text-zinc-500" /><p className="text-[10px] text-zinc-500 uppercase tracking-wider">Debrief</p></div>
            <p className="text-zinc-300 text-sm leading-relaxed whitespace-pre-wrap">{day.debrief.text}</p>
          </div>
        ) : (
          <p className="text-zinc-600 text-sm italic">No debrief written for this day.</p>
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

  const weekLabels = ["Mo","Tu","We","Th","Fr","Sa","Su"];

  const renderMonth = () => {
    const ms = startOfMonth(cursor), me = endOfMonth(cursor);
    const gridStart = startOfWeek(ms), cells: Date[] = [];
    for (let d = new Date(gridStart); cells.length < 42; d = addDays(d, 1)) cells.push(new Date(d));
    return (
      <div>
        <div className="grid grid-cols-7 mb-1">{weekLabels.map(l => <div key={l} className="text-center text-[10px] text-zinc-600 font-mono py-1">{l}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            const key = toKey(cell);
            const data = dayMap.get(key);
            const inMonth = cell.getMonth() === cursor.getMonth();
            const isToday = key === today;
            const hasData = !!data?.hasDebrief || (data?.sessionCount ?? 0) > 0;
            return (
              <motion.button key={key} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.008, type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => data && hasData && setSelected(data)}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-center transition-all duration-150 ${!inMonth ? "opacity-20" : ""} ${hasData ? `${scoreColor(data?.aiScore)} cursor-pointer hover:brightness-125 active:scale-95` : "bg-zinc-800/30 cursor-default"} ${isToday ? "ring-1 ring-emerald-400/70" : ""}`}>
                <span className={`text-[11px] font-mono leading-none ${isToday ? "text-emerald-400 font-bold" : hasData ? "text-zinc-100" : "text-zinc-600"}`}>{cell.getDate()}</span>
                {data?.aiScore != null && <div className={`w-1 h-1 rounded-full mt-0.5 ${data.aiScore >= 70 ? "bg-emerald-300" : data.aiScore >= 40 ? "bg-amber-300" : "bg-rose-400"}`} />}
                {data?.aiScoreStale && <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-400" />}
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeek = () => {
    const ws = startOfWeek(cursor);
    const cells = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
    return (
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell, i) => {
          const key = toKey(cell);
          const data = dayMap.get(key);
          const hasData = !!data?.hasDebrief || (data?.sessionCount ?? 0) > 0;
          const isToday = key === today;
          const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          return (
            <motion.button key={key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: "spring", stiffness: 350, damping: 28 }}
              onClick={() => data && hasData && setSelected(data)}
              className={`rounded-xl p-3 flex flex-col items-center gap-2 border transition-all ${hasData ? `${scoreColor(data?.aiScore)} border-zinc-600/30 cursor-pointer hover:brightness-110 active:scale-95` : "bg-zinc-800/30 border-zinc-700/30 cursor-default"} ${isToday ? "ring-1 ring-emerald-400/60" : ""}`}>
              <p className="text-[10px] text-zinc-500 font-mono uppercase">{dayNames[cell.getDay()]}</p>
              <p className={`text-sm font-semibold ${isToday ? "text-emerald-400" : "text-zinc-200"}`}>{cell.getDate()}</p>
              {hasData && <ScorePip score={data?.aiScore} />}
              {data?.aiScoreStale && <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />}
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
      return <div className="flex flex-col items-center justify-center py-16 gap-2"><FileText size={28} className="text-zinc-700" /><p className="text-zinc-600 text-sm">No data for this day</p></div>;
    }
    return (
      <motion.div key={key} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
        {data?.aiScore != null && (
          <div className="bg-zinc-800/60 rounded-xl p-4 border border-zinc-700/40">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-zinc-500 uppercase tracking-wider">AI Score</span>
              <span className="text-zinc-100 font-semibold text-sm">{data.aiScore} / 100</span>
            </div>
            <div className="w-full bg-zinc-700/40 rounded-full h-2">
              <motion.div className={`h-2 rounded-full ${data.aiScore >= 70 ? "bg-emerald-400" : data.aiScore >= 40 ? "bg-amber-400" : "bg-rose-400"}`}
                initial={{ width: 0 }} animate={{ width: `${data.aiScore}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2">
          {[{ label: "Focus", value: data?.totalFocusMinutes != null ? `${Math.round(data.totalFocusMinutes)}m` : "—" },
            { label: "Ratio", value: data?.focusRatio != null ? `${Math.round(data.focusRatio * 100)}%` : "—" },
            { label: "Sessions", value: data?.sessionCount ?? "—" }].map(({ label, value }) => (
            <div key={label} className="bg-zinc-800/50 rounded-xl p-3 border border-zinc-700/30 text-center">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-zinc-100 text-sm font-semibold">{value}</p>
            </div>
          ))}
        </div>
        {data?.debrief && <div className="bg-zinc-800/40 rounded-xl p-4 border border-zinc-700/30"><p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Debrief</p><p className="text-zinc-300 text-sm leading-relaxed">{data.debrief.text}</p></div>}
      </motion.div>
    );
  };

  return (
    <div className="bg-zinc-900/70 rounded-2xl border border-zinc-800/60 p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"><ChevronLeft size={16} /></button>
          <AnimatePresence mode="wait">
            <motion.span key={formatLabel(cursor, viewMode)} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="text-sm font-semibold text-zinc-200 w-48 text-center">{formatLabel(cursor, viewMode)}</motion.span>
          </AnimatePresence>
          <button onClick={goForward} className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"><ChevronRight size={16} /></button>
        </div>
        <div className="flex bg-zinc-800/80 rounded-lg p-0.5 gap-0.5">
          {(["month","week","day"] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${viewMode === m ? "bg-zinc-700 text-zinc-100 shadow" : "text-zinc-500 hover:text-zinc-300"}`}>{m}</button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-48 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-zinc-700 border-t-emerald-500 rounded-full animate-spin" />
          </motion.div>
        ) : (
          <motion.div key={`${viewMode}-${toKey(cursor)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {viewMode === "month" && renderMonth()}
            {viewMode === "week" && renderWeek()}
            {viewMode === "day" && renderDay()}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {selected && <DebriefSheet day={selected} onClose={() => setSelected(null)} onRefreshScore={handleRefreshScore} refreshingScore={refreshingScore} />}
      </AnimatePresence>
    </div>
  );
}
