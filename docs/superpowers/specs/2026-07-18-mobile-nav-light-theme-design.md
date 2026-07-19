# Mobile nav drawer: match desktop sidebar's light theme

## Problem

`apps/web/components/sidebar.tsx` (desktop) was reworked as part of ERP-48 into a
white/rounded sidebar with brand-color accents. `apps/web/components/mobile-nav.tsx`
(the hamburger drawer used below the `lg` breakpoint) already shares its icon map and
role labels with the desktop sidebar, but still renders the old dark-navy theme
(`#1e1b4b` background, white text). The two navs now look like different products.

## Approach

Port the desktop sidebar's exact color system into the drawer's existing
always-expanded layout. No new plumbing — `Sidebar` already exports `darken`,
`lighten`, `ICON_MAP`, `ROLE_LABELS`; `MobileNav` already imports the first three.

### Color system

Reuse the identical computation from `Sidebar`:

```ts
const isValidHex = brandColor && /^#[0-9a-fA-F]{6}$/.test(brandColor);
const accent = isValidHex ? brandColor : "#1d4ed8";
const activeBg = isValidHex ? lighten(brandColor, 0.93) : "#eff4ff";
```

Drop the drawer-only `sidebarBg` / `logoBg` / `dividerColor` / `inactiveText`
constants derived from `darken`.

### Drawer surface

- Background: white, `shadow-xl`, rounded trailing edge (`rounded-r-[20px]`).
- Divider lines: `border-[#eef0f3]` (was `rgba(255,255,255,.12)` / `#3730a380`).
- Header: logo tile filled with `accent`, `GraduationCap` icon (was
  `LayoutDashboard`, now matches desktop), bold `text-slate-900` title, `text-slate-400`
  close icon (was white/70).

### Nav items

Match desktop's pill styling exactly:
- `rounded-[14px]`, `h-[46px]`-equivalent padding.
- Active: `activeBg` background, `accent`-colored left bar + icon + semibold text.
- Inactive: `#94a3b8` icon, `text-slate-600` label, `hover:bg-slate-50`.

### SectionSwitcher

Pass `variant="light"` (already implemented in `section-switcher.tsx`, just unused
by `MobileNav` today — the desktop `Sidebar` already passes it).

### Footer (user + logout)

- Avatar circle: `accent` background (was fixed `logoBg`).
- Name: `text-slate-900`; role label: `text-slate-400` (was white/90, white/50).
- Logout row: `#94a3b8` icon, `text-slate-600` label, `hover:bg-slate-50` (was
  white/60 on transparent/white-08 hover).

### Bottom tab bar

- Active tab: color switches from static `text-primary` class to the same dynamic
  `accent` value (inline style), for parity with the drawer/desktop.
- Inactive tab / "More" button: `#94a3b8` (was `text-muted-foreground`).

## Out of scope

- Mobile top header (hamburger + title + bell) — already white/light, no change.
- Any behavioral change to open/close state, routing, or the bottom tab bar's
  item selection (still first 3 `items` + "More").
- Desktop `Sidebar` itself — untouched, it's the source of truth being mirrored.

## Files touched

- `apps/web/components/mobile-nav.tsx` (styling only)
- `apps/web/app/(school)/layout.tsx` (pass `variant="light"` to the `SectionSwitcher`
  instance rendered inside `MobileNav`)
