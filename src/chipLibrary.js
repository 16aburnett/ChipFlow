import { Graph } from './graph.js';

export class ChipLibrary {
  constructor() {
    this._chips     = new Map();  // name → Graph
    this._listeners = [];
  }

  // ── Event system ───────────────────────────────────────────────────────────

  onChange(fn) { this._listeners.push(fn); }
  _emit()      { for (const fn of this._listeners) fn(); }

  // ── CRUD ───────────────────────────────────────────────────────────────────

  create(name) {
    const graph = new Graph();
    this._chips.set(name, graph);
    graph.on(() => this._emit());
    this._emit();
    return graph;
  }

  has(name)    { return this._chips.has(name); }
  get(name)    { return this._chips.get(name); }
  list()       { return [...this._chips.keys()]; }

  remove(name) {
    this._chips.delete(name);
    this._emit();
  }

  rename(oldName, newName) {
    if (!this._chips.has(oldName) || this._chips.has(newName)) return false;
    const graph = this._chips.get(oldName);
    this._chips.delete(oldName);
    this._chips.set(newName, graph);
    this._emit();
    return true;
  }

  // ── Interface derivation ───────────────────────────────────────────────────
  // Scans ChipIn/ChipOut nodes in the subgraph to build a def-like object.

  getInterface(name) {
    const graph = this._chips.get(name);
    if (!graph) return null;
    const inputs = [], outputs = [];
    const inNames = new Set(), outNames = new Set();
    for (const node of graph.nodes.values()) {
      if (node.type === 'ChipIn') {
        const portName = node.props.name || 'in';
        if (inNames.has(portName)) console.warn(`[ChipFlow] Chip "${name}" has duplicate input port "${portName}"`);
        inNames.add(portName);
        inputs.push({ name: portName, type: 'any' });
      }
      if (node.type === 'ChipOut') {
        const portName = node.props.name || 'out';
        if (outNames.has(portName)) console.warn(`[ChipFlow] Chip "${name}" has duplicate output port "${portName}"`);
        outNames.add(portName);
        outputs.push({ name: portName, type: 'any' });
      }
    }
    return {
      label: name, category: 'custom',
      inputs, outputs, defaultProps: {}, isCustom: true,
    };
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  serialize() {
    const result = {};
    for (const [name, graph] of this._chips) result[name] = graph.serialize();
    return result;
  }

  loadFrom(data) {
    this._chips.clear();
    for (const [name, graphData] of Object.entries(data)) {
      const graph = new Graph();
      graph.loadFrom(graphData);
      graph.on(() => this._emit());
      this._chips.set(name, graph);
    }
    this._emit();
  }
}
