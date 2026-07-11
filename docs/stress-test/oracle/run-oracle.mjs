// frame 意味論オラクル: runtime reduce に遷移列を食わせ、最終状態と警告を実測する。
// 使い方: node docs/stress-test/oracle/run-oracle.mjs（要 pnpm -r build）
//
// runtime がフレーム木モデルに書き換わったため（frame-tree-cases.md T1-T7）、
// ここでの出力も「アクティブ画面」＋「木全体」の2段に分けて表示する形に追随した。
import { initialState, reduce, activeLocation, formatTree } from '../../../packages/runtime/dist/index.js';

const span = { offset: 0, length: 0, line: 0, col: 0 };
const comp = (name, variant = null) => ({ kind: 'component', module: null, name, variant });
const vari = (name) => ({ kind: 'variant', name });
const t = (word, target = null, session = null) => ({ kind: 'transition', word, target, session: session ? { name: session } : null, span });

function run(label, seq) {
  let state = initialState({ module: null, component: 'ホーム', variant: null });
  const warns = [];
  for (const tr of seq) {
    const r = reduce(state, tr);
    state = r.state;
    warns.push(...r.diagnostics.map((d) => `${d.code}:${d.message}`));
  }
  const loc = activeLocation(state);
  const active = `${loc.component}${loc.variant ? '##' + loc.variant : ''}`;
  console.log(`${label}\n  active: ${active}\n  warns: ${warns.length ? warns.join(' / ') : 'なし'}\n  tree:\n${formatTree(state).replace(/^/gm, '    ')}\n`);
}

// Q1: present の barrier 床での back()
run('Q1: push(A); present(B); back()', [
  t('push', comp('A')),
  t('present', comp('B')),
  t('back'),
]);

// Q2: 名前付きを挟んだ無名 dismiss
run('Q2: present(A); present(B,@named); dismiss()', [
  t('present', comp('A')),
  t('present', comp('B'), 'named'),
  t('dismiss'),
]);

// Q3: goto は begin 地点を消すか
run('Q3: push(A,@S); goto(B); exit(@S)', [
  t('push', comp('A'), 'S'),
  t('goto', comp('B')),
  t('exit', null, 'S'),
]);

// Q4: back(X) は barrier を越えるか
run('Q4: push(A); present(B); push(C); back(ホーム)', [
  t('push', comp('A')),
  t('present', comp('B')),
  t('push', comp('C')),
  t('back', comp('ホーム')),
]);

// Q5: goto(##v) の variant 書き換えと戻り
run('Q5: push(A); goto(##開いた); back(); push(A)', [
  t('push', comp('A')),
  t('goto', vari('開いた')),
  t('back'),
  t('push', comp('A')),
]);
