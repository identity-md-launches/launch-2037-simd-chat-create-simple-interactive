import { nodeName, randomSource, signalDistances, type Network, type NeuralEdge } from './network';

type RGB = readonly [number, number, number];
export type PaletteName = 'aurora' | 'ion' | 'ember';
interface Palette { primary: RGB; secondary: RGB; core: RGB }
export const palettes: Record<PaletteName, Palette> = {
  aurora: { primary: [116, 225, 170], secondary: [175, 143, 236], core: [224, 255, 239] },
  ion: { primary: [109, 199, 248], secondary: [160, 153, 255], core: [229, 248, 255] },
  ember: { primary: [244, 182, 119], secondary: [236, 131, 166], core: [255, 243, 224] },
};
const rgba = (color: RGB, alpha: number) => `rgba(${color.join(',')},${Math.max(0, Math.min(1, alpha))})`;
interface Point { x: number; y: number }
interface Wire { start: Point; end: Point; control: Point; path: Path2D; color: RGB }
interface Pulse { distances: number[]; age: number; duration: number }

function pointOnWire(wire: Wire, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * wire.start.x + 2 * u * t * wire.control.x + t * t * wire.end.x,
    y: u * u * wire.start.y + 2 * u * t * wire.control.y + t * t * wire.end.y,
  };
}

