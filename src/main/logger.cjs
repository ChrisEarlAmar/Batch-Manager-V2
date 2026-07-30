// Line-buffered file logger, one append-only file per process id under
// <userData>/logs/<id>.log. PTY output arrives in arbitrary chunks, so
// partial lines are buffered until a newline shows up before the
// timestamp prefix is written.
'use strict';

const fs = require('fs');
const path = require('path');

let logsDir = null;
const streams = new Map();
const partials = new Map();

function init(dir) {
  logsDir = dir;
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  } catch (err) {
    console.error('[logger] failed to create logs directory', logsDir, err);
  }
}

// A WriteStream is an EventEmitter — an async I/O failure (permission
// denied, disk full, an antivirus lock, the directory disappearing mid-run,
// etc.) surfaces as an 'error' event, not a thrown exception. With no
// listener, Node's default behavior for an unhandled 'error' event is to
// throw, which crashes the *entire* main process and every process it's
// managing. Dropping the broken stream from the cache means the next write
// just transparently opens a fresh one instead of retrying a dead object.
function getStream(id) {
  let stream = streams.get(id);
  if (!stream) {
    const file = path.join(logsDir, `${id}.log`);
    try {
      stream = fs.createWriteStream(file, { flags: 'a' });
    } catch (err) {
      console.error('[logger] failed to open log file', file, err);
      return null;
    }
    stream.on('error', (err) => {
      console.error('[logger] log stream error', file, err);
      if (streams.get(id) === stream) streams.delete(id);
    });
    streams.set(id, stream);
  }
  return stream;
}

function timestamp() {
  return new Date().toISOString();
}

function append(id, chunk) {
  const prior = partials.get(id) || '';
  const combined = prior + chunk;
  const lines = combined.split('\n');
  partials.set(id, lines.pop());
  const stream = getStream(id);
  if (!stream) return; // logging is best-effort; never block the process itself over it
  for (const line of lines) {
    stream.write(`[${timestamp()}] ${line}\n`);
  }
}

function markEvent(id, label) {
  const stream = getStream(id);
  if (!stream) return;
  stream.write(`[${timestamp()}] --- ${label} ---\n`);
}

function close(id) {
  const stream = streams.get(id);
  if (stream) {
    const prior = partials.get(id);
    if (prior) stream.write(`[${timestamp()}] ${prior}\n`);
    stream.end();
    streams.delete(id);
  }
  partials.delete(id);
}

function closeAll() {
  for (const id of Array.from(streams.keys())) close(id);
}

function getLogPath(id) {
  return path.join(logsDir, `${id}.log`);
}

module.exports = { init, append, markEvent, close, closeAll, getLogPath };
