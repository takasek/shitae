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
#app { max-width: 480px; margin: 0 auto; padding: 16px; }
.trace-log { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; color: #666; }
.trace-item { background: #e0e0e0; padding: 2px 8px; border-radius: 10px; cursor: pointer; }
.trace-item.current { background: #111; color: #fff; }
.trace-item:hover { background: #ccc; }
.event-log { margin-top: 12px; font-size: 12px; color: #666; }
.event-log-label { font-size: 11px; color: #999; margin-bottom: 4px; }
.event-log-item { padding: 3px 0; border-bottom: 1px dashed #eee; }
.screen { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.screen-title { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
.variant-label { font-size: 12px; color: #888; margin-bottom: 12px; }
.elements { margin-bottom: 16px; }
.element { padding: 6px 0; border-bottom: 1px solid #f0f0f0; color: #333; }
.element:last-child { border-bottom: none; }
.element.collection::before { content: "×N  "; color: #999; font-size: 11px; }
.actions { display: flex; flex-direction: column; gap: 8px; }
.action-btn { background: #f0f0f0; border: none; border-radius: 6px; padding: 10px 14px; text-align: left; cursor: pointer; font-size: 13px; }
.action-btn:hover { background: #e0e0e0; }
.choice-panel { margin-top: 8px; padding: 10px; background: #fff9e6; border-radius: 6px; border: 1px solid #f0c040; }
.choice-label { font-size: 12px; color: #888; margin-bottom: 6px; }
.choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice-btn { background: #fff; border: 1px solid #ccc; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.choice-btn:hover { background: #f5f5f5; }
.back-btn { margin-top: 12px; background: none; border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 12px; color: #555; }
.back-btn:hover { background: #f0f0f0; }
.no-actions { color: #bbb; font-size: 13px; font-style: italic; }
.doc-common { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd; }
.doc-common-label { font-size: 11px; color: #999; margin-bottom: 6px; }
.dc-btn { background: #eef; }
.dc-btn:hover { background: #dde; }
.overlay-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #222; color: #fff; padding: 8px 16px; display: flex; gap: 12px; font-size: 12px; }
.overlay-item { background: #444; padding: 2px 10px; border-radius: 10px; }
.overlay-btn { margin-left: 6px; background: #666; color: #fff; border: none; border-radius: 8px; padding: 1px 8px; cursor: pointer; font-size: 11px; }
.gate-panel { margin-top: 12px; font-size: 12px; }
.gate-panel-toggle { background: none; border: 1px solid #ddd; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #777; font-size: 11px; }
.gate-panel-body { margin-top: 6px; padding: 8px 10px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; display: flex; flex-direction: column; gap: 6px; }
.gate-row { display: flex; align-items: center; gap: 8px; }
.gate-row-label { color: #555; min-width: 80px; }
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

let pendingChoice = null; // { actionText, choices }
let overlays = new Map(); // 掲示中 component名 → 表示 variant（null=initial の含意。SPEC「オーバーレイ」。フレーム木とは別軸）

// トレースログ: 遷移イベントの配列 { label, snapshot }。末尾が常に現在地（スタック表示兼用）。
// snapshot はイベント適用後の全状態 { stack, sharedVariants, overlays } の deep copy（Map は entries 配列化）。
// 起動イベントを先頭に置く（設計判断: Task 2 brief）。
let traceLog = [{ label: '起動', snapshot: snapshotState() }];
// イベントログ: 遷移でないもの（effect / set / show / hide）と警告を流し込む append-only リスト。巻き戻し無し。
let eventLog = [];

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

// snapshot から全状態を復元する（トレースログのイベントタップ用。壁は無視——開発者向けタイムトラベル）
function restoreState(snapshot) {
  stack = JSON.parse(JSON.stringify(snapshot.stack));
  sharedVariants = new Map(JSON.parse(JSON.stringify(snapshot.sharedVariants)));
  overlays = new Map(JSON.parse(JSON.stringify(snapshot.overlays)));
}

// 遷移イベントの label（適用後の現在地が分かる形。末尾が常に現在地＝スタック表示兼用）
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
      return [...commonEls, ...varEls].includes(gate.name);
    }
    const frame = currentFrame();
    const comp = getComp(frame.module, frame.component);
    if (!comp) return true;
    const variant = displayVariant(frame);
    const commonEls = comp.commonElements ?? [];
    const varEls = variant ? (comp.variants[variant]?.elements ?? []) : [];
    const docEls = DATA.modules[frame.module]?.docCommonElements ?? [];
    return [...docEls, ...commonEls, ...varEls].includes(gate.name);
  }
  // member
  const mod = gate.module ?? currentFrame().module;
  const targetComp = getComp(mod, gate.targetComponent);
  if (!targetComp) return true; // 対象が判定不能（未定義 component 等）→ always-on
  const k = skey(mod, gate.targetComponent);
  const variant = sharedVariants.has(k) ? sharedVariants.get(k) : targetComp.initialVariant;
  const commonEls = targetComp.commonElements ?? [];
  const varEls = variant ? (targetComp.variants[variant]?.elements ?? []) : [];
  return [...commonEls, ...varEls].includes(gate.name);
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
    // 効果は遷移でない → イベントログへ（旧トースト表示分。toast の DOM/CSS は全廃）
    eventLog.push('effect: ' + result.text);
    return;
  }

  if (result.type === 'overlay') {
    // 掲示中集合を更新（show は表示 variant・module 込みで追加/上書き / hide 除去。hide 空打ち no-op）。フレーム木は動かさない。
    // module 省略時はアクティブフレームの module で解決（push/goto の相対解決と同じ規約）。
    // show/hide は遷移ではない → イベントログへ 1 行。
    if (result.op === 'show') {
      const mod = result.module ?? frame.module;
      // 明示 show(X##v) は singleton の共有レジストリも書き換える（全所在に即時反映。ADR-0011）
      if (result.variant != null && isSingleton(mod, result.component)) {
        sharedVariants.set(skey(mod, result.component), result.variant);
      }
      overlays.set(result.component, { variant: result.variant, module: mod });
      eventLog.push('show(' + result.component + (result.variant != null ? '##' + result.variant : '') + ')');
    } else {
      overlays.delete(result.component);
      eventLog.push('hide(' + result.component + ')');
    }
    return;
  }

  if (result.type === 'state') {
    // set（ADR-0014）: 遷移も掲示もせず singleton の共有 variant だけを書き換える。
    // 非 singleton は no-op（E030 は checker が静的に検出する）。set も遷移ではない → イベントログへ。
    const mod = result.module ?? frame.module;
    if (isSingleton(mod, result.component)) {
      sharedVariants.set(skey(mod, result.component), result.variant);
      eventLog.push('set(' + result.component + '##' + result.variant + ')');
    } else {
      eventLog.push('set(' + result.component + '##' + result.variant + ') は singleton でないため無効');
    }
    return;
  }

  const word = result.word;
  const target = resolveTarget(result, mod, comp);

  // back() は shitae back() 準拠: 成功時は「前に進んだ記録を取り消す」= トレースログ末尾を
  // 1 件取り除く（新規イベントは積まない。設計者確定事項）。失敗（wall・戻り先なし）は
  // no-op のため trace は変えず、警告をイベントログへ流す。
  if (word === 'back') {
    if (stack.length <= 1) return;
    if (!target) {
      const top = stack[stack.length - 1];
      if (top.wall) { eventLog.push('back() が壁に阻まれました'); return; }
      stack = stack.slice(0, -1);
      traceLog.pop();
    } else {
      // back(X): アクティブパスを遡るが barrier（wall）は越えない（runtime に整合）。
      let found = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].component === target.component) { found = i; break; }
        if (stack[i].wall) break; // 壁に阻まれ、これ以上遡れない
      }
      if (found < 0) {
        eventLog.push('back(' + target.component + ') の戻り先が見つかりません');
      } else if (found < stack.length - 1) {
        stack = stack.slice(0, found + 1);
        traceLog.pop();
      }
      // found === stack.length - 1 は既に対象がアクティブ（no-op）
    }
    return;
  }

  // 遷移（push/present/switch/goto/exit/dismiss）: 実際に stack が変わったものだけ
  // トレースログへ追加する（イベント適用後の全状態 snapshot を添える）。
  const beforeStack = JSON.stringify(stack);

  if (word === 'push' || word === 'present') {
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
      eventLog.push((word === 'exit' ? 'exit' : 'dismiss') + '(' + (sessionName ?? '') + ') の対象セッションが見つかりません');
    }
  }

  if (JSON.stringify(stack) !== beforeStack) {
    traceLog.push({ label: transitionLabel(word), snapshot: snapshotState() });
  }
}

// 選択肢 1 つ分の result 群を順に全部起こす
function runResults(bodies) {
  for (const body of bodies) applyTransition(body);
  pendingChoice = null;
  render();
}

function handleInteraction(idx) {
  const interaction = currentInteractions()[idx];
  if (!interaction) return;
  // prelude（最初のラベルより前の result 群）は常に成立
  for (const body of interaction.prelude) applyTransition(body);
  if (interaction.choices.length === 0) {
    pendingChoice = null;
    render();
  } else if (interaction.choices.length === 1) {
    runResults(interaction.choices[0].results);
  } else {
    pendingChoice = { actionText: interaction.actionText, choices: interaction.choices };
    render();
  }
}

// 掲示中 component の interaction 発火。遷移の相対解決は常にアクティブフレーム基準
// （applyTransition が currentFrame() を見るため、overlay 自身を「現在地」にはしない。SPEC 341）
function handleOverlayInteraction(name, idx) {
  const interaction = overlayInteractions(name)[idx];
  if (!interaction) return;
  for (const body of interaction.prelude) applyTransition(body);
  if (interaction.choices.length === 0) {
    pendingChoice = null;
    render();
  } else if (interaction.choices.length === 1) {
    runResults(interaction.choices[0].results);
  } else {
    pendingChoice = { actionText: interaction.actionText, choices: interaction.choices };
    render();
  }
}

function handleChoice(idx) {
  if (!pendingChoice) return;
  const choice = pendingChoice.choices[idx];
  pendingChoice = null;
  runResults(choice.results);
}

function goBack() {
  runResults([{ type: 'transition', word: 'back', target: null, session: null }]);
}

// トレースログのイベントタップ: 全状態巻き戻し（stack・sharedVariants・overlays を snapshot
// から復元し、trace をそのイベントまで truncate）。壁は無視する（開発者向けタイムトラベル。設計者確定事項）。
function jumpToTrace(idx) {
  const entry = traceLog[idx];
  if (!entry) return;
  restoreState(entry.snapshot);
  traceLog = traceLog.slice(0, idx + 1);
  pendingChoice = null;
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

function handleDocCommon(idx) {
  const interaction = docCommonInteractions()[idx];
  if (!interaction) return;
  for (const body of interaction.prelude) applyTransition(body);
  if (interaction.choices.length === 0) {
    pendingChoice = null;
    render();
  } else if (interaction.choices.length === 1) {
    runResults(interaction.choices[0].results);
  } else {
    pendingChoice = { actionText: interaction.actionText, choices: interaction.choices };
    render();
  }
}

function render() {
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);

  // トレースログ（末尾が常に現在地＝スタック表示兼用。タップで全状態巻き戻し）
  const traceLogHtml = traceLog.map((entry, i) => {
    const cls = i === traceLog.length - 1 ? 'trace-item current' : 'trace-item';
    return '<span class="' + cls + '" onclick="jumpToTrace(' + i + ')">' + esc(entry.label) + '</span>';
  }).join(' › ');

  // elements（document common の要素行は全 component の表示に共通要素として乗る。SPEC「document common」）
  const frameVariant = displayVariant(frame);
  let elements = '';
  const docEls = DATA.modules[frame.module]?.docCommonElements ?? [];
  const commonEls = comp?.commonElements ?? [];
  const varEls = frameVariant ? (comp?.variants[frameVariant]?.elements ?? []) : [];
  const allEls = [...docEls, ...commonEls, ...varEls];
  if (allEls.length > 0) {
    elements = '<div class="elements">' +
      allEls.map(e => '<div class="element">' + esc(e) + '</div>').join('') +
      '</div>';
  }

  // interactions
  const allInter = currentInteractions();

  let actionsHtml = '';
  if (allInter.length === 0) {
    actionsHtml = '<div class="no-actions">アクションなし</div>';
  } else {
    actionsHtml = '<div class="actions">';
    allInter.forEach((inter, idx) => {
      actionsHtml += '<button class="action-btn" onclick="handleInteraction(' + idx + ')">' + esc(inter.actionText) + '</button>';
    });
    actionsHtml += '</div>';
    if (pendingChoice) {
      const choices = pendingChoice.choices.map((c, idx) =>
        '<button class="choice-btn" onclick="handleChoice(' + idx + ')">' +
        esc('[' + c.label + ']') + '</button>'
      ).join('');
      actionsHtml += '<div class="choice-panel"><div class="choice-label">' + esc(pendingChoice.actionText) + ' の結果を選択:</div><div class="choices">' + choices + '</div></div>';
    }
  }

  // document common アクション（どの画面でも常に有効。画面固有アクションとは別枠）
  let docCommonHtml = '';
  const dc = docCommonInteractions();
  if (dc.length > 0) {
    docCommonHtml = '<div class="doc-common"><div class="doc-common-label">どの画面でも</div>' +
      dc.map((inter, idx) =>
        '<button class="action-btn dc-btn" onclick="handleDocCommon(' + idx + ')">' + esc(inter.actionText) + '</button>'
      ).join('') + '</div>';
  }

  // オーバーレイ帯（掲示中 component。画面下部に常駐。表示 variant と操作ボタンを添える）
  let overlayHtml = '';
  if (overlays.size > 0) {
    overlayHtml = '<div class="overlay-bar">' +
      [...overlays.keys()].map(n => {
        const v = overlayVariant(n);
        const label = v ? n + ' ## ' + v : n;
        const buttons = overlayInteractions(n).map((inter, idx) =>
          '<button class="overlay-btn" onclick="handleOverlayInteraction(' + JSON.stringify(n) + ',' + idx + ')">' +
          esc(inter.actionText) + '</button>'
        ).join('');
        return '<span class="overlay-item">▸ ' + esc(label) + buttons + '</span>';
      }).join('') +
      '</div>';
  }

  // back button（「戻れない」= stack 長 1 または現 frame.wall。disabled でなく DOM から消す）
  const canBack = stack.length > 1 && !currentFrame().wall;
  const backBtn = canBack ? '<button class="back-btn" onclick="goBack()">← 戻る</button>' : '';

  // イベントログ（append-only。effect・set・show/hide・警告を流し込む。巻き戻し無し）
  let eventLogHtml = '';
  if (eventLog.length > 0) {
    eventLogHtml = '<div class="event-log"><div class="event-log-label">イベントログ</div>' +
      eventLog.map((e) => '<div class="event-log-item">' + esc(e) + '</div>').join('') +
      '</div>';
  }

  const variantLabel = frameVariant ? '<div class="variant-label">## ' + esc(frameVariant) + '</div>' : '';

  // インスタンス variant 手動トグルパネル（gate 観測用。姿を持たない対象は切替不要なので除外）
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
        (gatePanelOpen ? '▾' : '▸') + ' インスタンス variant（gate 観測用）' +
      '</button>' +
      (gatePanelOpen ? '<div class="gate-panel-body">' + rows + '</div>' : '') +
    '</div>';
  }

  app.innerHTML =
    '<div class="trace-log">' + traceLogHtml + '</div>' +
    '<div class="screen">' +
      '<div class="screen-title">' + esc(frame.component) + '</div>' +
      variantLabel +
      elements +
      actionsHtml +
      docCommonHtml +
      backBtn +
    '</div>' +
    gatePanelHtml +
    eventLogHtml +
    overlayHtml;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

render();
</script>
</body>
</html>`;
}
