const PALETTE = [
  { bg: "#eef2ff", fg: "#4338ca" },
  { bg: "#dcfce7", fg: "#15803d" },
  { bg: "#ffedd5", fg: "#c2410c" },
  { bg: "#dbeafe", fg: "#1d4ed8" },
  { bg: "#fce7f3", fg: "#be185d" },
  { bg: "#cffafe", fg: "#0e7490" },
  { bg: "#fef9c3", fg: "#a16207" },
  { bg: "#ede9fe", fg: "#6d28d9" },
];

export function initialsOf(name: string) {
  const initials = (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

export function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
