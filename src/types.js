// ── Scalar types ──────────────────────────────────────────────────────────────

export const T = {
  bool:    'bool',
  u8:      'u8',
  i32:     'i32',
  i64:     'i64',
  f32:     'f32',
  f64:     'f64',
  address: 'address',
};

// ── Type metadata ─────────────────────────────────────────────────────────────

export const TYPE_INFO = {
  [T.bool]:    { bits: 1,  category: 'int'   },
  [T.u8]:      { bits: 8,  category: 'int'   },
  [T.i32]:     { bits: 32, category: 'int'   },
  [T.i64]:     { bits: 64, category: 'int'   },
  [T.f32]:     { bits: 32, category: 'float' },
  [T.f64]:     { bits: 64, category: 'float' },
  [T.address]: { bits: 64, category: 'ptr'   },
};

// ── Wire appearance ───────────────────────────────────────────────────────────
// strokeWidth scales with bit width; address gets a distinct color.

export const WIRE_STYLE = {
  [T.bool]:    { color: '#e0c040', strokeWidth: 1.5 },  // amber,  1 bit
  [T.u8]:      { color: '#50d080', strokeWidth: 2   },  // green,  8 bit
  [T.i32]:     { color: '#5090e0', strokeWidth: 2.5 },  // blue,  32 bit
  [T.i64]:     { color: '#a060e0', strokeWidth: 3.5 },  // purple,64 bit
  [T.f32]:     { color: '#40c8c8', strokeWidth: 2.5 },  // cyan,  32 bit
  [T.f64]:     { color: '#e060c0', strokeWidth: 3.5 },  // pink,  64 bit
  [T.address]: { color: '#e07030', strokeWidth: 3.5 },  // orange,64 bit
};

export const WIRE_STYLE_DEFAULT = { color: '#5858a8', strokeWidth: 2.5 };

// ── Type compatibility ────────────────────────────────────────────────────────
// Returns true if a wire of type `from` can connect to a port of type `to`.

export function typesCompatible(from, to) {
  if (from === to) return true;
  if (to === 'any' || from === 'any') return true;
  // i32 ↔ f32 and i64 ↔ f64 are the only implicit coercions allowed
  if ((from === T.i32 && to === T.f32) || (from === T.f32 && to === T.i32)) return true;
  if ((from === T.i64 && to === T.f64) || (from === T.f64 && to === T.i64)) return true;
  return false;
}
