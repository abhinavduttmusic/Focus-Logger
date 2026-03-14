import { type ReactNode } from "react";
import { motion } from "framer-motion";

const ENTER_EASE = [0.22, 1, 0.36, 1] as const;

const confirmMotion = {
  initial: { opacity: 0, scale: 0.96, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: 0.24, ease: ENTER_EASE },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 8,
    transition: { duration: 0.2, ease: ENTER_EASE },
  },
} as const;

const TAP = { whileTap: { scale: 0.95 }, transition: { duration: 0.12, ease: "easeOut" as const } };

interface ConfirmBannerProps {
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  confirmContent?: ReactNode;
  variant?: "sm" | "md";
}

export function ConfirmBanner({
  message,
  onConfirm,
  onCancel,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  confirmContent,
  variant = "sm",
}: ConfirmBannerProps) {
  const isMd = variant === "md";
  return (
    <motion.div {...confirmMotion}>
      <div
        className={
          isMd
            ? "flex items-center gap-2 p-2.5 rounded-xl bg-destructive/5 border border-destructive/20"
            : "flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/5 border border-destructive/20 text-xs"
        }
      >
        <span
          className={
            isMd
              ? "flex-1 text-sm font-medium text-destructive truncate"
              : "flex-1 text-foreground/80"
          }
        >
          {message}
        </span>
        <motion.button
          onClick={onCancel}
          {...TAP}
          className={
            isMd
              ? "px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary/60 transition-colors"
              : "px-2 py-1 rounded-md bg-secondary/60 text-foreground/70 text-[11px] font-medium hover:bg-secondary transition-colors"
          }
        >
          {cancelLabel}
        </motion.button>
        <motion.button
          onClick={onConfirm}
          disabled={confirmDisabled}
          {...TAP}
          className={
            isMd
              ? "px-2.5 py-1 rounded-lg text-xs font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
              : "px-2 py-1 rounded-md bg-destructive/90 text-destructive-foreground text-[11px] font-medium hover:bg-destructive transition-colors"
          }
        >
          {confirmContent ?? confirmLabel}
        </motion.button>
      </div>
    </motion.div>
  );
}

export function ConfirmBannerInline({
  message,
  children,
}: {
  message: ReactNode;
  children: ReactNode;
}) {
  return (
    <motion.div {...confirmMotion}>
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/5 border border-destructive/20">
        <span className="text-xs text-foreground/80">{message}</span>
        {children}
      </div>
    </motion.div>
  );
}

export { TAP as CONFIRM_TAP };
