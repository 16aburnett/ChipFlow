import { T } from './types.js';

// ── Chip builder helpers ───────────────────────────────────────────────────────

const arith = (label, category, type, fn) => ({
  label, category,
  inputs:  [{ name: 'a', type }, { name: 'b', type }],
  outputs: [{ name: 'result', type }],
  defaultProps: {},
  eval(inputs) { return { result: fn(inputs.a ?? 0, inputs.b ?? 0) }; },
});

const cmp = (label, type, fn) => ({
  label, category: 'compare',
  inputs:  [{ name: 'a', type }, { name: 'b', type }],
  outputs: [{ name: 'result', type: T.bool }],
  defaultProps: {},
  eval(inputs) { return { result: fn(inputs.a ?? 0, inputs.b ?? 0) }; },
});

const gate = (label, fn) => ({
  label, category: 'logic',
  inputs:  [{ name: 'a', type: T.bool }, { name: 'b', type: T.bool }],
  outputs: [{ name: 'out', type: T.bool }],
  defaultProps: {},
  eval(i) { return { out: fn(!!i.a, !!i.b) }; },
});

const constChip = (type, defaultVal) => ({
  label: type, category: 'value',
  inputs:  [],
  outputs: [{ name: 'value', type }],
  defaultProps: { value: defaultVal, name: '' },
  titleFromProps: 'name',
  eval(_i, props) { return { value: props.value }; },
});

// ── Chip registry ──────────────────────────────────────────────────────────────

