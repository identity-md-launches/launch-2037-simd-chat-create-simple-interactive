import { createNetwork, densityOptions, nodeName } from './network';
import { NeuralRenderer, type PaletteName } from './renderer';

const icons: Record<string, string> = {
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.8 9a2.3 2.3 0 1 1 3.4 2c-1.2.7-1.2 1.1-1.2 2M12 16h.01"/>',
  sliders: '<path d="M4 7h5m4 0h7M4 17h9m4 0h3M9 4v6m8 4v6"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  minus: '<path d="M6 12h12"/>',
  plus: '<path d="M6 12h12M12 6v12"/>',
  fit: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/><circle cx="12" cy="12" r="2"/>',
  activity: '<path d="M2 12h4l3-7 5 14 3-7h5"/>',
  pulse: '<path d="m13 3-8 11h6l-1 7 9-12h-7l1-6Z"/>',
  pause: '<path d="M8 6v12M16 6v12" stroke-width="2.5"/>',
  play: '<path d="m9 5 10 7-10 7V5Z"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.7-1L20 9M4 15l2.2 3A7 7 0 0 0 18 17"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
};

function icon(name: string): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
}
document.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => { element.innerHTML = icon(element.dataset.icon!); });

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing UI element: ${id}`);
  return found as T;
}

const canvas = element<HTMLCanvasElement>('network');
const nodeSelect = element<HTMLSelectElement>('node-select');
const pauseButton = element<HTMLButtonElement>('pause-button');
const pulseButton = element<HTMLButtonElement>('pulse-button');
const density = element<HTMLInputElement>('density');
const speed = element<HTMLInputElement>('speed');
const environment = element<HTMLDetailsElement>('environment');
const dialog = element<HTMLDialogElement>('help-dialog');
const helpButton = element<HTMLButtonElement>('help-button');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const mobile = window.matchMedia('(max-width: 760px)');
let paused = reducedMotion.matches;
let pulseCount = 0;
let selected = 0;
let densityIndex = 1;
let seed = 82419;
let network = createNetwork(densityOptions[densityIndex].count, seed);
let renderer: NeuralRenderer | null = null;

environment.open = !mobile.matches;
mobile.addEventListener('change', (event) => { environment.open = !event.matches; });

function announce(message: string): void { element('announcement').textContent = message; }

function updateSelected(id: number): void {
  selected = id;
  nodeSelect.value = String(id);
  element('node-detail').textContent = `${network.nodes[id].degree} connections`;
  canvas.setAttribute('aria-label', `Neural network with ${network.nodes.length} nodes and ${network.edges.length} connections. ${nodeName(id)} selected. Arrow keys move the view. Use the Inspect node menu and Send a pulse button below.`);
}

function updateNetwork(): void {
  element('node-count').textContent = String(network.nodes.length);
  element('link-count').textContent = String(network.edges.length);
  nodeSelect.replaceChildren(...network.nodes.map((node) => {
    const option = document.createElement('option');
    option.value = String(node.id);
    option.textContent = nodeName(node.id);
    return option;
  }));
  updateSelected(0);
}

function updateMotion(): void {
  document.body.dataset.paused = String(paused);
  pauseButton.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
  pauseButton.title = `${paused ? 'Resume' : 'Pause'} simulation (Space)`;
  element('pause-icon').innerHTML = icon(paused ? 'play' : 'pause');
  element('motion-status').textContent = paused ? (reducedMotion.matches ? 'Reduced motion' : 'Simulation paused') : 'Network active';
  renderer?.setRunning(!paused);
}

function updateRange(input: HTMLInputElement): void {
  const percent = (Number(input.value) - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
  input.style.setProperty('--range-fill', `${percent}%`);
}

function regenerate(): void {
  seed = (seed + 7919) >>> 0;
  network = createNetwork(densityOptions[densityIndex].count, seed);
  renderer?.setNetwork(network);
  updateNetwork();
  announce(`New network generated with ${network.nodes.length} nodes and ${network.edges.length} connections.`);
}

updateNetwork();
try {
  renderer = new NeuralRenderer(canvas, network, (id) => {
    updateSelected(id);
    announce(`${nodeName(id)} selected, ${network.nodes[id].degree} connections.`);
  }, (zoom) => {
    element('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
    element<HTMLButtonElement>('zoom-in').disabled = zoom >= 2.4;
    element<HTMLButtonElement>('zoom-out').disabled = zoom <= 0.6;
  });
  updateMotion();
} catch {
  element('canvas-error').hidden = false;
  element('motion-status').textContent = 'Canvas unavailable';
  canvas.hidden = true;
  for (const control of document.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('.scene button, .scene select, .environment button, .environment input')) control.disabled = true;
}

pulseButton.addEventListener('click', () => {
  renderer?.pulse();
  pulseCount++;
  element('pulse-count').textContent = String(pulseCount);
  element('pulse-label').textContent = pulseCount === 1 ? 'pulse sent' : 'pulses sent';
  announce(`Pulse ${pulseCount} sent from ${nodeName(selected)}.${paused ? ' Shown as a still highlight while motion is paused.' : ''}`);
});

pauseButton.addEventListener('click', () => {
  paused = !paused;
  updateMotion();
  announce(paused ? 'Simulation paused. You can still select nodes and send a still pulse.' : 'Simulation resumed.');
});

nodeSelect.addEventListener('change', () => {
  updateSelected(Number(nodeSelect.value));
  renderer?.select(selected, true);
  announce(`${nodeName(selected)} selected, ${network.nodes[selected].degree} connections.`);
});

element('zoom-in').addEventListener('click', () => renderer?.zoomBy(0.2));
element('zoom-out').addEventListener('click', () => renderer?.zoomBy(-0.2));
element('reset-view').addEventListener('click', () => {
  renderer?.resetView();
  announce('Network view reset to 100%.');
});
element('regenerate-button').addEventListener('click', regenerate);

document.querySelectorAll<HTMLInputElement>('input[name="palette"]').forEach((input) => {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    renderer?.setPalette(input.value as PaletteName);
    announce(`${input.value[0].toUpperCase() + input.value.slice(1)} atmosphere selected.`);
  });
});

density.addEventListener('input', () => {
  densityIndex = Number(density.value);
  const option = densityOptions[densityIndex];
  element('density-value').textContent = option.label;
  density.setAttribute('aria-valuetext', `${option.label}, ${option.count} nodes`);
  updateRange(density);
  regenerate();
});
speed.addEventListener('input', () => {
  const value = Number(speed.value);
  renderer?.setSpeed(value);
  element('speed-value').textContent = `${value.toFixed(value % 0.5 === 0 ? 1 : 2)}×`;
  speed.setAttribute('aria-valuetext', `${value} times speed`);
  updateRange(speed);
});
updateRange(density);
updateRange(speed);

reducedMotion.addEventListener('change', (event) => {
  if (event.matches) { paused = true; updateMotion(); }
});

helpButton.addEventListener('click', () => { dialog.showModal(); });
element('close-help').addEventListener('click', () => dialog.close());
element('explore-button').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => helpButton.focus());
dialog.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
});
canvas.addEventListener('keydown', (event) => {
  const offset: Record<string, [number, number]> = { ArrowLeft: [32, 0], ArrowRight: [-32, 0], ArrowUp: [0, 32], ArrowDown: [0, -32] };
  const direction = offset[event.key];
  if (!direction) return;
  event.preventDefault();
  renderer?.panBy(...direction);
});
document.addEventListener('keydown', (event) => {
  if (!['Space', 'Enter'].includes(event.code) || event.repeat || dialog.open || !renderer) return;
  const target = event.target as HTMLElement;
  if (target.closest('button, input, select, textarea, a, summary, [contenteditable]')) return;
  event.preventDefault();
  if (event.code === 'Space') pauseButton.click();
  else pulseButton.click();
});

// Keep a restored back/forward-cache page usable; ordinary teardown is owned by the browser.
window.addEventListener('pageshow', (event) => { if (event.persisted) updateMotion(); });
