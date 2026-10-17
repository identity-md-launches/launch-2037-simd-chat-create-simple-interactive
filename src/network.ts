export interface NeuralNode {
  id: number;
  x: number;
  y: number;
  degree: number;
  phase: number;
}

export interface NeuralEdge {
  a: number;
  b: number;
  bend: number;
  strength: number;
  length: number;
}

export interface Network {
  nodes: NeuralNode[];
  edges: NeuralEdge[];
  seed: number;
}

export const densityOptions = [
  { label: 'Sparse', count: 40 },
  { label: 'Balanced', count: 72 },
  { label: 'Dense', count: 108 },
] as const;

export const nodeName = (id: number) => `N-${String(id + 1).padStart(3, '0')}`;

export function randomSource(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** A connected geometric graph. The spanning tree guarantees every pulse can reach every node. */
export function createNetwork(count: number, seed: number): Network {
  const random = randomSource(seed);
  const nodes: NeuralNode[] = [{ id: 0, x: 0.04, y: -0.02, degree: 0, phase: random() * Math.PI * 2 }];
  const separation = Math.sqrt(2.6 / count) * 0.72;
  let attempts = 0;
  while (nodes.length < count) {
    const x = (random() * 2 - 1) * 0.98;
    const y = (random() * 2 - 1) * 0.88;
    attempts++;
    if ((x * x) / 1.02 + (y * y) / 0.85 > 1) continue;
    if (attempts < count * 500 && nodes.some((node) => Math.hypot(node.x - x, node.y - y) < separation)) continue;
    nodes.push({ id: nodes.length, x, y, degree: 0, phase: random() * Math.PI * 2 });
  }

  const edges: NeuralEdge[] = [];
  const edgeKeys = new Set<string>();
  const distance = (a: number, b: number) => Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
  const addEdge = (a: number, b: number) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ a, b, length: distance(a, b), bend: (random() - 0.5) * 0.55, strength: 0.25 + random() * 0.75 });
    nodes[a].degree++;
    nodes[b].degree++;
  };

  // Prim's algorithm creates a short-wire backbone before local connections are added.
  const reached = new Set([0]);
  while (reached.size < count) {
    let shortest = Infinity;
    let from = 0;
    let to = 0;
    for (const a of reached) {
      for (let b = 0; b < count; b++) {
        if (reached.has(b)) continue;
        const length = distance(a, b);
        if (length < shortest) { shortest = length; from = a; to = b; }
      }
    }
    addEdge(from, to);
    reached.add(to);
  }

  for (const node of nodes) {
    const nearest = nodes.filter((other) => other.id !== node.id).sort((a, b) => distance(node.id, a.id) - distance(node.id, b.id));
    const neighbors = random() > 0.48 ? 3 : 2;
    for (const other of nearest.slice(0, neighbors)) addEdge(node.id, other.id);
  }
  return { nodes, edges, seed };
}

/** Travel distances through actual wires, used for the visible pulse wavefront. */
export function signalDistances(network: Network, source: number): number[] {
  const distances = network.nodes.map(() => Infinity);
  const visited = new Set<number>();
  distances[source] = 0;
  while (visited.size < network.nodes.length) {
    let current = -1;
    let best = Infinity;
    for (let i = 0; i < distances.length; i++) {
      if (!visited.has(i) && distances[i] < best) { best = distances[i]; current = i; }
    }
    if (current < 0) break;
    visited.add(current);
    for (const edge of network.edges) {
      const neighbor = edge.a === current ? edge.b : edge.b === current ? edge.a : -1;
      if (neighbor < 0) continue;
      distances[neighbor] = Math.min(distances[neighbor], best + edge.length);
    }
  }
  return distances;
}
