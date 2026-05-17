export class History {
  constructor(graph, { maxSize = 100 } = {}) {
    this._graph      = graph;
    this._past       = [];
    this._future     = [];
    this._present    = this._capture();
    this._restoring  = false;
    this._maxSize    = maxSize;

    graph.on(() => {
      if (this._restoring) return;
      this._past.push(this._present);
      if (this._past.length > this._maxSize) this._past.shift();
      this._present = this._capture();
      this._future  = [];
    });
  }

  undo() {
    if (this._past.length === 0) return;
    this._future.push(this._present);
    this._present = this._past.pop();
    this._restore(this._present);
  }

  redo() {
    if (this._future.length === 0) return;
    this._past.push(this._present);
    this._present = this._future.pop();
    this._restore(this._present);
  }

  _capture() {
    return JSON.stringify(this._graph.serialize());
  }

  _restore(snapshot) {
    this._restoring = true;
    this._graph.loadFrom(JSON.parse(snapshot));
    this._restoring = false;
  }
}
