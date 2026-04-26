import DebriefsCalendar from "./DebriefsCalendar";

const BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL + "/" : "/");

export function ScoreTab() {
  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="w-full max-w-lg mx-auto pt-4 pb-10 px-4 sm:px-6 space-y-4">
        <DebriefsCalendar apiBase={`${BASE}api`} />
      </div>
    </div>
  );
}
