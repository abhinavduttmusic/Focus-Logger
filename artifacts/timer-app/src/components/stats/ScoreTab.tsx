import DebriefsCalendar from "./DebriefsCalendar";

const BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + "/" : "/");

export function ScoreTab() {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="w-full max-w-lg mx-auto pt-4 pb-10 px-4 sm:px-6 space-y-6">

        {/* Header */}
        <h1 className="text-[22px] font-semibold text-foreground">Performance Score</h1>

        {/* Explainer */}
        <p className="text-[13px] text-muted-foreground leading-relaxed -mt-2">
          Your daily performance score (0–100) is calculated from your focus ratio, session notes, and end-of-day debrief. Tap any day to view your score and debrief. Scores update automatically as you log more sessions.
        </p>

        {/* Daily */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Daily</p>
          <DebriefsCalendar apiBase={`${BASE}api`} lockedMode="day" />
        </div>

        {/* Weekly */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Weekly</p>
          <DebriefsCalendar apiBase={`${BASE}api`} lockedMode="week" />
        </div>

        {/* Monthly */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-1">Monthly</p>
          <DebriefsCalendar apiBase={`${BASE}api`} lockedMode="month" />
        </div>

      </div>
    </div>
  );
}
