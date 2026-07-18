import type { Document } from '@shitae/ast';
import { extractSimData } from './extract.js';
import type { SimulatorData } from './extract.js';

export function toSimulator(documents: Map<string, Document>, entryModule: string): string {
  const data = extractSimData(documents, entryModule);
  return buildHtml(data);
}

function buildHtml(data: SimulatorData): string {
  const json = JSON.stringify(data);
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>shitae simulator</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; font-size: 14px; background: #f5f5f5; color: #111; }
/* 3 カラム全幅グリッド（開発ツールのためレスポンシブ不要。設計者フィードバック 2026-07-19）:
   左 = スタック + 統合ログ / 中央 = 現在の画面 + 遷移マップ / 右 = gate パネルのみ（Task 10）。 */
#app { display: grid; grid-template-columns: 260px 1fr 300px; height: 100vh; }
.pane { padding: 16px; overflow-y: auto; }
.pane-trace { background: #fff; border-right: 1px solid #e0e0e0; }
/* 中央ペインは自身を単一スクロール領域にしない（.pane の overflow-y: auto を上書き）——
   画面カードと遷移マップを grid rows で独立スクロールの 2 領域に分割する（Task 9）。
   画面カードの高さが変わっても遷移マップの表示位置（row の開始位置）は動かない。 */
.pane-center { background: #f5f5f5; padding: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
.pane-events { background: #fff; border-left: 1px solid #e0e0e0; }
.pane-title { font-size: 13px; font-weight: 700; color: #333; margin-bottom: 2px; }
.pane-desc { font-size: 11px; color: #888; margin-bottom: 10px; }
/* min-height: 0 は grid item の暗黙の最小高さ（auto）を打ち消し overflow-y: auto を効かせるために必須 */
.screen-section { display: flex; flex-direction: column; overflow-y: auto; min-height: 0; padding: 16px 16px 8px; }
.graph-section { display: flex; flex-direction: column; overflow-y: auto; min-height: 0; padding: 8px 16px 16px; border-top: 1px solid #e0e0e0; }
.stack-list { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #333; margin-bottom: 16px; }
.stack-item { padding: 3px 8px; border-radius: 4px; background: #f5f5f5; }
.stack-item-current { background: #111; color: #fff; }
.stack-wall { color: #c0392b; margin-right: 2px; }
.stack-session { color: #2563eb; font-size: 11px; margin-left: 4px; }
.timeline-log { display: flex; flex-wrap: wrap; gap: 4px 6px; font-size: 12px; color: #666; }
.timeline-item { background: #e0e0e0; padding: 2px 8px; border-radius: 10px; cursor: pointer; }
.timeline-item-event { background: #eef0ff; color: #4b4f8f; }
.timeline-item.current { background: #111; color: #fff; }
.timeline-item:hover { background: #ccc; }
.screen { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.screen-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.variant-label { font-size: 12px; color: #888; margin-bottom: 12px; }
.elements { margin-bottom: 16px; }
.element { padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #333; }
.element:last-child { border-bottom: none; }
.element.collection::before { content: "×N  "; color: #999; font-size: 11px; }
.element-hierarchy > summary.element { cursor: pointer; }
.element-children { margin-left: 16px; border-left: 1px solid #eee; padding-left: 8px; }
.element-cycle { color: #c0392b; font-size: 11px; margin-left: 6px; }
.element-actions { margin: 2px 0 6px 16px; }
.scope-badge { font-size: 10px; color: #888; background: #f0f0f0; border-radius: 8px; padding: 1px 6px; white-space: nowrap; }
.action-flat { border-top: 1px solid #eee; padding-top: 6px; }
.action-list { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.action-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 6px 0; border-bottom: 1px solid #f5f5f5; }
.action-row:last-child { border-bottom: none; }
.action-text { font-size: 13px; color: #333; }
.action-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice-chip { background: #f0f0f0; border: none; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.choice-chip:hover { background: #e0e0e0; }
.back-btn { margin-top: 12px; background: none; border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 12px; color: #555; }
.back-btn:hover { background: #f0f0f0; }
.no-actions { color: #bbb; font-size: 13px; font-style: italic; }
.overlay-card { margin-top: 12px; border: 1px dashed #999; }
.overlay-badge { display: inline-block; font-size: 11px; color: #fff; background: #555; padding: 1px 8px; border-radius: 8px; margin-bottom: 8px; }
.gate-panel { margin-top: 20px; font-size: 12px; }
.gate-panel-toggle { background: none; border: 1px solid #ddd; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #777; font-size: 11px; }
.gate-panel-desc { margin-top: 6px; font-size: 11px; color: #888; }
.gate-panel-body { margin-top: 6px; padding: 8px 10px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; display: flex; flex-direction: column; gap: 6px; }
.gate-row { display: flex; align-items: center; gap: 8px; }
.gate-row-label { color: #555; min-width: 80px; }
.graph-svg { max-width: 100%; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; }
.graph-svg rect { fill: #fff; stroke: #ccc; }
.graph-node:hover rect { stroke: #111; fill: #f0f0f0; }
.graph-node-current rect { fill: #dbeafe; stroke: #2563eb; stroke-width: 2; }
.graph-svg text { font-size: 10px; fill: #333; pointer-events: none; }
.graph-svg line { stroke: #bbb; stroke-width: 1; }
.graph-svg marker path { fill: #bbb; }
/* 遷移マップペイン上部に sticky で固定する（Task 9）——マップが縦に伸びて
   ペイン内スクロールが生じても hover プレビューは常時見える位置にとどまり、
   画面下へフレームアウトしない。z-index と不透明背景でノード矩形の上に重ねて表示する。 */
.graph-preview { position: sticky; top: 0; z-index: 1; margin-bottom: 6px; padding: 6px 8px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; font-size: 11px; color: #555; min-height: 1em; }
.graph-preview-title { font-weight: 700; color: #333; }
</style>
</head>
<body>
<div id="app"></div>
<script>
const DATA = ${json};
const app = document.getElementById('app');
// (module, component) の合成キー（ADR-0013: singleton の共有スコープは定義ファイル単位）
function skey(module, component) { return JSON.stringify([module, component]); }
const SINGLETONS = new Set((DATA.singletons || []).map(s => skey(s.module, s.name)));
function isSingleton(module, component) { return SINGLETONS.has(skey(module, component)); }

// 姿指定なしで component に入ったら、最初に定義された姿を初期姿として扱う
function initialVariant(module, component) {
  const comp = DATA.modules[module]?.components[component];
  return comp?.initialVariant ?? null;
}

// singleton の共有 variant レジストリ（skey(module, component) → 現在 variant）。
// フレームスタック・overlays に置かれた singleton はスナップショットでなくここへの参照を見る（ADR-0011）。
// 二重の役割: presence gate の member 参照（対象.要素?）が対象インスタンスの現在 variant を
// 判定する際のデフォルト解決にも流用する（対象は非 singleton でもよい）。手動トグルパネルが
// 書き込む先も同じレジストリ——「document 内で variant 状態は単一」という原則と整合させるため
// 分離しない（ADR-0002 Consequence「simulator はインスタンス variant の手動トグルで観測可能にする」）。
let sharedVariants = new Map();

// gate 対象 component（{module, name}）の一覧（手動トグルパネル用。定義 module へ解決済み）
const GATE_TARGETS = DATA.gateTargets || [];
let gatePanelOpen = false;

// 対象インスタンスの variant を手動で書き換える（gate 観測用）
function setInstanceVariant(module, name, variant) {
  sharedVariants.set(skey(module, name), variant);
  render();
}

function toggleGatePanel() {
  gatePanelOpen = !gatePanelOpen;
  render();
}

// push/present/goto/switch の行き先 variant を解決する。singleton は共有レジストリが優先し、
// 明示 X##v はレジストリを書き換える（全所在に即時反映）。variant 省略時は「初回は initial、
// 以降は最後に遷移した variant」（レジストリ未登録なら initial）。
function resolveEntryVariant(target) {
  if (isSingleton(target.module, target.component)) {
    const k = skey(target.module, target.component);
    if (target.variant != null) sharedVariants.set(k, target.variant);
    return sharedVariants.has(k) ? sharedVariants.get(k) : initialVariant(target.module, target.component);
  }
  return target.variant ?? initialVariant(target.module, target.component);
}

// フレームの表示 variant。singleton は frame.variant（積んだ時点の値）を無視し、
// 常に共有レジストリの現在値を見る（スナップショット禁止。ADR-0011）。
function displayVariant(frame) {
  if (isSingleton(frame.module, frame.component)) {
    const k = skey(frame.module, frame.component);
    return sharedVariants.has(k) ? sharedVariants.get(k) : initialVariant(frame.module, frame.component);
  }
  return frame.variant;
}

// ── stack frame: { module, component, variant, wall, sessionName }
let stack = [{
  module: DATA.entryModule,
  component: DATA.entryComponent,
  variant: initialVariant(DATA.entryModule, DATA.entryComponent),
  wall: false,
  sessionName: null,
}];

let overlays = new Map(); // 掲示中 component名 → 表示 variant（null=initial の含意。SPEC「オーバーレイ」。フレーム木とは別軸）

// 統合ログ: 遷移（transition）と出力（event: effect / set / show / hide / 警告）を単一時系列に記録する
// （Task 10。旧 traceLog/eventLog の分離を統合し「trace 末尾スナップショット陳腐化」を根治）。
// 各エントリは { kind: 'transition' | 'event', label, snapshot }。snapshot は適用後の全状態
// { stack, sharedVariants, overlays } の deep copy（Map は entries 配列化）——event エントリも
// 状態を持つため巻き戻し対象になる。起動イベントを先頭に置く（設計判断: Task 2 brief）。
// 現在の frame スタックは別にスタック表示（renderStackList）が専任で描画する（Task 7）。
let timeline = [{ kind: 'transition', label: '起動', snapshot: snapshotState() }];

function getComp(module, name) {
  return DATA.modules[module]?.components[name];
}

function currentFrame() {
  return stack[stack.length - 1];
}

// 現在の全状態 { stack, sharedVariants, overlays } の deep copy を作る（Map は entries 配列化。structuredClone 相当）
function snapshotState() {
  return {
    stack: JSON.parse(JSON.stringify(stack)),
    sharedVariants: JSON.parse(JSON.stringify([...sharedVariants.entries()])),
    overlays: JSON.parse(JSON.stringify([...overlays.entries()])),
  };
}

// snapshot から全状態を復元する（統合ログのエントリタップ用。壁は無視——開発者向けタイムトラベル）
function restoreState(snapshot) {
  stack = JSON.parse(JSON.stringify(snapshot.stack));
  sharedVariants = new Map(JSON.parse(JSON.stringify(snapshot.sharedVariants)));
  overlays = new Map(JSON.parse(JSON.stringify(snapshot.overlays)));
}

// 統合ログへ1件追記する共通経路（Task 10）。適用後スナップショットを添える——
// 遷移だけでなく event（effect/set/show/hide/警告）も状態を持つため巻き戻し対象になる。
function pushTimelineEntry(kind, label) {
  timeline.push({ kind, label, snapshot: snapshotState() });
}

// interaction 1 件分の prelude → 指定 choice（未指定・choices 空なら prelude のみ）を順に適用する。
// [TRUE] ラベル1つ（choices 空）は choiceIdx を渡しても choice が無いため prelude だけが起こる。
function runChoice(interaction, choiceIdx) {
  for (const body of interaction.prelude) applyTransition(body);
  const choice = interaction.choices[choiceIdx];
  if (choice) {
    for (const body of choice.results) applyTransition(body);
  }
}

// 遷移イベントの label（適用後の現在地が分かる形。末尾が常に現在地。back も他の遷移語
// と同じくこの label を使う——word には 'back' がそのまま渡る。Task 7）
function transitionLabel(word) {
  const frame = currentFrame();
  const v = displayVariant(frame);
  const loc = v ? frame.component + ' / ' + v : frame.component;
  return word + ' → ' + loc;
}

// 掲示中 component の表示 variant（省略指定は initial。SPEC「オーバーレイ」）
function overlayVariant(name) {
  const entry = overlays.get(name);
  if (!entry) return null;
  // singleton は再 show の「省略時 initial 上書き」規則が適用されない——常に共有レジストリを見る（SPEC「オーバーレイ」）
  if (isSingleton(entry.module, name)) {
    const k = skey(entry.module, name);
    return sharedVariants.has(k) ? sharedVariants.get(k) : initialVariant(entry.module, name);
  }
  if (entry.variant != null) return entry.variant;
  return initialVariant(entry.module, name);
}

// 掲示中 component の実効 interactions（表示 variant で mergeInteractions 済み。全画面から操作可能。SPEC「オーバーレイ」）
// 裸 gate は掲示中 component 自身の表示 variant の実効 body で判定する——アクティブ画面の body は見ない（ADR-0019）。
function overlayInteractions(name) {
  const entry = overlays.get(name);
  if (!entry) return [];
  const comp = getComp(entry.module, name);
  if (!comp) return [];
  const v = overlayVariant(name);
  const list = v ? (comp.variants[v]?.interactions ?? []) : comp.commonInteractions;
  const hostCtx = { module: entry.module, component: name, variant: v };
  return list.filter((inter) => gateEnabled(inter, hostCtx));
}

// 要素配列（SimElement { name, ref }）から表示名（alias 優先）の一覧を得る。gate の
// 構造的 presence 照合は従来どおり表示名で行う（Task 8 の要素構造化で挙動を変えない）。
function elementNames(els) {
  return (els ?? []).map((e) => e.name);
}

// presence gate（'?'）の構造的 presence 判定（SPEC「2種類のガード的なもの」・ADR-0002）。
// gate なしは常に有効。host は既定で発火時のアクティブ component の現在 variant で判定
// （document common の裸参照もこの経路——ADR-0015 の動的解決）。
// hostCtx（{module, component, variant}）を渡すと判定対象をそちらに差し替える——
// overlay 掲示中 component の裸参照は自身の表示 variant の実効 body（共通＋固有）で判定し、
// アクティブ画面の body は見ない（ADR-0019）。
// member は対象インスタンスの現在 variant（未追跡なら initial。singleton なら共有レジストリ）を見る。
function gateEnabled(inter, hostCtx) {
  const gate = inter.gate;
  if (!gate) return true;
  if (gate.kind === 'host') {
    if (hostCtx) {
      const comp = getComp(hostCtx.module, hostCtx.component);
      if (!comp) return true;
      const commonEls = comp.commonElements ?? [];
      const varEls = hostCtx.variant ? (comp.variants[hostCtx.variant]?.elements ?? []) : [];
      return elementNames([...commonEls, ...varEls]).includes(gate.name);
    }
    const frame = currentFrame();
    const comp = getComp(frame.module, frame.component);
    if (!comp) return true;
    const variant = displayVariant(frame);
    const commonEls = comp.commonElements ?? [];
    const varEls = variant ? (comp.variants[variant]?.elements ?? []) : [];
    const docEls = DATA.modules[frame.module]?.docCommonElements ?? [];
    return elementNames([...docEls, ...commonEls, ...varEls]).includes(gate.name);
  }
  // member
  const mod = gate.module ?? currentFrame().module;
  const targetComp = getComp(mod, gate.targetComponent);
  if (!targetComp) return true; // 対象が判定不能（未定義 component 等）→ always-on
  const k = skey(mod, gate.targetComponent);
  const variant = sharedVariants.has(k) ? sharedVariants.get(k) : targetComp.initialVariant;
  const commonEls = targetComp.commonElements ?? [];
  const varEls = variant ? (targetComp.variants[variant]?.elements ?? []) : [];
  return elementNames([...commonEls, ...varEls]).includes(gate.name);
}

function currentInteractions() {
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);
  if (!comp) return [];
  // 姿の interactions は抽出時に mergeInteractions(共通, 姿固有) 済み（shadow 合成）
  const variant = displayVariant(frame);
  const list = variant ? (comp.variants[variant]?.interactions ?? []) : comp.commonInteractions;
  // Array#filter は (item, index, array) を渡す。gateEnabled を直接渡すと index が
  // hostCtx に化けるため、単項の呼び出しに包んで既定（currentFrame() 基準）を強制する。
  return list.filter((inter) => gateEnabled(inter));
}

// stack 上の sessionName（非 null）一覧を積み順（下から上）で重複除去して返す
// （exit/dismiss 警告のセッション一覧・スタック表示との突き合わせに使う。Task 7）。
function currentSessionNames() {
  const seen = new Set();
  const names = [];
  for (const f of stack) {
    if (f.sessionName != null && !seen.has(f.sessionName)) {
      seen.add(f.sessionName);
      names.push(f.sessionName);
    }
  }
  return names;
}

// exit/dismiss の対象セッション不在警告。スタック表示と突き合わせて理解できるよう、
// 現在スタックに乗っている session 一覧を併記する（ゼロ件なら「なし」。Task 7 受入基準d）。
function exitDismissWarning(word, sessionName) {
  const label = sessionName != null ? '@' + sessionName : '';
  const target = sessionName != null ? label + 'の開始点' : '直近の無名セッションの開始点';
  const names = currentSessionNames();
  const namesText = names.length > 0 ? names.map((n) => '@' + n).join(', ') : 'なし';
  return word + '(' + label + '): スタックに' + target + 'が積まれていない（現在のセッション: ' + namesText + '）';
}

function resolveTarget(result, currentModule, currentComponent) {
  if (!result || result.type !== 'transition') return null;
  const t = result.target;
  if (!t) return null;
  if (t.kind === 'variant') {
    return { module: currentModule, component: currentComponent, variant: t.variant };
  }
  return {
    module: t.module ?? currentModule,
    component: t.component,
    variant: t.variant,
  };
}

function applyTransition(result) {
  const frame = currentFrame();
  const mod = frame.module;
  const comp = frame.component;

  if (result.type === 'effect') {
    // 効果は遷移でない → 統合ログへ event として追記（旧トースト表示分。toast の DOM/CSS は全廃）
    pushTimelineEntry('event', 'effect: ' + result.text);
    return;
  }

  if (result.type === 'overlay') {
    // 掲示中集合を更新（show は表示 variant・module 込みで追加/上書き / hide 除去。hide 空打ち no-op）。フレーム木は動かさない。
    // module 省略時はアクティブフレームの module で解決（push/goto の相対解決と同じ規約）。
    // show/hide は遷移ではない → 統合ログへ event として1行。適用後の overlays/sharedVariants を
    // snapshot に持つため、この event エントリへ巻き戻すと掲示状態も復元される。
    if (result.op === 'show') {
      const mod = result.module ?? frame.module;
      // 明示 show(X##v) は singleton の共有レジストリも書き換える（全所在に即時反映。ADR-0011）
      if (result.variant != null && isSingleton(mod, result.component)) {
        sharedVariants.set(skey(mod, result.component), result.variant);
      }
      overlays.set(result.component, { variant: result.variant, module: mod });
      pushTimelineEntry('event', 'show(' + result.component + (result.variant != null ? '##' + result.variant : '') + ')');
    } else {
      overlays.delete(result.component);
      pushTimelineEntry('event', 'hide(' + result.component + ')');
    }
    return;
  }

  if (result.type === 'state') {
    // set（ADR-0014）: 遷移も掲示もせず singleton の共有 variant だけを書き換える。
    // 非 singleton は no-op（E030 は checker が静的に検出する）。set も遷移ではない →
    // 統合ログへ event として追記する（適用後の sharedVariants を snapshot に持つ）。
    const mod = result.module ?? frame.module;
    if (isSingleton(mod, result.component)) {
      sharedVariants.set(skey(mod, result.component), result.variant);
      pushTimelineEntry('event', 'set(' + result.component + '##' + result.variant + ')');
    } else {
      pushTimelineEntry('event', 'set(' + result.component + '##' + result.variant + ') は singleton でないため無効');
    }
    return;
  }

  const word = result.word;
  const target = resolveTarget(result, mod, comp);

  // 遷移（back/push/present/switch/goto/exit/dismiss）: 実際に stack が変わったものだけ
  // 統合ログへ transition として追加する（適用後の全状態 snapshot を添える）。back も他の
  // 遷移語と同じくこの共通経路に乗る——統合ログ=実行された遷移と出力の忠実な列という
  // オートマトン理論の見立てに沿い、back による巻き戻しも記録として残す（設計者確定
  // 事項。旧仕様のトレースログ末尾除去 traceLog.pop() は全廃。Task 7）。
  const beforeStack = JSON.stringify(stack);

  // back() は shitae back() 準拠: アクティブパスを1つ遡る。失敗（wall・戻り先なし）は
  // no-op のため stack は変わらず、警告を統合ログへ event として流す（transition 追記なし）。
  if (word === 'back') {
    if (stack.length <= 1) return;
    if (!target) {
      const top = stack[stack.length - 1];
      if (top.wall) { pushTimelineEntry('event', 'back() が壁に阻まれました'); return; }
      stack = stack.slice(0, -1);
    } else {
      // back(X): アクティブパスを遡るが barrier（wall）は越えない（runtime に整合）。
      // 複数段の巻き戻しも stack を1回で切り詰め、transition への追記は末尾で1件だけ起こる。
      let found = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].component === target.component) { found = i; break; }
        if (stack[i].wall) break; // 壁に阻まれ、これ以上遡れない
      }
      if (found < 0) {
        pushTimelineEntry('event', 'back(' + target.component + ') の戻り先が見つかりません');
      } else if (found < stack.length - 1) {
        stack = stack.slice(0, found + 1);
      }
      // found === stack.length - 1 は既に対象がアクティブ（no-op）
    }
  } else if (word === 'push' || word === 'present') {
    if (!target) return;
    const variant = resolveEntryVariant(target);
    stack = [...stack, { module: target.module, component: target.component, variant, wall: word === 'present', sessionName: result.session ?? null }];
  } else if (word === 'switch') {
    // 近似: 線形 stack 上で resume-or-create。stack 内に同名 sessionName が生存
    // していればそこまで戻る（resume 近似）、無ければ新規に積む（create、wall=true）。
    // 正確な兄弟規則・中断フレームの保持は @shitae/runtime（frame 木）の領分。
    if (!target || !result.session) return;
    const idx = stack.findLastIndex(f => f.sessionName === result.session);
    if (idx >= 0) {
      // resume: target frame は変えないが、明示 X##v の共有書換だけは効く（設計者確定。ADR-0011）。
      resolveEntryVariant(target);
      stack = stack.slice(0, idx + 1);
    } else {
      const variant = resolveEntryVariant(target);
      stack = [...stack, { module: target.module, component: target.component, variant, wall: true, sessionName: result.session }];
    }
  } else if (word === 'goto') {
    if (!target) return;
    // 同一 component 内の姿替え（goto(##姿)）以外は初期姿の解決を行う。
    // begin マーカー（sessionName）と wall は保存する（ADR-0006 B2）。
    const variant = resolveEntryVariant(target);
    const newFrame = { ...frame, component: target.component, variant, module: target.module };
    stack = [...stack.slice(0, -1), newFrame];
  } else if (word === 'exit' || word === 'dismiss') {
    const sessionName = result.session ?? null;
    let found = false;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].sessionName === sessionName) {
        found = true;
        stack = stack.slice(0, i);
        if (stack.length === 0) {
          stack = [{ module: DATA.entryModule, component: DATA.entryComponent, variant: initialVariant(DATA.entryModule, DATA.entryComponent), wall: false, sessionName: null }];
        }
        break;
      }
    }
    if (!found) {
      pushTimelineEntry('event', exitDismissWarning(word, sessionName));
    }
  }

  if (JSON.stringify(stack) !== beforeStack) {
    pushTimelineEntry('transition', transitionLabel(word));
  }
}

// 選択肢 1 つ分の result 群を順に全部起こす
function runResults(bodies) {
  for (const body of bodies) applyTransition(body);
  render();
}

// scope（'variant' | 'component' | 'document'）ごとの実効 interactions 一覧。
// 操作一覧のカテゴリ折り畳み・クリックハンドラの両方がこの分類を基準にする。
function scopedInteractions(scope) {
  if (scope === 'document') return docCommonInteractions();
  return currentInteractions().filter((inter) => inter.scope === scope);
}

// 操作一覧のラベルボタンクリック。choiceIdx はラベル無し操作（[TRUE] 1 ボタン）なら 0 のまま
// 渡ってくるが choices が空のため runChoice は prelude のみ実行する。
function handleInteraction(scope, idx, choiceIdx) {
  const interaction = scopedInteractions(scope)[idx];
  if (!interaction) return;
  runChoice(interaction, choiceIdx);
  render();
}

// 掲示中カードの scope（'component' | 'variant'）別 interactions。document common は掲示中
// カードに出さない（発火判定はアクティブ画面基準 — ADR-0015 — であり掲示中カードの所属ではない）。
function overlayScopedInteractions(name, scope) {
  return overlayInteractions(name).filter((inter) => inter.scope === scope);
}

// 掲示中カードの interaction 発火。cardIdx は表示順（[...overlays.keys()] の添字）。
// component 名は任意文字列（' や " を含みうる）のため onclick へ直接埋め込むと属性を壊しうる
// （旧実装のバグ）——名前を埋め込まず表示順インデックスで参照し、クリック時に名前へ解決し直す。
// 遷移の相対解決は常にアクティブフレーム基準（applyTransition が currentFrame() を見るため、
// overlay 自身を「現在地」にはしない。SPEC 341）。
function handleOverlayInteraction(cardIdx, scope, idx, choiceIdx) {
  const name = [...overlays.keys()][cardIdx];
  if (!name) return;
  const interaction = overlayScopedInteractions(name, scope)[idx];
  if (!interaction) return;
  runChoice(interaction, choiceIdx);
  render();
}

function goBack() {
  runResults([{ type: 'transition', word: 'back', target: null, session: null }]);
}

// 統合ログのエントリタップ: 全状態巻き戻し（stack・sharedVariants・overlays を snapshot
// から復元し、timeline をそのエントリまで truncate）。壁は無視する（開発者向けタイムトラベル。設計者確定事項）。
function jumpToTimeline(idx) {
  const entry = timeline[idx];
  if (!entry) return;
  restoreState(entry.snapshot);
  timeline = timeline.slice(0, idx + 1);
  render();
}

// document common（最初の # より前）のインタラクション。どの画面でも常に有効だが、
// 現在画面の実効 interactions に shadow されたものは除外する（SPEC「document common」3階層shadow）。
function docCommonInteractions() {
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);
  // Array#filter は (item, index, array) を渡す。gateEnabled を直接渡すと index が
  // hostCtx に化けるため、単項の呼び出しに包んで既定（currentFrame() 基準・ADR-0015）を強制する。
  if (!comp) return (DATA.documentCommon ?? []).filter((inter) => gateEnabled(inter));
  const variant = displayVariant(frame);
  const list = variant
    ? (comp.variants[variant]?.docCommonInteractions ?? DATA.documentCommon ?? [])
    : (comp.docCommonInteractions ?? DATA.documentCommon ?? []);
  return list.filter((inter) => gateEnabled(inter));
}

// scope バッジの表示ラベル（有効範囲の明示。旧カテゴリ見出しの置き換え——Task 8 / ADR-0022 5）
const SCOPE_BADGE_LABELS = { variant: 'variant固有', component: 'component common', document: 'document common' };

// 操作行 1 件（行動テキスト + scope バッジ + 選択肢ボタン横並び）。choices 空なら [TRUE]
// ラベル1つのボタンにする。item は { inter, scope, idx }——idx はその scope のフィルタ済み
// リスト（scopedInteractions / overlayScopedInteractions）内の位置で、描画とクリックハンドラが
// 同じフィルタ済みリストを参照するためインデックスはずれない。onclick へは scope 固定キーと
// 数値だけを埋め込む（任意文字列の埋め込みによる quote 衝突バグの根治方針を踏襲）。
function renderActionRow(item, buildOnclick) {
  const inter = item.inter;
  const labels = inter.choices.length > 0 ? inter.choices.map((c) => c.label) : ['TRUE'];
  const buttons = labels.map((l, choiceIdx) =>
    '<button class="choice-chip" onclick="' + buildOnclick(item.scope, item.idx, choiceIdx) + '">' +
    esc('[' + l + ']') + '</button>'
  ).join('');
  return '<div class="action-row"><span class="action-text">' + esc(inter.actionText) + '</span>' +
    '<span class="scope-badge">' + esc(SCOPE_BADGE_LABELS[item.scope] ?? item.scope) + '</span>' +
    '<span class="action-choices">' + buttons + '</span></div>';
}

// 要素サブツリー 1 件。ref を持つ要素（project 内の定義済み component への参照）は参照先の
// 中身（commonElements + 現在 variant の elements。variant は sharedVariants → initialVariant
// のオートマトン整合の解決——displayVariant / gateEnabled の member 分岐と同じ規約）を
// <details open> で再帰展開する（Task 8。ADR-0022 5「画面カードの要素は階層」）。
// visited は展開経路上の (module,name) 集合——再訪したら「（循環）」を出して打ち切る
// （循環ガード。ガードがあるため深さは無制限でよい）。attachedHtml はトップレベル要素にのみ
// 呼び出し側が渡す紐付け操作行で、要素名の直下（参照先の中身より前）に置く。
function renderElementNode(el, visited, attachedHtml) {
  const comp = el.ref ? getComp(el.ref.module, el.ref.name) : null;
  if (!comp) {
    return '<div class="element">' + esc(el.name) + '</div>' + attachedHtml;
  }
  const key = skey(el.ref.module, el.ref.name);
  if (visited.has(key)) {
    return '<div class="element">' + esc(el.name) + '<span class="element-cycle">（循環）</span></div>' + attachedHtml;
  }
  const nextVisited = new Set(visited);
  nextVisited.add(key);
  const v = sharedVariants.has(key) ? sharedVariants.get(key) : comp.initialVariant;
  const childEls = [...(comp.commonElements ?? []), ...(v ? (comp.variants[v]?.elements ?? []) : [])];
  const children = childEls.map((c) => renderElementNode(c, nextVisited, '')).join('');
  return '<details open class="element-hierarchy"><summary class="element">' + esc(el.name) + '</summary>' +
    attachedHtml + '<div class="element-children">' + children + '</div></details>';
}

// 画面カードの要素リストと操作一覧を描画する（本体・掲示中カード共通。Task 8）。els は
// トップレベル要素（SimElement）、items は gate フィルタ済みの操作（{ inter, scope, idx }）。
// action.target の参照名（targetName）がトップレベル要素の表示名に一致した操作はその要素行の
// 直下へ紐付け、残り（不一致・対象なし）はフラットリストへ出す。同名要素が複数あるときは
// 最初の要素にだけ紐付ける（発火する interaction は同一のため重複表示しない）。
// hostKey は循環ガードの起点（カード自身の (module,component)）。
function renderElementsAndActions(els, items, buildOnclick, hostKey) {
  const consumed = new Set();
  const elementRows = els.map((el) => {
    const attached = [];
    items.forEach((item, i) => {
      if (!consumed.has(i) && item.inter.targetName != null && item.inter.targetName === el.name) {
        consumed.add(i);
        attached.push(item);
      }
    });
    const attachedHtml = attached.length > 0
      ? '<div class="action-list element-actions">' + attached.map((item) => renderActionRow(item, buildOnclick)).join('') + '</div>'
      : '';
    return renderElementNode(el, new Set([hostKey]), attachedHtml);
  }).join('');
  const flat = items.filter((item, i) => !consumed.has(i));
  let actionsHtml = '';
  if (items.length === 0) {
    actionsHtml = '<div class="no-actions">アクションなし</div>';
  } else if (flat.length > 0) {
    actionsHtml = '<div class="action-list action-flat">' + flat.map((item) => renderActionRow(item, buildOnclick)).join('') + '</div>';
  }
  return {
    elementsHtml: els.length > 0 ? '<div class="elements">' + elementRows + '</div>' : '',
    actionsHtml,
  };
}

// 1 枚のカード（タイトル・variant ラベル・elements・操作一覧・任意の付帯マークアップ）を描画する
// 共通関数。本体画面のカードと掲示中カードの両方がこれを使う（Task 4: 掲示中を本体と同形にする）。
function renderScreenCard(opts) {
  const variantLabel = opts.variant ? '<div class="variant-label">## ' + esc(opts.variant) + '</div>' : '';
  return '<div class="screen' + (opts.extraClass ? ' ' + opts.extraClass : '') + '">' +
    (opts.badgeHtml ?? '') +
    '<div class="screen-title">' + esc(opts.title) + '</div>' +
    variantLabel +
    (opts.elementsHtml ?? '') +
    opts.actionsHtml +
    (opts.trailingHtml ?? '') +
  '</div>';
}

// 掲示中 component 1 件分をカードとして描画する（本体と同形。Task 4）。操作は
// variant固有 / component common の 2 scope のみ（document common は出さない。ADR-0015）。
// cardIdx は表示順（[...overlays.keys()] の添字）——onclick は component 名でなくこの
// インデックスで掲示中先を参照する（handleOverlayInteraction のコメント参照）。
// 要素の階層展開・操作の対象紐付け・scope バッジは本体と同じ描画経路
// （renderElementsAndActions）を通す（Task 8「本体・掲示中共通」）。
function renderOverlayCard(name, cardIdx) {
  const entry = overlays.get(name);
  const comp = getComp(entry.module, name);
  const v = overlayVariant(name);
  const commonEls = comp?.commonElements ?? [];
  const varEls = v ? (comp?.variants[v]?.elements ?? []) : [];

  // idx は overlayScopedInteractions(name, scope) 内の位置（handleOverlayInteraction が
  // 同じフィルタ済みリストを引くため描画とハンドラでずれない）
  const all = overlayInteractions(name);
  const items = [
    ...all.filter((inter) => inter.scope === 'variant').map((inter, idx) => ({ inter, scope: 'variant', idx })),
    ...all.filter((inter) => inter.scope === 'component').map((inter, idx) => ({ inter, scope: 'component', idx })),
  ];
  const buildOnclick = (scope, idx, choiceIdx) =>
    "handleOverlayInteraction(" + cardIdx + ",'" + scope + "'," + idx + "," + choiceIdx + ")";
  const { elementsHtml, actionsHtml } = renderElementsAndActions(
    [...commonEls, ...varEls], items, buildOnclick, skey(entry.module, name),
  );

  return renderScreenCard({
    title: name,
    variant: v,
    elementsHtml,
    actionsHtml,
    badgeHtml: '<div class="overlay-badge">掲示中</div>',
    extraClass: 'overlay-card',
  });
}

// 遷移マップ（Task 5）: DATA.graph を GraphViz dot 風の簡易レイヤードで配置する純関数。
// rank 割当: entryModule/entryComponent を rank 0 とし、エッジに沿って BFS する
// （エッジは静的な push/present/goto/switch のみ。SimGraph の定義参照）。エッジで
// 到達しないノードは最終 rank の次に隔離してまとめる。rank 内順序は前 rank の
// 隣接ノードの平均位置（barycenter）で 1 パス整列する——前 rank に隣接がなければ
// 末尾へ、barycenter が同着なら nodes の定義順を保つ（安定ソート）。
// 戻り値は { module, name, rank, order }[]（座標変換は呼び出し側が rank/order から行う）。
function layoutGraph(nodes, edges, entryModule, entryComponent) {
  const keyOf = (n) => skey(n.module, n.name);
  const indexByKey = new Map(nodes.map((n, i) => [keyOf(n), i]));
  const adj = nodes.map(() => []);
  const predAdj = nodes.map(() => []);
  for (const e of edges) {
    const fromIdx = indexByKey.get(keyOf(e.from));
    const toIdx = indexByKey.get(keyOf(e.to));
    if (fromIdx == null || toIdx == null) continue;
    adj[fromIdx].push(toIdx);
    predAdj[toIdx].push(fromIdx);
  }

  const rank = new Array(nodes.length).fill(-1);
  const entryIdx = indexByKey.get(skey(entryModule, entryComponent));
  if (entryIdx != null) {
    rank[entryIdx] = 0;
    const queue = [entryIdx];
    while (queue.length > 0) {
      const cur = queue.shift();
      for (const next of adj[cur]) {
        if (rank[next] === -1) {
          rank[next] = rank[cur] + 1;
          queue.push(next);
        }
      }
    }
  }
  const reachedRanks = rank.filter((r) => r >= 0);
  const maxRank = reachedRanks.length > 0 ? Math.max(...reachedRanks) : -1;
  const unreachedRank = maxRank + 1;
  for (let i = 0; i < rank.length; i++) {
    if (rank[i] === -1) rank[i] = unreachedRank;
  }

  // rank ごとにノード index をグループ化し、rank 昇順に barycenter 整列する
  // （直前に処理した rank の順序だけを見る 1 パス。BFS の rank は連番のため
  // 「直前に処理した rank」は常に r-1 と一致する）。
  const byRank = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (!byRank.has(rank[i])) byRank.set(rank[i], []);
    byRank.get(rank[i]).push(i);
  }
  const rankKeys = [...byRank.keys()].sort((a, b) => a - b);
  const order = new Array(nodes.length).fill(0);
  let prevOrder = new Map();
  for (const r of rankKeys) {
    const idxs = byRank.get(r);
    if (prevOrder.size > 0) {
      const baryOf = new Map();
      for (const idx of idxs) {
        const preds = predAdj[idx].filter((p) => prevOrder.has(p));
        baryOf.set(
          idx,
          preds.length === 0 ? Infinity : preds.reduce((sum, p) => sum + prevOrder.get(p), 0) / preds.length,
        );
      }
      idxs.sort((a, b) => {
        const diff = baryOf.get(a) - baryOf.get(b);
        return diff !== 0 ? diff : a - b; // 同着は定義順（index）を保つ
      });
    } else {
      idxs.sort((a, b) => a - b); // 最初に処理する rank 群は定義順
    }
    idxs.forEach((idx, i) => { order[idx] = i; });
    prevOrder = new Map(idxs.map((idx, i) => [idx, i]));
  }

  return nodes.map((n, i) => ({ module: n.module, name: n.name, rank: rank[i], order: order[i] }));
}

// 遷移マップの hover プレビュー。render() を経由せず #graph-preview を直接書き換える
// 局所 DOM 更新にする——render() は innerHTML を丸ごと再構築する設計のため、hover 状態を
// JS グローバルに持って render() を呼ぶとちらつく。
function showNodePreview(idx) {
  const node = DATA.graph.nodes[idx];
  const el = document.getElementById('graph-preview');
  if (!node || !el) return;
  const comp = getComp(node.module, node.name);
  if (!comp) { el.innerHTML = ''; return; }
  const variantNames = Object.keys(comp.variants);
  const elementsHtml = comp.commonElements.length > 0
    ? '<div class="graph-preview-elements">elements: ' + comp.commonElements.map((e) => esc(e.name)).join(', ') + '</div>'
    : '';
  const variantsHtml = variantNames.length > 0
    ? '<div class="graph-preview-variants">variant: ' + variantNames.map((v) => esc(v)).join(', ') + '</div>'
    : '';
  el.innerHTML =
    '<div class="graph-preview-title">' + esc(node.name) + '</div>' +
    '<div class="graph-preview-module">module: ' + esc(node.module) + '</div>' +
    elementsHtml + variantsHtml;
}

function hideNodePreview() {
  const el = document.getElementById('graph-preview');
  if (el) el.innerHTML = '';
}

// 遷移マップの SVG（rect + component 名テキストのノード、直線 + 矢印のエッジ）。
// レイアウトは layoutGraph（純関数）の rank/order を LR（rank=横方向、rank内=縦等間隔）で
// 座標化する。閲覧専用（設計者確定事項 2026-07-19）——ノードクリック遷移(gotoNode)は
// 廃止済みで onclick は持たない。hover は component 名でなく DATA.graph.nodes の配列
// インデックスで参照する（onmouseenter への任意文字列埋め込みを避ける）。
// component 名は任意文字列のため SVG テキストへは esc() を通す。現在の画面.本体に
// 対応するノードは module・name の両方一致で判定し graph-node-current を付けて
// ハイライトする——render() が毎回 innerHTML を再構築するため遷移のたびに自然に追随する。
function renderGraphMap() {
  const nodes = DATA.graph.nodes;
  const edges = DATA.graph.edges;
  const layout = layoutGraph(nodes, edges, DATA.entryModule, DATA.entryComponent);
  const rankWidth = 160;
  const rowHeight = 44;
  const nodeWidth = 120;
  const nodeHeight = 28;
  const marginX = 16;
  const marginY = 16;
  const maxRank = layout.reduce((m, n) => Math.max(m, n.rank), 0);
  const maxOrder = layout.reduce((m, n) => Math.max(m, n.order), 0);
  const width = marginX * 2 + (maxRank + 1) * rankWidth;
  const height = marginY * 2 + (maxOrder + 1) * rowHeight;
  const posByKey = new Map(layout.map((n) => [skey(n.module, n.name), n]));

  const frame = currentFrame();
  const currentKey = skey(frame.module, frame.component);

  const nodesHtml = layout.map((n, idx) => {
    const x = marginX + n.rank * rankWidth;
    const y = marginY + n.order * rowHeight;
    const isCurrent = skey(n.module, n.name) === currentKey;
    const cls = 'graph-node' + (isCurrent ? ' graph-node-current' : '');
    return '<g class="' + cls + '" onmouseenter="showNodePreview(' + idx + ')" onmouseleave="hideNodePreview()">' +
      '<rect x="' + x + '" y="' + y + '" width="' + nodeWidth + '" height="' + nodeHeight + '" rx="4"></rect>' +
      '<text x="' + (x + nodeWidth / 2) + '" y="' + (y + nodeHeight / 2 + 4) + '" text-anchor="middle">' + esc(n.name) + '</text>' +
    '</g>';
  }).join('');

  const edgesHtml = edges.map((e) => {
    const from = posByKey.get(skey(e.from.module, e.from.name));
    const to = posByKey.get(skey(e.to.module, e.to.name));
    if (!from || !to) return '';
    const x1 = marginX + from.rank * rankWidth + nodeWidth;
    const y1 = marginY + from.order * rowHeight + nodeHeight / 2;
    const x2 = marginX + to.rank * rankWidth;
    const y2 = marginY + to.order * rowHeight + nodeHeight / 2;
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#graph-arrow)"></line>';
  }).join('');

  return '<svg class="graph-svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z"></path></marker></defs>' +
    edgesHtml + nodesHtml +
  '</svg>';
}

// 遷移マップの区画（中央下ペインの主役、独立スクロール領域。設計者フィードバック 2026-07-19 で
// <details> 折り畳みを廃止し常時表示にした——閲覧専用化でノードクリック探索という開閉維持の
// 理由が消えたため）。#graph-preview はマップ本体（SVG）より前に置く——sticky でペイン上部に
// 固定するには DOM 上もペイン先頭にあるのが自然で、マップが縦に伸びてスクロールしても
// hover プレビューが画面外へフレームアウトしない（Task 9 受入基準b）。
function renderGraphSection() {
  if (!DATA.graph || DATA.graph.nodes.length === 0) return '';
  return '<section class="graph-section">' +
    '<div class="pane-title" title="遷移マップ — 画面間の遷移関係（閲覧専用）。状態遷移図として読める">遷移マップ</div>' +
    '<div class="pane-desc">画面間の遷移関係（閲覧専用）。状態遷移図として読める。現在の画面.本体に対応するノードを強調表示し、hover でプレビューを表示します。</div>' +
    '<div id="graph-preview" class="graph-preview"></div>' + renderGraphMap() +
  '</section>';
}

// スタック表示 1 行分（frame 1 件）。component 名/姿は displayVariant(frame) を使う
// （singleton は共有レジストリの現在値。ADR-0011）。壁 frame には記号（▌）を、named
// session（switch/push/present の begin マーカー）には @sessionName を添える（Task 7）。
function renderStackItem(frame, isCurrent) {
  const v = displayVariant(frame);
  const loc = v ? frame.component + ' / ' + v : frame.component;
  const wallMark = frame.wall ? '<span class="stack-wall" title="壁（barrier）">▌</span>' : '';
  const sessionMark = frame.sessionName ? '<span class="stack-session">@' + esc(frame.sessionName) + '</span>' : '';
  const cls = 'stack-item' + (isCurrent ? ' stack-item-current' : '');
  return '<div class="' + cls + '">' + wallMark + esc(loc) + sessionMark + '</div>';
}

// フレームスタックの表示（上が現在地＝プッシュダウン構成として上から読む。遷移のたび追随。Task 7）
function renderStackList() {
  const rows = [];
  for (let i = stack.length - 1; i >= 0; i--) {
    rows.push(renderStackItem(stack[i], i === stack.length - 1));
  }
  return rows.join('');
}

function render() {
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);

  const stackHtml = renderStackList();

  // 統合ログ（末尾が常に現在地。タップで全状態巻き戻し。transition/event 両方クリック可）
  const timelineHtml = timeline.map((entry, i) => {
    const kindCls = 'timeline-item-' + entry.kind;
    const cls = i === timeline.length - 1 ? 'timeline-item ' + kindCls + ' current' : 'timeline-item ' + kindCls;
    return '<span class="' + cls + '" onclick="jumpToTimeline(' + i + ')">' + esc(entry.label) + '</span>';
  }).join(' › ');

  // elements（document common の要素行は全 component の表示に共通要素として乗る。SPEC「document common」）
  const frameVariant = displayVariant(frame);
  const docEls = DATA.modules[frame.module]?.docCommonElements ?? [];
  const commonEls = comp?.commonElements ?? [];
  const varEls = frameVariant ? (comp?.variants[frameVariant]?.elements ?? []) : [];

  // 操作一覧: scope はカテゴリ見出しでなく各行のバッジで示し、対象一致の操作は要素行の直下へ
  // 紐付ける（Task 8）。idx は scopedInteractions(scope) 内の位置——handleInteraction が同じ
  // フィルタ済みリストを引くため描画とハンドラでずれない。currentInteractions() は姿の merged
  // 実効 interactions（scope が 'variant' か 'component'）、docCommonInteractions() は生存
  // document common（shadow 済み・gate フィルタ済み）を返す。
  const allInter = currentInteractions();
  const items = [
    ...allInter.filter((inter) => inter.scope === 'variant').map((inter, idx) => ({ inter, scope: 'variant', idx })),
    ...allInter.filter((inter) => inter.scope === 'component').map((inter, idx) => ({ inter, scope: 'component', idx })),
    ...docCommonInteractions().map((inter, idx) => ({ inter, scope: 'document', idx })),
  ];
  const buildOnclick = (scope, idx, choiceIdx) => "handleInteraction('" + scope + "'," + idx + "," + choiceIdx + ")";
  const { elementsHtml: elements, actionsHtml } = renderElementsAndActions(
    [...docEls, ...commonEls, ...varEls], items, buildOnclick, skey(frame.module, frame.component),
  );

  // 掲示中カード（本体と同形。表示順 = [...overlays.keys()] の添字が handleOverlayInteraction の
  // cardIdx と一致する。document common カテゴリは持たない——ADR-0015・renderOverlayCard 参照）
  const overlayCardsHtml = [...overlays.keys()].map((n, cardIdx) => renderOverlayCard(n, cardIdx)).join('');

  // back button（「戻れない」= stack 長 1 または現 frame.wall。disabled でなく DOM から消す）
  const canBack = stack.length > 1 && !currentFrame().wall;
  const backBtn = canBack ? '<button class="back-btn" onclick="goBack()">← 戻る</button>' : '';

  // インスタンス variant 手動トグルパネル（画面外 component の姿切替。presence gate の
  // 効きを手動で試験するための開発者向け UI——姿を持たない対象は切替不要なので除外）。
  // 見出しは用途が伝わる表記（設計者確定事項 2026-07-19。旧「インスタンス variant（gate 観測用）」
  // は何をするパネルか伝わらないという指摘）。機能（トグル開閉・variant 切替）は現状維持。
  const gateTargetsWithVariants = GATE_TARGETS.filter((t) => {
    const comp = getComp(t.module, t.name);
    return comp && Object.keys(comp.variants).length > 0;
  });
  let gatePanelHtml = '';
  if (gateTargetsWithVariants.length > 0) {
    const rows = gateTargetsWithVariants.map((t) => {
      const comp = getComp(t.module, t.name);
      const k = skey(t.module, t.name);
      const current = sharedVariants.has(k) ? sharedVariants.get(k) : comp.initialVariant;
      const options = Object.keys(comp.variants).map((v) =>
        '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'
      ).join('');
      return '<div class="gate-row"><span class="gate-row-label">' + esc(t.name) + '</span>' +
        '<select onchange="setInstanceVariant(' + esc(JSON.stringify(t.module)) + ', ' + esc(JSON.stringify(t.name)) + ', this.value)">' + options + '</select></div>';
    }).join('');
    gatePanelHtml = '<div class="gate-panel">' +
      '<button class="gate-panel-toggle" onclick="toggleGatePanel()">' +
        (gatePanelOpen ? '▾' : '▸') + ' 画面外 component の姿切替（gate 試験用）' +
      '</button>' +
      '<p class="gate-panel-desc">今の画面に出ていない component の variant を手動で切り替え、presence gate（?）の効きをその場で試せます。</p>' +
      (gatePanelOpen ? '<div class="gate-panel-body">' + rows + '</div>' : '') +
    '</div>';
  }

  const mainCardHtml = renderScreenCard({
    title: frame.component,
    variant: frameVariant,
    elementsHtml: elements,
    actionsHtml,
    trailingHtml: backBtn,
  });

  const graphSectionHtml = renderGraphSection();

  // 全幅 3 カラムグリッド（設計者フィードバック 2026-07-19）: 左 = スタック + 統合ログ /
  // 中央 = 現在の画面（上）+ 遷移マップ（下） / 右 = gate パネルのみ（Task 10 でイベントログ
  // ペインを統合ログへ吸収）。各ペインに見出し・役割説明を添え、エリアの意味が一目で伝わる
  // ようにする。説明文にはオートマトンとしての読み方を一言添える（用語は現状のまま。ADR-0022）。
  app.innerHTML =
    '<aside class="pane pane-trace">' +
      '<div class="pane-title" title="スタック — 今積み重なっている画面。プッシュダウン構成として読める">スタック</div>' +
      '<div class="pane-desc">今積み重なっている画面。プッシュダウン構成として読める。上が現在地</div>' +
      '<div class="stack-list">' + stackHtml + '</div>' +
      '<div class="pane-title" title="統合ログ — 実行された遷移の列（効果・状態変更も出力として並ぶ）。クリックでその時点へ巻き戻し">統合ログ</div>' +
      '<div class="pane-desc">ナビゲーション履歴。実行された遷移の列（効果・状態変更も出力として並ぶ）。クリックでその時点へ巻き戻し</div>' +
      '<div class="timeline-log">' + timelineHtml + '</div>' +
    '</aside>' +
    '<main class="pane pane-center">' +
      '<section class="screen-section">' +
        '<div class="pane-title">現在の画面</div>' +
        '<div class="pane-desc">アクティブな frame の表示（本体）と掲示中カード</div>' +
        mainCardHtml +
        overlayCardsHtml +
      '</section>' +
      graphSectionHtml +
    '</main>' +
    '<aside class="pane pane-events">' +
      gatePanelHtml +
    '</aside>';
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

render();
</script>
</body>
</html>`;
}
