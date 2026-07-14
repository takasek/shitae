// frame 意味論オラクル r2: round-2（switch/overlay/document common 導入後）の境界を runtime reduce で実測する。
// 使い方: node docs/stress-test/oracle/run-oracle-r2.mjs（要 pnpm -r build）
import { initialState, reduce, activeLocation, formatTree } from '../../../packages/runtime/dist/index.js';

const span = { offset: 0, length: 0, line: 0, col: 0 };
const comp = (name, variant = null) => ({ kind: 'component', module: null, name, variant });
const vari = (name) => ({ kind: 'variant', name });
const t = (word, target = null, session = null) => ({ kind: 'transition', word, target, session: session ? { name: session } : null, span });
const ov = (verb, name, variant = null) => ({ kind: 'overlay', verb, target: { module: null, name, variant }, span });

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
  const overlays = [...state.overlays.keys()].join(',') || 'なし';
  console.log(`${label}\n  active: ${active}\n  overlays: ${overlays}\n  warns: ${warns.length ? warns.join(' / ') : 'なし'}\n  tree:\n${formatTree(state).replace(/^/gm, '    ')}\n`);
}

// T1: push フレーム内から switch → 子フレーム化 → exit の道連れ
run('T1: present(ホーム,@tabHome); push(記事,@reading); switch(検索,@tabSearch); exit(@reading)', [
  t('present', comp('ホーム'), 'tabHome'),
  t('push', comp('記事'), 'reading'),
  t('switch', comp('検索'), 'tabSearch'),
  t('exit', null, 'reading'),
]);

// T2: back(X) は barrier なしフレーム境界を越えるか（越えたとき子と @S はどうなるか）
run('T2: push(A,@S); push(B); back(ホーム); exit(@S)', [
  t('push', comp('A'), 'S'),
  t('push', comp('B')),
  t('back', comp('ホーム')),
  t('exit', null, 'S'),
]);

// T3: アクティブフレーム自身の @S へ switch（タブ再タップ）— 底へ戻る? 最上段のまま?
run('T3: present(A,@S); push(B); switch(A,@S)', [
  t('present', comp('A'), 'S'),
  t('push', comp('B')),
  t('switch', comp('A'), 'S'),
]);

// T4: dismiss() の named 素通りと道連れ
run('T4: present(A,@S); present(B); present(C,@T); dismiss()', [
  t('present', comp('A'), 'S'),
  t('present', comp('B')),
  t('present', comp('C'), 'T'),
  t('dismiss'),
]);

// T5: push(A,@S) の底で back() — begin マーカーごと破棄 → 後続 exit は迷子
run('T5: push(A,@S); back(); exit(@S)', [
  t('push', comp('A'), 'S'),
  t('back'),
  t('exit', null, 'S'),
]);

// T6: switch(##v, @S) — 裸 variant nav-target での新規作成
run('T6: switch(##展開,@weird)', [
  t('switch', vari('展開'), 'weird'),
]);

// T7: 兄弟タブの遠隔 exit — 画面は動かないか
run('T7: present(ホーム,@tabHome); switch(検索,@tabSearch); switch(通知,@tabNotif); exit(@tabSearch)', [
  t('present', comp('ホーム'), 'tabHome'),
  t('switch', comp('検索'), 'tabSearch'),
  t('switch', comp('通知'), 'tabNotif'),
  t('exit', null, 'tabSearch'),
]);

// T8: show(X##v) の variant は保持されるか / 再 show で variant は更新されるか
run('T8: show(ミニ##再生中); show(ミニ##一時停止); hide(ミニ); hide(ミニ)', [
  ov('show', 'ミニ', '再生中'),
  ov('show', 'ミニ', '一時停止'),
  ov('hide', 'ミニ'),
  ov('hide', 'ミニ'),
]);

// T9: 同名 @S — exit はアクティブパス LIFO、switch 復帰は木全体で最新
run('T9: push(A,@S); push(B,@S); exit(@S); exit(@S)', [
  t('push', comp('A'), 'S'),
  t('push', comp('B'), 'S'),
  t('exit', null, 'S'),
  t('exit', null, 'S'),
]);
