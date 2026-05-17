const FILE_VERSION = 1;

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
