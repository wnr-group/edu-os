export default function StudentsLoading() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-8 w-32 rounded bg-muted-foreground/20" />
          <div className="h-4 w-80 max-w-full rounded bg-muted-foreground/20" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-24 rounded bg-muted-foreground/20" />
          <div className="h-9 w-24 rounded bg-muted-foreground/20" />
          <div className="h-9 w-32 rounded bg-muted-foreground/20" />
        </div>
      </div>

      {/* Stat chips */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-[70px] w-44 rounded-xl border bg-white" />
        ))}
      </div>

      {/* Table card */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="border-b px-4.5 py-3.5">
          <div className="h-9 w-full max-w-md rounded bg-muted-foreground/10" />
        </div>
        <div className="space-y-2 p-3.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-muted-foreground/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
