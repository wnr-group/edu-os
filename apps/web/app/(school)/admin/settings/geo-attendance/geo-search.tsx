"use client";

import { useEffect, useId, useState } from "react";
import { MapPin, Search as SearchIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocationSearch } from "@/hooks/useLocationSearch";
import type { GeoSearchResult } from "@/lib/geocoding";

export function GeoSearch({ onSelect }: { onSelect: (result: GeoSearchResult) => void }) {
  const search = useLocationSearch();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listboxId = useId();

  useEffect(() => {
    if (search.error?.code === "network") {
      toast.error(search.error.message);
    }
  }, [search.error]);

  function handleQueryChange(value: string) {
    search.onQueryChange(value);
    setHighlightedIndex(-1);
    setDropdownOpen(value.trim().length > 0);
  }

  function handleFocus() {
    if (search.query.trim().length > 0) setDropdownOpen(true);
  }

  function handleBlur() {
    setDropdownOpen(false);
    setHighlightedIndex(-1);
  }

  function handleSelect(result: GeoSearchResult) {
    onSelect(result);
    search.setQuerySilently(result.primaryName);
    setDropdownOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        return;
      }
      if (search.results.length === 0) return;
      setHighlightedIndex((i) => (i + 1) % search.results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!dropdownOpen) {
        setDropdownOpen(true);
        return;
      }
      if (search.results.length === 0) return;
      setHighlightedIndex((i) => (i - 1 + search.results.length) % search.results.length);
    } else if (e.key === "Enter") {
      if (search.results.length > 0) {
        e.preventDefault();
        const targetIndex = highlightedIndex >= 0 ? highlightedIndex : 0;
        handleSelect(search.results[targetIndex]);
      }
    } else if (e.key === "Escape") {
      if (dropdownOpen) {
        e.preventDefault();
        setDropdownOpen(false);
        setHighlightedIndex(-1);
      }
    }
  }

  const trimmedQuery = search.query.trim();
  const showDropdown = dropdownOpen && trimmedQuery.length > 0;

  const statusText = search.loading
    ? "Searching…"
    : search.error
      ? search.error.message
      : trimmedQuery.length > 0
        ? search.results.length > 0
          ? `${search.results.length} result${search.results.length === 1 ? "" : "s"} found`
          : `No locations found for "${trimmedQuery}"`
        : "";

  return (
    <div className="relative flex-1">
      <div className="flex h-9 items-center gap-2 rounded-lg border px-3 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 bg-white shadow-xs">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-indigo-600" />
        <input
          type="text"
          value={search.query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Search or pick a campus"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `${listboxId}-option-${highlightedIndex}` : undefined}
        />
        
      </div>

      {/* Screen-reader-only announcer, always mounted (not conditionally removed)
          so assistive tech reliably picks up on text changes inside it. */}
      <div aria-live="polite" role="status" className="sr-only">
        {showDropdown ? statusText : ""}
      </div>

      {showDropdown && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-[2000] max-h-64 overflow-auto rounded-[13px] border bg-card p-1 shadow-lg"
        >
          {search.loading && <div className="px-2.5 py-2 text-xs text-muted-foreground">Searching…</div>}

          {!search.loading && search.error && search.error.code !== "network" && (
            <div className="px-2.5 py-2 text-xs text-destructive">{search.error.message}</div>
          )}

          {!search.loading && !search.error && search.results.length === 0 && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              No locations found for &ldquo;{trimmedQuery}&rdquo;.
            </div>
          )}

          {!search.loading &&
            search.results.map((result, index) => (
              <div
                key={result.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === highlightedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => handleSelect(result)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2",
                  index === highlightedIndex ? "bg-indigo-50" : "hover:bg-muted/50",
                )}
              >
                <div className="text-sm font-semibold text-foreground">{result.primaryName}</div>
                <div className="text-xs text-muted-foreground">
                  {[result.secondaryAddress, result.country].filter(Boolean).join(", ")}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
