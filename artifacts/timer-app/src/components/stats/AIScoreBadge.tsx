import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";

interface PeriodScore {
  score: number | null;
  stale: boolean;
  reasoning?: string;
}

interface Props {
  period: "day" | "week" | "month";
  periodDate: string;
  initialData?: PeriodScore;
  apiBase?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { r: 28, stroke: 5, svgSize: 72, fontSize: 14, labelSize: 9 },
  md: { r: 38, stroke: 6, svgSize: 96, fontSize: 18, labelSize: 10 },
  lg: { r: 52, stroke: 7, svgSize: 128, fontSize: 24, labelSize: 11 },
};

function scoreLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Strong";
  if (score >= 55) return "Decent";
  if (score >= 40) return "Light";
  return "Low";
}

export default function AIScoreBadge({ period, periodDate, initialData, apiBase = "/api", size = "md" }: Props) {
  const [data, setData] = useState<PeriodScore>(initialData ?? { score: null, stale: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);

  const { r, stroke, svgSize, fontSize, labelSize } = sizeMap[size];
  const circumference = 2 * Math.PI * r;
  const center = svgSize / 2;
  const score = data.score;
  const dashOffset = score != null ? circumference - (score / 100) * circumference : circumference;

  const gradientColor =
    score == null ? ["#3f3f46", "#52525b"] :
    score >= 80 ? ["#10b981", "#34d399"] :
    score >= 60 ? ["#0d9488", "#2dd4bf"] :
    score >= 40 ? ["#d97706", "#fbbf24"] :
    ["#dc2626", "#f87171"];

  const handleRequestScore = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/debriefs/period-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, date: periodDate }),
      });
      if (!res.ok) throw new Error("Server error");
      const result: PeriodScore = await res.json();
      setData(result);
    } catch {
      setError("Failed to compute score. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="overflow-visible">
          <defs>
            <linearGradient id={`gauge-grad-${period}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientColor[0]} />
              <stop offset="100%" stopColor={gradientColor[1]} />
            </linearGradient>
          </defs>
          <circle cx={center} cy={center} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
          <motion.circle
            cx={center} cy={center} r={r} fill="none"
            stroke={`url(#gauge-grad-${period})`} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1] }}
            transform={`rotate(-90 ${center} ${center})`}
          />
          <AnimatePresence mode="wait">
            {loading ? (
              <text key="loading" x={center} y={center + 4} textAnchor="middle" fontSize={labelSize} fill="#71717a">scoring…</text>
            ) : score != null ? (
              <motion.g key="score" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4, type: "spring", stiffness: 300 }}>
                <text x={center} y={center + fontSize * 0.38} textAnchor="middle" fontSize={fontSize} fontWeight="700" fill={gradientColor[1]} fontFamily="ui-monospace, monospace">{score}</text>
                <text x={center} y={center + fontSize * 0.38 + labelSize + 3} textAnchor="middle" fontSize={labelSize - 1} fill="#52525b" fontFamily="ui-monospace, monospace">{scoreLabel(score)}</text>
              </motion.g>
            ) : (
              <text key="empty" x={center} y={center + 4} textAnchor="middle" fontSize={labelSize} fill="#3f3f46" fontFamily="ui-monospace, monospace">—</text>
            )}
          </AnimatePresence>
        </svg>
        {data.stale && score != null && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-0 right-0 w-3 h-3 rounded-full bg-amber-400 border-2 border-zinc-900" title="Score may be outdated" />
        )}
      </div>

      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">Performance Score</p>
      <div className="flex flex-col items-center gap-1.5">
        <button
          onClick={handleRequestScore}
          disabled={loading}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            data.stale && score != null ? "border-amber-500/60 text-amber-400 hover:bg-amber-500/10" :
            score == null ? "border-emerald-600/60 text-emerald-400 hover:bg-emerald-500/10" :
            "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
          }`}
        >
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {loading ? "Computing…" : data.stale && score != null ? "Refresh score" : score == null ? "Generate score" : "Rescore"}
        </button>
        {data.stale && score != null && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-1 text-[10px] text-amber-500/80">
            <AlertTriangle size={9} />New sessions added since last score
          </motion.p>
        )}
        {error && <p className="text-[10px] text-rose-400">{error}</p>}
      </div>

      {data.reasoning && (
        <div className="w-full max-w-[200px]">
          <button onClick={() => setShowReasoning((s) => !s)} className="text-[10px] text-zinc-600 hover:text-zinc-400 underline underline-offset-2 transition-colors w-full text-center">
            {showReasoning ? "Hide reasoning" : "Why this score?"}
          </button>
          <AnimatePresence>
            {showReasoning && (
              <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 text-[11px] text-zinc-500 leading-relaxed text-center">
                {data.reasoning}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
