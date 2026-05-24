import { Graph }        from './graph.js';
import { Renderer }     from './renderer.js';
import { Evaluator }    from './evaluator.js';
import { ChipLibrary }  from './chipLibrary.js';
import { History }      from './history.js';
import { saveGraph, loadGraph, setupAutosave, loadAutosave } from './persistence.js';
import { CHIP_TYPES, CATEGORY_COLORS, DEFAULT_COLORS } from './chipTypes.js';

// ── Core objects ───────────────────────────────────────────────────────────────

const graph    = new Graph();
const library  = new ChipLibrary();
const renderer = new Renderer(graph, 'canvas-container', library);
const evaluator = new Evaluator(graph, library);

// ── Tab system ─────────────────────────────────────────────────────────────────
// tabStates: chipName → { history, viewState }
// '__main__' is the special key for the main graph.

const tabStates = new Map();
tabStates.set('__main__', { history: null, viewState: null });

let activeTab = '__main__';

function getActiveGraph() {
  return activeTab === '__main__' ? graph : library.get(activeTab);
}

function getActiveHistory() {
  return tabStates.get(activeTab)?.history;
}

function switchTab(chipName) {
  if (chipName === activeTab) return;

  // Save view state for current tab (guard in case entry was removed)
  const currentState = tabStates.get(activeTab);
  if (currentState) currentState.viewState = renderer.getViewState();

  // Ensure state entry exists for new tab
  if (!tabStates.has(chipName)) {
    tabStates.set(chipName, {
      history:   new History(library.get(chipName)),
      viewState: null,
    });
  }

  activeTab = chipName;
  renderer.switchGraph(getActiveGraph(), tabStates.get(chipName).viewState);
  renderTabBar();
  buildPalette();
}

function renderTabBar() {
  const bar = document.getElementById('tab-bar');
  bar.querySelectorAll('.tab').forEach(el => el.remove());

  const makeTab = (label, chipName) => {
    const tab = document.createElement('div');
    tab.className = 'tab' + (chipName === activeTab ? ' active' : '');

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    tab.appendChild(labelSpan);
    tab.addEventListener('click', () => switchTab(chipName));

    if (chipName !== '__main__') {
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '✕';
      close.title = 'Close tab';
      close.addEventListener('click', e => {
        e.stopPropagation();
        if (activeTab === chipName) switchTab('__main__');
        tabStates.delete(chipName);
        renderTabBar();
      });
      tab.appendChild(close);
    }

    return tab;
  };

  const newBtn = document.getElementById('btn-new-chip');
  bar.insertBefore(makeTab('Main', '__main__'), newBtn);
  for (const name of library.list()) {
    bar.insertBefore(makeTab(name, name), newBtn);
  }
}

library.onChange(renderTabBar);

// ── Demo graph ─────────────────────────────────────────────────────────────────

if (!loadAutosave(graph, library)) {
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

setupAutosave(graph, library);
tabStates.get('__main__').history = new History(graph);

renderTabBar();

// ── Undo / redo ────────────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!e.ctrlKey || document.activeElement?.tagName === 'INPUT') return;
  if (e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) getActiveHistory()?.redo(); else getActiveHistory()?.undo();
});

// ── New chip button ────────────────────────────────────────────────────────────

document.getElementById('btn-new-chip').addEventListener('click', () => {
  let name = prompt('Custom chip name:')?.trim();
  if (!name) return;
  let base = name, n = 2;
  while (library.has(name)) name = `${base}${n++}`;
  library.create(name);
  switchTab(name);
});

// ── Custom chip management ─────────────────────────────────────────────────────

function renameCustomChip(oldName) {
  const newName = prompt('New name:', oldName)?.trim();
  if (!newName || newName === oldName) return;
  if (library.has(newName)) { alert(`A chip named "${newName}" already exists.`); return; }

  library.rename(oldName, newName);

  // Sync tab state map key
  if (tabStates.has(oldName)) {
    tabStates.set(newName, tabStates.get(oldName));
    tabStates.delete(oldName);
  }
  if (activeTab === oldName) activeTab = newName;

  renderTabBar();
  buildPalette();
}

