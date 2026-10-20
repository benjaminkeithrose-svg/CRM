/* Field CRM - writing out a recording on the phone (v166, a trial).
   Runs in its own thread, so the app stays usable while it works. Whisper,
   through transformers.js 3.8.1 and onnxruntime-web, both shipped in
   speech/ (kept in a cache of their own; this file changes with the app, so
   it is not in that folder). The model itself comes from huggingface.co the first time it is
   used and is kept in the browser's own cache after that; nothing said is
   sent anywhere. The app sends the recording as 16 kHz pieces of under 30
   seconds, cut at quiet moments, and gets the words back. */
import { pipeline, env } from './speech/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
// the engine's own files, from here rather than a CDN, so it works with no signal once loaded
env.backends.onnx.wasm.wasmPaths = new URL('./speech/', import.meta.url).href;
// GitHub Pages cannot send the headers that allow several threads
env.backends.onnx.wasm.numThreads = 1;

let asr = null, asrModel = '';
async function load(model, id){
  if(asr && asrModel === model) return asr;
  asr = null;
  const seen = {};
  asr = await pipeline('automatic-speech-recognition', model, {
    dtype: 'q8', device: 'wasm',
    progress_callback: p => {
      if(p.status !== 'progress' || !p.file) return;
      seen[p.file] = [p.loaded || 0, p.total || 0];
      let loaded = 0, total = 0;
      for(const k in seen){ loaded += seen[k][0]; total += seen[k][1]; }
      postMessage({id, type: 'download', loaded, total});
    }
  });
  asrModel = model;
  return asr;
}

// one job at a time: a second recording waits for the first
let queue = Promise.resolve();
onmessage = e => {
  const {id, cmd, model, pieces} = e.data || {};
  queue = queue.then(async () => {
    try {
      const run = await load(model, id);
      if(cmd === 'load'){ postMessage({id, type: 'ready'}); return; }
      const words = [];
      for(let i = 0; i < pieces.length; i++){
        postMessage({id, type: 'piece', i, n: pieces.length});
        const r = await run(pieces[i]);
        const t = String((r && r.text) || '').trim();
        if(t) words.push(t);
      }
      postMessage({id, type: 'done', text: words.join(' ')});
    } catch(err){
      asr = null; asrModel = '';
      postMessage({id, type: 'error', message: (err && err.message) || String(err)});
    }
  });
};
