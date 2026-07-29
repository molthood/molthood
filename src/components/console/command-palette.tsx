"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CornerDownLeft, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { consoleNav } from "@/config/console";
import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils";

type CommandItem = {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: LucideIcon;
  keywords: string;
  href: string;
};

type CommandPaletteContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

const CommandPaletteContext = React.createContext<CommandPaletteContextValue | null>(
  null,
);

/**
 * Palette entries are navigation and actions only.
 *
 * It deliberately does not index agents or projects: doing so would require
 * either a fetch on every keystroke or a cached copy that could disagree with
 * the live pages.
 */
function buildItems(): CommandItem[] {
  const navigation: CommandItem[] = consoleNav.map((item) => ({
    id: `nav-${item.href}`,
    label: item.label,
    hint: item.description,
    group: "Navigation",
    icon: item.icon,
    keywords: `${item.label} ${item.description}`.toLowerCase(),
    href: item.href,
  }));

  const actions: CommandItem[] = [
    {
      id: "action-run",
      label: "Run an analysis",
      hint: "Analyze a token, wallet, contract, or the chain",
      group: "Actions",
      icon: consoleNav[3].icon,
      keywords: "run analyse analyze execute token wallet contract chain",
      href: "/executions",
    },
    {
      id: "action-docs",
      label: "Documentation",
      hint: "Guides and API reference",
      group: "Actions",
      icon: consoleNav[0].icon,
      keywords: "docs documentation help reference api",
      href: siteConfig.links.docs,
    },
  ];

  return [...navigation, ...actions];
}

function CommandPaletteDialog() {
  const { open, setOpen } = useCommandPalette();
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo(buildItems, []);

  const results = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => item.keywords.includes(needle));
  }, [items, query]);

  // Reset the cursor whenever the result set changes underneath it.
  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const runItem = React.useCallback(
    (item: CommandItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router, setOpen],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (index) => (index - 1 + Math.max(results.length, 1)) % Math.max(results.length, 1),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) runItem(item);
    }
  };

  // Keep the highlighted row inside the scroll viewport.
  React.useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  let renderedGroup = "";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
          )}
        />
        <DialogPrimitive.Content
          onKeyDown={onKeyDown}
          className={cn(
            "fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2",
            "overflow-hidden rounded-card border border-border-strong bg-surface shadow-xl",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          )}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search navigation, agents, and projects.
          </DialogPrimitive.Description>

          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search navigation, agents, projects…"
              aria-label="Command palette search"
              className="h-13 w-full bg-transparent text-sm font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted/70"
            />
            <Kbd className="shrink-0">Esc</Kbd>
          </div>

          <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
            {results.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm font-medium text-muted">
                No results for “{query}”.
              </p>
            ) : (
              results.map((item, index) => {
                const Icon = item.icon;
                const isActive = index === activeIndex;
                const showGroup = item.group !== renderedGroup;
                renderedGroup = item.group;

                return (
                  <React.Fragment key={item.id}>
                    {showGroup ? (
                      <p className="px-3 pt-3 pb-1.5 font-mono text-[10px] font-bold tracking-[0.12em] text-muted uppercase">
                        {item.group}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      data-active={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => runItem(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                        isActive ? "bg-foreground/10" : "hover:bg-foreground/5",
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {item.label}
                        </span>
                        {item.hint ? (
                          <span className="block truncate text-xs font-medium text-muted">
                            {item.hint}
                          </span>
                        ) : null}
                      </span>
                      {isActive ? (
                        <CornerDownLeft
                          className="size-3.5 shrink-0 text-muted"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  </React.Fragment>
                );
              })
            )}
          </div>

          <div className="flex items-center gap-4 border-t border-border px-4 py-2.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navigate
            </span>
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
              <Kbd>↵</Kbd>
              open
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Owns palette state and the global ⌘K / Ctrl+K shortcut. */
function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = React.useMemo(() => ({ open, setOpen }), [open]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog />
    </CommandPaletteContext.Provider>
  );
}

function useCommandPalette() {
  const context = React.useContext(CommandPaletteContext);

  if (!context) {
    throw new Error("useCommandPalette must be used inside a CommandPaletteProvider.");
  }

  return context;
}

export { CommandPaletteProvider, useCommandPalette };
