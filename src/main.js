/**
 * main.js
 * Entry point: wires together the graph, renderer, and evaluator.
 * Also sets up the toolbar and creates a demo graph so you see something
 * interesting the moment you open the page.
 */

import { Graph }     from './graph.js';
import { Renderer }  from './renderer.js';
import { Evaluator } from './evaluator.js';
import { saveGraph, loadGraph } from './persistence.js';

// ── Core objects ───────────────────────────────────────────────────────────────

const graph     = new Graph();
const renderer  = new Renderer(graph, 'canvas-container');
const evaluator = new Evaluator(graph);

// ── Demo graph: (4 + 3) × 2 = 14 ─────────────────────────────────────────────
//
// [Number: 4] ──a─┐
//                  [Add] ──result──a─┐
// [Number: 3] ──b─┘                  [Multiply] ──result──▶ 14
//                       [Number: 2] ──────────b─┘

const n4  = graph.addNode('Number',   80, 100, { value: 4 });
const n3  = graph.addNode('Number',   80, 240, { value: 3 });
const add = graph.addNode('Add',      310, 165);
const n2  = graph.addNode('Number',   310, 320, { value: 2 });
const mul = graph.addNode('Multiply', 540, 230);

graph.addEdge(n4.id,  'value',  add.id, 'a');
graph.addEdge(n3.id,  'value',  add.id, 'b');
graph.addEdge(add.id, 'result', mul.id, 'a');
graph.addEdge(n2.id,  'value',  mul.id, 'b');

// ── Toolbar: add chips ─────────────────────────────────────────────────────────

document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', () => {
    const type   = btn.dataset.add;
    const center = renderer.viewportCenter();
    // Small random jitter so repeated clicks don't stack chips perfectly
    const jitter = () => (Math.random() - 0.5) * 48;
    graph.addNode(type, center.x - 82 + jitter(), center.y - 30 + jitter());
  });
});

// ── Toolbar: save / load ───────────────────────────────────────────────────────

document.getElementById('btn-save').addEventListener('click', () => {
  saveGraph(graph);
});

document.getElementById('btn-load').addEventListener('click', () => {
  loadGraph(graph).catch(err => alert(`Load failed:\n\n${err.message}`));
});

// ── Toolbar: run ───────────────────────────────────────────────────────────────

document.getElementById('btn-run').addEventListener('click', () => {
  try {
    const results = evaluator.evaluate();
    renderer.showEvalResults(results);

    // Also log the leaf output values to the console in a friendly format
    const summary = {};
    for (const [nodeId, ports] of Object.entries(results)) {
      const node = graph.nodes.get(nodeId);
      summary[`${node.type}[${nodeId}]`] = ports;
    }
    console.table(summary);
  } catch (err) {
    alert(`Evaluation error:\n\n${err.message}`);
  }
});
