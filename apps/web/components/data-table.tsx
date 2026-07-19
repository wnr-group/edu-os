import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  renderActions?: (row: T) => React.ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  emptyMessage = "No records found.",
  renderActions,
}: DataTableProps<T>) {
  return (
   <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm animate-fade-in-up">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {columns.map((col, i) => (
              <TableHead
                key={i}
                className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {col.header}
              </TableHead>
            ))}
            {renderActions && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length + (renderActions ? 1 : 0)}
                className="py-12 text-center text-sm text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, rowIndex) => (
              <TableRow
                key={row.id}
                className={`transition-colors hover:bg-muted/30 ${rowIndex % 2 === 0 ? "" : "bg-muted/10"}`}
              >
                {columns.map((col, i) => (
                  <TableCell key={i} className="px-4 py-3 text-sm">
                    {typeof col.accessor === "function"
                      ? col.accessor(row)
                      : (row[col.accessor] as React.ReactNode)}
                  </TableCell>
                ))}
                {renderActions && (
                  <TableCell className="px-4 py-3 text-right">
                    {renderActions(row)}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}