const HEAP_SIZE    = 256 * 1024 * 1024;  // 256 MB default
const ALIGN        = 8;                   // all allocations are 8-byte aligned

function alignUp(n) {
  return (n + ALIGN - 1) & ~(ALIGN - 1);
}

export class Heap {
  constructor(size = HEAP_SIZE) {
    this._buf  = new ArrayBuffer(size);
    this._view = new DataView(this._buf);
    this._free = [{ offset: 0, size }];   // free-list: sorted array of { offset, size }
  }

  // ── Allocator ──────────────────────────────────────────────────────────────

  malloc(size) {
    if (size <= 0) return 0;
    const need = alignUp(size);
    for (let i = 0; i < this._free.length; i++) {
      const block = this._free[i];
      if (block.size >= need) {
        const ptr = block.offset;
        if (block.size === need) {
          this._free.splice(i, 1);
        } else {
          block.offset += need;
          block.size   -= need;
        }
        return ptr;
      }
    }
    throw new Error(`Heap out of memory (requested ${size} bytes)`);
  }

  free(ptr) {
    // No-op for null/zero pointer
    if (!ptr) return;

    // Insert back into free list and coalesce adjacent blocks
    this._free.push({ offset: ptr, size: ALIGN });
    this._free.sort((a, b) => a.offset - b.offset);

    for (let i = 0; i < this._free.length - 1; ) {
      const a = this._free[i];
      const b = this._free[i + 1];
      if (a.offset + a.size === b.offset) {
        a.size += b.size;
        this._free.splice(i + 1, 1);
      } else {
        i++;
      }
    }
  }

  // ── Typed read/write ───────────────────────────────────────────────────────

  loadU8(addr)          { return this._view.getUint8(addr); }
  storeU8(addr, val)    { this._view.setUint8(addr, val & 0xff); }

  loadI32(addr)         { return this._view.getInt32(addr, true); }
  storeI32(addr, val)   { this._view.setInt32(addr, val, true); }

  loadI64(addr)         { return Number(this._view.getBigInt64(addr, true)); }
  storeI64(addr, val)   { this._view.setBigInt64(addr, BigInt(Math.trunc(val)), true); }

  loadF32(addr)         { return this._view.getFloat32(addr, true); }
  storeF32(addr, val)   { this._view.setFloat32(addr, val, true); }

  loadF64(addr)         { return this._view.getFloat64(addr, true); }
  storeF64(addr, val)   { this._view.setFloat64(addr, val, true); }
}
