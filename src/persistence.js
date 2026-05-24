const FILE_VERSION = 1;
const AUTOSAVE_KEY = 'chipflow_autosave';
const AUTOSAVE_MS  = 500;

// ── Autosave ───────────────────────────────────────────────────────────────────

export function setupAutosave(graph, library) {
  let timer = null;
  const save = () => {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      version: FILE_VERSION,
      graph:   graph.serialize(),
      library: library.serialize(),
    }));
  };
  graph.on(()          => { clearTimeout(timer); timer = setTimeout(save, AUTOSAVE_MS); });
  library.onChange(() => { clearTimeout(timer); timer = setTimeout(save, AUTOSAVE_MS); });
}

export function loadAutosave(graph, library) {
  const raw = localStorage.getItem(AUTOSAVE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    if (!data.version || !data.graph) return false;
    if (data.library) library.loadFrom(data.library);
    graph.loadFrom(data.graph);
    return true;
  } catch {
    return false;
  }
}

export function saveGraph(graph, library) {
  const payload = {
    version: FILE_VERSION,
    graph:   graph.serialize(),
    library: library.serialize(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: 'graph.chipflow' });
  a.click();
  URL.revokeObjectURL(url);
}

export function loadGraph(graph, library) {
  return new Promise((resolve, reject) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file', accept: '.chipflow,application/json',
    });
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (!data.version || !data.graph) throw new Error('Invalid .chipflow file.');
        if (data.library) library.loadFrom(data.library);
        graph.loadFrom(data.graph);
        resolve(file.name);
      } catch (err) {
        reject(err);
      }
    };
    input.click();
  });
}
