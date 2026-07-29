"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { CommandPaletteProvider } from "@/components/console/command-palette";
import { ConsoleSidebar } from "@/components/console/console-sidebar";
import { ConsoleTopbar } from "@/components/console/console-topbar";
import { EASE_OUT } from "@/components/motion/motion-presets";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  // Close the mobile drawer on every navigation.
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh bg-background">
      <ConsoleSidebar className="sticky top-0 hidden h-dvh lg:flex" />

      <AnimatePresence>
        {open ? (
          <motion.div
            key="drawer"
            className="fixed inset-0 z-50 lg:hidden"
            initial="hidden"
            animate="visible"
            exit="hidden"
          >
            <motion.div
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]"
              aria-hidden="true"
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Console navigation"
              variants={{ hidden: { x: "-100%" }, visible: { x: 0 } }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              className="absolute inset-y-0 left-0 flex"
            >
              <ConsoleSidebar className="h-dvh" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="absolute top-3.5 right-[-3.25rem] inline-flex size-9 items-center justify-center rounded-md border border-border-strong bg-surface text-muted transition-colors hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <ConsoleTopbar onOpenSidebar={() => setOpen(true)} />
        <main className="flex-1 px-4 py-7 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

/**
 * Application chrome for every `/console` route. Providers live here so that
 * toasts, tooltips, and the command palette are available to any child.
 */
function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={200}>
      <ToastProvider>
        <CommandPaletteProvider>
          <ConsoleChrome>{children}</ConsoleChrome>
        </CommandPaletteProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}

export { ConsoleShell };
