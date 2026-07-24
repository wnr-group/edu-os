"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, X, GraduationCap, Users } from "lucide-react";

interface SearchResult {
  id: string;
  type: "student" | "teacher";
  name: string;
  detail: string;
}

interface CommandSearchProps {
  userRole: string;
  /** Icon-only trigger for tight spaces (e.g. the sidebar's collapsed icon rail). */
  compact?: boolean;
  /** Plain square icon button (e.g. the mobile top bar's right-hand slot). */
  iconOnly?: boolean;
}

export function CommandSearch({ userRole, compact = false, iconOnly = false }: CommandSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const rolePrefix = userRole === "teacher" ? "/teacher" : userRole === "principal" ? "/principal" : "/admin";
// Teachers must not be able to search for or view other teachers (product
// decision, not just a routing gap) — restrict teacher results to Admin/
// Super Admin only. Principal has no teacher-detail route either, so it
// stays restricted to students as before.
const canViewTeacherResults = rolePrefix === "/admin";

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        const raw: SearchResult[] = data.results ?? [];
        setResults(canViewTeacherResults ? raw : raw.filter((r) => r.type !== "teacher"));
        setActiveIndex(0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const navigate = useCallback(
    (result: SearchResult) => {
      setOpen(false);
      if (result.type === "student") {
        router.push(`${rolePrefix}/students/${result.id}`);
      } else {
        router.push(`${rolePrefix}/teachers/${result.id}`);
      }
    },
    [rolePrefix, router]
  );

  function handleKeyNav(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      navigate(results[activeIndex]);
    }
  }

  if (!open) {
    if (iconOnly) {
      return (
        <button
          onClick={() => setOpen(true)}
          title="Search"
          aria-label="Search"
          className="-mr-1.5 rounded-lg p-1.5 text-foreground"
        >
          <Search className="h-5 w-5" />
        </button>
      );
    }
    if (compact) {
      return (
        <button
          onClick={() => setOpen(true)}
          title="Search"
          aria-label="Search"
          className="flex h-[46px] w-full items-center gap-[14px] rounded-[14px] px-[15px] text-[#94a3b8] transition-colors hover:bg-slate-50 hover:text-foreground"
        >
          <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center">
            <Search className="h-[19px] w-[19px]" />
          </span>
          <span className="whitespace-nowrap text-[14.5px] font-medium text-[#475569] opacity-0 -translate-x-1 transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0">
            Search...
          </span>
        </button>
      );
    }
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
      >
        <Search className="h-3.5 w-3.5" />
        <span>Search...</span>
        <kbd className="ml-4 hidden rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
          ⌘K
        </kbd>
      </button>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setOpen(false)} />
      <div className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyNav}
            placeholder={canViewTeacherResults ? "Search students or teachers..." : "Search students..."}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Searching...</p>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No results found.</p>
          )}
          {!loading && results.map((result, i) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => navigate(result)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === activeIndex ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              {result.type === "student" ? (
                <GraduationCap className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Users className="h-4 w-4 shrink-0 text-indigo-600" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
                <p className="truncate text-xs text-muted-foreground">{result.detail}</p>
              </div>
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground capitalize">
                {result.type}
              </span>
            </button>
          ))}
          {!loading && query.length < 2 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters to search...
            </p>
          )}
        </div>
      </div>
    </>
  );
}