export const CHIP_TYPES = {

  // ── Legacy chips (kept for backward compat with saved graphs) ─────────────

  Number: {
    label: 'Number', category: 'value', hidden: true,
    inputs:  [],
    outputs: [{ name: 'value', type: T.f64 }],
    defaultProps: { value: 0 },
    eval(_i, props) { return { value: Number(props.value) }; },
  },

  Boolean: {
    label: 'Boolean', category: 'value', hidden: true,
    inputs:  [],
    outputs: [{ name: 'value', type: T.bool }],
    defaultProps: { value: false },
    eval(_i, props) { return { value: Boolean(props.value) }; },
  },

  Add:      { ...arith('Add  (+)',      'math', T.f64, (a, b) => a + b),      hidden: true },
  Subtract: { ...arith('Subtract  (−)', 'math', T.f64, (a, b) => a - b),    hidden: true },
  Multiply: { ...arith('Multiply  (×)', 'math', T.f64, (a, b) => a * b),    hidden: true },
  Divide: {
    label: 'Divide  (÷)', category: 'math', hidden: true,
    inputs:  [{ name: 'a', type: T.f64 }, { name: 'b', type: T.f64 }],
    outputs: [{ name: 'result', type: T.f64 }],
    defaultProps: {},
    eval(inputs) { return { result: (inputs.b ?? 0) !== 0 ? (inputs.a ?? 0) / inputs.b : 0 }; },
  },
  LessThan: cmp('Less Than  (<)', T.f64, (a, b) => a < b),
  Equal: {
    label: 'Equal  (=)', category: 'compare',
    inputs:  [{ name: 'a', type: T.f64 }, { name: 'b', type: T.f64 }],
    outputs: [{ name: 'result', type: T.bool }],
    defaultProps: {},
    eval(inputs) { return { result: inputs.a === inputs.b }; },
  },
  Branch: {
    label: 'Branch', category: 'control',
    inputs:  [{ name: 'condition', type: T.bool }, { name: 'onTrue', type: 'any' }, { name: 'onFalse', type: 'any' }],
    outputs: [{ name: 'result', type: 'any' }],
    defaultProps: {},
    eval(inputs) { return { result: inputs.condition ? inputs.onTrue : inputs.onFalse }; },
  },

  // ── Typed constants ───────────────────────────────────────────────────────

  Const_Bool: { ...constChip(T.bool, false), isConst: true },
  Const_U8:   { ...constChip(T.u8,   0),     isConst: true },
  Const_I32:  { ...constChip(T.i32,  0),     isConst: true },
  Const_I64:  { ...constChip(T.i64,  0),     isConst: true },
  Const_F32:  { ...constChip(T.f32,  0.0),   isConst: true },
  Const_F64:  { ...constChip(T.f64,  0.0),   isConst: true },

  // ── Integer arithmetic ────────────────────────────────────────────────────

  Add_I32:  arith('Add (i32)',  'math', T.i32, (a, b) => (a + b) | 0),
  Sub_I32:  arith('Sub (i32)',  'math', T.i32, (a, b) => (a - b) | 0),
  Mul_I32:  arith('Mul (i32)',  'math', T.i32, (a, b) => Math.imul(a, b)),
  Div_I32:  arith('Div (i32)',  'math', T.i32, (a, b) => b !== 0 ? (a / b) | 0 : 0),
  Mod_I32:  arith('Mod (i32)',  'math', T.i32, (a, b) => b !== 0 ? a % b : 0),

  Add_I64:  arith('Add (i64)',  'math', T.i64, (a, b) => a + b),
  Sub_I64:  arith('Sub (i64)',  'math', T.i64, (a, b) => a - b),
  Mul_I64:  arith('Mul (i64)',  'math', T.i64, (a, b) => a * b),
  Div_I64:  arith('Div (i64)',  'math', T.i64, (a, b) => b !== 0 ? Math.trunc(a / b) : 0),
  Mod_I64:  arith('Mod (i64)',  'math', T.i64, (a, b) => b !== 0 ? a % b : 0),

  // ── Float arithmetic ──────────────────────────────────────────────────────

  Add_F32:  arith('Add (f32)',  'math', T.f32, (a, b) => Math.fround(a + b)),
  Sub_F32:  arith('Sub (f32)',  'math', T.f32, (a, b) => Math.fround(a - b)),
  Mul_F32:  arith('Mul (f32)',  'math', T.f32, (a, b) => Math.fround(a * b)),
  Div_F32:  arith('Div (f32)',  'math', T.f32, (a, b) => b !== 0 ? Math.fround(a / b) : 0),

  Add_F64:  arith('Add (f64)',  'math', T.f64, (a, b) => a + b),
  Sub_F64:  arith('Sub (f64)',  'math', T.f64, (a, b) => a - b),
  Mul_F64:  arith('Mul (f64)',  'math', T.f64, (a, b) => a * b),
  Div_F64:  arith('Div (f64)',  'math', T.f64, (a, b) => b !== 0 ? a / b : 0),

  // ── Comparisons ───────────────────────────────────────────────────────────

  Eq_I32:  cmp('Eq (i32)',  T.i32, (a, b) => a === b),
  Neq_I32: cmp('Neq (i32)', T.i32, (a, b) => a !== b),
  Lt_I32:  cmp('Lt (i32)',  T.i32, (a, b) => a < b),
  Lte_I32: cmp('Lte (i32)', T.i32, (a, b) => a <= b),
  Gt_I32:  cmp('Gt (i32)',  T.i32, (a, b) => a > b),
  Gte_I32: cmp('Gte (i32)', T.i32, (a, b) => a >= b),

  Eq_F64:  cmp('Eq (f64)',  T.f64, (a, b) => a === b),
  Neq_F64: cmp('Neq (f64)', T.f64, (a, b) => a !== b),
  Lt_F64:  cmp('Lt (f64)',  T.f64, (a, b) => a < b),
  Lte_F64: cmp('Lte (f64)', T.f64, (a, b) => a <= b),
  Gt_F64:  cmp('Gt (f64)',  T.f64, (a, b) => a > b),
  Gte_F64: cmp('Gte (f64)', T.f64, (a, b) => a >= b),

  // ── Boolean logic gates ───────────────────────────────────────────────────

  And_Bool:  gate('AND',  (a, b) => a && b),
  Or_Bool:   gate('OR',   (a, b) => a || b),
  Xor_Bool:  gate('XOR',  (a, b) => a !== b),
  Nand_Bool: gate('NAND', (a, b) => !(a && b)),
  Nor_Bool:  gate('NOR',  (a, b) => !(a || b)),
  Xnor_Bool: gate('XNOR', (a, b) => a === b),
  Not_Bool: {
    label: 'NOT', category: 'logic',
    inputs:  [{ name: 'a', type: T.bool }],
    outputs: [{ name: 'out', type: T.bool }],
    defaultProps: {},
    eval(i) { return { out: !i.a }; },
  },

  // ── Bitwise ops (i32) ─────────────────────────────────────────────────────

  And_I32:  arith('AND (i32)',  'bitwise', T.i32, (a, b) => (a & b)   | 0),
  Or_I32:   arith('OR (i32)',   'bitwise', T.i32, (a, b) => (a | b)   | 0),
  Xor_I32:  arith('XOR (i32)',  'bitwise', T.i32, (a, b) => (a ^ b)   | 0),
  Shl_I32:  arith('SHL (i32)',  'bitwise', T.i32, (a, b) => (a << b)  | 0),
  Shr_I32:  arith('SHR (i32)',  'bitwise', T.i32, (a, b) => (a >>> b) | 0),
  Shra_I32: arith('SHRA (i32)', 'bitwise', T.i32, (a, b) => (a >> b)  | 0),
  Not_I32: {
    label: 'NOT (i32)', category: 'bitwise',
    inputs:  [{ name: 'a', type: T.i32 }],
    outputs: [{ name: 'result', type: T.i32 }],
    defaultProps: {},
    eval(i) { return { result: (~(i.a ?? 0)) | 0 }; },
  },

  // ── Bitwise ops (i64) — note: JS numbers lose precision above 2^53 ────────

  And_I64:  arith('AND (i64)',  'bitwise', T.i64, (a, b) => a & b),
  Or_I64:   arith('OR (i64)',   'bitwise', T.i64, (a, b) => a | b),
  Xor_I64:  arith('XOR (i64)',  'bitwise', T.i64, (a, b) => a ^ b),
  Shl_I64:  arith('SHL (i64)',  'bitwise', T.i64, (a, b) => a << b),
  Shr_I64:  arith('SHR (i64)',  'bitwise', T.i64, (a, b) => a >> b),

  // ── Type casts ────────────────────────────────────────────────────────────

  Cast_I32_F64: { label: 'i32→f64', category: 'cast', inputs: [{ name: 'in', type: T.i32 }], outputs: [{ name: 'out', type: T.f64 }], defaultProps: {}, eval(i) { return { out: i.in ?? 0 }; } },
  Cast_F64_I32: { label: 'f64→i32', category: 'cast', inputs: [{ name: 'in', type: T.f64 }], outputs: [{ name: 'out', type: T.i32 }], defaultProps: {}, eval(i) { return { out: (i.in ?? 0) | 0 }; } },
  Cast_I32_I64: { label: 'i32→i64', category: 'cast', inputs: [{ name: 'in', type: T.i32 }], outputs: [{ name: 'out', type: T.i64 }], defaultProps: {}, eval(i) { return { out: i.in ?? 0 }; } },
  Cast_I64_I32: { label: 'i64→i32', category: 'cast', inputs: [{ name: 'in', type: T.i64 }], outputs: [{ name: 'out', type: T.i32 }], defaultProps: {}, eval(i) { return { out: (i.in ?? 0) | 0 }; } },
  Cast_F32_F64: { label: 'f32→f64', category: 'cast', inputs: [{ name: 'in', type: T.f32 }], outputs: [{ name: 'out', type: T.f64 }], defaultProps: {}, eval(i) { return { out: i.in ?? 0 }; } },
  Cast_F64_F32: { label: 'f64→f32', category: 'cast', inputs: [{ name: 'in', type: T.f64 }], outputs: [{ name: 'out', type: T.f32 }], defaultProps: {}, eval(i) { return { out: Math.fround(i.in ?? 0) }; } },
  Cast_U8_I32:  { label: 'u8→i32',  category: 'cast', inputs: [{ name: 'in', type: T.u8  }], outputs: [{ name: 'out', type: T.i32 }], defaultProps: {}, eval(i) { return { out: (i.in ?? 0) & 0xff }; } },
  Cast_I32_U8:  { label: 'i32→u8',  category: 'cast', inputs: [{ name: 'in', type: T.i32 }], outputs: [{ name: 'out', type: T.u8  }], defaultProps: {}, eval(i) { return { out: (i.in ?? 0) & 0xff }; } },

  // ── Heap memory ───────────────────────────────────────────────────────────

  Malloc: {
    label: 'Malloc', category: 'memory',
    inputs:  [{ name: 'size', type: T.i32 }],
    outputs: [{ name: 'ptr',  type: T.address }],
    defaultProps: {},
    eval(inputs, _p, heap) { return { ptr: heap.malloc(inputs.size ?? 0) }; },
  },
  Free: {
    label: 'Free', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }],
    outputs: [],
    defaultProps: {},
    eval(inputs, _p, heap) { heap.free(inputs.ptr ?? 0); return {}; },
  },

  Load_I32: {
    label: 'Load (i32)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }],
    outputs: [{ name: 'value', type: T.i32 }],
    defaultProps: {},
    eval(i, _p, heap) { return { value: heap.loadI32(i.ptr + i.offset) }; },
  },
  Store_I32: {
    label: 'Store (i32)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }, { name: 'value', type: T.i32 }],
    outputs: [{ name: 'ptr', type: T.address }],
    defaultProps: {},
    eval(i, _p, heap) { heap.storeI32(i.ptr + i.offset, i.value ?? 0); return { ptr: i.ptr }; },
  },

  Load_F64: {
    label: 'Load (f64)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }],
    outputs: [{ name: 'value', type: T.f64 }],
    defaultProps: {},
    eval(i, _p, heap) { return { value: heap.loadF64(i.ptr + i.offset) }; },
  },
  Store_F64: {
    label: 'Store (f64)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }, { name: 'value', type: T.f64 }],
    outputs: [{ name: 'ptr', type: T.address }],
    defaultProps: {},
    eval(i, _p, heap) { heap.storeF64(i.ptr + i.offset, i.value ?? 0); return { ptr: i.ptr }; },
  },

  Load_U8: {
    label: 'Load (u8)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }],
    outputs: [{ name: 'value', type: T.u8 }],
    defaultProps: {},
    eval(i, _p, heap) { return { value: heap.loadU8(i.ptr + i.offset) }; },
  },
  Store_U8: {
    label: 'Store (u8)', category: 'memory',
    inputs:  [{ name: 'ptr', type: T.address }, { name: 'offset', type: T.i32 }, { name: 'value', type: T.u8 }],
    outputs: [{ name: 'ptr', type: T.address }],
    defaultProps: {},
    eval(i, _p, heap) { heap.storeU8(i.ptr + i.offset, i.value ?? 0); return { ptr: i.ptr }; },
  },

  // ── I/O ───────────────────────────────────────────────────────────────────

  Print: {
    label: 'Print', category: 'io',
    inputs:  [{ name: 'value', type: 'any' }],
    outputs: [],
    defaultProps: {},
    eval(inputs, _p, _h, out) { out.push(String(inputs.value ?? '')); return {}; },
  },

  // ── Custom chip interface ─────────────────────────────────────────────────

  ChipIn: {
    label: 'in', category: 'interface',
    inputs:  [],
    outputs: [{ name: 'value', type: 'any' }],
    defaultProps: { name: 'in', type: 'any' },
    titleFromProps: 'name',
    titlePrefix: 'Input: ',
    typeFromProps: 'type',
    isRenameable: true,
    eval(_i, props) { return { value: props._value ?? null }; },
  },

  ChipOut: {
    label: 'out', category: 'interface',
    inputs:  [{ name: 'value', type: 'any' }],
    outputs: [],
    defaultProps: { name: 'out', type: 'any' },
    titleFromProps: 'name',
    titlePrefix: 'Output: ',
    typeFromProps: 'type',
    isRenameable: true,
    eval(inputs) { return { _out: inputs.value ?? null }; },
  },

};

// ── Colour palette per category ───────────────────────────────────────────────

export const CATEGORY_COLORS = {
  value:   { header: '#1d5230', body: '#162b20', portColor: '#50c080' },
  math:    { header: '#1c3a72', body: '#131f44', portColor: '#5090e0' },
  compare: { header: '#4a2a72', body: '#271540', portColor: '#a060e0' },
  control: { header: '#6e3a1e', body: '#3a1f0e', portColor: '#e08040' },
  logic:   { header: '#5a4a10', body: '#302808', portColor: '#e0c040' },
  bitwise: { header: '#3a4a10', body: '#202808', portColor: '#90c030' },
  cast:    { header: '#4a3a3a', body: '#2a2020', portColor: '#c08080' },
  memory:  { header: '#6a3010', body: '#3a1a08', portColor: '#e07030' },
  io:        { header: '#4a1a3a', body: '#2a0e22', portColor: '#e040b0' },
  interface: { header: '#2a2a5a', body: '#16163a', portColor: '#a0a0ff' },
  custom:    { header: '#3a2a4a', body: '#221830', portColor: '#c080e0' },
};

export const DEFAULT_COLORS = { header: '#3a3a5a', body: '#22223a', portColor: '#8080cc' };
