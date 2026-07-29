"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import { EASE_OUT } from "@/components/motion/motion-presets";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "danger" | "warning" | "info";

type Toast = {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
};

type ToastInput = Omit<Toast, "id" | "tone"> & { tone?: ToastTone };

type ToastContextValue = {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const DURATION = 4000;

const toneIcon: Record<ToastTone, typeof CheckCircle2> = {
  success: CheckCircle2,
  danger: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const toneClasses: Record<ToastTone, string> = {
  success: "text-[#12490F]",
  danger: "text-danger",
  warning: "text-[#4A3005]",
  info: "text-[#0B2A5C]",
};

/** Wraps the app so any client component can raise a toast via `useToast`. */
function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const nextId = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = React.useCallback(
    ({ tone = "success", ...input }: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, tone, ...input }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION),
      );
    },
    [dismiss],
  );

  // Clear every pending timer if the provider unmounts mid-flight.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-100 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        <AnimatePresence initial={false}>
          {toasts.map((item) => {
            const Icon = toneIcon[item.tone];

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.97 }}
                transition={{ duration: 0.24, ease: EASE_OUT }}
                className={cn(
                  "pointer-events-auto flex w-full items-start gap-3 rounded-card border border-border-strong bg-surface p-3.5 shadow-lg sm:w-88",
                )}
              >
                <Icon
                  className={cn("mt-0.5 size-4 shrink-0", toneClasses[item.tone])}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{item.title}</p>
                  {item.description ? (
                    <p className="mt-1 text-sm leading-relaxed font-medium text-muted">
                      {item.description}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  aria-label="Dismiss"
                  className="-mt-0.5 -mr-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider.");
  }

  return context;
}

export { ToastProvider, useToast };
