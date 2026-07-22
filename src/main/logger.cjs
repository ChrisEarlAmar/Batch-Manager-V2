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
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
}

function getStream(id) {
  let stream = streams.get(id);
  if (!stream) {
    const file = path.join(logsDir, `${id}.log`);
    stream = fs.createWriteStream(file, { flags: 'a' });
    streams.set(id, stream);
  }
  return stream;
}

function timestamp() {
  return new Date().toISOString();
}

function append(id, chunk) {
  const stream = getStream(id);
  const prior = partials.get(id) || '';
  const combined = prior + chunk;
  const lines = combined.split('\n');
  partials.set(id, lines.pop());
  for (const line of lines) {
    stream.write(`[${timestamp()}] ${line}\n`);
  }
}

function markEvent(id, label) {
  const stream = getStream(id);
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
