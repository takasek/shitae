// Bounded checks of generated simulator code, using the repository's VM test pattern.
// This is an observation probe, not browser or product acceptance.
import { readFileSync } from 'node:fs';
import * as vm from 'node:vm';
const report = new URL('./', import.meta.url);
const root = new URL('../../../', report);
const { parse } = await import(new URL('packages/parser/dist/index.js', root));
const { toSimulator } = await import(new URL('packages/simulator/dist/index.js', root));
function contextFor(relative) {
  const source = readFileSync(new URL(relative, report), 'utf8');
  const name = relative.split('/').at(-1).replace(/\.shitae$/, '');
  const parsed = parse(source);
  if (parsed.diagnostics.some(d => d.severity === 'error')) throw new Error('Parse error: ' + relative);
  const html = toSimulator(new Map([[name, parsed.document]]), name);
  const script = html.match(/<script>\n([\s\S]*)\n<\/script>/)?.[1];
  if (!script) throw new Error('Missing script');
  const elements = new Map();
  const context = vm.createContext({
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, {innerHTML:'', textContent:'', style:{}, classList:{add(){},remove(){}}});
      return elements.get(id);
    } },
    setTimeout: () => 0, clearTimeout: () => {}, console,
  });
  vm.runInContext(script, context);
  return context;
}
const gateCtx = contextFor('reproductions/alias-member.shitae');
const readGates = () => JSON.parse(vm.runInContext('JSON.stringify(currentInteractions().map(i => ({action:i.actionText, gate:i.gate, enabled:gateEnabled(i)})))', gateCtx));
const ready = readGates();
vm.runInContext("setInstanceVariant('alias-member', 'DiagramView', 'Error'); render()", gateCtx);
const error = readGates();
vm.runInContext("setInstanceVariant('alias-member', 'DiagramView', 'Ready'); render()", gateCtx);
const restored = readGates();
const inlineCtx = contextFor('astra/models/inline-repro.shitae');
const inline = JSON.parse(vm.runInContext(`JSON.stringify(getComp('inline-repro','比較画面').commonElements.map(el => ({element:el, rendered:renderElementNode(el,new Set(),' ', -1, [],[])})))`, inlineCtx));
console.log(JSON.stringify({scope:'Generated JavaScript in node:vm with minimal DOM stubs; no new browser observation', aliasMember:{ready,error,restored}, inline}, null, 2));
