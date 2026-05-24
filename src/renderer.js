import { CHIP_TYPES, CATEGORY_COLORS, DEFAULT_COLORS } from './chipTypes.js';
import { T, WIRE_STYLE, WIRE_STYLE_DEFAULT, typesCompatible } from './types.js';

// ── Layout constants ───────────────────────────────────────────────────────────

const CHIP_W      = 164;
const HEADER_H    = 28;
const PORT_ROW_H  = 26;
const PORT_PAD    = 10;
const PORT_R      = 6;
const PORT_HIT_R  = 11;

const WIRE_HOVER_COLOR  = '#8888e8';
const WIRE_ANIM_COLOR   = '#80c0ff';
const PORT_HOVER_FILL   = '#c0c0ff';

function chipBodyH(def) {
  const rows = Math.max(def.inputs.length, def.outputs.length, 1);
  return PORT_PAD + rows * PORT_ROW_H + PORT_PAD;
}

function chipH(def) { return HEADER_H + chipBodyH(def); }

function portRelY(idx) { return HEADER_H + PORT_PAD + idx * PORT_ROW_H + PORT_ROW_H / 2; }

function fmtValue(v) {
  if (v === null || v === undefined) return 'null';
  const s = String(v);
  return s.length > 18 ? s.slice(0, 16) + '…' : s;
}

function portWorldPos(node, portName, isInput, def) {
  const ports = isInput ? def.inputs : def.outputs;
  const idx   = ports.findIndex(p => p.name === portName);
  return { x: isInput ? node.x : node.x + CHIP_W, y: node.y + portRelY(idx) };
}

