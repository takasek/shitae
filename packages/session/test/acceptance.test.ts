import { describe, it, expect } from 'vitest';
import { parse } from '@shitae/parser';
import { Session } from '../src/index.js';

function make(source: string, extras = new Map<string, ReturnType<typeof parse>['document']>()) {
  const p = parse(source); expect(p.diagnostics.filter(d => d.severity === 'error')).toEqual([]);
  return new Session(new Map([['main', p.document], ...extras]), 'main');
}
function act(s: Session, name: string) {
  const a = s.query({select:['actions']}).data!.actions!.items.find(a => a.actionText === name)!;
  return s.dispatch({handle:a.handle});
}
describe('Session acceptance with independent expected states', () => {
  it('resumes suspended stacks, updates a singleton on explicit resume, and removes only an inactive subtree', () => {
    const s = make('> a -> switch(A##One, @a)\n> detail -> push(D)\n> child -> present(Child, @child)\n> b -> switch(B, @b)\n> resume -> switch(A##Two, @a)\n> overlay -> show(O)\n> close-a -> exit(@a)\n# Entry\n#! A\n## One\nx\n## Two\ny\n# D\nx\n# B\nx\n# O\nx\n# Child\nx\n');
    act(s,'a'); act(s,'detail'); act(s,'b'); act(s,'resume');
    let q = s.query({select:['state']});
    expect(q.summary.location.component).toBe('D');
    expect(q.data!.state!.frames.map(f => f.stack.map(l => l.component))).toEqual([['Entry'], ['A','D'], ['B']]);
    expect(q.data!.state!.sharedVariants[0]).toMatchObject({component:'A',variant:'Two',origin:'dsl'});
    act(s,'child'); act(s,'b'); act(s,'overlay');
    const before = s.query({select:['state']}).data!.state!;
    expect(before.frames.map(f => f.stack.map(l => l.component))).toEqual([['Entry'], ['A','D'], ['B'], ['Child']]);
    expect(before.frames.find(f=>f.stack[0]!.component==='Child')!.parentId).toBe(before.frames.find(f=>f.stack[0]!.component==='A')!.id);
    act(s,'close-a');
    q = s.query({select:['state']});
    expect(q.summary.location.component).toBe('B');
    expect(q.data!.state!.frames.map(f => f.stack.map(l => l.component))).toEqual([['Entry'], ['B']]);
    expect(q.data!.state!.overlays.map(o=>o.component)).toEqual(['O']);
  });
  it('keeps barrier DSL no-ops accepted with runtime diagnostics, while built-in back remains disabled', () => {
    const s = make('> present -> present(A)\n> back -> back()\n> back-entry -> back(Entry)\n> missing -> exit(@missing)\n# Entry\n# A\n');
    act(s,'present'); const before = s.query({select:['state']}).data!.state;
    for (const [name,code] of [['back','R003'],['back-entry','R003'],['missing','R002']]) {
      const r=act(s,name!); expect(r.receipt.changed).toEqual([]);
      expect(r.receipt.diagnostics[0]!.diagnostic.code).toBe(code);
      expect(s.query({select:['state']}).data!.state).toEqual(before);
    }
    const back=s.query({select:['actions']}).data!.actions!.controls.back;
    expect(back.enabled).toBe(false); expect(()=>s.dispatch({handle:back.handle})).toThrow('DISABLED_ACTION');
  });
  it('bounds default response payloads independently of module/inclusion/frame/history sizes', () => {
    const layers=Array.from({length:100},(_,i)=>`> layer${i} -> push(Home, @layer${i})\n`).join('')+'> resume -> switch(Home, @layer0)\n';
    const small=make(layers+'# Home\n> step -> push(Home)\n');
    const s=make(Array.from({length:30},(_,i)=>`import module${i} as m${i}\n`).join('')+layers+'# Home\n'+
      Array.from({length:300},(_,i)=>`c${i}: C${i}\n`).join('')+
      Array.from({length:30},(_,i)=>`m${i}::Other\n`).join('')+'> step -> push(Home)\n'+
      Array.from({length:300},(_,i)=>`# C${i}\nx\n`).join(''),
      new Map(Array.from({length:30},(_,i)=>['module'+i,parse('# Other\nx\n').document])));
    const first=act(small,'step');
    for(let i=0;i<100;i++) act(s,'layer'+i);
    act(s,'resume');
    const last=act(s,'step');
    expect(Object.keys(first).sort()).toEqual(['receipt','revision','summary']);
    expect(Object.keys(s.query()).sort()).toEqual(['revision','summary']);
    expect(JSON.stringify(last).length-JSON.stringify(first).length).toBeLessThan(30);
    const state=s.query({select:['state']}).data!.state!;
    expect(state.frames).toHaveLength(101);
    expect(state.activePath).toHaveLength(2);
    expect(state.inclusion.main.children).toHaveLength(330);
    expect(new Set(state.componentValues.map(c=>c.module)).size).toBe(31);
  });
});
