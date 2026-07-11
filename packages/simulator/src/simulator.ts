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
.stack-bar { display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; color: #666; }
.stack-item { background: #e0e0e0; padding: 2px 8px; border-radius: 10px; }
.stack-item.current { background: #111; color: #fff; }
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
.back-btn:disabled { opacity: 0.4; cursor: default; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #333; color: #fff; padding: 10px 20px; border-radius: 20px; font-size: 13px; opacity: 0; transition: opacity .2s; pointer-events: none; }
.toast.show { opacity: 1; }
.no-actions { color: #bbb; font-size: 13px; font-style: italic; }
.doc-common { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ddd; }
.doc-common-label { font-size: 11px; color: #999; margin-bottom: 6px; }
.dc-btn { background: #eef; }
.dc-btn:hover { background: #dde; }
.overlay-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #222; color: #fff; padding: 8px 16px; display: flex; gap: 12px; font-size: 12px; }
.overlay-item { background: #444; padding: 2px 10px; border-radius: 10px; }
</style>
</head>
<body>
<div id="app"></div>
<div class="toast" id="toast"></div>
<script>
const DATA = ${json};
const app = document.getElementById('app');
const toastEl = document.getElementById('toast');

// 姿指定なしで component に入ったら、最初に定義された姿を初期姿として扱う
function initialVariant(module, component) {
  const comp = DATA.modules[module]?.components[component];
  return comp?.initialVariant ?? null;
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
let toastTimer = null;
let overlays = new Set(); // 掲示中 component 名（SPEC「オーバーレイ」。フレーム木とは別軸）

function getComp(module, name) {
  return DATA.modules[module]?.components[name];
}

function currentFrame() {
  return stack[stack.length - 1];
}

function currentInteractions() {
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);
  if (!comp) return [];
  // 姿の interactions は抽出時に mergeInteractions(共通, 姿固有) 済み（shadow 合成）
  if (frame.variant) return comp.variants[frame.variant]?.interactions ?? [];
  return comp.commonInteractions;
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
    showToast(result.text);
    return;
  }

  if (result.type === 'overlay') {
    // 掲示中集合を更新（show 追加 / hide 除去 / hide 空打ち no-op）。フレーム木は動かさない。
    if (result.op === 'show') overlays.add(result.component);
    else overlays.delete(result.component);
    return;
  }

  const word = result.word;
  const target = resolveTarget(result, mod, comp);

  if (word === 'push' || word === 'present') {
    if (!target) return;
    const variant = target.variant ?? initialVariant(target.module, target.component);
    stack = [...stack, { module: target.module, component: target.component, variant, wall: word === 'present', sessionName: result.session ?? null }];
  } else if (word === 'switch') {
    // 近似: 線形 stack 上で resume-or-create。stack 内に同名 sessionName が生存
    // していればそこまで戻る（resume 近似）、無ければ新規に積む（create、wall=true）。
    // 正確な兄弟規則・中断フレームの保持は @shitae/runtime（frame 木）の領分。
    if (!target || !result.session) return;
    const idx = stack.findLastIndex(f => f.sessionName === result.session);
    if (idx >= 0) {
      stack = stack.slice(0, idx + 1);
    } else {
      const variant = target.variant ?? initialVariant(target.module, target.component);
      stack = [...stack, { module: target.module, component: target.component, variant, wall: true, sessionName: result.session }];
    }
  } else if (word === 'goto') {
    if (!target) return;
    // 同一 component 内の姿替え（goto(##姿)）以外は初期姿の解決を行う。
    // begin マーカー（sessionName）と wall は保存する（ADR-0006 B2）。
    const variant = target.variant ?? initialVariant(target.module, target.component);
    const newFrame = { ...frame, component: target.component, variant, module: target.module };
    stack = [...stack.slice(0, -1), newFrame];
  } else if (word === 'back') {
    if (stack.length <= 1) return;
    if (!target) {
      const top = stack[stack.length - 1];
      if (top.wall) { showToast('back() が壁に阻まれました'); return; }
      stack = stack.slice(0, -1);
    } else {
      // back(X): アクティブパスを遡るが barrier（wall）は越えない（runtime に整合）。
      let found = -1;
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].component === target.component) { found = i; break; }
        if (stack[i].wall) break; // 壁に阻まれ、これ以上遡れない
      }
      if (found >= 0) stack = stack.slice(0, found + 1);
      else showToast('back(' + target.component + ') の戻り先が見つかりません');
    }
  } else if (word === 'exit' || word === 'dismiss') {
    const sessionName = result.session ?? null;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].sessionName === sessionName) {
        stack = stack.slice(0, i);
        if (stack.length === 0) {
          stack = [{ module: DATA.entryModule, component: DATA.entryComponent, variant: initialVariant(DATA.entryModule, DATA.entryComponent), wall: false, sessionName: null }];
        }
        break;
      }
    }
  }
}

// 選択肢 1 つ分の result 群を順に全部起こす
function runResults(bodies) {
  for (const body of bodies) applyTransition(body);
  pendingChoice = null;
  render();
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2500);
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

function handleChoice(idx) {
  if (!pendingChoice) return;
  const choice = pendingChoice.choices[idx];
  pendingChoice = null;
  runResults(choice.results);
}

function goBack() {
  runResults([{ type: 'transition', word: 'back', target: null, session: null }]);
}

// document common（最初の # より前）のインタラクション。どの画面でも常に有効。
function docCommonInteractions() {
  return DATA.documentCommon ?? [];
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

  // breadcrumb
  const breadcrumb = stack.map((f, i) => {
    const label = f.variant ? f.component + ' / ' + f.variant : f.component;
    const cls = i === stack.length - 1 ? 'stack-item current' : 'stack-item';
    return '<span class="' + cls + '">' + esc(label) + '</span>';
  }).join(' › ');

  // elements
  let elements = '';
  const commonEls = comp?.commonElements ?? [];
  const varEls = frame.variant ? (comp?.variants[frame.variant]?.elements ?? []) : [];
  const allEls = [...commonEls, ...varEls];
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

  // オーバーレイ帯（掲示中 component。画面下部に常駐）
  let overlayHtml = '';
  if (overlays.size > 0) {
    overlayHtml = '<div class="overlay-bar">' +
      [...overlays].map(n => '<span class="overlay-item">▸ ' + esc(n) + '</span>').join('') +
      '</div>';
  }

  // back button
  const canBack = stack.length > 1 && !currentFrame().wall;
  const backBtn = '<button class="back-btn" onclick="goBack()" ' + (canBack ? '' : 'disabled') + '>← 戻る</button>';

  const variantLabel = frame.variant ? '<div class="variant-label">## ' + esc(frame.variant) + '</div>' : '';

  app.innerHTML =
    '<div class="stack-bar">' + breadcrumb + '</div>' +
    '<div class="screen">' +
      '<div class="screen-title">' + esc(frame.component) + '</div>' +
      variantLabel +
      elements +
      actionsHtml +
      docCommonHtml +
      backBtn +
    '</div>' +
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
