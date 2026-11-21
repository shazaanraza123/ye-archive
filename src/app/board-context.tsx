import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readBoard, toggleBoardId, writeBoard } from "@/lib/board";

type Ctx = {
  ids: string[];
  count: number;
  has: (id: string) => boolean;
  toggle: (id: string) => boolean;
  toast: string | null;
};

const BoardCtx = createContext<Ctx | null>(null);

export function BoardProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setIds(readBoard().ids);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const toggle = useCallback((id: string) => {
    let added = false;
    setIds((prev) => {
      const next = toggleBoardId(prev, id);
      added = next.added;
      writeBoard({ v: 1, ids: next.ids, updated: new Date().toISOString() });
      return next.ids;
    });
    setToast(added ? "SAVED · VIEW BOARD" : "REMOVED");
    return added;
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ids,
      count: ids.length,
      has: (id: string) => ids.includes(id),
      toggle,
      toast,
    }),
    [ids, toggle, toast],
  );

  return <BoardCtx.Provider value={value}>{children}</BoardCtx.Provider>;
}

export function useBoard(): Ctx {
  const ctx = useContext(BoardCtx);
  if (!ctx) throw new Error("useBoard requires BoardProvider");
  return ctx;
}
