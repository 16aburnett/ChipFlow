import { CHIP_TYPES } from './chipTypes.js';
import { Heap }       from './heap.js';

export class Evaluator {
  constructor(graph, library = null) {
    this.graph   = graph;
    this.library = library;
  }

  evaluate() {
    const { nodes, edges } = this.graph.serialize();
    const order  = this._topoSort(nodes, edges);
    const heap   = new Heap();
    const values = {};
    const output = [];

    for (const nodeId of order) {
      const node = this.graph.nodes.get(nodeId);
      if (CHIP_TYPES[node.type]) {
        const def    = CHIP_TYPES[node.type];
        const inputs = this._gatherInputs(nodeId, edges, values, def.inputs);
        values[nodeId] = def.eval(inputs, node.props, heap, output);
      } else if (this.library?.has(node.type)) {
        const iface  = this.library.getInterface(node.type);
        const inputs = this._gatherInputs(nodeId, edges, values, iface.inputs);
        values[nodeId] = this._evalCustomChip(node.type, inputs, heap, output);
      }
    }

    return { values, output };
  }

  _gatherInputs(nodeId, edges, values, portDefs) {
    const inputs = {};
    for (const port of portDefs) {
      const edge = edges.find(e => e.toNode === nodeId && e.toPort === port.name);
      if (edge) inputs[port.name] = values[edge.fromNode]?.[edge.fromPort];
    }
    return inputs;
  }

  _evalCustomChip(chipType, inputs, heap, output) {
    const subGraph          = this.library.get(chipType);
    const { nodes, edges }  = subGraph.serialize();
    const order             = this._topoSort(nodes, edges);
    const values            = {};

    for (const nodeId of order) {
      const node = subGraph.nodes.get(nodeId);

      if (node.type === 'ChipIn') {
        values[nodeId] = { value: inputs[node.props.name] ?? null };
        continue;
      }

      if (this.library?.has(node.type)) {
        const iface      = this.library.getInterface(node.type);
        const nodeInputs = this._gatherInputs(nodeId, edges, values, iface.inputs);
        values[nodeId]   = this._evalCustomChip(node.type, nodeInputs, heap, output);
        continue;
      }

      const def = CHIP_TYPES[node.type];
      if (!def) continue;
      const nodeInputs   = this._gatherInputs(nodeId, edges, values, def.inputs);
      values[nodeId]     = def.eval(nodeInputs, node.props, heap, output);
    }

    // Collect results from ChipOut nodes
    const result = {};
    for (const node of subGraph.nodes.values()) {
      if (node.type === 'ChipOut') {
        result[node.props.name || 'out'] = values[node.id]?._out ?? null;
      }
    }
    return result;
  }

  // ── Kahn's algorithm topological sort ─────────────────────────────────────

  _topoSort(nodes, edges) {
    const ids      = nodes.map(n => n.id);
    const inDegree = Object.fromEntries(ids.map(id => [id, 0]));
    const adj      = Object.fromEntries(ids.map(id => [id, []]));

    for (const e of edges) {
      if (adj[e.fromNode] !== undefined)    adj[e.fromNode].push(e.toNode);
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
        'ChipFlow graphs must be acyclic (DAG only).'
      );
    }

    return result;
  }
}