export class NeuralRenderer {
  private readonly context: CanvasRenderingContext2D;
  private readonly layer = document.createElement('canvas');
  private readonly layerContext: CanvasRenderingContext2D;
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private frame = 0;
  private lastTime = 0;
  private elapsed = 0;
  private running = true;
  private speed = 1;
  private selected = 0;
  private hovered = -1;
  private palette: Palette = palettes.aurora;
  private zoom = 1;
  private pan: Point = { x: 0, y: 0 };
  private points: Point[] = [];
  private wires: Wire[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private pulses: Pulse[] = [];
  private stillPulse: number[] | null = null;
  private pointer: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean; touch: boolean } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private network: Network,
    private readonly onSelect: (id: number) => void,
    private readonly onZoom: (zoom: number) => void,
  ) {
    const context = canvas.getContext('2d', { alpha: true });
    const layerContext = this.layer.getContext('2d');
    if (!context || !layerContext) throw new Error('Canvas 2D is unavailable');
    this.context = context;
    this.layerContext = layerContext;
    this.makeSprites();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement!);
    const options = { signal: this.abort.signal };
    canvas.addEventListener('pointerdown', this.pointerDown, options);
    canvas.addEventListener('pointermove', this.pointerMove, options);
    canvas.addEventListener('pointerup', this.pointerUp, options);
    canvas.addEventListener('pointercancel', this.pointerCancel, options);
    canvas.addEventListener('lostpointercapture', this.pointerCancel, options);
    canvas.addEventListener('pointerleave', () => { this.hovered = -1; if (!this.running) this.draw(); }, options);
    canvas.addEventListener('wheel', this.wheel, { ...options, passive: false });
    document.addEventListener('visibilitychange', this.visibilityChange, options);
    this.resize();
    this.schedule();
  }

  setNetwork(network: Network): void {
    this.network = network;
    this.selected = 0;
    this.hovered = -1;
    this.pulses = [];
    this.stillPulse = null;
    this.resetView();
  }

  setPalette(name: PaletteName): void {
    this.palette = palettes[name];
    this.makeSprites();
    this.rebuild();
  }

  setSpeed(speed: number): void { this.speed = speed; }

  setRunning(running: boolean): void {
    this.running = running;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    if (running) {
      this.stillPulse = null;
      this.schedule();
    } else {
      this.draw();
    }
  }

  select(id: number, reveal = false): void {
    if (!this.network.nodes[id]) return;
    this.selected = id;
    if (reveal) {
      const point = this.points[id];
      if (point && (point.x < 24 || point.x > this.width - 24 || point.y < 24 || point.y > this.height - 64)) {
        this.pan.x += this.width / 2 - point.x;
        this.pan.y += this.height * 0.45 - point.y;
        this.rebuild();
      }
    }
    this.draw();
  }

  pulse(): void {
    const distances = signalDistances(this.network, this.selected);
    if (!this.running) {
      this.stillPulse = distances;
      this.draw();
      return;
    }
    this.pulses.push({ distances, age: 0, duration: Math.max(...distances) * 0.8 + 1.4 });
    // Repeated activation stays bounded even at the slowest speed.
    if (this.pulses.length > 8) this.pulses.shift();
    this.schedule();
  }

  zoomBy(delta: number): void { this.setZoom(this.zoom + delta); }

  panBy(x: number, y: number): void {
    this.pan.x = Math.max(-this.width * 1.5, Math.min(this.width * 1.5, this.pan.x + x));
    this.pan.y = Math.max(-this.height * 1.5, Math.min(this.height * 1.5, this.pan.y + y));
    this.rebuild();
  }

  resetView(): void {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.onZoom(this.zoom);
    this.rebuild();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.abort.abort();
  }

  private setZoom(value: number, anchor: Point = { x: this.width / 2, y: this.height * 0.46 }): void {
    const next = Math.max(0.6, Math.min(2.4, Math.round(value * 100) / 100));
    const center = { x: this.width / 2, y: this.height * 0.46 };
    this.pan.x = anchor.x - center.x - (anchor.x - center.x - this.pan.x) * (next / this.zoom);
    this.pan.y = anchor.y - center.y - (anchor.y - center.y - this.pan.y) * (next / this.zoom);
    this.zoom = next;
    this.onZoom(next);
    this.rebuild();
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.width * this.pixelRatio);
    this.canvas.height = Math.round(this.height * this.pixelRatio);
    this.layer.width = this.canvas.width;
    this.layer.height = this.canvas.height;
    this.context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.layerContext.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    this.pan = { x: 0, y: 0 };
    this.rebuild();
  }

  private rebuild(): void {
    if (!this.width || !this.height) return;
    const xScale = this.width * (this.width < 500 ? 0.44 : 0.45) * this.zoom;
    const yScale = this.height * 0.46 * this.zoom;
    this.points = this.network.nodes.map((node) => ({
      x: this.width / 2 + node.x * xScale + this.pan.x,
      y: this.height * 0.46 + node.y * yScale + this.pan.y,
    }));
    this.wires = this.network.edges.map((edge) => {
      const start = this.points[edge.a];
      const end = this.points[edge.b];
      const control = { x: (start.x + end.x) / 2 + (end.y - start.y) * edge.bend, y: (start.y + end.y) / 2 - (end.x - start.x) * edge.bend };
      const path = new Path2D();
      path.moveTo(start.x, start.y);
      path.quadraticCurveTo(control.x, control.y, end.x, end.y);
      return { start, end, control, path, color: this.isSecondary(edge.a) || this.isSecondary(edge.b) ? this.palette.secondary : this.palette.primary };
    });
    const context = this.layerContext;
    context.clearRect(0, 0, this.width, this.height);
    const haze = context.createRadialGradient(this.width * 0.45, this.height * 0.5, 0, this.width * 0.45, this.height * 0.5, Math.max(this.width, this.height) * 0.52);
    haze.addColorStop(0, rgba(this.palette.primary, 0.035));
    haze.addColorStop(0.65, rgba(this.palette.primary, 0.012));
    haze.addColorStop(1, rgba(this.palette.primary, 0));
    context.fillStyle = haze;
    context.fillRect(0, 0, this.width, this.height);
    const random = randomSource(this.network.seed + 8);
    for (let i = 0; i < 65; i++) {
      const x = random() * this.width;
      const y = random() * this.height;
      context.fillStyle = rgba(this.palette.core, random() * 0.16 + 0.03);
      context.fillRect(x, y, random() > 0.9 ? 2 : 1, 1);
    }
    this.wires.forEach((wire, index) => {
      const edge = this.network.edges[index];
      context.lineWidth = 0.65 + edge.strength * 0.45;
      context.strokeStyle = rgba(wire.color, 0.16 + edge.strength * 0.34);
      context.shadowBlur = 7;
      context.shadowColor = rgba(wire.color, 0.35);
      context.stroke(wire.path);
    });
    context.shadowBlur = 0;
    this.draw();
  }

  private isSecondary(id: number): boolean {
    const node = this.network.nodes[id];
    return node.x > 0.32 && node.y < 0.36 || node.y > 0.5 && node.x > -0.22;
  }

  private makeSprites(): void {
    this.sprites = [this.palette.primary, this.palette.secondary].map((color) => {
      const sprite = document.createElement('canvas');
      sprite.width = 96;
      sprite.height = 96;
      const context = sprite.getContext('2d')!;
      const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
      gradient.addColorStop(0, rgba(color, 0.65));
      gradient.addColorStop(0.12, rgba(color, 0.28));
      gradient.addColorStop(0.4, rgba(color, 0.07));
      gradient.addColorStop(1, rgba(color, 0));
      context.fillStyle = gradient;
      context.fillRect(0, 0, 96, 96);
      return sprite;
    });
  }

  private schedule(): void {
    if (!this.frame && this.running && !document.hidden) this.frame = requestAnimationFrame(this.tick);
  }

  private tick = (time: number): void => {
    this.frame = 0;
    // Clamp a long frame instead of catching up after backgrounding or a busy main thread.
    const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.05) : 0;
    this.lastTime = time;
    this.elapsed += delta * this.speed;
    for (const pulse of this.pulses) pulse.age += delta * this.speed;
    this.pulses = this.pulses.filter((pulse) => pulse.age < pulse.duration);
    this.draw();
    this.schedule();
  };

  private draw(): void {
    if (!this.width || !this.points.length) return;
    const context = this.context;
    context.clearRect(0, 0, this.width, this.height);
    context.drawImage(this.layer, 0, 0, this.width, this.height);
    context.lineCap = 'round';

    // Ambient signals follow the same quadratic curves as the cached wires.
    this.wires.forEach((wire, index) => {
      const edge = this.network.edges[index];
      if (index % 5 === 0) {
        const progress = (this.elapsed * (0.09 + edge.strength * 0.07) + index * 0.618) % 1;
        this.drawSignal(wire, progress, 0.5, 0.08);
      }
      if (this.stillPulse && Math.min(this.stillPulse[edge.a], this.stillPulse[edge.b]) < 0.85) {
        context.strokeStyle = rgba(wire.color, 0.86);
        context.lineWidth = 1.7;
        context.stroke(wire.path);
      }
      for (const pulse of this.pulses) {
        this.drawPulseOnWire(wire, edge, pulse);
      }
    });

    this.network.nodes.forEach((node, index) => {
      const point = this.points[index];
      const secondary = this.isSecondary(index);
      const color = secondary ? this.palette.secondary : this.palette.primary;
      const breathing = 0.72 + Math.sin(this.elapsed * 0.9 + node.phase) * 0.18;
      let activation = this.stillPulse && this.stillPulse[index] < 0.9 ? 0.8 : 0;
      for (const pulse of this.pulses) {
        const age = pulse.age - pulse.distances[index] * 0.8;
        if (age >= 0 && age < 0.9) activation = Math.max(activation, (1 - age / 0.9) * 1.2);
      }
      const selected = index === this.selected;
      const radius = (node.degree >= 5 ? 3.1 : node.degree >= 3 ? 2 : 1.4) + activation * 1.5;
      const glow = (node.degree >= 5 ? 55 : 34) + activation * 36 + (selected ? 26 : 0);
      context.globalAlpha = breathing + activation * 0.2;
      context.drawImage(this.sprites[secondary ? 1 : 0], point.x - glow / 2, point.y - glow / 2, glow, glow);
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(point.x, point.y, radius, 0, Math.PI * 2);
      context.fillStyle = rgba(color, breathing + activation * 0.25);
      context.fill();
      context.beginPath();
      context.arc(point.x, point.y, radius * 0.4, 0, Math.PI * 2);
      context.fillStyle = rgba(this.palette.core, 0.95);
      context.fill();
      if (node.degree >= 5) {
        context.beginPath();
        context.arc(point.x, point.y, radius + 4, 0, Math.PI * 2);
        context.strokeStyle = rgba(color, 0.2);
        context.lineWidth = 0.7;
        context.stroke();
      }
      if (selected || index === this.hovered) {
        context.beginPath();
        context.arc(point.x, point.y, selected ? 13 : 10, 0, Math.PI * 2);
        context.strokeStyle = rgba(color, selected ? 0.8 : 0.45);
        context.lineWidth = 1;
        context.stroke();
        if (selected) {
          context.beginPath();
          context.arc(point.x, point.y, 19, 0, Math.PI * 2);
          context.setLineDash([2, 5]);
          context.strokeStyle = rgba(color, 0.3);
          context.stroke();
          context.setLineDash([]);
        }
        this.drawLabel(point, index, color, selected);
      } else if (node.degree >= 5 && index % 3 === 0 && this.width > 500) {
        this.drawLabel(point, index, color, false);
      }
    });
  }

  private drawSignal(wire: Wire, progress: number, intensity: number, tail: number): void {
    const context = this.context;
    for (let i = 8; i >= 0; i--) {
      const t = progress - (i / 8) * tail;
      if (t < 0 || t > 1) continue;
      const point = pointOnWire(wire, t);
      context.beginPath();
      context.arc(point.x, point.y, i === 0 ? 1.5 : 0.9, 0, Math.PI * 2);
      context.fillStyle = rgba(i === 0 ? this.palette.core : wire.color, intensity * (1 - i / 9));
      context.fill();
    }
  }

  private drawPulseOnWire(wire: Wire, edge: NeuralEdge, pulse: Pulse): void {
    const reverse = pulse.distances[edge.b] < pulse.distances[edge.a];
    const departure = Math.min(pulse.distances[edge.a], pulse.distances[edge.b]) * 0.8;
    const duration = edge.length * 0.8;
    const progress = (pulse.age - departure) / duration;
    if (progress < 0 || progress > 1.8) return;
    const context = this.context;
    context.strokeStyle = rgba(wire.color, Math.max(0, 1 - progress / 1.8) * 0.65);
    context.lineWidth = 1.5;
    context.stroke(wire.path);
    if (progress <= 1) {
      if (reverse) this.drawSignal({ ...wire, start: wire.end, end: wire.start }, progress, 1, 0.18);
      else this.drawSignal(wire, progress, 1, 0.18);
    }
  }

  private drawLabel(point: Point, id: number, color: RGB, selected: boolean): void {
    const context = this.context;
    context.font = '10px monospace';
    context.fillStyle = rgba(color, selected ? 0.9 : 0.4);
    context.fillText(nodeName(id), point.x + (selected ? 25 : 12), point.y + 4);
  }

  private visibilityChange = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.lastTime = 0;
    this.schedule();
  };

  private pointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) return;
    this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false, touch: event.pointerType === 'touch' };
    this.canvas.setPointerCapture(event.pointerId);
  };

  private pointerMove = (event: PointerEvent): void => {
    if (this.pointer && event.pointerId === this.pointer.id) {
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.hypot(event.clientX - this.pointer.startX, event.clientY - this.pointer.startY) > 6) this.pointer.moved = true;
      if (this.pointer.moved) {
        this.pan.x = Math.max(-this.width * 1.5, Math.min(this.width * 1.5, this.pan.x + dx));
        // One-finger vertical gestures remain available for page scrolling on phones.
        if (!this.pointer.touch) this.pan.y = Math.max(-this.height * 1.5, Math.min(this.height * 1.5, this.pan.y + dy));
        this.rebuild();
      }
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      return;
    }
    this.hovered = this.hitTest(event.clientX, event.clientY);
    this.canvas.style.cursor = this.hovered >= 0 ? 'pointer' : 'grab';
    if (!this.running) this.draw();
  };

  private pointerUp = (event: PointerEvent): void => {
    if (this.pointer && event.pointerId === this.pointer.id && !this.pointer.moved) {
      const id = this.hitTest(event.clientX, event.clientY);
      if (id >= 0) { this.selected = id; this.onSelect(id); this.draw(); }
    }
    this.pointer = null;
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  };

  private pointerCancel = (): void => { this.pointer = null; };

  private hitTest(x: number, y: number): number {
    const bounds = this.canvas.getBoundingClientRect();
    let nearest = -1;
    let distance = 22;
    this.points.forEach((point, id) => {
      const candidate = Math.hypot(point.x - (x - bounds.left), point.y - (y - bounds.top));
      if (candidate < distance) { nearest = id; distance = candidate; }
    });
    return nearest;
  }

  private wheel = (event: WheelEvent): void => {
    if (event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const bounds = this.canvas.getBoundingClientRect();
    this.setZoom(this.zoom + (event.deltaY < 0 ? 0.1 : -0.1), { x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  };
}
