// Subtle "AI network" decoration for hero backgrounds: a handful of nodes
// connected by thin lines, with a slow ambient drift and gentle per-node
// pulse. Pure SVG + CSS animation (no JS state), so it renders on the server
// and stays lightweight. Uses currentColor so the wrapping element controls
// tint via a text-color class.
const NODES = [
  { x: 40, y: 60 },
  { x: 140, y: 28 },
  { x: 235, y: 78 },
  { x: 330, y: 36 },
  { x: 415, y: 96 },
  { x: 85, y: 138 },
  { x: 195, y: 158 },
  { x: 305, y: 146 },
  { x: 395, y: 186 },
  { x: 55, y: 214 },
  { x: 255, y: 226 },
  { x: 375, y: 252 },
];

const EDGES: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [1, 6],
  [2, 6],
  [3, 7],
  [4, 8],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [6, 10],
  [7, 10],
  [8, 11],
  [9, 10],
  [10, 11],
];

export function NetworkBackground({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 460 300"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <g className="animate-drift" style={{ animationDuration: "18s" }}>
        {EDGES.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a].x}
            y1={NODES[a].y}
            x2={NODES[b].x}
            y2={NODES[b].y}
            stroke="currentColor"
            strokeWidth="1"
            opacity={0.16}
          />
        ))}
        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.x}
            cy={n.y}
            r={i % 3 === 0 ? 2.6 : 1.8}
            fill="currentColor"
            className="animate-pulse"
            style={{ opacity: 0.4, animationDelay: `${i * 0.3}s`, animationDuration: "3.6s" }}
          />
        ))}
      </g>
    </svg>
  );
}