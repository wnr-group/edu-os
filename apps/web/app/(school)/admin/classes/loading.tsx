export default function ClassesLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-52 rounded bg-muted-foreground/20" />
          <div className="h-4 w-80 max-w-full rounded bg-muted-foreground/20" />
        </div>
        <div className="h-9 w-28 rounded bg-muted-foreground/20" />
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-11 w-40 rounded-xl border bg-white" />
        ))}
      </div>

      {/* Quick setup card */}
      <div className="h-16 rounded-2xl border bg-white" />

      {/* Search */}
      <div className="h-9 w-80 max-w-full rounded bg-muted-foreground/20" />

      {/* Class rows */}
      <div className="space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl border bg-white" />
        ))}
      </div>
    </div>
  );
}
