"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { loadUnreadCount } from "./notifications";

// Single source of truth for the unread count, shared between the navbar
// bell and the full notification center — they're separate components (the
// bell lives in the persistent TopBar, the center is a route that mounts
// and unmounts independently) with no other way to know about each other's
// read/resolve actions. Without this, marking something read on the full
// page never updated the bell's own badge until a page refresh.
interface NotificationsCtx {
  unreadCount: number;
  refresh: () => Promise<void>;
  decrementBy: (n: number) => void;
}

const Ctx = createContext<NotificationsCtx>({
  unreadCount: 0,
  refresh: async () => {},
  decrementBy: () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    setUnreadCount(await loadUnreadCount());
  }, []);

  const decrementBy = useCallback((n: number) => {
    if (n <= 0) return;
    setUnreadCount((c) => Math.max(0, c - n));
  }, []);

  return <Ctx.Provider value={{ unreadCount, refresh, decrementBy }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  return useContext(Ctx);
}
