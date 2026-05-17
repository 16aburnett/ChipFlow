/**
 * renderer.js
 * Konva-based renderer for ChipFlow.
 *
 * Architecture
 * ────────────
 *   Stage
 *   └─ layer
 *      └─ worldGroup  ← zoomed + panned as a unit
 *         ├─ wireGroup  (wires render behind chips)
 *         └─ chipGroup  (chip Konva.Groups on top)
 *
 * Coordinate spaces
 * ─────────────────
 *   Screen space  — raw pixel position on the <canvas> element
 *   World space   — the logical graph coordinate system
 *   screenToWorld() converts between them.
 *   All graph node x/y values are in world space.
 *   Chip Konva.Groups live inside worldGroup, so their Konva position IS world space.
 *   Wire paths are also in world space.
 */

import { CHIP_TYPES, CATEGORY_COLORS, DEFAULT_COLORS } from './chipTypes.js';

// ── Layout constants ───────────────────────────────────────────────────────────

const CHIP_W       = 164;   // fixed chip width (px, world space)
const HEADER_H     = 28;    // title bar height
const PORT_ROW_H   = 26;    // vertical spacing per port row
const PORT_PAD     = 10;    // top/bottom padding inside body
const PORT_R       = 6;     // visible port circle radius
const PORT_HIT_R   = 11;    // invisible hit-area radius (easier to click)

const WIRE_COLOR        = '#5858a8';
const WIRE_HOVER_COLOR  = '#8888e8';
const WIRE_ANIM_COLOR   = '#80c0ff';
const PORT_DEFAULT_FILL = '#7070bb';
const PORT_HOVER_FILL   = '#c0c0ff';

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Total height of a chip's body section (below header). */
function chipBodyH(type) {
  const def  = CHIP_TYPES[type];
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  return PORT_PAD + rows * PORT_ROW_H + PORT_PAD;
}

/** Total chip height. */
function chipH(type) {
  return HEADER_H + chipBodyH(type);
}

/**
 * Y offset of a port relative to the chip group's top-left (0,0).
 * Left (input) and right (output) ports at the same index share a Y so
 * they appear horizontally aligned.
 */
function portRelY(portIndex) {
  return HEADER_H + PORT_PAD + portIndex * PORT_ROW_H + PORT_ROW_H / 2;
}

/**
 * World-space position of a port, given the node's current position.
 */
function portWorldPos(node, portName, isInput) {
  const def   = CHIP_TYPES[node.type];
  const ports = isInput ? def.inputs : def.outputs;
  const idx   = ports.findIndex(p => p.name === portName);
  return {
    x: isInput ? node.x : node.x + CHIP_W,
    y: node.y + portRelY(idx),
  };
}

/**
 * Cubic bezier SVG path string between two world-space points.
 * Control points pull horizontally so wires make a natural S-curve.
 */
function bezierPath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.55, 60);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

