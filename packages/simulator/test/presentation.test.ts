import { describe, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import { parse } from '@shitae/parser';
import { toSimulator } from '../src/simulator.js';

describe('state display presentation persistence', () => {
  it('preserves the specific duplicate-target control focus and inclusion fold, with no Session mutation', () => {
    let nodes: any[] = [];
    const document: any = {activeElement:null};
    const app: any = {contains:(el:any)=>nodes.includes(el), querySelectorAll:(selector:string)=>nodes.filter(n => selector.includes('data-history-key') ? false : selector.startsWith('details') ? n.tag === 'details' && n.dataset.stateKey : n.attrs['data-focus-key'] || n.attrs.onchange)};
    Object.defineProperty(app,'innerHTML',{set(html:string){
      document.activeElement=null;
      nodes=[...html.matchAll(/<(details|input|select|button|div)\s+([^>]+)>/g)].map(m=>{
        const attrs=Object.fromEntries([...m[2]!.matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1]!,a[2]!]));
        const el:any={tag:m[1],attrs,dataset:{stateKey:attrs['data-state-key']},open:/\bopen\b/.test(m[2]!),getAttribute:(k:string)=>attrs[k]??null};
        el.focus=()=>{document.activeElement=el;}; return el;
      });
    }});
    document.getElementById=()=>app;
    const p=parse('# Home\na: Card\nb: Card\n> One(a.signal?) -> effect\n> Two(b.signal?) -> effect\n# Card\n## On\nsignal\n## Off\nx\n');
    const html=toSimulator(new Map([['main',p.document]]),'main');
    const ctx=vm.createContext({document,crypto:webcrypto,structuredClone,console,setTimeout:()=>0});
    vm.runInContext(html.match(/<script>\n([\s\S]*)\n<\/script>/)![1]!,ctx);
    const run=(s:string)=>vm.runInContext(s,ctx);
    const before=run('JSON.stringify(SESSION.query({select:["state","actions","history"]}))');
    const selects=nodes.filter(n=>n.tag==='select'); expect(selects).toHaveLength(2);
    const key=selects[1].attrs['data-focus-key']; selects[1].focus();
    const fold=nodes.find(n=>n.tag==='details'&&n.dataset.stateKey); fold.open=false; const foldKey=fold.dataset.stateKey;
    run('toggleShowStates()');
    expect(app.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(nodes.find(n=>n.tag==='select'&&n.attrs['data-focus-key']===key));
    expect(document.activeElement).not.toBe(selects[1]);
    expect(document.activeElement.attrs['data-focus-key']).toBe(key);
    expect(nodes.find(n=>n.dataset.stateKey===foldKey).open).toBe(false);
    expect(run('JSON.stringify(SESSION.query({select:["state","actions","history"]}))')).toBe(before);
    const stopPropagation=vi.fn();ctx.event={stopPropagation};
    run(document.activeElement.attrs.onclick); expect(stopPropagation).toHaveBeenCalledOnce();
  });
});