function bezierPath(x1, y1, x2, y2) {
  const dx = Math.max(Math.abs(x2 - x1) * 0.55, 60);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}`;
}

// ── Renderer ───────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(graph, containerId, library = null) {
    this.graph   = graph;
    this.library = library;

    this._chipShapes   = new Map();
    this._wireShapes   = new Map();
    this._pendingWire  = null;
    this._tempWirePath = null;
    this._isPanning    = false;
    this._panOrigin    = null;

    const container = document.getElementById(containerId);

    this.stage = new Konva.Stage({
      container: containerId,
      width:  container.clientWidth,
      height: container.clientHeight,
    });

    this.layer = new Konva.Layer();
    this.stage.add(this.layer);

    this.world = new Konva.Group();
    this.layer.add(this.world);

    this.wireGroup = new Konva.Group();
    this.chipGroup = new Konva.Group();
    this.world.add(this.wireGroup);
    this.world.add(this.chipGroup);

    this._setupZoomPan();
    this._setupWireDrawing();
    this._listenToGraph();
    this._setupResize(container);
  }

  getViewState() {
    return { position: this.world.position(), scale: this.world.scale() };
  }

  switchGraph(newGraph, savedState = null) {
    this.chipGroup.destroyChildren();
    this.wireGroup.destroyChildren();
    this._chipShapes.clear();
    this._wireShapes.clear();
    if (this._tempWirePath) { this._tempWirePath.destroy(); this._tempWirePath = null; }
    this._pendingWire = null;

    this.graph = newGraph;
    this._listenToGraph();

    const { nodes, edges } = newGraph.serialize();
    for (const node of nodes) this._renderNode(node);
    for (const edge of edges) this._renderEdge(edge);

    if (savedState) {
      this.world.position(savedState.position);
      this.world.scale(savedState.scale);
    } else {
      this.world.position({ x: 0, y: 0 });
      this.world.scale({ x: 1, y: 1 });
    }

    this.layer.batchDraw();
  }

  _getDef(type) {
    if (CHIP_TYPES[type]) return CHIP_TYPES[type];
    if (this.library?.has(type)) return this.library.getInterface(type);
    return { label: type, category: 'custom', inputs: [], outputs: [], defaultProps: {}, isCustom: true };
  }

  _wireStyle(fromNodeId, fromPort) {
    const node = this.graph?.nodes.get(fromNodeId);
    if (!node) return WIRE_STYLE_DEFAULT;
    const def  = this._getDef(node.type);
    const type = def?.typeFromProps
      ? (node.props[def.typeFromProps] ?? 'any')
      : def?.outputs.find(p => p.name === fromPort)?.type;
    return (type && WIRE_STYLE[type]) ? WIRE_STYLE[type] : WIRE_STYLE_DEFAULT;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────────

  _setupZoomPan() {
    const { stage, world } = this;

    stage.on('wheel', e => {
      e.evt.preventDefault();
      const oldScale = world.scaleX();
      const pointer  = stage.getPointerPosition();
      const mouseAt  = {
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

    stage.on('mousedown', e => {
      if (e.target !== stage) return;
      this._isPanning = true;
      const pos = stage.getPointerPosition();
      this._panOrigin = { sx: pos.x, sy: pos.y, wx: world.x(), wy: world.y() };
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
      if (this._pendingWire) this._cancelWire();
    });
  }

  _setupWireDrawing() {
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
    const token = {};          // unique object — becomes stale when _listenToGraph is called again
    this._listenToken = token;
    this.graph.on(event => {
      if (this._listenToken !== token) return;  // stale listener
      switch (event.type) {
        case 'node-added':   this._renderNode(event.node); break;
        case 'node-moved':   this._syncChipPosition(event.node); this._updateEdgesForNode(event.node.id); break;
        case 'node-updated': this._refreshChipDisplay(event.node); break;
        case 'node-removed': this._removeChipShape(event.id); for (const e of event.removedEdges) this._removeWireShape(e.id); break;
        case 'edge-added':   this._renderEdge(event.edge); break;
        case 'edge-removed': this._removeWireShape(event.id); break;
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

  // ── Node (chip) rendering ──────────────────────────────────────────────────────

  _renderNode(node) {
    const group = this._buildChipGroup(node);
    this.chipGroup.add(group);
    this._chipShapes.set(node.id, group);
  }

  _buildChipGroup(node) {
    const def    = this._getDef(node.type);
    const colors = CATEGORY_COLORS[def.category] ?? DEFAULT_COLORS;
    const totalH = chipH(def);
    const baseName = def.titleFromProps ? (node.props[def.titleFromProps] || def.label) : def.label;
    const title    = (def.titlePrefix ?? '') + baseName + (def.titleSuffix ?? '');

    const group = new Konva.Group({ x: node.x, y: node.y, draggable: true });
    group._chipNodeId = node.id;

    group.add(new Konva.Rect({
      x: 4, y: 4, width: CHIP_W, height: totalH,
      cornerRadius: 7, fill: 'rgba(0,0,0,0.45)', listening: false,
    }));

    const body = new Konva.Rect({
      width: CHIP_W, height: totalH, cornerRadius: 7,
      fill: colors.body, stroke: '#3a3a6a', strokeWidth: 1.5,
    });
    group.add(body);
    group._body = body;

    group.add(new Konva.Rect({
      width: CHIP_W, height: HEADER_H, cornerRadius: [7, 7, 0, 0],
      fill: colors.header, listening: false,
    }));

    const titleText = new Konva.Text({
      x: 10, y: 7, text: title,
      fontSize: 12, fontFamily: 'Segoe UI, system-ui, sans-serif',
      fill: '#ffffff', fontStyle: 'bold', listening: false,
    });
    group.add(titleText);
    group._titleText = titleText;

    const resolvePort = def.typeFromProps
      ? p => ({ ...p, type: node.props[def.typeFromProps] ?? 'any' })
      : p => p;
    def.inputs.forEach((port, idx)  => this._addPort(group, node, resolvePort(port), idx, true,  colors, def));
    def.outputs.forEach((port, idx) => this._addPort(group, node, resolvePort(port), idx, false, colors, def));

    if (def.isConst) {
      this._addValueDisplay(group, node, def, colors);
      const pencil = new Konva.Text({
        x: CHIP_W - 18, y: 8, text: '✎',
        fontSize: 11, fill: '#ffffff', opacity: 0, listening: false,
      });
      group.add(pencil);
      group.on('mouseover', () => { pencil.opacity(0.5); this.layer.batchDraw(); });
      group.on('mouseout',  () => { pencil.opacity(0);   this.layer.batchDraw(); });
    }
    if (def.isRenameable) this._addRenameHandler(group, node, colors, def);

    group._resultBadges = [];

    group.on('dragmove', () => {
      const n = this.graph.nodes.get(node.id);
      if (n) { n.x = group.x(); n.y = group.y(); }
      this._updateEdgesForNode(node.id);
      this.layer.batchDraw();
    });

    group.on('dragend', () => { this.graph.moveNode(node.id, group.x(), group.y()); });

    group.on('mouseenter', () => { body.stroke('#6a6aaa'); this.layer.batchDraw(); });
    group.on('mouseleave', () => { body.stroke('#3a3a6a'); this.layer.batchDraw(); });

    group.on('contextmenu', e => {
      e.evt.preventDefault();
      this.graph.removeNode(node.id);
    });

    return group;
  }

  _addValueDisplay(group, node, def, colors) {
    const outType = def.outputs[0]?.type;

    const valText = new Konva.Text({
      x: 8, y: HEADER_H + PORT_PAD - 2,
      width: CHIP_W - PORT_R - 16,
      text: String(node.props.value),
      fontSize: 20, fontFamily: 'Consolas, monospace',
      fill: colors.portColor, align: 'center', listening: false,
    });
    group.add(valText);
    group._valText = valText;

    group.on('dblclick dbltap', () => {
      this._showValueEditor(node, outType, colors, def);
    });

    if (outType === T.bool) {
      let clickTimer = null;
      group.on('click tap', () => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; return; }
        clickTimer = setTimeout(() => {
          clickTimer = null;
          this.graph.updateNodeProps(node.id, { value: !node.props.value });
        }, 220);
      });
    }
  }

  _addRenameHandler(group, node, colors, def) {
    const pencil = new Konva.Text({
      x: CHIP_W - 18, y: 8, text: '✎',
      fontSize: 11, fill: '#ffffff', opacity: 0, listening: false,
    });
    group.add(pencil);
    group.on('mouseover', () => { pencil.opacity(0.5); this.layer.batchDraw(); });
    group.on('mouseout',  () => { pencil.opacity(0);   this.layer.batchDraw(); });
    group.on('dblclick dbltap', () => this._showNameEditor(node, colors, def));
  }

  _refreshChipDisplay(node) {
    const group = this._chipShapes.get(node.id);
    if (!group) return;
    const def = this._getDef(node.type);
    if (def.typeFromProps) {
      group.destroy();
      this._chipShapes.delete(node.id);
      this._renderNode(node);
      this._updateEdgesForNode(node.id);
      return;
    }
    if (group._valText) group._valText.text(String(node.props.value));
    if (def.titleFromProps && group._titleText) {
      group._titleText.text(node.props[def.titleFromProps] || def.label);
    }
  }

  _showValueEditor(node, outType, colors, def) {
    const container = this.stage.container();
    const rect      = container.getBoundingClientRect();
    const scale     = this.world.scaleX();
    const sx = rect.left + this.world.x() + node.x * scale;
    const sy = rect.top  + this.world.y() + (node.y + HEADER_H) * scale;
    const accent = colors?.portColor ?? '#50c080';

    const popup = document.createElement('div');
    Object.assign(popup.style, {
      position: 'fixed', left: `${sx}px`, top: `${sy}px`,
      width: `${CHIP_W * scale}px`,
      background: '#111122', border: `2px solid ${accent}`, borderRadius: '0 0 7px 7px',
      zIndex: '1000', boxSizing: 'border-box', display: 'flex',
      flexDirection: 'column', gap: '4px', padding: '6px',
    });

    const isBool = outType === T.bool;
    let valSelect = null;
    let valInput  = null;

    if (isBool) {
      valSelect = document.createElement('select');
      Object.assign(valSelect.style, {
        width: '100%', background: '#1a1a30', color: accent,
        border: 'none', outline: 'none',
        fontSize: `${Math.max(14, 18 * scale)}px`, fontFamily: 'Consolas, monospace',
        textAlign: 'center', padding: '2px 0', boxSizing: 'border-box',
      });
      for (const v of ['false', 'true']) {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = v;
        if (String(node.props.value) === v) opt.selected = true;
        valSelect.appendChild(opt);
      }
      popup.appendChild(valSelect);
    } else {
      valInput = document.createElement('input');
      valInput.type  = 'text';
      valInput.value = String(node.props.value);
      Object.assign(valInput.style, {
        width: '100%', background: 'transparent', color: accent,
        border: 'none', outline: 'none',
        fontSize: `${Math.max(14, 18 * scale)}px`, fontFamily: 'Consolas, monospace',
        textAlign: 'center', padding: '2px 0', boxSizing: 'border-box',
      });
      popup.appendChild(valInput);
    }

    const nameInput = document.createElement('input');
    nameInput.type        = 'text';
    nameInput.value       = String(node.props.name ?? '');
    nameInput.placeholder = 'label (optional)';
    Object.assign(nameInput.style, {
      width: '100%', background: 'transparent', color: '#7070a0',
      border: 'none', borderTop: `1px solid #2a2a4a`, outline: 'none',
      fontSize: `${Math.max(10, 11 * scale)}px`, fontFamily: 'Segoe UI, system-ui, sans-serif',
      textAlign: 'center', padding: '2px 0', boxSizing: 'border-box',
    });
    popup.appendChild(nameInput);

    document.body.appendChild(popup);
    if (isBool) { valSelect.focus(); } else { valInput.focus(); valInput.select(); }

    const parse = raw => {
      if (outType === T.u8)  return Math.max(0, Math.min(255, parseInt(raw) || 0));
      if (outType === T.i32) return (parseInt(raw) || 0) | 0;
      if (outType === T.i64) return Math.trunc(parseFloat(raw) || 0);
      if (outType === T.f32) return Math.fround(parseFloat(raw));
      return parseFloat(raw);
    };

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const val  = isBool ? (valSelect.value === 'true') : parse(valInput.value);
      const name = nameInput.value.trim();
      if (isBool || !isNaN(val)) this.graph.updateNodeProps(node.id, { value: val, name });
      popup.remove();
    };
    const cancel = () => { if (done) return; done = true; popup.remove(); };
    const keyInputs = isBool ? [valSelect, nameInput] : [valInput, nameInput];
    for (const el of keyInputs) {
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    }
    popup.addEventListener('focusout', e => {
      if (!popup.contains(e.relatedTarget)) commit();
    });
  }

  _showNameEditor(node, colors, def) {
    const container = this.stage.container();
    const rect      = container.getBoundingClientRect();
    const scale     = this.world.scaleX();
    const sx = rect.left + this.world.x() + node.x * scale;
    const sy = rect.top  + this.world.y() + (node.y + HEADER_H) * scale;
    const accent = colors?.portColor ?? '#a0a0ff';

    const hasType = !!def.typeFromProps;
    const popup   = document.createElement('div');
    Object.assign(popup.style, {
      position: 'fixed', left: `${sx}px`, top: `${sy}px`,
      width: `${CHIP_W * scale}px`,
      background: '#111122', border: `2px solid ${accent}`, borderRadius: '0 0 7px 7px',
      zIndex: '1000', boxSizing: 'border-box', display: 'flex',
      flexDirection: 'column', gap: '4px', padding: '6px',
    });

    const input = document.createElement('input');
    input.type  = 'text';
    input.value = String(node.props.name ?? '');
    Object.assign(input.style, {
      width: '100%', background: 'transparent', color: accent,
      border: 'none', borderBottom: `1px solid ${accent}`, outline: 'none',
      fontSize: `${Math.max(11, 13 * scale)}px`, fontFamily: 'Segoe UI, system-ui, sans-serif',
      textAlign: 'center', padding: '2px 0', boxSizing: 'border-box',
    });
    popup.appendChild(input);

    let select = null;
    if (hasType) {
      select = document.createElement('select');
      Object.assign(select.style, {
        width: '100%', background: '#1a1a30', color: accent,
        border: `1px solid ${accent}`, borderRadius: '3px', outline: 'none',
        fontSize: `${Math.max(10, 12 * scale)}px`, padding: '2px', boxSizing: 'border-box',
      });
      for (const t of ['any', 'bool', 'i32', 'i64', 'f32', 'f64']) {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        if (t === (node.props[def.typeFromProps] ?? 'any')) opt.selected = true;
        select.appendChild(opt);
      }
      popup.appendChild(select);
    }

    document.body.appendChild(popup);
    input.focus();
    input.select();

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const name = input.value.trim();
      const props = {};
      if (name) props.name = name;
      if (hasType) props.type = select.value;
      if (Object.keys(props).length) this.graph.updateNodeProps(node.id, props);
      popup.remove();
    };
    const cancel = () => { if (done) return; done = true; popup.remove(); };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    if (select) {
      select.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      });
    }
    popup.addEventListener('focusout', e => {
      if (!popup.contains(e.relatedTarget)) commit();
    });
  }

  // ── Port ──────────────────────────────────────────────────────────────────────

  _addPort(group, node, port, idx, isInput, colors, def) {
    const relX = isInput ? 0 : CHIP_W;
    const relY = portRelY(idx);
    const portColor = (port.type && WIRE_STYLE[port.type])
      ? WIRE_STYLE[port.type].color
      : (port.type === 'any' ? '#c0c0c0' : (colors.portColor ?? '#7070bb'));

    group.add(new Konva.Text({
      x: isInput ? PORT_HIT_R + 4 : CHIP_W - PORT_HIT_R - 74,
      y: relY - 7, width: 70, text: port.name,
      fontSize: 10, fontFamily: 'Segoe UI, system-ui, sans-serif',
      fill: '#9090c0', align: isInput ? 'left' : 'right', listening: false,
    }));

    const dot = new Konva.Circle({
      x: relX, y: relY, radius: PORT_R,
      fill: portColor, stroke: '#20204a', strokeWidth: 1.5, listening: false,
    });
    group.add(dot);

    const hit = new Konva.Circle({
      x: relX, y: relY, radius: PORT_HIT_R, fill: 'transparent', listening: true,
    });
    hit._portInfo = { nodeId: node.id, portName: port.name, isInput };
    group.add(hit);

    hit.on('mousedown', e => {
      e.cancelBubble = true;
      for (const g of this._chipShapes.values()) g.draggable(false);
      const worldPos = portWorldPos(node, port.name, isInput, def);
      this._startWire(node.id, port.name, isInput, worldPos.x, worldPos.y);
    });

    hit.on('mouseup', e => {
      e.cancelBubble = true;
      for (const g of this._chipShapes.values()) g.draggable(true);
      if (this._pendingWire) this._finishWire(node.id, port.name, isInput);
    });

    hit.on('mouseenter', () => {
      if (this._pendingWire) {
        dot.fill(this._pendingWireCompatible(node.id, port.name, isInput) ? '#60e080' : '#e04040');
      } else {
        dot.fill(PORT_HOVER_FILL);
      }
      dot.radius(PORT_R + 2);
      this.layer.batchDraw();
    });
    hit.on('mouseleave', () => {
      dot.fill(portColor);
      dot.radius(PORT_R);
      this.layer.batchDraw();
    });
  }

  // ── Edge (wire) rendering ──────────────────────────────────────────────────────

  _renderEdge(edge) {
    const { x: x1, y: y1 } = this._nodePortWorldPos(edge.fromNode, edge.fromPort, false);
    const { x: x2, y: y2 } = this._nodePortWorldPos(edge.toNode,   edge.toPort,   true);
    const style = this._wireStyle(edge.fromNode, edge.fromPort);

    const path = new Konva.Path({
      data: bezierPath(x1, y1, x2, y2),
      stroke: style.color, strokeWidth: style.strokeWidth,
      lineCap: 'round', listening: true, hitStrokeWidth: 10,
    });
    path._edgeId    = edge.id;
    path._baseStyle = style;

    path.on('click', () => {
      path.stroke('#ff5050');
      this.layer.batchDraw();
      setTimeout(() => this.graph.removeEdge(edge.id), 180);
    });
    path.on('mouseenter', () => {
      path.stroke(WIRE_HOVER_COLOR);
      path.strokeWidth(style.strokeWidth + 1);
      this.layer.batchDraw();
    });
    path.on('mouseleave', () => {
      path.stroke(style.color);
      path.strokeWidth(style.strokeWidth);
      this.layer.batchDraw();
    });

    this.wireGroup.add(path);
    this._wireShapes.set(edge.id, path);
  }

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

  // ── Wire drawing state machine ─────────────────────────────────────────────────

  _startWire(nodeId, portName, isInput, wx, wy) {
    if (this._tempWirePath) this._tempWirePath.destroy();
    this._pendingWire = { nodeId, portName, isInput, x: wx, y: wy };

    const def   = this._getDef(this.graph.nodes.get(nodeId)?.type);
    const ports = isInput ? def?.inputs : def?.outputs;
    const ptype = ports?.find(p => p.name === portName)?.type;
    const style = (ptype && WIRE_STYLE[ptype]) ? WIRE_STYLE[ptype] : WIRE_STYLE_DEFAULT;

    this._tempWirePath = new Konva.Path({
      data: bezierPath(wx, wy, wx, wy),
      stroke: style.color, strokeWidth: style.strokeWidth,
      dash: [7, 5], listening: false,
    });
    this.wireGroup.add(this._tempWirePath);
    this.layer.batchDraw();
  }

  _finishWire(targetNodeId, targetPortName, targetIsInput) {
    const src = this._pendingWire;
    this._cancelWire();
    if (src.nodeId === targetNodeId) return;

    let fromNode, fromPort, toNode, toPort;
    if (!src.isInput && targetIsInput) {
      fromNode = src.nodeId; fromPort = src.portName;
      toNode = targetNodeId; toPort = targetPortName;
    } else if (src.isInput && !targetIsInput) {
      fromNode = targetNodeId; fromPort = targetPortName;
      toNode = src.nodeId;   toPort = src.portName;
    } else {
      return;
    }

    const fromNodeObj = this.graph.nodes.get(fromNode);
    const toNodeObj   = this.graph.nodes.get(toNode);
    const fromDef  = this._getDef(fromNodeObj?.type);
    const toDef    = this._getDef(toNodeObj?.type);
    const fromType = fromDef?.typeFromProps
      ? (fromNodeObj.props[fromDef.typeFromProps] ?? 'any')
      : fromDef?.outputs.find(p => p.name === fromPort)?.type;
    const toType   = toDef?.typeFromProps
      ? (toNodeObj.props[toDef.typeFromProps] ?? 'any')
      : toDef?.inputs.find(p => p.name === toPort)?.type;

    if (fromType && toType && toType !== 'any' && fromType !== 'any' && !typesCompatible(fromType, toType)) {
      this._flashIncompatible();
      return;
    }

    this.graph.addEdge(fromNode, fromPort, toNode, toPort);
  }

  _cancelWire() {
    this._pendingWire = null;
    if (this._tempWirePath) { this._tempWirePath.destroy(); this._tempWirePath = null; }
    for (const g of this._chipShapes.values()) g.draggable(true);
    this.layer.batchDraw();
  }

  _flashIncompatible() {
    if (!this._tempWirePath) return;
    this._tempWirePath.stroke('#ff4444');
    this.layer.batchDraw();
    setTimeout(() => this._cancelWire(), 300);
  }

  _pendingWireCompatible(targetNodeId, targetPortName, targetIsInput) {
    const src = this._pendingWire;
    if (!src || src.nodeId === targetNodeId) return false;

    let fromNode, fromPort, toNode, toPort;
    if (!src.isInput && targetIsInput) {
      fromNode = src.nodeId; fromPort = src.portName;
      toNode = targetNodeId; toPort = targetPortName;
    } else if (src.isInput && !targetIsInput) {
      fromNode = targetNodeId; fromPort = targetPortName;
      toNode = src.nodeId;   toPort = src.portName;
    } else {
      return false;
    }

    const fromDef  = this._getDef(this.graph.nodes.get(fromNode)?.type);
    const toDef    = this._getDef(this.graph.nodes.get(toNode)?.type);
    const fromType = fromDef?.outputs.find(p => p.name === fromPort)?.type;
    const toType   = toDef?.inputs.find(p => p.name === toPort)?.type;

    if (!fromType || !toType || toType === 'any') return true;
    return typesCompatible(fromType, toType);
  }

  // ── Eval animation ─────────────────────────────────────────────────────────────

  showEvalResults(results) {
    const FLASH_MS = 500;
    const BADGE_MS = 2500;

    for (const path of this._wireShapes.values()) {
      path.stroke(WIRE_ANIM_COLOR);
      path.strokeWidth(path._baseStyle.strokeWidth + 1);
      this.layer.batchDraw();
      setTimeout(() => {
        path.stroke(path._baseStyle.color);
        path.strokeWidth(path._baseStyle.strokeWidth);
        this.layer.batchDraw();
      }, FLASH_MS);
    }

    for (const [nodeId, outputs] of Object.entries(results)) {
      const group = this._chipShapes.get(nodeId);
      if (!group) continue;

      const origFill = group._body.fill();
      group._body.fill('#1a3a2a');
      setTimeout(() => { group._body.fill(origFill); this.layer.batchDraw(); }, FLASH_MS);

      const node = this.graph.nodes.get(nodeId);
      const def  = this._getDef(node.type);

      for (const [portName, value] of Object.entries(outputs)) {
        if (portName.startsWith('_')) continue;
        const idx = def.outputs.findIndex(p => p.name === portName);
        if (idx < 0) continue;

        group._resultBadges.forEach(b => b.destroy());
        group._resultBadges = [];

        const badge = new Konva.Label({ x: CHIP_W + 12, y: portRelY(idx) - 11 });
        badge.add(new Konva.Tag({ fill: '#0a2a1a', stroke: '#30804a', strokeWidth: 1, cornerRadius: 3 }));
        badge.add(new Konva.Text({
          text: fmtValue(value), fontSize: 11,
          fontFamily: 'Consolas, monospace', fill: '#80ffa8', padding: 4,
        }));
        group.add(badge);
        group._resultBadges.push(badge);
        setTimeout(() => { badge.destroy(); this.layer.batchDraw(); }, BADGE_MS);
      }
    }

    this.layer.batchDraw();
  }

  // ── Coordinate utilities ────────────────────────────────────────────────────────

  screenToWorld(sx, sy) {
    const scale = this.world.scaleX();
    return { x: (sx - this.world.x()) / scale, y: (sy - this.world.y()) / scale };
  }

  viewportCenter() {
    return this.screenToWorld(this.stage.width() / 2, this.stage.height() / 2);
  }

  _nodePortWorldPos(nodeId, portName, isInput) {
    const node = this.graph.nodes.get(nodeId);
    const def  = this._getDef(node.type);
    return portWorldPos(node, portName, isInput, def);
  }
}
