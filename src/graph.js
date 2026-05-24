/**
 * graph.js
 * Pure data model for the node graph. No rendering dependencies.
 *
 * Emits events so the renderer (or anything else) can react to changes:
 *   node-added, node-moved, node-updated, node-removed,
 *   edge-added, edge-removed
 */

import { CHIP_TYPES } from './chipTypes.js';

export class Graph {
  constructor() {
    this._counter = 1;
    /** @type {Map<string, GraphNode>} */
    this.nodes = new Map();
    /** @type {GraphEdge[]} */
    this.edges = [];
    /** @type {Function[]} */
    this._listeners = [];
  }

  _uid() {
    return String(this._counter++);
  }

  // ── Event system ───────────────────────────────────────────────────────────

  on(fn) {
    this._listeners.push(fn);
  }

  _emit(event) {
    for (const fn of this._listeners) fn(event);
  }

  // ── Nodes ──────────────────────────────────────────────────────────────────

  /**
   * Add a new chip node to the graph.
   * @param {string} type  - key from CHIP_TYPES
   * @param {number} x     - world x
   * @param {number} y     - world y
   * @param {object} props - initial prop overrides (e.g. { value: 42 })
   */
  addNode(type, x, y, props = {}) {
    const def  = CHIP_TYPES[type];   // may be undefined for custom chip types
    const node = {
      id:    this._uid(),
      type,
      x,
      y,
      props: { ...(def?.defaultProps ?? {}), ...props },
    };

    this.nodes.set(node.id, node);
    this._emit({ type: 'node-added', node });
    return node;
  }

  /** Update the (x, y) position of a node. */
  moveNode(id, x, y) {
    const node = this.nodes.get(id);
    if (!node) return;
    node.x = x;
    node.y = y;
    this._emit({ type: 'node-moved', node });
  }

  /** Update arbitrary props on a node (e.g. the value of a Number chip). */
  updateNodeProps(id, props) {
    const node = this.nodes.get(id);
    if (!node) return;
    Object.assign(node.props, props);
    this._emit({ type: 'node-updated', node });
  }

  /** Remove a node and all edges connected to it. */
  removeNode(id) {
    const removedEdges = this.edges.filter(
      e => e.fromNode === id || e.toNode === id,
    );
    this.edges = this.edges.filter(
      e => e.fromNode !== id && e.toNode !== id,
    );
    this.nodes.delete(id);
    this._emit({ type: 'node-removed', id, removedEdges });
  }

  // ── Edges ──────────────────────────────────────────────────────────────────

  /**
   * Connect an output port to an input port.
   * Each input port accepts at most one incoming edge — any existing edge to
   * the same (toNode, toPort) is replaced.
   */
  addEdge(fromNode, fromPort, toNode, toPort) {
    // Remove any existing edge feeding the same input port
    this.edges = this.edges.filter(
      e => !(e.toNode === toNode && e.toPort === toPort),
    );
    const edge = { id: this._uid(), fromNode, fromPort, toNode, toPort };
    this.edges.push(edge);
    this._emit({ type: 'edge-added', edge });
    return edge;
  }

  removeEdge(id) {
    const edge = this.edges.find(e => e.id === id);
    if (!edge) return;
    this.edges = this.edges.filter(e => e.id !== id);
    this._emit({ type: 'edge-removed', id });
  }

  /** All edges that touch a given node (as source or destination). */
  edgesForNode(nodeId) {
    return this.edges.filter(
      e => e.fromNode === nodeId || e.toNode === nodeId,
    );
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  loadFrom({ nodes, edges }) {
    for (const id of [...this.nodes.keys()]) this.removeNode(id);

    for (const node of nodes) {
      const n = { ...node, props: { ...node.props } };
      this.nodes.set(n.id, n);
      this._emit({ type: 'node-added', node: n });
    }

    for (const edge of edges) {
      const e = { ...edge };
      this.edges.push(e);
      this._emit({ type: 'edge-added', edge: e });
    }

    // Bump counter above all loaded IDs to prevent future collisions
    const allIds = [...nodes.map(n => n.id), ...edges.map(e => e.id)];
    const maxId  = Math.max(0, ...allIds.map(id => parseInt(id) || 0));
    this._counter = maxId + 1;
  }

  serialize() {
    return {
      nodes: [...this.nodes.values()],
      edges: [...this.edges],
    };
  }
}

/**
 * @typedef {{ id: string, type: string, x: number, y: number, props: object }} GraphNode
 * @typedef {{ id: string, fromNode: string, fromPort: string, toNode: string, toPort: string }} GraphEdge
 */
