import { FileText } from "lucide-react";

interface NotesAreaProps {
  value: string;
  onChange: (val: string) => void;
}

export function NotesArea({ value, onChange }: NotesAreaProps) {
  return (
    <div className="w-full glass-panel rounded-3xl p-1 overflow-hidden transition-all duration-300 focus-within:ring-4 focus-within:ring-primary/10">
      <div className="bg-card/50 rounded-[1.35rem] p-6 h-full flex flex-col">
        <div className="flex items-center gap-2 mb-4 text-muted-foreground font-medium">
          <FileText className="w-4 h-4" />
          <span>Session Notes & Goals</span>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What are you aiming to accomplish? Drop your thoughts here..."
          className="w-full flex-1 min-h-[120px] bg-transparent border-none resize-none outline-none text-foreground placeholder:text-muted-foreground/60 leading-relaxed"
        />
      </div>
    </div>
  );
}
