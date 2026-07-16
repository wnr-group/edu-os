"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import type { Column } from "@/components/data-table";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterConfig {
  label: string;
  options: FilterOption[];
  filterFn: (row: any, value: string) => boolean;
}

interface FilterableDataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  searchKeys: (keyof T)[];
  searchPlaceholder?: string;
  filter?: FilterConfig;
  renderActions?: (row: T) => React.ReactNode;
  emptyState?: React.ReactNode;
}

export function FilterableDataTable<T extends { id: string }>({
  data,
  columns,
  searchKeys,
  searchPlaceholder = "Search...",
  filter,
  renderActions,
  emptyState,
}: FilterableDataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState("");

  const filtered = useMemo(() => {
    let result = data;
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter((row) =>
        searchKeys.some((key) =>
          String(row[key] ?? "")
            .toLowerCase()
            .includes(q)
        )
      );
    }
    if (filterValue && filter) {
      result = result.filter((row) => filter.filterFn(row, filterValue));
    }
    return result;
  }, [data, query, filterValue, searchKeys, filter]);

  return (
    <div className="space-y-4 animate-fade-in-up">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {filter && (
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{filter.label}</option>
            {filter.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {filtered.length === 0 && query === "" && filterValue === "" && emptyState
        ? emptyState
        : (
          <DataTable
            data={filtered}
            columns={columns}
            renderActions={renderActions}
            emptyMessage={query ? `No results for "${query}"` : "No records found."}
          />
        )}
    </div>
  );
}