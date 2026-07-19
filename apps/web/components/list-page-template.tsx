"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, SlidersHorizontal, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { DataTable } from "@/components/data-table";
import type { Column } from "@/components/data-table";
import type { FilterConfig } from "@/components/filterable-data-table";

interface ListPageTemplateProps<T extends { id: string }> {
  title: string;
  description?: string;
  headerAction?: React.ReactNode;
  /**
   * Pass a pre-built `<KpiGrid>...</KpiGrid>` element (built with KpiCard,
   * both of which have no "use client" directive) rather than raw stat
   * data. KpiCard's `icon` prop is a component reference, and component
   * references can't cross the Server → Client Component prop boundary as
   * plain data — only already-rendered elements can. Building the KpiGrid
   * in the caller (typically the page.tsx Server Component) and passing
   * the resulting ReactNode here avoids that.
   */
  stats?: React.ReactNode;
  data: T[];
  columns: Column<T>[];
  searchKeys: (keyof T)[];
  searchPlaceholder?: string;
  filters?: FilterConfig[];
  onFiltersClick?: () => void;
  onExport?: () => void;
  renderActions?: (row: T) => React.ReactNode;
  renderMobileCard: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
  pageSize?: number;
  pageSizeOptions?: number[];
}

/**
 * Foundation layout for list pages (Students, Teachers, Discipline,
 * Feedback, ...). Builds on the existing `DataTable`/`Input`/`Button`
 * primitives rather than replacing them, and adds what today's
 * `FilterableDataTable` doesn't have: pagination, an Export slot, support
 * for more than one filter dropdown, and a required mobile card renderer
 * so every list gets a real `< md` fallback instead of a scrolling table.
 */
export function ListPageTemplate<T extends { id: string }>({
  title,
  description,
  headerAction,
  stats,
  data,
  columns,
  searchKeys,
  searchPlaceholder = "Search...",
  filters = [],
  onFiltersClick,
  onExport,
  renderActions,
  renderMobileCard,
  emptyState,
  pageSize: initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
}: ListPageTemplateProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<number, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const hasActiveFilters = Object.values(filterValues).some((v) => !!v);

  const filtered = useMemo(() => {
    let result = data;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(q))
      );
    }
    filters.forEach((f, i) => {
      const val = filterValues[i];
      if (val) result = result.filter((row) => f.filterFn(row, val));
    });
    return result;
  }, [data, query, filterValues, searchKeys, filters]);

  useEffect(() => {
    setPage(1);
  }, [query, filterValues, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const emptyMessage = query || hasActiveFilters ? "No matching records found." : "No records found.";
  const showProvidedEmptyState = filtered.length === 0 && query === "" && !hasActiveFilters && emptyState;

  return (
    <div className="space-y-5 animate-fade-in-up">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {headerAction && <div className="shrink-0">{headerAction}</div>}
      </div>

      {stats && <div>{stats}</div>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((f, i) => (
            <Select
              key={f.label}
              value={filterValues[i] ?? ""}
              onValueChange={(v) => setFilterValues((prev) => ({ ...prev, [i]: (v as string) ?? "" }))}
            >
              <SelectTrigger size="sm" className="h-9 text-sm">
                <SelectValue placeholder={f.label} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{f.label}</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          {onFiltersClick && (
            <Button variant="outline" size="sm" onClick={onFiltersClick}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
            </Button>
          )}
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          )}
        </div>
      </div>

      {showProvidedEmptyState ? (
        emptyState
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable data={paged} columns={columns} renderActions={renderActions} emptyMessage={emptyMessage} />
          </div>

          <div className="space-y-3 md:hidden">
            {paged.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
            ) : (
              paged.map((row) => <div key={row.id}>{renderMobileCard(row)}</div>)
            )}
          </div>

          {filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
              <p className="text-sm text-muted-foreground">
                Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of{" "}
                {filtered.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger size="sm" className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {pageSizeOptions.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}