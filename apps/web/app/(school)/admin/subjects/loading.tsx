export default function SubjectsLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Page header */}
      <div>
        <div className="h-8 w-28 rounded bg-muted-foreground/20" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-muted-foreground/20" />
      </div>

      {/* Quick setup card */}
      <div className="rounded-2xl border bg-white p-5">
        <div className="h-5 w-28 rounded bg-muted-foreground/20" />
        <div className="mt-2 h-4 w-64 rounded bg-muted-foreground/20" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-9 w-24 rounded-lg bg-muted-foreground/20" />
          ))}
        </div>
        <div className="mt-5 h-14 rounded-xl bg-muted-foreground/10" />
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-11 w-40 rounded-xl border bg-white" />
        ))}
      </div>

      {/* Matrix card */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-5 py-4">
          <div className="h-3 w-32 rounded bg-muted-foreground/20" />
          <div className="mt-2 h-5 w-48 rounded bg-muted-foreground/20" />
        </div>
        <div className="space-y-1.5 p-3.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-11 rounded-lg bg-muted-foreground/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
