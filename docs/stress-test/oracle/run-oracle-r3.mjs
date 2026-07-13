// frame 意味論オラクル r3: singleton（ADR-0011）・switch resume 書換・overlay 追随の境界を runtime reduce で実測する。
// 使い方: node docs/stress-test/oracle/run-oracle-r3.mjs（要 pnpm -r build）
import {
  initialState,
  reduce,
  activeLocation,
  resolveLocation,
  overlayVariant,
  formatTree,
} from '../../../packages/runtime/dist/index.js';

const span = { offset: 0, length: 0, line: 0, col: 0 };
const comp = (name, variant = null, module = null) => ({ kind: 'component', module, name, variant });
const vari = (name) => ({ kind: 'variant', name });
const t = (word, target = null, session = null) => ({ kind: 'transition', word, target, session: session ? { name: session } : null, span });
const ov = (verb, name, variant = null) => ({ kind: 'overlay', verb, target: { module: null, name, variant }, span });

function run(label, seq, { singletons = [], probeOverlay = null } = {}) {
  let state = initialState({ module: null, component: 'ホーム', variant: null }, singletons);
  const warns = [];
  for (const tr of seq) {
    const r = reduce(state, tr);
    state = r.state;
    warns.push(...r.diagnostics.map((d) => `${d.code}`));
  }
  const loc = resolveLocation(state, activeLocation(state));
  const active = `${loc.component}${loc.variant ? '##' + loc.variant : ''}`;
  const overlays = [...state.overlays.entries()].map(([k, v]) => `${k}${v ? '##' + v : ''}`).join(',') || 'なし';
  const shared = [...state.sharedVariants.entries()].map(([k, v]) => `${k}=${v}`).join(',') || '空';
  const probed = probeOverlay ? ` / overlayVariant(${probeOverlay})=${overlayVariant(state, probeOverlay)}` : '';
  console.log(`${label}\n  active: ${active}\n  overlays: ${overlays}${probed}\n  shared: ${shared}\n  warns: ${warns.length ? warns.join(' / ') : 'なし'}\n  tree:\n${formatTree(state).replace(/^/gm, '    ')}\n`);
}

// S1: singleton 共有の基本 — present → goto(##v) → dismiss → 再 present で共有 variant が残る
run('S1: present(クーポン); goto(##受取済); dismiss(); present(クーポン)', [
  t('present', comp('クーポン')),
  t('goto', vari('受取済')),
  t('dismiss'),
  t('present', comp('クーポン')),
], { singletons: ['クーポン'] });

// S2: switch resume 経路の X##v — フレームは復帰しつつ共有 variant だけ書き換わる（ADR-0011 設計者確定）
run('S2: present(ホーム,@A); switch(クーポン,@B); goto(##受取済); switch(ホーム,@A); switch(クーポン##未受取,@B)', [
  t('present', comp('ホーム'), 'A'),
  t('switch', comp('クーポン'), 'B'),
  t('goto', vari('受取済')),
  t('switch', comp('ホーム'), 'A'),
  t('switch', comp('クーポン', '未受取'), 'B'),
], { singletons: ['クーポン'] });

// S3: スタック中段の singleton はスナップショットでない — 明示 X##v 書換後に back で降りると新値が見える
run('S3: push(クーポン); push(設定); push(クーポン##受取済); back(); back()', [
  t('push', comp('クーポン')),
  t('push', comp('設定')),
  t('push', comp('クーポン', '受取済')),
  t('back'),
  t('back'),
], { singletons: ['クーポン'] });

// S4: show(singleton) は共有を映す — 明示書換に追随し、再 show（省略形）でも initial に戻らない
run('S4: show(クーポン); push(クーポン##受取済); show(クーポン)', [
  ov('show', 'クーポン'),
  t('push', comp('クーポン', '受取済')),
  ov('show', 'クーポン'),
], { singletons: ['クーポン'], probeOverlay: 'クーポン' });

// S5: モジュール衝突（c20 のライブ再現）— 別モジュールの同名通常 component が singleton 扱いに巻き込まれる
run('S5: push(クーポン##通常)[ローカル通常]; push(mod::クーポン)[singleton]', [
  t('push', comp('クーポン', '通常')),
  t('push', comp('クーポン', null, 'mod')),
], { singletons: ['クーポン'] });

// S6: セッション無し push(##v) — アクティブ component の variant v を現在フレームに積む（c23）
run('S6: push(##二); back()', [
  t('push', vari('二')),
  t('back'),
]);

// S7: exit でフレームが死んでも共有 variant は生きる
run('S7: present(クーポン,@m); goto(##受取済); exit(@m); present(クーポン)', [
  t('present', comp('クーポン'), 'm'),
  t('goto', vari('受取済')),
  t('exit', null, 'm'),
  t('present', comp('クーポン')),
], { singletons: ['クーポン'] });

// S8: 通常 component（非 singleton）の対照 — 戻り系は積まれた時点の variant（スナップショット）
run('S8: push(記事##展開); push(設定); back()  [非singleton対照]', [
  t('push', comp('記事', '展開')),
  t('push', comp('設定')),
  t('back'),
]);
