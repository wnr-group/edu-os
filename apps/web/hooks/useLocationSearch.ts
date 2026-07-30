"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { searchLocation, type GeoSearchError, type GeoSearchResult } from "@/lib/geocoding";

const DEBOUNCE_MS = 400;
const MAX_QUERY_LENGTH = 200;

export interface UseLocationSearchResult {
  query: string;
  results: GeoSearchResult[];
  loading: boolean;
  error: GeoSearchError | null;
  onQueryChange: (value: string) => void;
  setQuerySilently: (value: string) => void;
}

export function useLocationSearch(): UseLocationSearchResult {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<GeoSearchError | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const cacheRef = useRef<Map<string, GeoSearchResult[]>>(new Map());

  // Cleanup on unmount: no dangling timer, no dangling in-flight request.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = useCallback((raw: string) => {
    const trimmed = raw.trim();
    const cacheKey = trimmed.toLowerCase();
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setResults(cached);
      setError(null);
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    searchLocation(trimmed, controller.signal).then(({ data, error: searchError }) => {
      if (controller.signal.aborted) return;
      setLoading(false);
      if (searchError) {
        if (searchError.code === "aborted") return;
        setError(searchError);
        setResults([]);
        return;
      }
      const safeData = data ?? [];
      cacheRef.current.set(cacheKey, safeData);
      setResults(safeData);
    });
  }, []);

  const onQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const trimmed = value.trim();
      if (!trimmed) {
        abortRef.current?.abort();
        setLoading(false);
        setError(null);
        setResults([]);
        return;
      }
      if (trimmed.length > MAX_QUERY_LENGTH) {
        // Reject immediately, no debounce wait, no wasted network round trip —
        // this can never be valid input, server-side validation would just
        // truncate/reject it a beat later at the cost of a spinner flash.
        abortRef.current?.abort();
        setLoading(false);
        setResults([]);
        setError({
          code: "invalid_input",
          message: `Search text is too long (max ${MAX_QUERY_LENGTH} characters).`,
        });
        return;
      }

      debounceRef.current = setTimeout(() => runSearch(value), DEBOUNCE_MS);
    },
    [runSearch],
  );

  const setQuerySilently = useCallback((value: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    setLoading(false);
    setError(null);
    setResults([]);
    setQuery(value);
  }, []);

  return { query, results, loading, error, onQueryChange, setQuerySilently };
}
