/**
 * Turns a raw URL path segment into a readable breadcrumb/page-title label.
 * UUID segments (record ids) become "Detail" rather than showing the raw id.
 */
export function formatSegment(segment: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(segment)) {
    return "Detail";
  }
  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}