/**
 * main.js
 * Entry point: wires together the graph, renderer, and evaluator.
 * Also sets up the toolbar and creates a demo graph so you see something
 * interesting the moment you open the page.
 */

import { Graph }     from './graph.js';
import { Renderer }  from './renderer.js';
import { Evaluator } from './evaluator.js';
import { saveGraph, loadGraph, setupAutosave, loadAutosave } from './persistence.js';
import { History }   from './history.js';
import { CHIP_TYPES, CATEGORY_COLORS, DEFAULT_COLORS } from './chipTypes.js';

// ── Core objects ───────────────────────────────────────────────────────────────

const graph     = new Graph();
const renderer  = new Renderer(graph, 'canvas-container');
const evaluator = new Evaluator(graph);

// ── Demo graph: (4 + 3) × 2 = 14 ─────────────────────────────────────────────
// Only shown on first visit — autosave takes over after that.
if (!loadAutosave(graph)) {
  const n4  = graph.addNode('Number',   80, 100, { value: 4 });
  const n3  = graph.addNode('Number',   80, 240, { value: 3 });
  const add = graph.addNode('Add',      310, 165);
  const n2  = graph.addNode('Number',   310, 320, { value: 2 });
  const mul = graph.addNode('Multiply', 540, 230);

  graph.addEdge(n4.id,  'value',  add.id, 'a');
  graph.addEdge(n3.id,  'value',  add.id, 'b');
  graph.addEdge(add.id, 'result', mul.id, 'a');
  graph.addEdge(n2.id,  'value',  mul.id, 'b');
}

setupAutosave(graph);
const history = new History(graph);

// ── Undo / redo ────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!e.ctrlKey || document.activeElement?.tagName === 'INPUT') return;
  if (e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) history.redo(); else history.undo();
});

// ── Chip palette ───────────────────────────────────────────────────────────────

const byCategory = {};
for (const [key, def] of Object.entries(CHIP_TYPES)) {
  if (def.hidden) continue;
  (byCategory[def.category] ??= []).push({ key, def });
}

const palette = document.getElementById('chip-palette');

const CATEGORY_ORDER = ['value'];
const sortedCategories = [
  ...CATEGORY_ORDER.filter(c => byCategory[c]),
  ...Object.keys(byCategory).filter(c => !CATEGORY_ORDER.includes(c)),
];

for (const category of sortedCategories) {
  const chips = byCategory[category];
  const colors = CATEGORY_COLORS[category] ?? DEFAULT_COLORS;

  const wrap = document.createElement('div');
  wrap.className = 'palette-category';

  const catBtn = document.createElement('button');
  catBtn.className = 'palette-cat-btn';
  catBtn.textContent = category;
  catBtn.style.borderBottomColor = colors.portColor;
  catBtn.addEventListener('click', e => {
    e.stopPropagation();
    document.querySelectorAll('.palette-category.open').forEach(el => {
      if (el !== wrap) el.classList.remove('open');
    });
    wrap.classList.toggle('open');
  });

  const dropdown = document.createElement('div');
  dropdown.className = 'palette-dropdown';

  for (const { key, def } of chips) {
    const item = document.createElement('button');
    item.className = 'palette-chip-btn';
    item.textContent = def.label;
    item.addEventListener('click', () => {
      const center = renderer.viewportCenter();
      const jitter = () => (Math.random() - 0.5) * 48;
      graph.addNode(key, center.x - 82 + jitter(), center.y - 30 + jitter());
      wrap.classList.remove('open');
    });
    dropdown.appendChild(item);
  }

  wrap.appendChild(catBtn);
  wrap.appendChild(dropdown);
  palette.appendChild(wrap);
}

document.addEventListener('click', () => {
  document.querySelectorAll('.palette-category.open').forEach(el => el.classList.remove('open'));
});

// ── Toolbar: save / load ───────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', () => {
  saveGraph(graph);
});

document.getElementById('btn-load').addEventListener('click', () => {
  loadGraph(graph).catch(err => alert(`Load failed:\n\n${err.message}`));
});

// ── Output panel ───────────────────────────────────────────────────────────────

const outputPanel  = document.getElementById('output-panel');
const outputLines  = document.getElementById('output-lines');
const outputResize = document.getElementById('output-resize');
let panelHeight = 180;

function openPanel()  {
  outputPanel.style.height = panelHeight + 'px';
  document.getElementById('btn-output-toggle').textContent = '▾';
}
function closePanel() {
  outputPanel.style.height = '0';
  document.getElementById('btn-output-toggle').textContent = '▴';
}

document.getElementById('btn-output-toggle').addEventListener('click', () => {
  if (outputPanel.offsetHeight > 0) closePanel(); else openPanel();
});

document.getElementById('btn-output-clear').addEventListener('click', () => {
  outputLines.innerHTML = '';
});

let resizing = false, resizeStartY = 0, resizeStartH = 0;
outputResize.addEventListener('mousedown', e => {
  resizing = true;
  resizeStartY = e.clientY;
  resizeStartH = outputPanel.offsetHeight;
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!resizing) return;
  panelHeight = Math.max(60, Math.min(600, resizeStartH + (resizeStartY - e.clientY)));
  outputPanel.style.height = panelHeight + 'px';
});
document.addEventListener('mouseup', () => { resizing = false; });

// ── Toolbar: run ───────────────────────────────────────────────────────────────

document.getElementById('btn-run').addEventListener('click', () => {
  try {
    const { values, output } = evaluator.evaluate();
    renderer.showEvalResults(values);

    outputLines.innerHTML = '';
    if (output.length > 0) {
      for (const line of output) {
        const div = document.createElement('div');
        div.className = 'output-line';
        div.textContent = line;
        outputLines.appendChild(div);
      }
      openPanel();
      outputLines.scrollTop = outputLines.scrollHeight;
    }
  } catch (err) {
    alert(`Evaluation error:\n\n${err.message}`);
  }
});
