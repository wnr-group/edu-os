// Next.js re-mounts `template.tsx` on every navigation (unlike layout.tsx,
// which persists), so this gives every marketing page a consistent, subtle
// entrance transition with zero extra dependencies. Respects
// prefers-reduced-motion via the global override in globals.css.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}