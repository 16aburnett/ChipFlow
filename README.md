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

### Milestone 1 — Foundation
- Save / load graphs to JSON
- LocalStorage autosave
- Inline value editing (replace browser `prompt()`)
- Undo / redo

### Milestone 2 — Type system & wire model

**Scalar value types** flow directly on wires and are copied freely. Wire appearance encodes the type at a glance:

| Type | Width | Wire thickness | Color |
|---|---|---|---|
| `bool`/`bit` | 1 bit | thinnest | — |
| `char`/`u8` | 8 bit | thin | — |
| `i32` / `f32` | 32 bit | medium | — |
| `i64` / `f64` | 64 bit | thick | — |
| `address` | 64 bit | thick | distinct color |

Each type also gets a distinct color. Thickness follows bit width — wider types carry more data and look heavier. Arrays and vectors are not passed on wires; large data lives in heap memory and is accessed via `address` pointers.

**Heap memory** is managed explicitly via chips. The evaluator owns a single `ArrayBuffer` (up to ~2GB) with a free-list allocator. Pointers are `address` values — `u32` offsets into the buffer — and are just another scalar type on the wire.

| Chip | Inputs | Outputs | Notes |
|---|---|---|---|
| `Malloc` | `size: i32` | `ptr: address` | Allocates a block |
| `Store` | `ptr: address, offset: i32, value: T` | `ptr: address` | Writes typed value; passes ptr through to encode ordering |
| `Load` | `ptr: address, offset: i32` | `value: T` | Reads typed value |
| `Free` | `ptr: address` | — | Returns block to allocator |

Sequencing is implicit: chaining `Store → Store → Load` through the pointer wire creates the correct dependency order with no special control-flow wires. Parallel stores to non-overlapping offsets can fan out freely — the topo-sort schedules them in the same layer.

The evaluator signature becomes `eval(inputs, props, heap) → outputs`.

Other chips in this milestone:
- **Typed arithmetic & comparison:** one op per scalar type (`IAdd`, `FAdd`, `ICmp`, etc.)
- **Single-bit logic gates:** AND, OR, XOR, NOT, NAND, NOR, XNOR — operate on `bool` inputs/outputs
- **Bitwise integer ops:** BitwiseAnd, BitwiseOr, BitwiseXor, BitwiseNot, ShiftLeft, ShiftRight, RotateLeft, RotateRight — operate on `i32`/`i64`
- **Type conversion:** explicit cast chips between scalar types
- **I/O:** `FileRead`, `FileWrite`, `Print`/`Log`

### Milestone 3 — Custom chips
Encapsulate any subgraph as a reusable chip with named input/output ports. Custom chips are saved as part of the project file and appear in the toolbar alongside built-ins. The evaluator recurses into the subgraph on execution.

### Milestone 4 — Looping
Loops are higher-order chips that take a custom chip as their body, keeping the graph acyclic:
- **ForRange** — iterate a chip N times, passing the index each time
- **While** / **Until** — iterate a chip until a condition is met
- **ForEach** — iterate over elements of a heap array by pointer + length + element size

Loop bodies receive an accumulator value (and heap access) and return the next accumulator, giving a fold-like interface. This covers the map/filter/reduce patterns without requiring separate chips.

### Milestone 5 — Step animation
Visualize execution chip-by-chip: wires light up as data flows through them, showing the value (for scalars) or type+size (for heap handles) at each step. Particularly useful for tracing loops and custom chip recursion.