// ── Renderer ───────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(graph, containerId) {
    this.graph = graph;

    /** @type {Map<string, Konva.Group>}  nodeId → Konva chip group */
    this._chipShapes = new Map();
    /** @type {Map<string, Konva.Path>}   edgeId → Konva wire path  */
    this._wireShapes = new Map();

    // Wire drawing state
    this._pendingWire  = null;   // { nodeId, portName, isInput, x, y }
    this._tempWirePath = null;   // temporary Konva.Path while dragging

    // Pan state
    this._isPanning  = false;
    this._panOrigin  = null;

    // ── Build Konva stage ──────────────────────────────────────────────────
    const container = document.getElementById(containerId);

    this.stage = new Konva.Stage({
      container: containerId,
      width:  container.clientWidth,
      height: container.clientHeight,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    // worldGroup: everything inside here zooms/pans together
    this.world = new Konva.Group();
    this.layer.add(this.world);

    this.wireGroup = new Konva.Group();
    this.chipGroup = new Konva.Group();
    this.world.add(this.wireGroup);
    this.world.add(this.chipGroup);

    // ── Wire everything up ────────────────────────────────────────────────
    this._setupZoomPan();
    this._setupWireDrawing();
    this._listenToGraph();
    this._setupResize(container);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Setup
  // ────────────────────────────────────────────────────────────────────────────

  _setupZoomPan() {
    const { stage, world } = this;

    // Scroll wheel → zoom, centred on the mouse pointer
    stage.on('wheel', e => {
      e.evt.preventDefault();

      const oldScale = world.scaleX();
      const pointer  = stage.getPointerPosition();

      // Where in world-space does the pointer currently sit?
      const mouseAt = {
        x: (pointer.x - world.x()) / oldScale,
        y: (pointer.y - world.y()) / oldScale,
      };

      const factor   = e.evt.deltaY < 0 ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(oldScale * factor, 0.08), 6);

      world.scale({ x: newScale, y: newScale });
      world.position({
        x: pointer.x - mouseAt.x * newScale,
        y: pointer.y - mouseAt.y * newScale,
      });

      this.layer.batchDraw();
    });

    // Drag on empty canvas → pan
    stage.on('mousedown', e => {
      if (e.target !== stage) return;
      this._isPanning = true;
      const pos = stage.getPointerPosition();
      this._panOrigin = {
        sx: pos.x, sy: pos.y,
        wx: world.x(), wy: world.y(),
      };
      stage.container().style.cursor = 'grabbing';
    });

    stage.on('mousemove', () => {
      if (!this._isPanning) return;
      const pos = stage.getPointerPosition();
      world.position({
        x: this._panOrigin.wx + pos.x - this._panOrigin.sx,
        y: this._panOrigin.wy + pos.y - this._panOrigin.sy,
      });
      this.layer.batchDraw();
    });

    stage.on('mouseup', () => {
      if (this._isPanning) {
        this._isPanning = false;
        stage.container().style.cursor = 'default';
      }
      // Cancel any wire-in-progress if released on empty canvas
      if (this._pendingWire) {
        this._cancelWire();
      }
    });
  }

  _setupWireDrawing() {
    // Update the temp wire endpoint as the mouse moves
    this.stage.on('mousemove', () => {
      if (!this._pendingWire || !this._tempWirePath) return;

      const rawPos = this.stage.getPointerPosition();
      const scale  = this.world.scaleX();
      const wx     = (rawPos.x - this.world.x()) / scale;
      const wy     = (rawPos.y - this.world.y()) / scale;

      const { x: sx, y: sy } = this._pendingWire;
      this._tempWirePath.data(bezierPath(sx, sy, wx, wy));
      this.layer.batchDraw();
    });
  }

  _listenToGraph() {
    this.graph.on(event => {
      switch (event.type) {
        case 'node-added':
          this._renderNode(event.node);
          break;

        case 'node-moved':
          // Konva group position is kept in sync by the dragmove handler;
          // this branch handles programmatic moves.
          this._syncChipPosition(event.node);
          this._updateEdgesForNode(event.node.id);
          break;

        case 'node-updated':
          this._refreshChipDisplay(event.node);
          break;

        case 'node-removed':
          this._removeChipShape(event.id);
          for (const e of event.removedEdges) this._removeWireShape(e.id);
          break;

        case 'edge-added':
          this._renderEdge(event.edge);
          break;

        case 'edge-removed':
          this._removeWireShape(event.id);
          break;
      }
      this.layer.batchDraw();
    });
  }

  _setupResize(container) {
    window.addEventListener('resize', () => {
      this.stage.width(container.clientWidth);
      this.stage.height(container.clientHeight);
      this.layer.batchDraw();
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Node (chip) rendering
  // ────────────────────────────────────────────────────────────────────────────

  _renderNode(node) {
    const group = this._buildChipGroup(node);
    this.chipGroup.add(group);
    this._chipShapes.set(node.id, group);
  }

  _buildChipGroup(node) {
    const def    = CHIP_TYPES[node.type];
    const colors = CATEGORY_COLORS[def.category] ?? DEFAULT_COLORS;
    const totalH = chipH(node.type);

    const group = new Konva.Group({ x: node.x, y: node.y, draggable: true });
    group._chipNodeId = node.id;

    // ── Drop shadow ────────────────────────────────────────────────────────
    group.add(new Konva.Rect({
      x: 4, y: 4,
      width: CHIP_W, height: totalH,
      cornerRadius: 7,
      fill: 'rgba(0,0,0,0.45)',
      listening: false,
    }));

    // ── Body ───────────────────────────────────────────────────────────────
    const body = new Konva.Rect({
      width: CHIP_W, height: totalH,
      cornerRadius: 7,
      fill: colors.body,
      stroke: '#3a3a6a',
      strokeWidth: 1.5,
    });
    group.add(body);
    group._body = body;

    // ── Header ─────────────────────────────────────────────────────────────
    group.add(new Konva.Rect({
      width: CHIP_W, height: HEADER_H,
      cornerRadius: [7, 7, 0, 0],
      fill: colors.header,
      listening: false,
    }));

    // ── Title ──────────────────────────────────────────────────────────────
    group.add(new Konva.Text({
      x: 10, y: 7,
      text: def.label,
      fontSize: 12,
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fill: '#ffffff',
      fontStyle: 'bold',
      listening: false,
    }));

    // ── Ports ──────────────────────────────────────────────────────────────
    def.inputs.forEach((port, idx)  => this._addPort(group, node, port, idx, true,  colors));
    def.outputs.forEach((port, idx) => this._addPort(group, node, port, idx, false, colors));

    // ── Special display for value chips ────────────────────────────────────
    if (node.type === 'Number' || node.type === 'Boolean') {
      this._addValueDisplay(group, node);
    }

    // ── Result badge (populated during eval animation) ─────────────────────
    group._resultBadges = [];

    // ── Drag ───────────────────────────────────────────────────────────────
    group.on('dragmove', () => {
      // Keep graph data in sync (moves node.x / node.y without emitting events
      // that would fight the Konva drag)
      const n = this.graph.nodes.get(node.id);
      if (n) { n.x = group.x(); n.y = group.y(); }
      this._updateEdgesForNode(node.id);
      this.layer.batchDraw();
    });

    group.on('dragend', () => {
      this.graph.moveNode(node.id, group.x(), group.y());
    });

    // ── Hover highlight ────────────────────────────────────────────────────
    group.on('mouseenter', () => {
      body.stroke('#6a6aaa');
      this.layer.batchDraw();
    });
    group.on('mouseleave', () => {
      body.stroke('#3a3a6a');
      this.layer.batchDraw();
    });

    // ── Right-click to delete ──────────────────────────────────────────────
    group.on('contextmenu', e => {
      e.evt.preventDefault();
      this.graph.removeNode(node.id);
    });

    return group;
  }

  /** Inline value display + double-click to edit for Number / Boolean chips. */
  _addValueDisplay(group, node) {
    const valText = new Konva.Text({
      x: 8,
      y: HEADER_H + PORT_PAD - 2,
      width: CHIP_W - PORT_R - 16,
      text: String(node.props.value),
      fontSize: 20,
      fontFamily: 'Consolas, monospace',
      fill: '#a8ffc0',
      align: 'center',
      listening: false,
    });
    group.add(valText);
    group._valText = valText;

    // Double-click: overlay input for numbers, toggle for booleans
    group.on('dblclick dbltap', () => {
      if (node.type === 'Number') {
        this._showValueEditor(node);
      } else if (node.type === 'Boolean') {
        this.graph.updateNodeProps(node.id, { value: !node.props.value });
      }
    });
  }

  /** Sync the display of a chip when its props change (e.g. Number value). */
  _refreshChipDisplay(node) {
    const group = this._chipShapes.get(node.id);
    if (!group) return;
    if (group._valText) {
      group._valText.text(String(node.props.value));
    }
  }

  _showValueEditor(node) {
    const container = this.stage.container();
    const rect      = container.getBoundingClientRect();
    const scale     = this.world.scaleX();

    const sx = rect.left + this.world.x() + node.x * scale;
    const sy = rect.top  + this.world.y() + (node.y + HEADER_H) * scale;

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = String(node.props.value);
    Object.assign(input.style, {
      position: 'fixed', left: `${sx}px`, top: `${sy}px`,
      width: `${CHIP_W * scale}px`, height: `${chipBodyH(node.type) * scale}px`,
      background: '#162b20', color: '#a8ffc0',
      border: '2px solid #50c080', borderRadius: '0 0 7px 7px',
      fontSize: `${20 * scale}px`, fontFamily: 'Consolas, monospace',
      textAlign: 'center', padding: '0', outline: 'none',
      zIndex: '1000', boxSizing: 'border-box',
    });
    document.body.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const parsed = parseFloat(input.value);
      if (!isNaN(parsed)) this.graph.updateNodeProps(node.id, { value: parsed });
      input.remove();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      input.remove();
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
  }

  // ── Port ──────────────────────────────────────────────────────────────────

  _addPort(group, node, port, idx, isInput, colors) {
    const relX  = isInput ? 0 : CHIP_W;
    const relY  = portRelY(idx);
    const portColor = colors.portColor ?? PORT_DEFAULT_FILL;

    // Label
    group.add(new Konva.Text({
      x:     isInput ? PORT_HIT_R + 4 : CHIP_W - PORT_HIT_R - 74,
      y:     relY - 7,
      width: 70,
      text:  port.name,
      fontSize: 10,
      fontFamily: 'Segoe UI, system-ui, sans-serif',
      fill: '#9090c0',
      align: isInput ? 'left' : 'right',
      listening: false,
    }));

    // Visible dot
    const dot = new Konva.Circle({
      x: relX, y: relY,
      radius: PORT_R,
      fill: portColor,
      stroke: '#20204a',
      strokeWidth: 1.5,
      listening: false,
    });
    group.add(dot);

    // Larger invisible hit area on top
    const hit = new Konva.Circle({
      x: relX, y: relY,
      radius: PORT_HIT_R,
      fill: 'transparent',
      listening: true,
    });
    hit._portInfo = { nodeId: node.id, portName: port.name, isInput };
    group.add(hit);

    // ── Wire drawing interactions ──────────────────────────────────────────

    hit.on('mousedown', e => {
      e.cancelBubble = true;              // don't start chip drag
      // Disable dragging on ALL chips while drawing a wire
      for (const g of this._chipShapes.values()) g.draggable(false);

      const worldPos = portWorldPos(node, port.name, isInput);
      this._startWire(node.id, port.name, isInput, worldPos.x, worldPos.y);
    });

    hit.on('mouseup', e => {
      e.cancelBubble = true;              // don't trigger stage mouseup cancel
      for (const g of this._chipShapes.values()) g.draggable(true);

      if (this._pendingWire) {
        this._finishWire(node.id, port.name, isInput);
      }
    });

    hit.on('mouseenter', () => {
      dot.fill(PORT_HOVER_FILL);
      dot.radius(PORT_R + 2);
      this.layer.batchDraw();
    });
    hit.on('mouseleave', () => {
      dot.fill(portColor);
      dot.radius(PORT_R);
      this.layer.batchDraw();
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Edge (wire) rendering
  // ────────────────────────────────────────────────────────────────────────────

  _renderEdge(edge) {
    const { x: x1, y: y1 } = this._nodePortWorldPos(edge.fromNode, edge.fromPort, false);
    const { x: x2, y: y2 } = this._nodePortWorldPos(edge.toNode,   edge.toPort,   true);

    const path = new Konva.Path({
      data:           bezierPath(x1, y1, x2, y2),
      stroke:         WIRE_COLOR,
      strokeWidth:    2.5,
      lineCap:        'round',
      listening:      true,
      hitStrokeWidth: 10,   // fat invisible hit area
    });
    path._edgeId = edge.id;

    // Click wire → flash red, then delete
    path.on('click', () => {
      path.stroke('#ff5050');
      this.layer.batchDraw();
      setTimeout(() => this.graph.removeEdge(edge.id), 180);
    });

    path.on('mouseenter', () => {
      path.stroke(WIRE_HOVER_COLOR);
      path.strokeWidth(3);
      this.layer.batchDraw();
    });
    path.on('mouseleave', () => {
      path.stroke(WIRE_COLOR);
      path.strokeWidth(2.5);
      this.layer.batchDraw();
    });

    this.wireGroup.add(path);
    this._wireShapes.set(edge.id, path);
  }

  /** Redraw all wires connected to a node (called during chip drag). */
  _updateEdgesForNode(nodeId) {
    for (const edge of this.graph.edgesForNode(nodeId)) {
      const path = this._wireShapes.get(edge.id);
      if (!path) continue;
      const { x: x1, y: y1 } = this._nodePortWorldPos(edge.fromNode, edge.fromPort, false);
      const { x: x2, y: y2 } = this._nodePortWorldPos(edge.toNode,   edge.toPort,   true);
      path.data(bezierPath(x1, y1, x2, y2));
    }
  }

  _removeChipShape(nodeId) {
    const g = this._chipShapes.get(nodeId);
    if (g) { g.destroy(); this._chipShapes.delete(nodeId); }
  }

  _removeWireShape(edgeId) {
    const p = this._wireShapes.get(edgeId);
    if (p) { p.destroy(); this._wireShapes.delete(edgeId); }
  }

  _syncChipPosition(node) {
    const g = this._chipShapes.get(node.id);
    if (g) g.position({ x: node.x, y: node.y });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Wire drawing state machine
  // ────────────────────────────────────────────────────────────────────────────

  _startWire(nodeId, portName, isInput, wx, wy) {
    if (this._tempWirePath) this._tempWirePath.destroy();

    this._pendingWire = { nodeId, portName, isInput, x: wx, y: wy };

    this._tempWirePath = new Konva.Path({
      data:        bezierPath(wx, wy, wx, wy),
      stroke:      '#4488ff',
      strokeWidth: 2,
      dash:        [7, 5],
      listening:   false,
    });
    this.wireGroup.add(this._tempWirePath);
    this.layer.batchDraw();
  }

  _finishWire(targetNodeId, targetPortName, targetIsInput) {
    const src = this._pendingWire;
    this._cancelWire();                     // clears pending state first

    if (src.nodeId === targetNodeId) return; // same chip — skip

    let fromNode, fromPort, toNode, toPort;

    if (!src.isInput && targetIsInput) {
      // Natural direction: output → input
      fromNode = src.nodeId;    fromPort = src.portName;
      toNode   = targetNodeId;  toPort   = targetPortName;
    } else if (src.isInput && !targetIsInput) {
      // Reversed drag direction still valid
      fromNode = targetNodeId;  fromPort = targetPortName;
      toNode   = src.nodeId;    toPort   = src.portName;
    } else {
      return; // output→output or input→input — invalid
    }

    this.graph.addEdge(fromNode, fromPort, toNode, toPort);
  }

  _cancelWire() {
    this._pendingWire = null;
    if (this._tempWirePath) {
      this._tempWirePath.destroy();
      this._tempWirePath = null;
    }
    for (const g of this._chipShapes.values()) g.draggable(true);
    this.layer.batchDraw();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Eval animation
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Called after evaluation. Animates wires and shows output values on chips.
   * @param {{ [nodeId: string]: { [portName: string]: any } }} results
   */
  showEvalResults(results) {
    const FLASH_MS  = 500;
    const BADGE_MS  = 2500;

    // Animate wires first
    for (const path of this._wireShapes.values()) {
      path.stroke(WIRE_ANIM_COLOR);
      path.strokeWidth(3);
      this.layer.batchDraw();
      setTimeout(() => {
        path.stroke(WIRE_COLOR);
        path.strokeWidth(2.5);
        this.layer.batchDraw();
      }, FLASH_MS);
    }

    // Animate chips and show result badges
    for (const [nodeId, outputs] of Object.entries(results)) {
      const group = this._chipShapes.get(nodeId);
      if (!group) continue;

      // Flash the chip body
      const origFill = group._body.fill();
      group._body.fill('#1a3a2a');
      setTimeout(() => { group._body.fill(origFill); this.layer.batchDraw(); }, FLASH_MS);

      // Show output value badges
      const node = this.graph.nodes.get(nodeId);
      const def  = CHIP_TYPES[node.type];

      for (const [portName, value] of Object.entries(outputs)) {
        const idx = def.outputs.findIndex(p => p.name === portName);
        if (idx < 0) continue;

        const relY = portRelY(idx);

        // Remove any existing badge for this port
        group._resultBadges.forEach(b => b.destroy());
        group._resultBadges = [];

        const badge = new Konva.Label({ x: CHIP_W + 12, y: relY - 11 });
        badge.add(new Konva.Tag({
          fill:         '#0a2a1a',
          stroke:       '#30804a',
          strokeWidth:  1,
          cornerRadius: 3,
        }));
        badge.add(new Konva.Text({
          text:       String(value),
          fontSize:   11,
          fontFamily: 'Consolas, monospace',
          fill:       '#80ffa8',
          padding:    4,
        }));

        group.add(badge);
        group._resultBadges.push(badge);

        setTimeout(() => {
          badge.destroy();
          this.layer.batchDraw();
        }, BADGE_MS);
      }
    }

    this.layer.batchDraw();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Coordinate utilities
  // ────────────────────────────────────────────────────────────────────────────

  /** Convert screen coordinates to world coordinates. */
  screenToWorld(sx, sy) {
    const scale = this.world.scaleX();
    return {
      x: (sx - this.world.x()) / scale,
      y: (sy - this.world.y()) / scale,
    };
  }

  /** World-space centre of the current viewport. Useful for placing new chips. */
  viewportCenter() {
    return this.screenToWorld(this.stage.width() / 2, this.stage.height() / 2);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  _nodePortWorldPos(nodeId, portName, isInput) {
    const node = this.graph.nodes.get(nodeId);
    return portWorldPos(node, portName, isInput);
  }
}