function deleteCustomChip(name) {
  if (!confirm(`Delete chip "${name}"? This cannot be undone.`)) return;
  if (activeTab === name) switchTab('__main__');
  tabStates.delete(name);
  library.remove(name);
}

// ── Chip palette ───────────────────────────────────────────────────────────────

const HIDDEN_CATEGORIES = new Set(['interface']);

function buildPalette() {
  const palette = document.getElementById('chip-palette');
  palette.innerHTML = '';

  const byCategory = {};
  for (const [key, def] of Object.entries(CHIP_TYPES)) {
    if (def.hidden || HIDDEN_CATEGORIES.has(def.category)) continue;
    (byCategory[def.category] ??= []).push({ key, def });
  }

  const CATEGORY_ORDER = ['value'];
  const sortedCategories = [
    ...CATEGORY_ORDER.filter(c => byCategory[c]),
    ...Object.keys(byCategory).filter(c => !CATEGORY_ORDER.includes(c)),
  ];

  const placeChip = key => {
    const center = renderer.viewportCenter();
    const jitter = () => (Math.random() - 0.5) * 48;
    getActiveGraph().addNode(key, center.x - 82 + jitter(), center.y - 30 + jitter());
  };

  for (const category of sortedCategories) {
    const colors = CATEGORY_COLORS[category] ?? DEFAULT_COLORS;
    palette.appendChild(makeCategoryDropdown(category, byCategory[category], colors, placeChip));
  }

  const customNames = library.list();
  if (customNames.length > 0) {
    const customColors = CATEGORY_COLORS.custom ?? DEFAULT_COLORS;
    const customChips  = customNames.map(name => ({ key: name, def: { label: name } }));
    palette.appendChild(makeCategoryDropdown('custom', customChips, customColors, placeChip, [
      { label: 'Edit',   className: 'palette-edit-btn',   onClick: name => switchTab(name) },
      { label: '✎',      className: 'palette-icon-btn',   onClick: renameCustomChip },
      { label: '✕',      className: 'palette-icon-btn palette-delete-btn', onClick: deleteCustomChip },
    ]));
  }

  if (activeTab !== '__main__') {
    const ifaceColors = CATEGORY_COLORS.interface ?? DEFAULT_COLORS;
    palette.appendChild(makeCategoryDropdown('interface', [
      { key: 'ChipIn',  def: CHIP_TYPES.ChipIn  },
      { key: 'ChipOut', def: CHIP_TYPES.ChipOut },
    ], ifaceColors, placeChip));
  }
}

function makeCategoryDropdown(category, chips, colors, onPlace, extraActions = null) {
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
    const row = document.createElement('div');
    row.className = 'palette-chip-row';

    const item = document.createElement('button');
    item.className = 'palette-chip-btn';
    item.textContent = def.label ?? key;
    item.addEventListener('click', () => { onPlace(key); wrap.classList.remove('open'); });
    row.appendChild(item);

    if (extraActions) {
      for (const action of extraActions) {
        const btn = document.createElement('button');
        btn.className = action.className;
        btn.textContent = action.label;
        btn.addEventListener('click', e => { e.stopPropagation(); action.onClick(key); wrap.classList.remove('open'); });
        row.appendChild(btn);
      }
    }

    dropdown.appendChild(row);
  }

  wrap.appendChild(catBtn);
  wrap.appendChild(dropdown);
  return wrap;
}

document.addEventListener('click', () => {
  document.querySelectorAll('.palette-category.open').forEach(el => el.classList.remove('open'));
});

library.onChange(buildPalette);
buildPalette();

// ── Toolbar: save / load ───────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', () => saveGraph(graph, library));
document.getElementById('btn-load').addEventListener('click', () => {
  loadGraph(graph, library)
    .then(() => { renderTabBar(); buildPalette(); })
    .catch(err => alert(`Load failed:\n\n${err.message}`));
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
  resizing = true; resizeStartY = e.clientY; resizeStartH = outputPanel.offsetHeight;
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
