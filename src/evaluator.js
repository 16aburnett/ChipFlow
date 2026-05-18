/**
 * evaluator.js
 * Evaluates a graph by topologically sorting its nodes and running each chip's
 * eval() function in dependency order.
 *
 * Returns a Map: nodeId → { portName → value }
 * which the renderer can use to animate wires and display results.
 */

import { CHIP_TYPES } from './chipTypes.js';
import { Heap }       from './heap.js';

export class Evaluator {
  constructor(graph) {
    this.graph = graph;
  }

  /**
   * Run the full graph and return all output values.
   * @returns {{ [nodeId: string]: { [portName: string]: any } }}
   */
  evaluate() {
    const { nodes, edges } = this.graph.serialize();
    const order  = this._topoSort(nodes, edges);
    const heap   = new Heap();
    const values = {};

    for (const nodeId of order) {
      const node = this.graph.nodes.get(nodeId);
      const def  = CHIP_TYPES[node.type];

      const inputs = {};
      for (const port of def.inputs) {
        const edge = edges.find(e => e.toNode === nodeId && e.toPort === port.name);
        if (edge) inputs[port.name] = values[edge.fromNode]?.[edge.fromPort];
      }

      values[nodeId] = def.eval(inputs, node.props, heap);
    }

    return values;
  }

  // ── Kahn's algorithm topological sort ─────────────────────────────────────

  _topoSort(nodes, edges) {
    const ids       = nodes.map(n => n.id);
    const inDegree  = Object.fromEntries(ids.map(id => [id, 0]));
    const adj       = Object.fromEntries(ids.map(id => [id, []]));

    for (const e of edges) {
      if (adj[e.fromNode] !== undefined)  adj[e.fromNode].push(e.toNode);
      if (inDegree[e.toNode] !== undefined) inDegree[e.toNode]++;
    }

    const queue  = ids.filter(id => inDegree[id] === 0);
    const result = [];

    while (queue.length > 0) {
      const id = queue.shift();
      result.push(id);
      for (const next of adj[id]) {
        inDegree[next]--;
        if (inDegree[next] === 0) queue.push(next);
      }
    }

    if (result.length !== ids.length) {
      throw new Error(
        'Graph contains a cycle — evaluation aborted. ' +
        'ChipFlow graphs must be acyclic (use While/Map chips for iteration).'
      );
    }

    return result;
  }
}
