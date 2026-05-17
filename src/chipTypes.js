/**
 * chipTypes.js
 * Defines every built-in chip: its ports and how to evaluate it.
 * Adding a new chip is just adding an entry here — no other file changes needed.
 */

export const CHIP_TYPES = {

  // ── Value ─────────────────────────────────────────────────────────────────

  Number: {
    label: 'Number',
    category: 'value',
    inputs:  [],
    outputs: [{ name: 'value', type: 'number' }],
    defaultProps: { value: 0 },
    eval(_inputs, props) {
      return { value: Number(props.value) };
    },
  },

  Boolean: {
    label: 'Boolean',
    category: 'value',
    inputs:  [],
    outputs: [{ name: 'value', type: 'bool' }],
    defaultProps: { value: false },
    eval(_inputs, props) {
      return { value: Boolean(props.value) };
    },
  },

  // ── Math ──────────────────────────────────────────────────────────────────

  Add: {
    label: 'Add  (+)',
    category: 'math',
    inputs:  [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    outputs: [{ name: 'result', type: 'number' }],
    defaultProps: {},
    eval(inputs) {
      return { result: (inputs.a ?? 0) + (inputs.b ?? 0) };
    },
  },

  Subtract: {
    label: 'Subtract  (−)',
    category: 'math',
    inputs:  [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    outputs: [{ name: 'result', type: 'number' }],
    defaultProps: {},
    eval(inputs) {
      return { result: (inputs.a ?? 0) - (inputs.b ?? 0) };
    },
  },

  Multiply: {
    label: 'Multiply  (×)',
    category: 'math',
    inputs:  [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    outputs: [{ name: 'result', type: 'number' }],
    defaultProps: {},
    eval(inputs) {
      return { result: (inputs.a ?? 0) * (inputs.b ?? 0) };
    },
  },

  Divide: {
    label: 'Divide  (÷)',
    category: 'math',
    inputs:  [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    outputs: [{ name: 'result', type: 'number' }],
    defaultProps: {},
    eval(inputs) {
      const b = inputs.b ?? 0;
      return { result: b !== 0 ? (inputs.a ?? 0) / b : 0 };
    },
  },

  // ── Comparison ────────────────────────────────────────────────────────────

  LessThan: {
    label: 'Less Than  (<)',
    category: 'compare',
    inputs:  [{ name: 'a', type: 'number' }, { name: 'b', type: 'number' }],
    outputs: [{ name: 'result', type: 'bool' }],
    defaultProps: {},
    eval(inputs) {
      return { result: (inputs.a ?? 0) < (inputs.b ?? 0) };
    },
  },

  Equal: {
    label: 'Equal  (=)',
    category: 'compare',
    inputs:  [{ name: 'a', type: 'any' }, { name: 'b', type: 'any' }],
    outputs: [{ name: 'result', type: 'bool' }],
    defaultProps: {},
    eval(inputs) {
      return { result: inputs.a === inputs.b };
    },
  },

  // ── Control flow ──────────────────────────────────────────────────────────

  Branch: {
    label: 'Branch',
    category: 'control',
    inputs: [
      { name: 'condition', type: 'bool' },
      { name: 'onTrue',    type: 'any'  },
      { name: 'onFalse',   type: 'any'  },
    ],
    outputs: [{ name: 'result', type: 'any' }],
    defaultProps: {},
    eval(inputs) {
      return { result: inputs.condition ? inputs.onTrue : inputs.onFalse };
    },
  },

};

// ── Colour palette per category ───────────────────────────────────────────────
// Each category has a header colour and a body colour.
export const CATEGORY_COLORS = {
  value:   { header: '#1d5230', body: '#162b20', portColor: '#50c080' },
  math:    { header: '#1c3a72', body: '#131f44', portColor: '#5090e0' },
  compare: { header: '#4a2a72', body: '#271540', portColor: '#a060e0' },
  control: { header: '#6e3a1e', body: '#3a1f0e', portColor: '#e08040' },
};

export const DEFAULT_COLORS = { header: '#3a3a5a', body: '#22223a', portColor: '#8080cc' };
