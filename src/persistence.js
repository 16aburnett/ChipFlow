const FILE_VERSION  = 1;
const AUTOSAVE_KEY  = 'chipflow_autosave';
const AUTOSAVE_MS   = 500;   // debounce delay

// ── Autosave ───────────────────────────────────────────────────────────────────

export function setupAutosave(graph) {
  let timer = null;
  graph.on(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ version: FILE_VERSION, graph: graph.serialize() }));
    }, AUTOSAVE_MS);
  });
}

export function loadAutosave(graph) {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data.version || !data.graph) return false;
    graph.loadFrom(data.graph);
    return true;
  } catch {
    return false;
  }
}

export function saveGraph(graph) {
  const payload = { version: FILE_VERSION, graph: graph.serialize() };
  const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = Object.assign(document.createElement('a'), { href: url, download: 'graph.chipflow' });
  a.click();
  URL.revokeObjectURL(url);
}

export function loadGraph(graph) {
  return new Promise((resolve, reject) => {
    const input  = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.chipflow,application/json',
    });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.version || !data.graph) throw new Error('Invalid .chipflow file.');
        graph.loadFrom(data.graph);
        resolve(file.name);
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
