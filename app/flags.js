// Bug flags. Start the app with BUGS="B01,B04".
// Server code checks bug('B01'). Served HTML/JS/CSS use marker lines:
//   //#if B01  ...  //#else  ...  //#endif     (also /*#if B01*/ and <!--#if B01-->)
// Marker lines are always stripped, so the browser never sees flag names.
const MARKER = /^\s*(?:\/\/|\/\*|<!--)\s*#(if|else|endif)\b(?:\s+(B\d+))?/;

function parseBugs(value = '') {
  return new Set(value.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));
}

function applyFlags(text, bugs) {
  const out = [];
  const stack = [];
  text.split('\n').forEach((line, i) => {
    const m = line.match(MARKER);
    if (!m) {
      if (stack.every((f) => f.on)) out.push(line);
      return;
    }
    const [, kind, id] = m;
    if (kind === 'if') {
      if (!id) throw new Error(`#if without bug id at line ${i + 1}`);
      stack.push({ on: bugs.has(id) });
    } else if (!stack.length) {
      throw new Error(`#${kind} without #if at line ${i + 1}`);
    } else if (kind === 'else') {
      stack[stack.length - 1].on = !stack[stack.length - 1].on;
    } else {
      stack.pop();
    }
  });
  if (stack.length) throw new Error('unclosed #if');
  return out.join('\n');
}

module.exports = { parseBugs, applyFlags };
