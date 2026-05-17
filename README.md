# ChipFlow

A dataflow visual programming language that runs in the browser. Connect chips with wires to build computation graphs — data flows from source chips through operations to outputs.

![demo: (4 + 3) × 2 = 14]

## Getting started

No build step required. Open `index.html` in a browser.

If you run into cors issues, you may need to start a server:
```bash
npx serve .
```

## Controls

| Action | How |
|---|---|
| Add a chip | Toolbar buttons at the top |
| Connect chips | Drag from an output port to an input port |
| Delete a wire | Click it |
| Delete a chip | Right-click it |
| Edit a value chip | Double-click it |
| Pan | Drag the canvas background |
| Zoom | Scroll wheel |
| Run the graph | **▶ Run** button |

## Built-in chips

| Category | Chips |
|---|---|
| **Value** | Number, Boolean |
| **Math** | Add, Subtract, Multiply, Divide |
| **Compare** | Less Than, Equal |
| **Control** | Branch |

## Architecture

```
src/
  chipTypes.js   — declarative chip registry (add a chip by adding one entry)
  graph.js       — data model: nodes + directed edges, event emitter
  evaluator.js   — Kahn's topological sort; detects cycles at runtime
  renderer.js    — Konva canvas: chips, bezier-curve wires, zoom/pan
  main.js        — wires everything together, seeds the demo graph
```

## Planned features

- Custom chips — encapsulate a subgraph as a reusable chip with its own inputs/outputs
- Looping constructs
- Step-by-step animation of data flowing through the graph
- Save / load graphs
- Print / log output chips
