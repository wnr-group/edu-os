"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { loadNotifications, markRead, categoryFor, formatWhen, type NotificationRow } from "@/lib/notifications";
import { useNotifications } from "@/lib/notifications-context";

// Lives in the top bar's right-hand cluster, between search and the profile
// menu — same slot pattern (icon trigger → in-place overlay) already used
// by both of its neighbors, so this is a fourth trigger of the same kind,
// not a new interaction language.
export function NotificationBell({ centerHref }: { centerHref: string }) {
  const { unreadCount, refresh, decrementBy } = useNotifications();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setLoading(true);
      const rows = await loadNotifications(8);
      setItems(rows);
      setLoading(false);
    }
  }

  async function handleItemClick(n: NotificationRow) {
    if (!n.is_read) {
      const ok = await markRead([n.id]);
      if (!ok) return;
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      decrementBy(1);
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger className="relative flex items-center rounded-lg p-1.5 text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F59E0B] px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold text-foreground">Notifications</span>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-muted/50 ${!n.is_read ? "bg-primary/[0.03]" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {!n.is_read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className={`text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ${n.is_read ? "ml-3.5" : ""}`}>
                    {categoryFor(n.type).label}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{formatWhen(n.created_at)}</span>
                </div>
                <p className={`text-sm ${n.is_read ? "text-muted-foreground" : "font-medium text-foreground"}`}>{n.body}</p>
              </button>
            ))
          )}
        </div>
        <Link
          href={centerHref}
          onClick={() => setOpen(false)}
          className="block border-t border-border px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-muted/50"
        >
          View all
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
