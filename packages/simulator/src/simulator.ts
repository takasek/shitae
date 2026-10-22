import { readFileSync } from 'node:fs';
import { createMetadata } from '@shitae/session/model';
import type { ModelMetadata } from '@shitae/session';
import type { Document } from '@shitae/ast';
import { extractSimData } from './extract.js';
import type { SimulatorData, SimulatorConfig } from './extract.js';

export function toSimulator(
  documents: Map<string, Document>,
  entryModule: string,
  config?: SimulatorConfig,
  model?: { files: Map<string, string>; metadata: ModelMetadata },
): string {
  const data = extractSimData(documents, entryModule, config);
  return buildHtml(data, documents, entryModule, model);
}

/** Display copy of a real file path: the module ID plus the `.shitae` suffix when the real file has one, so shared HTML never carries the author's directory. */
function displayFile(module: string, file: string): string {
  return file.endsWith('.shitae') ? module + '.shitae' : module;
}

function embeddedModel(documents: Map<string, Document>, entryModule: string, model?: { files: Map<string, string>; metadata: ModelMetadata }) {
  if (!model) return { documents: [...documents], entryModule, files: [], metadata: createMetadata(documents, entryModule) };
  return {
    documents: [...documents], entryModule,
    files: [...model.files].map(([module, file]) => [module, displayFile(module, file)]),
    metadata: { ...model.metadata, manifest: model.metadata.manifest.map((m) => ({ ...m, file: m.file === null ? null : displayFile(m.module, m.file) })) },
  };
}

function buildHtml(data: SimulatorData, documents: Map<string, Document>, entryModule: string, model?: { files: Map<string, string>; metadata: ModelMetadata }): string {
  const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
  const json = safeJson(data);
  const modelJson = safeJson(embeddedModel(documents, entryModule, model));
  const bundle = readFileSync(new URL('../dist/session-browser.js', import.meta.url), 'utf8');
  const sessionScript = readFileSync(new URL('./gui-session.js', import.meta.url), 'utf8');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>shitae simulator</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: system-ui, sans-serif; font-size: 14px; background: #f5f5f5; color: #111; }
/* 2 カラム全幅グリッド（開発ツールのためレスポンシブ不要。UX round2・設計者フィードバック
   2026-07-20 に加え、右カラム（gate パネル専用、常に対象なしの文書では空白のまま横幅を
   占有し続けていた——UX round2 2-4(d)）を廃止しドロワー化。空いた分は中央（1fr）へ還元する
   （Task 18 項目5）。左 = 統合ログ専用 / 中央 = 現在の画面 → スタック → 遷移マップの縦3領域
   （ミクロ→マクロ。スタック・マップは折畳み可）。gate パネルはトグルボタンで開く
   オーバーレイドロワー（.gate-drawer、position: fixed）へ移した——グリッドのカラムには
   含まれない（レイアウトの外に浮く）。 */
#app { display: grid; grid-template-columns: 320px minmax(0,1fr); grid-template-rows: auto minmax(0,1fr); height: 100vh; }
.live-position { grid-column: 1 / -1; padding: 12px 16px; background: #fff; border-bottom: 2px solid #345; }
.history-point { padding: 8px; border-left: 3px solid #ccc; margin: 6px 0; }
.history-point.selected { border-color: #285bd4; background: #eef3ff; }
.history-preview h2 { font-size: 18px; }
.history-preview p, .history-preview li { margin: 8px 0; }
.history-preview ul { padding-left: 20px; }
button:focus-visible { outline: 3px solid #285bd4; }

.pane { padding: 16px; overflow-y: auto; }
.pane-trace { background: #fff; border-right: 1px solid #e0e0e0; }
/* 中央ペインは自身を単一スクロール領域にしない（.pane の overflow-y: auto を上書き）——
   現在の画面（可変・独立スクロール）と、スタック+マップ（まとめて1スクロール領域）の
   grid rows 2 領域に分割する（Task 9 の後継・Task 14）。上下 1fr/1fr の均等割りは
   固定高500px相当となり、薄い画面で死んだ空白・濃い画面で掲示中カードの見切れを生んだ
   （UX round4 §3-1）。下段（スタック・マップ）を content 分の高さ（auto、マップ自身の
   max-height cap は維持）に縮め、上段（現在の画面）が残り高さを占める可変領域（1fr）に
   することで両方を解消する（設計者確定 2026-07-21）。版・保存情報と診断を追加した後も
   上段で操作を続けられるよう、下段全体は最大40vhとして独立スクロールを維持する。 */
.pane-center { background: #f5f5f5; padding: 0; overflow: hidden; display: grid; grid-template-rows: minmax(0, 1fr) auto; }
.pane-title { font-size: 13px; font-weight: 700; color: #333; margin-bottom: 2px; }
summary.pane-title { cursor: pointer; }
.pane-desc { font-size: 11px; color: #888; margin-bottom: 10px; }
/* min-height: 0 は grid item の暗黙の最小高さ（auto）を打ち消し overflow-y: auto を効かせるために必須 */
.screen-section { display: flex; flex-direction: column; overflow-y: auto; min-height: 0; padding: 16px 16px 8px; }
/* スタック（.stack-section）と遷移マップ（.graph-section）を1つのスクロール領域にまとめる
   （Task 14）——どちらも折畳み可能な <details> なので、開閉状態によらず縦積みで自然にスクロールする。 */
.lower-section { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; max-height: 40vh; padding: 8px 16px 16px; }
.stack-section { border-top: 1px solid #e0e0e0; padding-top: 8px; }
.graph-section { border-top: 1px solid #e0e0e0; padding-top: 8px; }
.stack-list { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #333; margin-top: 6px; }
.stack-item { padding: 3px 8px; border-radius: 4px; background: #f5f5f5; }
.stack-item-current { background: #111; color: #fff; }
.stack-wall { color: #c0392b; margin-right: 2px; }
.stack-session { color: #2563eb; font-size: 11px; margin-left: 4px; }
.timeline-log { display: flex; flex-wrap: wrap; gap: 4px 6px; font-size: 12px; color: #666; }
.timeline-item { background: #e0e0e0; padding: 2px 8px; border-radius: 10px; cursor: pointer; }
.timeline-item-event { background: #eef0ff; color: #4b4f8f; }
.timeline-item-screen { font-size: 10px; opacity: .65; margin-right: 2px; }
.timeline-item.current { background: #111; color: #fff; }
.timeline-item.ghost { opacity: .4; }
.timeline-item:hover { background: #ccc; }
.provenance-step { border-bottom: 1px solid #ddd; padding: 10px 0; }
.provenance-heading { display: block; width: 100%; text-align: left; font-size: 13px; font-weight: 600; padding: 7px; }
.provenance-marker { border-left: 3px solid #777; padding-left: 7px; font-size: 12px; }
.provenance-step .timeline-item { display: block; text-align: left; margin: 5px 0; border: 0; border-radius: 4px; }
.review-text { width: 100%; box-sizing: border-box; font: inherit; font-size: 12px; }
.scenario-controls { margin: 8px 0 12px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 12px; }
.artifact-identity { font-weight: 600; overflow-wrap: anywhere; }
.scenario-scope { margin: 8px 0; line-height: 1.6; }
.identity-details { margin: 6px 0; }
.identity-details summary { cursor: pointer; }
.identity-details pre { white-space: pre-wrap; overflow-wrap: anywhere; margin: 6px 0; }
[role="alert"] { white-space: pre-wrap; overflow-wrap: anywhere; color: #a02020; margin-bottom: 10px; }
.timeline-toggle { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 11px; color: #666; }
.action-toggle { display: flex; align-items: center; gap: 4px; margin-bottom: 8px; font-size: 11px; color: #666; }
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
/* アクション行は「押せるもの」と分かる見た目にし、要素行（.element、静的表示）と視覚的に
   区別する（UX round2・Task 15）。枠・背景・角丸でボタン風の境界を持たせる。 */
.action-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding: 8px 10px; margin: 4px 0; background: #eef4ff; border: 1px solid #c7d7f5; border-radius: 8px; }
.action-row-conditional { background: #fff; border-color: #ddd; }
.action-row-conditional .action-text { font-weight: 600; }
/* ラベル無し操作（choices 空）はチップを出さず行全体をボタンにする——「[TRUE] は押せる
   ボタンなのか内部フラグ表示なのか分からない」という指摘（UX round2）を、行自体に
   cursor: pointer を与え押せることを明示することで解消する（Task 15）。 */
.action-row-solo { cursor: pointer; }
.action-row-solo:hover { background: #d6e4ff; }
.action-text { font-size: 13px; color: #333; }
.action-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.choice-chip { background: #fff; border: 1px solid #a9c2f0; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
.choice-chip:hover { background: #eaf1ff; }
.back-btn { margin-top: 12px; background: none; border: 1px solid #ccc; border-radius: 6px; padding: 8px 14px; cursor: pointer; font-size: 12px; color: #555; }
.back-btn:hover { background: #f0f0f0; }
.no-actions { color: #bbb; font-size: 13px; font-style: italic; }
.doc-events-section { border-top: 1px solid #e0e0e0; margin-top: 12px; padding-top: 8px; }
/* member gate 付きアクション行のインラインバッジ・select（Task 18 項目4）。off の行は
   .action-row-disabled で見た目を沈め（背景を薄く・カーソルを not-allowed に）、行自体は
   消さない——「gate off で操作が消えて存在に気づけない」の解消が目的のため、視認できる
   ことが要件。select はバッジと違い操作可能なので pointer-events は殺さない。 */
.gate-inline-badge { font-size: 10px; color: #7c5cbf; background: #f3f0fb; border-radius: 8px; padding: 1px 6px; white-space: nowrap; }
.gate-inline-select { font-size: 11px; }
.gate-off-mark { font-size: 11px; color: #c0392b; }
.action-row-disabled { background: #f5f5f5; opacity: .7; }
.action-row-disabled.action-row-solo { cursor: not-allowed; }
.action-row-disabled .choice-chip { cursor: not-allowed; opacity: .6; }
.overlay-card { margin-top: 12px; border: 1px dashed #999; }
.overlay-badge { display: inline-block; font-size: 11px; color: #fff; background: #555; padding: 1px 8px; border-radius: 8px; margin-bottom: 8px; }
/* gate ドロワー（Task 18 項目5）: 常設の第3カラムだった旧 .gate-panel を廃し、トグルボタン
   （画面上部）で開くオーバーレイへ移した。トグル本体（.gate-toggle-block）は見出し・説明を
   常時表示する（旧 Task 12 の empty state 継承——対象ゼロでも白紙に見えないようにする方針を
   ドロワー化後も保つ）。ドロワー本体（.gate-drawer）だけが開閉に応じて DOM へ出入りする。 */
.gate-toggle-block { margin: 4px 0 10px; font-size: 12px; }
.gate-drawer-toggle { background: none; border: 1px solid #ddd; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #777; font-size: 11px; }
.gate-panel-desc { margin-top: 6px; font-size: 11px; color: #888; }
/* position: fixed でグリッドの外に浮かせる（レイアウトに影響しない。他ペインの幅は変わらない）。
   閉じるボタン + 背景クリック（.gate-drawer-backdrop）のどちらでも解除できる（brief 明記）。 */
.gate-drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.15); z-index: 20; }
.gate-drawer { position: fixed; top: 0; right: 0; height: 100vh; width: 320px; max-width: 90vw; background: #fff; z-index: 21; padding: 16px; overflow-y: auto; box-shadow: -2px 0 8px rgba(0,0,0,.2); font-size: 12px; }
.gate-drawer-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.gate-drawer-close { background: none; border: 1px solid #ccc; border-radius: 6px; padding: 4px 10px; cursor: pointer; color: #555; font-size: 11px; white-space: nowrap; }
.gate-panel-body { margin-top: 6px; padding: 8px 10px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; display: flex; flex-direction: column; gap: 6px; }
.gate-row { display: flex; align-items: center; gap: 8px; }
.gate-row-label { color: #555; min-width: 80px; }
.gate-host-info { color: #888; }
/* マップ全体を viewBox で縮小して収めていた旧方式（Task 5〜15）を廃止し（UX round2・fleamarket
   18ノードで12px級まで縮小し判読不能と実測）、ノード矩形は固定寸法のまま、はみ出た分は
   このスクロール領域内の横縦スクロールで見る（Task 16 受入基準c）。position: relative は
   ノード近傍 tooltip（.graph-tooltip）の絶対配置の基準にするため（Task 16 受入基準e）——
   ノードと tooltip を同じ座標系（このスクロール領域内のローカル座標）に置くことで、マップを
   スクロールしても tooltip がノードから相対的にズレない。z-index は外クリックで pin を
   解除するバックドロップ（.graph-tooltip-backdrop、z-index 1）より上に出すため。 */
/* resize: vertical はマップ高さのツマミ調整（UX round4 §3-1 nice-to-have）——マップの
   ノード数が多い画面では下段（スタック+マップ）が伸び、現在の画面の取り分（1fr）を圧迫する。
   ユーザーが右下ハンドルで縦方向に縮められるようにし、直近のリサイズ高さは graphMapHeight
   （render() をまたいで保持するグローバル変数）へ反映する。max-height 480px は設計者確定の
   既存 cap のまま変更しない。 */
.graph-map-scroll { position: relative; z-index: 2; overflow: auto; max-height: 480px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; resize: vertical; }
.graph-svg { display: block; }
.graph-svg rect { fill: #fff; stroke: #ccc; }
.graph-node:hover rect { stroke: #111; fill: #f0f0f0; }
.graph-node-current rect { fill: #dbeafe; stroke: #2563eb; stroke-width: 2; }
.graph-svg text { font-size: 10px; fill: #333; pointer-events: none; }
.graph-svg text.graph-lane-title { font-size: 12px; font-weight: 700; fill: #555; }
.graph-svg line { stroke: #bbb; stroke-width: 1; }
.graph-svg marker path { fill: #bbb; }
/* ノード近傍への絶対配置 tooltip（Task 16 受入基準e）。ペイン上部固定領域だった旧
   #graph-preview（sticky + min-height 予約、Task 9/12）を廃止し、ホバー中のノードの
   すぐそば（直下）に出す方式へ切替えた。position: absolute はドキュメントフローから
   外れるためレイアウトに影響しない（他要素の並び・サイズを変えない）。pointer-events: none
   は pin されていない間の既定——tooltip が別ノードの矩形に重なっても、マウスイベントは
   tooltip を素通りして下のノードへ届く。これが Task 12 のフリッカ（tooltip の出現で
   直下のノードの mouseleave/mouseenter が連鎖する）を構造的に防ぐ根拠になる（旧方式は
   固定 min-height でレイアウトシフトを止めていたが、今回はそもそも重なっても効かない
   ようにする、より直接的な対策）。:empty は「何もホバーしていない」既定状態を非表示にする。 */
.graph-tooltip { position: absolute; z-index: 1; max-width: 220px; padding: 6px 8px; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px; font-size: 11px; line-height: 1.4; color: #555; pointer-events: none; }
.graph-tooltip:empty { display: none; }
/* pin（ノードクリックで固定表示）中は分割/統合・閉じるボタンを押せるよう pointer-events を
   戻し、見た目も「浮いているカード」として実線・影を付けて hover 中の淡いプレビューと区別する。 */
.graph-tooltip-pinned { pointer-events: auto; border-style: solid; border-color: #ccc; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
.graph-tooltip-title { font-weight: 700; color: #333; }
.graph-tooltip-actions { display: flex; gap: 6px; margin-top: 6px; }
.graph-tooltip-gate { display: flex; align-items: center; gap: 6px; margin-top: 6px; }
.graph-tooltip-btn { background: #f0f0f0; border: none; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.graph-tooltip-btn:hover { background: #e0e0e0; }
.graph-node { cursor: pointer; }
/* pin 中だけ現れる透明な外クリック検知用バックドロップ（「外クリックか閉じるで解除」。
   Task 16 受入基準e）。position: fixed で viewport 全体を覆うが、.graph-map-scroll に
   z-index: 2（このバックドロップは z-index: 1）を与えているため、マップ内のノード・
   tooltip はバックドロップより上に出て操作できる——実質「マップの外」をクリックしたときだけ
   このバックドロップが拾って pin を閉じる、という素直な動作になる。 */
.graph-tooltip-backdrop { position: fixed; inset: 0; z-index: 1; }
.graph-save-btn { align-self: flex-start; margin-bottom: 6px; background: none; border: 1px solid #ccc; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 11px; color: #555; }
.graph-save-btn:hover { background: #f0f0f0; }
@media (max-width: 680px) {
  #app { grid-template-columns: minmax(0,1fr); grid-template-rows: auto minmax(0,1fr) minmax(120px,20vh); }
  #app .pane-center { grid-row: 2; }
  #app .pane-trace { grid-row: 3; }
  #app .lower-section { max-height: 15vh; }
}
</style>
</head>
<body>
<div id="app"></div>
<script>
const DATA = ${json};
const app = document.getElementById('app');
${bundle}
const MODEL = ${modelJson};
${sessionScript}
let gatePanelOpen = false;

// 中央ペインのスタック・遷移マップの折畳み状態（gatePanelOpen と同じ JS グローバル方式だが、
// ネイティブ <details> の open 属性・ontoggle で同期する——Task 5 時代の graphPanelOpen
// パターンの再導入（Task 6 でノードクリック探索の廃止に伴い一旦撤去、UX round2 でスタックの
// 場所と合わせて復活。設計者確定事項）。既定はスタック開・マップ開。
let stackPanelOpen = true;
let mapPanelOpen = true;

// 遷移マップ（.graph-map-scroll）の高さのツマミ調整（UX round4 §3-1 nice-to-have）。
// null は「ユーザーがまだリサイズしていない」を表し、この間は CSS の max-height 480px の
// みに従う。ユーザーがネイティブ resize ハンドルで縦方向に縮めると、その高さを render()
// をまたいで保持する——保持しないと画面遷移のたびに元へ戻りツマミの意味がなくなる。
let graphMapHeight = null;

// ResizeObserver は node:vm のテスト環境には存在しない（ブラウザ専用 API）。実行環境に
// 無ければ何もしない——マップ高さの手動保持は nice-to-have であり必須機能ではないため。
function attachGraphMapResizeObserver(el) {
  if (typeof ResizeObserver === 'undefined') return;
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      graphMapHeight = Math.round(entry.contentRect.height);
    }
  });
  ro.observe(el);
}

// 「外部イベントを発生させる」（document common 由来の操作。scope==='document'）セクションの
// 折畳み状態。主操作と違い頻繁に触るものではないため既定は閉——画面を開いた瞬間に主操作より
// 前へ割り込まないようにする（UX round2 2-1・2-3、Task 18 項目2）。開閉状態は stackPanelOpen 等
// と同じ JS グローバル + ネイティブ <details> の ontoggle 同期方式。
// null は「ユーザーがまだ手動で開閉していない」を表す——この間は showActions に連動する
// （showActions オンならこのセクションはノイズにならないため既定で開く。music の主動線
// 「ミニプレイヤーをタップ」が既定閉のこのセクションに埋没していた問題への対応。UX round4
// §3-4）。ユーザーが一度でも手動開閉すると true/false の具体値になり、以降 showActions の
// 値に関わらずその状態を保つ（手動操作を上書きしない）。
let docEventsPanelOpen = null;

// scope バッジの表示ラベル（有効範囲の明示。旧カテゴリ見出しの置き換え——Task 8 / ADR-0022 5）
const SCOPE_BADGE_LABELS = { variant: 'variant固有', component: 'component common', document: 'document common' };
// scope バッジの title 属性（hover での一言説明。3種の見分けが初見では自明でないという
// 指摘への対応——UX round2 2-1、Task 18 受入基準c）
const SCOPE_BADGE_TITLES = {
  variant: 'この姿（variant）でだけ有効な操作',
  component: 'この component のどの姿でも共通して有効な操作',
  document: 'この文書のどの画面でも常に有効な操作（外部イベント。document common 由来）',
};

// 操作行 1 件（行動テキスト + scope バッジ + 選択肢ボタン横並び）。item は { inter, scope, idx }
// ——idx はその scope のフィルタ済みリスト（scopedInteractions / overlayScopedInteractions）内の
// 位置で、描画とクリックハンドラが同じフィルタ済みリストを参照するためインデックスはずれない。
// onclick へは scope 固定キーと数値だけを埋め込む（任意文字列の埋め込みによる quote 衝突バグの
// 根治方針を踏襲）。choices 空（旧 [TRUE] 表記）はチップを出さず行全体をボタンにする——
// 「[TRUE] は押せるボタンなのか内部フラグ表示なのか分からない」という指摘（UX round2）を、
// チップという内部状態的な見た目自体を無くし行の押せる見た目（action-row-solo。Task 15）へ
// 一本化することで解消する。
// member gate 付きアクション行に添えるインライン UI（Task 18 項目4）: 現在の判定対象 variant を
// 示す小バッジ + その場で切り替える select——既存 setInstanceVariant を呼ぶため、書換え先の
// 共有レジストリ（sharedVariants）は右ドロワーの手動トグルパネルと同一で、どちらから切り替えて
// も同期する。off の行にも付ける——その場で対象 variant を切り替えて有効化を試せるように
// するため（brief「その場で variant を切り替える select」）。対象が variant を持たない
// （切替の余地がない）場合はバッジのみで select を省く。
// 対象 component の variant 切替 select（member gate インライン化・マップ tooltip gate 統合の
// 両方が使う共通部品——onchange は既存 setInstanceVariant を呼ぶため、書換え先の共有レジストリ
// （sharedVariants）はどちらから切り替えても同期する。Task 18 項目4・6）。
function renderVariantSelect(module, component, variantNames, current, focusKey) {
  const options = variantNames.map((v) =>
    '<option value="' + esc(v) + '"' + (v === current ? ' selected' : '') + '>' + esc(v) + '</option>'
  ).join('');
  return '<select class="gate-inline-select" data-focus-key="' + esc(focusKey ?? ('gate:' + module + ':' + component)) + '" onclick="event.stopPropagation()" onchange="setInstanceVariant(' +
    esc(JSON.stringify(module)) + ', ' + esc(JSON.stringify(component)) + ', this.value)">' + options + '</select>';
}

function renderGateInlineControls(gate, focusKey) {
  const mod = gate.module ?? currentFrame().module;
  const comp = getComp(mod, gate.targetComponent);
  if (!comp) return '';
  const k = skey(mod, gate.targetComponent);
  const current = componentValue(mod, gate.targetComponent).variant;
  const badgeLabel = gate.targetComponent + (current ? ' / ' + current : '');
  const badge = '<span class="gate-inline-badge" title="member gate 判定対象: ' +
    esc(gate.targetComponent) + '.' + esc(gate.name) + '">' + esc(badgeLabel) + '</span>';
  const variantNames = Object.keys(comp.variants);
  if (variantNames.length === 0) return badge;
  return badge + renderVariantSelect(mod, gate.targetComponent, variantNames, current, focusKey);
}

// 操作行 1 件の描画。member gate 付きの行は renderGateInlineControls のバッジ+select を添え、
// gate off なら行を消さず「無効」表示（.action-row-disabled + .gate-off-mark）にして onclick・
// choice-chip の disabled 属性で押せなくする（Task 18 受入基準d）。host gate 付きの行は
// 一覧の時点（filterHostGate）で既に除外されているためここには現れない。
function renderActionRow(item, buildOnclick) {
  const inter = item.inter;
  const badge = '<span class="scope-badge" title="' + esc(SCOPE_BADGE_TITLES[item.scope] ?? '') + '">' +
    esc(SCOPE_BADGE_LABELS[item.scope] ?? item.scope) + '</span>';
  const isMemberGate = inter.gate != null && inter.gate.kind === 'member';
  const focusKey = operationKey(inter);
  const gateHtml = isMemberGate ? renderGateInlineControls(inter.gate, focusKey + ':gate') : '';
  const gateOff = isMemberGate && !gateEnabled(inter);
  const offMark = gateOff ? '<span class="gate-off-mark">gate off で無効</span>' : '';
  const rowClass = 'action-row' + (gateOff ? ' action-row-disabled' : '');
  if (inter.choices.length === 0) {
    const onclickAttr = gateOff ? '' : ' onclick="' + renderedClick(item, 0, buildOnclick) + '"';
    return '<div class="' + rowClass + ' action-row-solo" data-focus-key="' + esc(focusKey) + '"' + (gateOff ? '' : ' role="button" tabindex="0" onkeydown="if(event.target === this && (event.key === &quot;Enter&quot; || event.key === &quot; &quot;)){event.preventDefault();this.click()}"') + onclickAttr + '>' +
      '<span class="action-text">' + esc(inter.actionText) + '</span>' + gateHtml + offMark + badge + '</div>';
  }
  const buttons = inter.choices.map((c, choiceIdx) =>
    '<button class="choice-chip" data-focus-key="' + esc(focusKey + ':' + c.id) + '" onclick="' + renderedClick(item, choiceIdx, buildOnclick) + '"' + (gateOff ? ' disabled' : '') + '>' +
    esc('[' + c.label + ']で実行') + '</button>'
  ).join('');
  return '<div class="' + rowClass + ' action-row-conditional"><span class="action-text">' + esc(inter.actionText) + '</span>' +
    gateHtml + offMark + badge + '<span class="action-choices">' + buttons + '</span></div>';
}

// 要素サブツリー 1 件。ref を持つ要素（project 内の定義済み component への参照）は参照先の
// 中身（commonElements + 現在 variant の elements。variant は sharedVariants → initialVariant
// のオートマトン整合の解決——displayVariant / gateEnabled の member 分岐と同じ規約）を
// <details open> で再帰展開する（Task 8。ADR-0022 5「画面カードの要素は階層」）。
// visited は展開経路上の (module,name) 集合——再訪したら「（循環）」を出して打ち切る
// （循環ガード。ガードがあるため深さは無制限でよい）。attachedHtml はトップレベル要素にのみ
// 呼び出し側が渡す紐付け操作行で、要素名の直下（参照先の中身より前）に置く。
// cardIdx・path は部品自身の interaction 実行用（Task 13）: cardIdx は本体なら -1、掲示中
// カードなら [...overlays.keys()] の索引。path はここまでの要素インデックス列——
// resolveNestedItems（クリック時）がこの path を辿って同じ展開・フィルタ結果を再構築し、
// 描画とハンドラでインデックスがずれないようにする。overrideItems は el に紐付いた親（または
// さらに外側）側の attached items のうち targetMember を持つもの——外側上書き（Task 13
// 受入基準d）の判定に computeOwnComponentContext へそのまま渡す。
function renderElementNode(el, visited, attachedHtml, cardIdx, path, overrideItems) {
  const ctx = computeElementContext(el, overrideItems);
  if (!ctx) {
    return '<div class="element">' + esc(el.name) + stateLabel(el.node) + '</div>' + attachedHtml;
  }
  const key = el.ref ? skey(el.ref.module, el.ref.name) : null;
  if (key !== null && visited.has(key)) {
    return '<div class="element">' + esc(el.name) + stateLabel(el.node) + '<span class="element-cycle">（循環）</span></div>' + attachedHtml;
  }
  const nextVisited = new Set(visited);
  if (key !== null) nextVisited.add(key);
  const buildOwnOnclick = (scope, idx, choiceIdx) =>
    "handleNestedInteraction(" + cardIdx + ",[" + path.join(",") + "],'" + scope + "'," + idx + "," + choiceIdx + ")";
  const { elementsHtml: childElementsHtml, actionsHtml: ownActionsHtml } =
    renderElementsAndActions(ctx.childEls, ctx.ownItems, buildOwnOnclick, nextVisited, cardIdx, path, false);
  return '<details open class="element-hierarchy" data-state-key="' + esc(nodeKey(el.node)) + '"><summary class="element">' + esc(el.name) + stateLabel(el.node) + '</summary>' +
    attachedHtml + ownActionsHtml + '<div class="element-children">' + childElementsHtml + '</div></details>';
}

// 画面カードの要素リストと操作一覧を描画する（本体・掲示中カード共通。Task 8）。els は
// トップレベル要素（SimElement）、items は gate フィルタ済みの操作（{ inter, scope, idx }）。
// action.target の参照名（targetName）がトップレベル要素の表示名に一致した操作はその要素行の
// 直下へ紐付け、残り（不一致・対象なし）はフラットリストへ出す。同名要素が複数あるときは
// 最初の要素にだけ紐付ける（発火する interaction は同一のため重複表示しない）。
// 要素配列 els への操作 items の紐付けを計算する（Task 8 の対象紐付けアルゴリズムそのもの）。
// 同名要素が複数あるときは els の並び順で最初の要素にだけ紐付ける（items も並び順で走査し、
// 一度紐付いた item は他の要素へは付かない）。renderElementsAndActions と resolveNestedItems
// の両方がこれを呼ぶ——描画時の紐付けとクリック時の外側上書き判定（Task 13）が同じ結果を見る。
function computeAttachments(els, items) {
  const consumed = new Set();
  const attachedByIndex = els.map((el) => {
    const attached = [];
    items.forEach((item, i) => {
      if (!consumed.has(i) && item.inter.targetName != null && item.inter.targetName === el.name) {
        consumed.add(i);
        attached.push(item);
      }
    });
    return attached;
  });
  const flat = items.filter((item, i) => !consumed.has(i));
  return { attachedByIndex, flat };
}

// visitedBase は循環ガードの起点集合（カード自身の (module,component) を含む Set）。
// cardIdx・path は Task 13 の部品 interaction 実行用（renderElementNode 参照）——
// 再帰呼び出し（部品自身の子要素展開）では showEmptyState を false にして「アクションなし」の
// 空状態表示を最上位カードだけに限定する（部品ノードごとに表示すると入れ子で冗長になるため）。
// アクション表示トグル（showActions）は紐付け（attachedHtml）・フラット・部品由来（ここでの
// 再帰呼び出しが同じ関数を通るため自動的に含まれる）の3経路すべてをここ1箇所で止める——
// 要素構造（elementsHtml・renderElementNode への展開）自体は showActions に関係なく組み立てる
// ため要素階層は off でも残る（Task 15 受入基準b）。
function renderElementsAndActions(els, items, buildOnclick, visitedBase, cardIdx, path, showEmptyState = true) {
  const { attachedByIndex, flat } = computeAttachments(els, items);
  const elementRows = els.map((el, elIdx) => {
    const attached = attachedByIndex[elIdx];
    const attachedHtml = showActions && attached.length > 0
      ? '<div class="action-list element-actions">' + attached.map((item) => renderActionRow(item, buildOnclick)).join('') + '</div>'
      : '';
    // attached のうち targetMember を持つものは「対象.member」形の外側上書き——el が指す
    // 部品自身の interaction（targetName === その member）を隠すのに使う（Task 13 受入基準d）。
    const overrideItems = attached.filter((item) => item.inter.targetMember != null);
    return renderElementNode(el, visitedBase, attachedHtml, cardIdx, [...path, elIdx], overrideItems);
  }).join('');
  let actionsHtml = '';
  if (showActions) {
    if (items.length === 0) {
      if (showEmptyState) actionsHtml = '<div class="no-actions">この画面自身の操作はありません</div>';
    } else if (flat.length > 0) {
      actionsHtml = '<div class="action-list action-flat">' + flat.map((item) => renderActionRow(item, buildOnclick)).join('') + '</div>';
    }
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
    (opts.stateHtml ?? '') + (opts.elementsHtml ?? '') +
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
  const v = overlayVariant(name);

  // idx は overlayScopedInteractions(name, scope) 内の位置（handleOverlayInteraction が
  // 同じフィルタ済みリストを引くため描画とハンドラでずれない）。要素・操作一覧は
  // overlayTopLevelElements/Items を通す——resolveNestedItems（Task 13）と同一実装を共有する。
  const els = overlayTopLevelElements(cardIdx);
  const items = overlayTopLevelItems(cardIdx);
  const buildOnclick = (scope, idx, choiceIdx) =>
    "handleOverlayInteraction(" + cardIdx + ",'" + scope + "'," + idx + "," + choiceIdx + ")";
  const { elementsHtml, actionsHtml } = renderElementsAndActions(
    els, items, buildOnclick, new Set([skey(entry.module, name)]), cardIdx, [],
  );

  return renderScreenCard({
    title: name,
    variant: v,
    stateHtml: rootStateLabel(view.data.state.inclusion.overlays[cardIdx]),
    elementsHtml,
    actionsHtml,
    badgeHtml: '<div class="overlay-badge">掲示中</div>',
    extraClass: 'overlay-card',
  });
}

// 遷移マップ（Task 5、rank 割当は Task 16 で longest-path へ刷新）: DATA.graph を
// GraphViz dot 風の簡易レイヤードで配置する純関数。
// rank 割当: entryModule/entryComponent を rank 0 とし、各ノードの rank は
// entry からの全先行パスの最長（longest-path。エッジは静的な push/present/goto/switch
// のみ。SimGraph の定義参照）——遷移チェーンが横に並ぶことを基本にする。entry から
// DFS で到達可能なノードを辿り、後退辺（現在探索中のノードへ戻るエッジ＝サイクル）は
// 無視して前進辺・交差辺だけを予測グラフ（forwardPreds）として残す。これにより
// サイクルがあっても無限ループせず、DAG とみなした longest-path が求まる（合流ノードは
// 複数の先行ノードのうち rank が最大のものを採り、最長側の rank になる）。エッジで
// 到達しないノードのうち出エッジを持たない孤立ノードだけを最終 rank の次に隔離してまとめる
// （下記追加起点の説明を参照）。rank 内順序は前 rank の
// 隣接ノードの平均位置（barycenter）で 1 パス整列する——前 rank に隣接がなければ
// 末尾へ、barycenter が同着なら nodes の定義順を保つ（安定ソート）。longest-path でも
// 各ノードの rank は「ある前進辺の先行ノードの rank + 1」として定義されるため、
// rank r（>0）のノードには必ず rank r-1 の先行ノードが存在し、rank 値は 0 から
// maxRank まで連番で埋まる（前 rank 参照が常に有効な根拠）。
// entry から到達しないノードのうち出エッジを持つものは、独立した起点として同じ
// longest-path 計算へ加える（N-1）——入次数ゼロのハブ部品（タブバー等、出エッジ多数・
// 入エッジなし）が旧規則（隔離 rank = maxRank+1）でレーン最右端へ押し出され、そこから
// 実際の後続ノードへ逆向きの長い交差エッジが走る問題への対応。出エッジを持たない
// 孤立ノードだけが従来どおり隔離 rank へ回る。DFS 森の postorder を逆順にしたものが
// 森全体（後退辺を除いた前進・交差辺だけのグラフ）のトポロジカル順序になる、という
// 標準的な性質は複数の起点で呼んでも成り立つため、entry の DFS と追加起点の DFS を
// 同じ postorder/forwardPreds へ積み上げるだけでよい。
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
  const forwardPreds = nodes.map(() => []);
  const NOT_VISITED = 0, ON_STACK = 1, DONE = 2;
  const state = new Array(nodes.length).fill(NOT_VISITED);
  const postorder = [];

  // 1 つの根から反復 DFS（post-order）を行い、後退辺（探索中＝スタック上のノードへの
  // エッジ）を検出して forwardPreds から除外する（サイクル無視）。post-order を逆順に
  // したものが、後退辺を除いた前進・交差辺だけのグラフ上でのトポロジカル順序になる——
  // longest-path はこのトポロジカル順に rank[v] = max(前進辺で入る先行ノードの rank) + 1
  // で求まる。複数回呼んでも postorder・forwardPreds は共通の配列へ積み上がり続ける。
  function dfsFrom(rootIdx) {
    const dfsStack = [{ idx: rootIdx, iter: 0 }];
    state[rootIdx] = ON_STACK;
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      if (top.iter < adj[top.idx].length) {
        const next = adj[top.idx][top.iter];
        top.iter++;
        if (state[next] === ON_STACK) continue; // 後退辺（サイクル）は無視する
        forwardPreds[next].push(top.idx); // 前進辺・交差辺は longest-path の候補として残す
        if (state[next] === NOT_VISITED) {
          state[next] = ON_STACK;
          dfsStack.push({ idx: next, iter: 0 });
        }
      } else {
        state[top.idx] = DONE;
        postorder.push(top.idx);
        dfsStack.pop();
      }
    }
  }

  const entryIdx = indexByKey.get(skey(entryModule, entryComponent));
  if (entryIdx != null) dfsFrom(entryIdx);
  // entry から到達しない残りのノードのうち、出エッジを持つものを追加の起点として
  // DFS する（定義順で走査。既に他の追加起点から訪問済みならスキップ）。
  for (let i = 0; i < nodes.length; i++) {
    if (state[i] === NOT_VISITED && adj[i].length > 0) dfsFrom(i);
  }

  if (entryIdx != null) rank[entryIdx] = 0; // entry は常に rank 0（後退辺は無視済みのため上書きされない）
  const topoOrder = postorder.slice().reverse();
  for (const idx of topoOrder) {
    if (idx === entryIdx) continue;
    const preds = forwardPreds[idx];
    rank[idx] = preds.length === 0 ? 0 : Math.max(...preds.map((p) => rank[p] + 1));
  }

  // 出エッジを持たない孤立ノード（上のループでも一度も訪問されない）だけが最終的に
  // rank === -1 のまま残る。従来どおり隔離 rank（maxRank + 1）へまとめる。
  const reachedRanks = rank.filter((r) => r >= 0);
  const maxRank = reachedRanks.length > 0 ? Math.max(...reachedRanks) : -1;
  const unreachedRank = maxRank + 1;
  for (let i = 0; i < rank.length; i++) {
    if (rank[i] === -1) rank[i] = unreachedRank;
  }

  // rank ごとにノード index をグループ化し、rank 昇順に barycenter 整列する
  // （直前に処理した rank の順序だけを見る 1 パス。longest-path の rank も 0 から maxRank
  // まで連番で埋まるため（上のコメント参照）「直前に処理した rank」は常に r-1 と一致する）。
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

// 遷移マップの粒度状態（Task 11）: variant で分割表示する component の skey 集合。
// 初期値は CLI が simconfig から埋め込んだ DATA.graphConfig.split。
let graphSplit = new Set(((DATA.graphConfig && DATA.graphConfig.split) || []).map((s) => skey(s.module, s.component)));

// 遷移マップの表示範囲（Task 16）: 既定は現在地からの近傍表示（false）。「全体を見る」
// トグルで全ノード表示へ切替わり、状態は JS グローバルで保持される
// （mapPanelOpen 等と同じパターン）。
let graphShowAll = false;

function toggleGraphShowAll() {
  graphShowAll = !graphShowAll;
  render();
}

// 近傍表示（Task 16 受入基準d）: currentIdx から無向 2 ホップ以内のノードだけを残す純関数。
// fleamarket 18ノードが判読不能になった問題（UX round2）への対応——既定では現在地周辺だけを
// 見せ、「全体を見る」トグルで従来どおり全ノードを見られるようにする。表示外ノードへ向かう
// エッジは両端が可視集合に無いため描画から自然に落ちる（省く方針。境界表示はしない）。
// currentIdx が見つからない（-1 等）場合は全ノード・全エッジをそのまま返す（安全側フォールバック）。
// 粒度分割（Task 11）で同一 component から生まれた variant 兄弟ノード（n.component が一致する
// もの）は、どれか1つが近傍に入っていれば全員可視にする——split は遷移エッジの有無とは独立な
// 表示粒度の選択であり、同じ画面の別姿として一緒に見えるべきため（近傍モードでも粒度分割が
// 機能する。受入基準d）。plain な {module,name} だけの fixture（component 未指定）は対象外。
// gate 試験対象（DATA.gateTargets、member gate の参照先）は遷移エッジを持たないことが多く
// （部品として画面内に置かれるだけで push/present 等の対象にはならない）、無向隣接だけでは
// 近傍表示に決して現れない（N-3）。マップ tooltip 経由の gate 試験（Task 18 項目6）の入口を
// 必ず確保するため、近傍表示でも gate 対象ノードは常に可視集合へ含める——DATA を参照する
// ため他の近傍表示ロジックと異なり厳密には純関数でないが、対象一覧はグローバルな文書メタ
// データであり呼び出し引数化するほどの可変性はない（設計判断）。
function filterGraphNeighborhood(nodes, edges, currentIdx) {
  if (currentIdx < 0 || currentIdx >= nodes.length) return { nodes, edges };
  const keyOf = (n) => skey(n.module, n.name);
  const indexByKey = new Map(nodes.map((n, i) => [keyOf(n), i]));
  const undirectedAdj = nodes.map(() => new Set());
  for (const e of edges) {
    const a = indexByKey.get(skey(e.from.module, e.from.name));
    const b = indexByKey.get(skey(e.to.module, e.to.name));
    if (a == null || b == null) continue;
    undirectedAdj[a].add(b);
    undirectedAdj[b].add(a);
  }
  const visible = new Set([currentIdx]);
  let frontier = [currentIdx];
  const HOPS = 2;
  for (let hop = 0; hop < HOPS; hop++) {
    const next = [];
    for (const idx of frontier) {
      for (const nb of undirectedAdj[idx]) {
        if (!visible.has(nb)) { visible.add(nb); next.push(nb); }
      }
    }
    frontier = next;
  }
  // gate 試験対象ノードは無向隣接に依らず常に可視集合へ含める（N-3）。sibling 展開より
  // 前に行うことで、gate 対象が split 済み component なら variant 兄弟も下のループで拾われる。
  const gateTargets = DATA.gateTargets || [];
  nodes.forEach((n, i) => {
    if (n.component != null && gateTargets.some((t) => t.module === n.module && t.name === n.component)) {
      visible.add(i);
    }
  });
  const compGroups = new Map();
  nodes.forEach((n, i) => {
    if (n.component == null) return;
    const k = skey(n.module, n.component);
    if (!compGroups.has(k)) compGroups.set(k, []);
    compGroups.get(k).push(i);
  });
  for (const idx of [...visible]) {
    const n = nodes[idx];
    if (n.component == null) continue;
    for (const sibling of compGroups.get(skey(n.module, n.component)) ?? []) visible.add(sibling);
  }
  const filteredNodes = nodes.filter((_, i) => visible.has(i));
  const visibleKeys = new Set(filteredNodes.map(keyOf));
  const filteredEdges = edges.filter(
    (e) => visibleKeys.has(skey(e.from.module, e.from.name)) && visibleKeys.has(skey(e.to.module, e.to.name)),
  );
  return { nodes: filteredNodes, edges: filteredEdges };
}

// 直近の描画で表示した集約後ノード一覧（renderGraphMap が更新する）。hover/pin tooltip は
// onclick/onmouseenter に数値インデックスだけを埋め込み、このリストで解決する（component
// 名文字列の属性埋め込みによる quote 衝突バグの根治方針を踏襲）。graphNodePositions は
// 同じ添字で各ノードのローカル座標 { x, y, w, h }（.graph-map-scroll 内、renderGraphMap の
// レイアウト計算そのもの）を持ち、pin 中の tooltip をノード直下へ絶対配置する際に使う。
let graphNodesView = [];
let graphNodePositions = [];

// tooltip を pin（固定表示）しているノードの識別子（null = pin なし。Task 16 受入基準e、
// 粒度メニューを tooltip へ統合。旧 graphMenu の後継）。生の配列インデックスでなく
// { module, component, variant } で持つ——近傍表示（Task 16 受入基準d）は現在地に応じて
// graphNodesView の中身・順序が変わりうるため、素の idx を保持すると近傍集合が変わった際に
// 無関係な別ノードを指してしまう。render() のたびに renderGraphSection が現在の
// graphNodesView 上の位置へ解決し直し、対象ノードが可視集合から消えていれば自動的に
// pin を解除する（resolveGraphPinnedIdx）。
let graphPinnedKey = null;

// graphPinnedKey を今回描画の graphNodesView 上のインデックスへ解決する。見つからなければ
// pin 対象が近傍表示や粒度切替で可視集合から外れたということなので、pin 自体を解除して
// -1 を返す（呼び出し側は render() の戻り経路の中にいるため、ここでは render() を再帰呼び
// 出ししない——次の render() 開始時点の graphPinnedKey が null になっていれば十分）。
function resolveGraphPinnedIdx() {
  if (graphPinnedKey == null) return -1;
  const idx = graphNodesView.findIndex((n) =>
    n.module === graphPinnedKey.module && n.component === graphPinnedKey.component && n.variant === graphPinnedKey.variant,
  );
  if (idx === -1) graphPinnedKey = null;
  return idx;
}

// tooltip を pin する。ノード情報表示はどのノードでも有効（variant の有無を問わない）——
// 分割/統合ボタンの表示可否は renderGraphSection 側で個別に判定する。
function pinGraphTooltip(idx) {
  // 実イベント経由の呼び出しでは event が暗黙に束縛される（インライン属性ハンドラの仕様）。
  // 外クリックバックドロップへのバブリングでこの直後に unpinGraphTooltip が連鎖しないよう
  // 止める。vm テストのような直接呼び出しでは event 自体が存在しないため typeof で防御する。
  if (typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation();
  const node = graphNodesView[idx];
  if (!node) return;
  graphPinnedKey = { module: node.module, component: node.component, variant: node.variant };
  render();
}

function unpinGraphTooltip() {
  graphPinnedKey = null;
  render();
}

// pin の split/統合切替。集約後インデックスは粒度切替でずれるため、切替と同時に pin を解除する
function toggleGraphSplit(idx) {
  const node = graphNodesView[idx];
  if (!node) return;
  const k = skey(node.module, node.component);
  if (graphSplit.has(k)) graphSplit.delete(k);
  else graphSplit.add(k);
  graphPinnedKey = null;
  render();
}

// 「設定を保存」の書き込み内容（simconfig JSON 文字列）を生成する（Task 11 形式確定事項:
// { "graph": { "split": [ { "module", "component" } ] } }）。ファイル書き込み手段
// （FS Access API / ダウンロード fallback）から分離してあり、内容生成だけを vm テストで縛れる。
function buildSimConfigJson() {
  const split = [...graphSplit].map((k) => {
    const pair = JSON.parse(k); // skey は JSON.stringify([module, component])
    return { module: pair[0], component: pair[1] };
  });
  return JSON.stringify({ graph: { split } }, null, 2);
}

// showSaveFilePicker で取得したハンドル。初回保存でユーザが選んだファイルへ、以後は
// ピッカーを出さず同じハンドルで上書きする
let saveFileHandle = null;

// 「設定を保存」ボタン。File System Access API があれば showSaveFilePicker
// （suggestedName = <entryModule>.simconfig.json）、無ければ a[download] での
// JSON ダウンロード fallback（self-contained 維持——どちらも組み込み API のみ）。
async function saveGraphConfig() {
  const json = buildSimConfigJson();
  const fileName = DATA.entryModule + '.simconfig.json';
  if (typeof window !== 'undefined' && window.showSaveFilePicker) {
    try {
      if (!saveFileHandle) {
        saveFileHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [{ description: 'shitae simulator config', accept: { 'application/json': ['.json'] } }],
        });
      }
      const writable = await saveFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
    } catch (e) {
      // ピッカーのキャンセル等は黙って無視（次回の保存で改めて試せる）
    }
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

// 遷移マップの集約（Task 11）: 最細粒度 edges（variant 単位）を粒度状態 splitSet に応じて
// ノード集合へ集約する純関数（layoutGraph の前段）。統合 component は 1 ノード、split
// component は variant ごとのノード（表示名 X ## v）。エッジ規則: to.variant null の split 先は
// 初期姿ノードへ、from.variant null（component common 由来）の split 元は全 variant ノードから。
// 自己 edge もそのまま残す。戻り値ノードは { module, name, component, variant }——
// name は layoutGraph の識別キー（skey(module, name)）を兼ねる表示名。
function aggregateGraph(nodes, edges, splitSet) {
  const variantsOf = (module, component) => {
    const comp = getComp(module, component);
    return comp ? Object.keys(comp.variants) : [];
  };
  const isSplit = (module, component) =>
    splitSet.has(skey(module, component)) && variantsOf(module, component).length > 0;
  const nameOf = (component, variant) => (variant != null ? component + ' ## ' + variant : component);

  const aggNodes = [];
  for (const n of nodes) {
    if (isSplit(n.module, n.name)) {
      for (const v of variantsOf(n.module, n.name)) {
        aggNodes.push({ module: n.module, name: nameOf(n.name, v), component: n.name, variant: v });
      }
    } else {
      aggNodes.push({ module: n.module, name: n.name, component: n.name, variant: null });
    }
  }

  // エッジ端点 → 集約後ノード名。from は複数ノードに膨らみうる（variant null の split 元）
  const fromNamesOf = (ep) => {
    if (!isSplit(ep.module, ep.component)) return [ep.component];
    if (ep.variant != null) return [nameOf(ep.component, ep.variant)];
    return variantsOf(ep.module, ep.component).map((v) => nameOf(ep.component, v));
  };
  const toNameOf = (ep) => {
    if (!isSplit(ep.module, ep.component)) return ep.component;
    const v = ep.variant != null ? ep.variant : initialVariant(ep.module, ep.component);
    return nameOf(ep.component, v);
  };

  const aggEdges = new Map();
  for (const e of edges) {
    const toName = toNameOf(e.to);
    for (const fromName of fromNamesOf(e.from)) {
      const edge = { from: { module: e.from.module, name: fromName }, to: { module: e.to.module, name: toName } };
      aggEdges.set(JSON.stringify([edge.from, edge.to]), edge);
    }
  }
  return { nodes: aggNodes, edges: [...aggEdges.values()] };
}

// tooltip の本文（ノード名・module・elements・variant 一覧）。hover 表示・pin 表示の
// 両方から使う共通部分（Task 16 受入基準e、粒度メニュー統合に伴い pin 側は
// renderGraphTooltipPinnedContent がこれへボタン行を足す）。
function renderGraphTooltipBody(node) {
  const comp = getComp(node.module, node.component);
  if (!comp) return '';
  const variantNames = Object.keys(comp.variants);
  const elementsHtml = comp.commonElements.length > 0
    ? '<div class="graph-tooltip-elements">elements: ' + comp.commonElements.map((e) => esc(e.name)).join(', ') + '</div>'
    : '';
  const variantsHtml = variantNames.length > 0
    ? '<div class="graph-tooltip-variants">variant: ' + variantNames.map((v) => esc(v)).join(', ') + '</div>'
    : '';
  return '<div class="graph-tooltip-title">' + esc(node.name) + '</div>' +
    '<div class="graph-tooltip-module">module: ' + esc(node.module) + '</div>' +
    elementsHtml + variantsHtml;
}

// pin tooltip に gate 試験の variant 切替を統合する（Task 18 項目6・UX round2 2-4(d)3）: gate
// 状態は本質的に「画面外 component の見せ方（variant）」の話であり、遷移マップのノード
// メニュー（variant で分割/統合）と概念的に隣接する——独立したドロワーとの往復を減らすため、
// このノードの component が member gate の参照先（DATA.gateTargets）なら pin tooltip に直接
// 切替 select を出す。select 自体は renderGateInlineControls と共通の renderVariantSelect を使う。
function renderGraphTooltipGateControls(node) {
  const isTarget = GATE_TARGETS.some((t) => t.module === node.module && t.name === node.component);
  if (!isTarget) return '';
  const comp = getComp(node.module, node.component);
  const variantNames = comp ? Object.keys(comp.variants) : [];
  if (variantNames.length === 0) return '';
  const k = skey(node.module, node.component);
  const current = componentValue(node.module, node.component).variant;
  const badge = '<span class="gate-inline-badge" title="この component は member gate（対象.要素?）の判定対象です">gate 試験</span>';
  return '<div class="graph-tooltip-gate">' + badge + renderVariantSelect(node.module, node.component, variantNames, current, 'graph:' + node.module + ':' + node.component) + '</div>';
}

// 遷移マップの hover tooltip。render() を経由せず #graph-tooltip を直接書き換える
// 局所 DOM 更新にする——render() は innerHTML を丸ごと再構築する設計のため、hover 状態を
// JS グローバルに持って render() を呼ぶとちらつく（#graph-preview 時代からの理由を踏襲）。
// idx は集約後ノード（graphNodesView）のインデックス。x, y はノード描画時（renderGraphNodeSvg）
// に計算済みの固定座標——ノード直下（フリッカを避ける重ならない位置）を指す数値のみで、
// onmouseenter への埋め込みも数値のみに保つ。pin 中は hover に奪われない（pin が優先）。
function showNodeTooltip(idx, x, y) {
  if (graphPinnedKey != null) return;
  const node = graphNodesView[idx];
  const el = document.getElementById('graph-tooltip');
  if (!node || !el) return;
  el.innerHTML = renderGraphTooltipBody(node);
  el.style.left = x + 'px';
  el.style.top = y + 'px';
}

function hideNodeTooltip() {
  if (graphPinnedKey != null) return;
  const el = document.getElementById('graph-tooltip');
  if (el) el.innerHTML = '';
}

// 遷移マップの SVG（rect + component 名テキストのノード、直線 + 矢印のエッジ）。
// aggregateGraph で粒度状態（graphSplit）に応じた集約を行ってから layoutGraph（純関数）へ
// 渡し、rank/order を LR（rank=横方向、rank内=縦等間隔）で座標化する（Task 11）。
// 遷移関係は閲覧専用（設計者確定事項 2026-07-19）——ノードクリックは遷移せず tooltip を
// pin するだけ。hover/click は component 名でなく集約後ノードの配列インデックスで参照する
// （属性への任意文字列埋め込みを避ける）。component 名は任意文字列のため SVG テキストへは
// esc() を通す。現在の画面.本体に対応するノードは module・component の両方一致
// （split 時はさらに現在 variant 一致）で判定し graph-node-current を付けてハイライトする
// ——render() が毎回 innerHTML を再構築するため遷移のたびに自然に追随する。
// ノード 1 個分の <g>（rect + テキスト）。idx は集約後ノード（graphNodesView）配列上の
// インデックス（レーン分割後も agg.nodes 上の絶対位置を指す。onclick/onmouseenter に
// 埋め込むのはこのインデックスと固定オフセット座標のみ——component 名の quote 衝突を
// 避ける方針を踏襲）。tooltip の位置はノード直下（y + h + 4px）に固定オフセットする——
// ノード自身の矩形と重ならない位置にすることで Task 12 のフリッカ連鎖を起こさない
// （.graph-tooltip の pointer-events: none と合わせた二重の対策。Task 16 受入基準e）。
function renderGraphNodeSvg(view, idx, x, y, w, h) {
  const frame = currentFrame();
  const frameVariant = displayVariant(frame);
  const isCurrent = view.module === frame.module && view.component === frame.component &&
    (view.variant == null || view.variant === frameVariant);
  const cls = 'graph-node' + (isCurrent ? ' graph-node-current' : '');
  const tooltipY = y + h + 4;
  return '<g class="' + cls + '" onmouseenter="showNodeTooltip(' + idx + ',' + x + ',' + tooltipY + ')" ' +
      'onmouseleave="hideNodeTooltip()" onclick="pinGraphTooltip(' + idx + ')">' +
    '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="4"></rect>' +
    '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 4) + '" text-anchor="middle">' + esc(view.name) + '</text>' +
  '</g>';
}

// 遷移マップ本体（Task 16: モジュール別スイムレーン + 近傍表示）。集約後ノードを module
// ごとの水平レーンへ分け、レーンごとに layoutGraph（純関数）を回してレーン内で rank
// 横並びにする（レーン単位の縦積み構成）。レーン内の「起点」は、そのレーンが実文書の
// entry module を含むならその entry ノード、それ以外は当該レーンの先頭ノード（nodes の
// 定義順で最初）——複数レーンそれぞれに DAG としての起点を与える素朴な拡張（単一 entry
// しか持たない layoutGraph のインターフェースは変えない）。単一 module のみならレーンは
// 1本になりレーン見出しは省略する。cross-module エッジはレーンをまたいで直線で結ぶ
// （多少の交差は許容——ラフツール）。ノード寸法は固定（nodeWidth/nodeHeight）で
// ノード数に依らない——マップ全体を viewBox で縮小する旧方式をやめ、はみ出た分は
// 呼び出し側（.graph-map-scroll）のスクロールで見る。graphShowAll が false（既定）なら
// 現在地から無向2ホップの近傍だけに絞る（filterGraphNeighborhood）——絞り込み後の集合が
// レーン分割・レイアウト・graphNodesView（クリック/hover 索引）すべての入力になるため、
// 近傍モードでも粒度分割・現在地ハイライト・ノードメニューはそのまま機能する。
function renderGraphMap() {
  const agg = aggregateGraph(DATA.graph.nodes, DATA.graph.edges, graphSplit);
  let nodes = agg.nodes;
  let edges = agg.edges;
  if (!graphShowAll) {
    const frame = currentFrame();
    const frameVariant = displayVariant(frame);
    const currentIdx = nodes.findIndex((view) =>
      view.module === frame.module && view.component === frame.component &&
      (view.variant == null || view.variant === frameVariant),
    );
    const filtered = filterGraphNeighborhood(nodes, edges, currentIdx);
    nodes = filtered.nodes;
    edges = filtered.edges;
  }
  graphNodesView = nodes;
  // entry component が split されているときは初期姿ノードを rank 0 の起点にする
  const entryName = graphSplit.has(skey(DATA.entryModule, DATA.entryComponent)) &&
    initialVariant(DATA.entryModule, DATA.entryComponent) != null
    ? DATA.entryComponent + ' ## ' + initialVariant(DATA.entryModule, DATA.entryComponent)
    : DATA.entryComponent;

  const rankWidth = 160;
  const rowHeight = 44;
  const nodeWidth = 120;
  const nodeHeight = 28;
  const marginX = 16;
  const marginY = 16;
  const laneHeadingHeight = 24;
  const laneGap = 20;

  // module ごとにスイムレーンへ分ける（nodes 内の初出順を保つ）
  const laneModules = [];
  for (const n of nodes) if (!laneModules.includes(n.module)) laneModules.push(n.module);
  const showLaneHeading = laneModules.length > 1;

  const nodesWithIdx = nodes.map((n, i) => ({ ...n, _idx: i }));
  const posByKey = new Map(); // skey(module,name) -> { x, y }（レーン跨ぎのエッジ描画用）
  const nodesHtmlParts = [];
  let yCursor = marginY;
  let width = 0;
  // graphNodesView と同じ添字で各ノードのローカル座標を記録する（tooltip の pin 表示で
  // renderGraphSection がノード直下へ絶対配置する際に使う。Task 16 受入基準e）
  graphNodePositions = new Array(nodes.length);

  for (const laneModule of laneModules) {
    const laneEntries = nodesWithIdx.filter((n) => n.module === laneModule);
    const laneEdges = edges.filter((e) => e.from.module === laneModule && e.to.module === laneModule);
    const laneEntryName = laneModule === DATA.entryModule && laneEntries.some((n) => n.name === entryName)
      ? entryName
      : laneEntries[0].name;
    const layout = layoutGraph(laneEntries, laneEdges, laneModule, laneEntryName);
    const laneMaxRank = layout.reduce((m, n) => Math.max(m, n.rank), 0);
    const laneMaxOrder = layout.reduce((m, n) => Math.max(m, n.order), 0);
    width = Math.max(width, marginX * 2 + (laneMaxRank + 1) * rankWidth);

    const laneTop = yCursor + (showLaneHeading ? laneHeadingHeight : 0);
    if (showLaneHeading) {
      nodesHtmlParts.push(
        '<text class="graph-lane-title" x="' + marginX + '" y="' + (yCursor + laneHeadingHeight - 8) + '">' +
          esc(laneModule) + '</text>',
      );
    }
    // layout は laneEntries と同順・同 index（layoutGraph は並べ替えず座標だけ返す）
    layout.forEach((n, j) => {
      const view = laneEntries[j];
      const x = marginX + n.rank * rankWidth;
      const y = laneTop + n.order * rowHeight;
      posByKey.set(skey(n.module, n.name), { x, y });
      graphNodePositions[view._idx] = { x, y, w: nodeWidth, h: nodeHeight };
      nodesHtmlParts.push(renderGraphNodeSvg(view, view._idx, x, y, nodeWidth, nodeHeight));
    });

    yCursor = laneTop + (laneMaxOrder + 1) * rowHeight + laneGap;
  }
  const height = yCursor - laneGap + marginY;

  const edgesHtml = edges.map((e) => {
    const from = posByKey.get(skey(e.from.module, e.from.name));
    const to = posByKey.get(skey(e.to.module, e.to.name));
    if (!from || !to) return '';
    const x1 = from.x + nodeWidth;
    const y1 = from.y + nodeHeight / 2;
    const x2 = to.x;
    const y2 = to.y + nodeHeight / 2;
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#graph-arrow)"></line>';
  }).join('');

  const svg = '<svg class="graph-svg" width="' + width + '" height="' + height + '">' +
    '<defs><marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z"></path></marker></defs>' +
    edgesHtml + nodesHtmlParts.join('') +
  '</svg>';

  // pin 中の tooltip（Task 16 受入基準e、粒度メニューを tooltip へ統合）。graphPinnedKey を
  // 今回描画の graphNodesView 上のインデックスへ解決し、見つかればノード直下へ絶対配置し
  // 分割/統合ボタン + 閉じるボタンを内蔵する。見つからなければ（近傍表示や粒度切替で
  // pin 対象が可視集合から外れた）resolveGraphPinnedIdx の副作用として pin 自体を解除する。
  const pinnedIdx = resolveGraphPinnedIdx();
  let tooltipHtml = '<div id="graph-tooltip" class="graph-tooltip"></div>';
  let backdropHtml = '';
  if (pinnedIdx >= 0) {
    const node = graphNodesView[pinnedIdx];
    const pos = graphNodePositions[pinnedIdx];
    const comp = getComp(node.module, node.component);
    const isSplit = graphSplit.has(skey(node.module, node.component));
    const splitBtn = comp && Object.keys(comp.variants).length > 0
      ? '<button class="graph-tooltip-btn" onclick="toggleGraphSplit(' + pinnedIdx + ')">' +
          (isSplit ? '統合' : 'variant で分割') + '</button>'
      : '';
    tooltipHtml = '<div id="graph-tooltip" class="graph-tooltip graph-tooltip-pinned" style="left:' + pos.x + 'px; top:' + (pos.y + pos.h + 4) + 'px;">' +
      renderGraphTooltipBody(node) +
      renderGraphTooltipGateControls(node) +
      '<div class="graph-tooltip-actions">' + splitBtn +
        '<button class="graph-tooltip-btn" onclick="unpinGraphTooltip()">閉じる</button>' +
      '</div>' +
    '</div>';
    // 外クリックで pin を解除するバックドロップ（「外クリックか閉じるで解除」）。pin 中だけ出す
    backdropHtml = '<div class="graph-tooltip-backdrop" onclick="unpinGraphTooltip()"></div>';
  }

  // ノード寸法固定 + はみ出た分はスクロールで見る（受入基準c）——マップ全体を
  // viewBox で縮小して収める旧方式はここで廃止した。tooltip は .graph-map-scroll の中に
  // 置く（.graph-map-scroll が position: relative の基準になり、ノードと同じローカル座標系で
  // 絶対配置できる——マップをスクロールしてもノードから相対的にズレない）。
  const mapHeightStyle = graphMapHeight != null ? ' style="height: ' + graphMapHeight + 'px"' : '';
  return backdropHtml + '<div class="graph-map-scroll"' + mapHeightStyle + '>' + svg + tooltipHtml + '</div>';
}

// 遷移マップの区画（中央ペイン最下段、スタックと1つのスクロール領域を共有する。UX round2で
// 折畳み可能に戻した——閲覧専用化でノードクリック探索という開閉維持の理由は消えたが、
// スタックとマップが同じスクロール領域を分け合う以上、双方を閉じられる方が長い文書で有利
// という設計者判断による。開閉状態は mapPanelOpen に保持し、ネイティブ <details> の
// ontoggle で同期する（Task 5 時代の graphPanelOpen と同じ方式。Task 14）。ノード情報の
// tooltip（pin 中は粒度メニューも内蔵）はノード近傍へ絶対配置するため mapHtml
// （renderGraphMap の戻り値）に含まれており、この関数で個別に組み立てる必要はない
// （旧 #graph-preview・.graph-menu はここで担っていたが Task 16 で廃止した）。
function renderGraphSection() {
  if (!DATA.graph || DATA.graph.nodes.length === 0) return '';
  const mapHtml = renderGraphMap();
  // 「遷移関係は閲覧専用（クリックでは遷移しない）」と「表示（ノード情報・分割粒度）は
  // クリックで操作できる」を明確に書き分ける——両者が同じ短い説明文に同居すると「閲覧専用な
  // のになぜクリックで何か起きるのか」と読めてしまう（UX round2 指摘、Task 16 項目3）。
  return '<details' + (mapPanelOpen ? ' open' : '') + ' class="graph-section" ontoggle="mapPanelOpen = this.open">' +
    '<summary class="pane-title" title="遷移マップ — 画面間の遷移関係（表示のみ。状態遷移図として読める）">遷移マップ</summary>' +
    '<div class="pane-desc">画面間の遷移関係を表示します。状態遷移図として読める。遷移関係自体は閲覧専用です（ノードをクリックしても画面は遷移しません）。既定は現在の画面から近い範囲だけを表示し（近傍表示）、「全体を見る」で全ノードへ切替わります。現在の画面.本体に対応するノードを強調表示します。ノードにカーソルを合わせると詳細を表示し、クリックすると詳細を固定表示できます（variant を持つノードは、固定表示した詳細から分割 / 統合を切り替えられます）。</div>' +
    '<button class="graph-save-btn" onclick="saveGraphConfig()">設定を保存</button>' +
    '<label class="graph-scope-toggle"><input type="checkbox" ' + (graphShowAll ? 'checked' : '') +
      ' onchange="toggleGraphShowAll()"> 全体を見る</label>' +
    mapHtml +
  '</details>';
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

// スタックの区画（中央ペイン最下段の上側、遷移マップと1つのスクロール領域を共有する。
// UX round2 で左ペインから中央へ移動——ミクロ(画面)→マクロ(スタック→マップ)の見え方に
// するため（設計者確定事項）。折畳み可能で、開閉状態は stackPanelOpen に保持し、ネイティブ
// <details> の ontoggle で同期する（mapPanelOpen と同じ方式。Task 14）。
function renderStackSection() {
  const stackHtml = renderStackList();
  return '<details' + (stackPanelOpen ? ' open' : '') + ' class="stack-section" ontoggle="stackPanelOpen = this.open">' +
    '<summary class="pane-title" title="スタック — 今積み重なっている画面。プッシュダウン構成として読める">現在の操作位置のスタック</summary>' +
    '<div class="pane-desc">今積み重なっている画面。プッシュダウン構成として読める。上が現在地</div>' +
    '<div class="stack-list">' + stackHtml + '</div>' +
  '</details>';
}

// 「外部イベントを発生させる」区画（画面カードの主操作リストと視覚的な優先度を分ける。
// UX round2 2-4(a)2・Task 18 項目2）。document common 操作（プッシュ通知・セッション切れ検知
// 等、稀に起こる外的要因を模す）は「今できる主操作」と優先度が異なるという指摘への対応——
// scope==='document' の操作だけをここへ集め、既定閉の <details> にまとめる。実行機構は
// 変わらない（handleInteraction('document', idx, ...) が docCommonInteractions() を直接引く）。
// 対象ゼロならセクション自体を出さない（無言の空 details を避ける）。
// セクションが screen-section スクロール領域の下端にあるため、summary クリックで開いても
// 行が fold の下に隠れ何も起きていないように見えていた（N-4）。開いたとき（this.open）だけ
// 自身へ scrollIntoView する——block: 'nearest' は既にビューポート内なら動かさない控えめな
// 挙動で、閉じたときや初期描画（既定閉）では呼ばない。
function renderExternalEventsSection() {
  const items = documentEventItems();
  if (items.length === 0) return '';
  const buildOnclick = (scope, idx, choiceIdx) => "handleInteraction('" + scope + "'," + idx + "," + choiceIdx + ")";
  const rowsHtml = items.map((item) => renderActionRow(item, buildOnclick)).join('');
  const isOpen = docEventsPanelOpen !== null ? docEventsPanelOpen : showActions;
  const ontoggle = "docEventsPanelOpen = this.open; if (this.open) this.scrollIntoView({ block: 'nearest' })";
  return '<details' + (isOpen ? ' open' : '') + ' class="doc-events-section" ontoggle="' + ontoggle + '">' +
    '<summary class="pane-title" title="外部イベントを発生させる — この文書のどの画面でも常に有効な操作（document common）。プッシュ通知やセッション切れなど、稀に起こる外的要因を模す">外部イベントを発生させる</summary>' +
    '<div class="action-list">' + rowsHtml + '</div>' +
  '</details>';
}

function render() {
  const presentation = capturePresentation();
  syncView();
  const frame = currentFrame();
  const comp = getComp(frame.module, frame.component);

  const stackSectionHtml = renderStackSection();

  // 統合ログ（cursor が指すエントリ＝現在地。タップで全状態巻き戻し・redo。
  // transition/event 両方クリック可。cursor より未来のエントリは ghost（半透明）表示。
  // onclick へは timeline インデックス（数値）のみを埋め込むため、showEvents による
  // event 行の除外（DOM から省く）はクリックインデックスの整合を壊さない。
  // 描画は newest-on-top（配列末尾＝最新から先に出す）——timeline 配列自体・cursor・
  // onclick のインデックス意味論は時系列のまま変えない。逆順に辿るのは描画順だけ（Task 14）。
  const timelineParts = [];
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i];
    if (entry.kind === 'event' && !showEvents && i !== cursor) continue;
    const classes = ['timeline-item', 'timeline-item-' + entry.kind];
    if (i === cursor) classes.push('current');
    if (i > cursor) classes.push('ghost');
    // 記録時のアクティブ画面（component/variant）を薄いラベルで併記する（Task 18 受入基準a）——
    // 「effect: 盤面が更新される」のような1行が前後の遷移行を見なくても自己完結して読める。
    // transition 行では併記しない（N-2）——ラベル自体が遷移後の画面（=記録時のアクティブ画面と
    // 常に同一）を指すため、画面名を添えると「[ホーム] present → ホーム」のように全文重複し、
    // 「[X] は遷移元では」という誤読を招く（UX round3 実機評価）。event 行は遷移先を示さない
    // （例: effect の本文は画面名を含まない）ため引き続き併記して自己完結性を保つ。
    const screenBadge = entry.kind === 'event'
      ? '<span class="timeline-item-screen">[' + esc(entry.screen) + ']</span> '
      : '';
    timelineParts.push('<div class="' + classes.join(' ') + '" data-observation-id="' + entry.id + '">' + screenBadge + esc(entry.label) + '<button onclick="previewObservation(' + entry.id + ')">画面を見る</button><button onclick="requestResume(' + entry.id + ')"' + (i === cursor ? ' disabled title="現在の操作位置と同じ地点です"' : '') + '>この時点から続ける…</button></div>');
  }
  const timelineHtml = timelineParts.join(' › ');

  // elements（document common の要素行は全 component の表示に共通要素として乗る。SPEC「document common」）。
  // 操作一覧: scope はカテゴリ見出しでなく各行のバッジで示し、対象一致の操作は要素行の直下へ
  // 紐付ける（Task 8）。idx は scopedInteractions(scope) 内の位置——handleInteraction が同じ
  // フィルタ済みリストを引くため描画とハンドラでずれない。要素配列・操作一覧は
  // mainTopLevelElements/Items を通す——resolveNestedItems（Task 13）と同一実装を共有する。
  const frameVariant = displayVariant(frame);
  const buildOnclick = (scope, idx, choiceIdx) => "handleInteraction('" + scope + "'," + idx + "," + choiceIdx + ")";
  const { elementsHtml: elements, actionsHtml } = renderElementsAndActions(
    mainTopLevelElements(), mainTopLevelItems(), buildOnclick, new Set([skey(frame.module, frame.component)]), -1, [],
  );

  // 掲示中カード（本体と同形。表示順 = [...overlays.keys()] の添字が handleOverlayInteraction の
  // cardIdx と一致する。document common カテゴリは持たない——ADR-0015・renderOverlayCard 参照）
  const overlayCardsHtml = [...overlays.keys()].map((n, cardIdx) => renderOverlayCard(n, cardIdx)).join('');

  // back button（「戻れない」= stack 長 1 または現 frame.wall。disabled でなく DOM から消す）
  const canBack = view.data.actions.controls.back.enabled;
  const backBtn = canBack ? '<button class="back-btn" onclick="' + esc('goBack(' + JSON.stringify(view.data.actions.controls.back.handle) + ')') + '">← 前の画面へ（画面内の操作）</button>' : '';

  // インスタンス variant 手動トグルドロワー（画面外 component の姿切替。presence gate の
  // 効きを手動で試験するための開発者向け UI——姿を持たない対象は切替不要なので除外）。
  // 見出しは用途が伝わる表記（設計者確定事項 2026-07-19。旧「インスタンス variant（gate 観測用）」
  // は何をするパネルか伝わらないという指摘）。常設の第3カラムだったものをオーバーレイ
  // ドロワーへ移した（UX round2 2-4(d)・Task 18 項目5）——トグル本体（見出し・説明）は
  // 常時表示し続ける（旧 Task 12 の empty state 継承の前提を保つ）。ドロワー本体（対象一覧・
  // empty state）だけが gatePanelOpen に応じて DOM へ出入りする。
  const gateTargetsWithVariants = GATE_TARGETS.filter((t) => {
    const comp = getComp(t.module, t.name);
    return comp && Object.keys(comp.variants).length > 0;
  });
  // host gate（裸参照）は手動切替対象ではないため参照情報として別枠で併記する（UX round4 §3-2）。
  const hostGateNames = currentHostGateNames();
  const memberGateRowsHtml = gateTargetsWithVariants.map((t) => {
    const comp = getComp(t.module, t.name);
    const k = skey(t.module, t.name);
    const current = t.variant;
    return '<div class="gate-row"><span class="gate-row-label">' + esc(t.name) + '</span>' +
      renderVariantSelect(t.module, t.name, Object.keys(comp.variants), current, 'drawer:' + t.module + ':' + t.name) + '</div>';
  }).join('');
  const hostGateInfoHtml = hostGateNames.length > 0
    ? '<p class="gate-host-info">この画面の host gate（裸参照。対象.要素? でなく要素? 単体）は画面の要素で自動判定されます: ' +
      hostGateNames.map(esc).join(', ') + '。手動で切り替えられる対象ではありません。</p>'
    : '';
  const gatePanelBodyHtml = (gateTargetsWithVariants.length > 0 || hostGateNames.length > 0)
    ? '<div class="gate-panel-body">' + memberGateRowsHtml + hostGateInfoHtml + '</div>'
    : '<div class="gate-panel-body"><p class="gate-panel-empty">この画面で切り替えられる presence gate（対象.要素?）の参照先はありません。切り替えられる試験対象なし。</p></div>';
  const gateToggleHtml = '<div class="gate-toggle-block">' +
    '<button class="gate-drawer-toggle" onclick="toggleGatePanel()">画面外 component の姿切替（gate 試験用）</button>' +
    '<p class="gate-panel-desc">今の画面に出ていない component の variant を手動で切り替え、presence gate（?）の効きをその場で試せます。</p>' +
  '</div>';
  const gateDrawerHtml = gatePanelOpen
    ? '<div class="gate-drawer-backdrop" onclick="toggleGatePanel()"></div>' +
      '<div class="gate-drawer">' +
        '<div class="gate-drawer-header">' +
          '<span class="pane-title">画面外 component の姿切替（gate 試験用）</span>' +
          '<button class="gate-drawer-close" onclick="toggleGatePanel()">閉じる</button>' +
        '</div>' +
        gatePanelBodyHtml +
      '</div>'
    : '';

  const mainCardHtml = renderScreenCard({
    title: frame.component,
    variant: frameVariant,
    stateHtml: rootStateLabel(view.data.state.inclusion.main),
    elementsHtml: elements,
    actionsHtml,
    trailingHtml: backBtn,
  });

  const externalEventsHtml = renderExternalEventsSection();

  const graphSectionHtml = renderGraphSection();

  // 全幅 2 カラムグリッド（UX round2・設計者フィードバック 2026-07-20、右カラム廃止は
  // Task 18 項目5）: 左 = 統合ログ専用 / 中央 = 現在の画面（上）+ スタック・遷移マップ
  // （下、1スクロール領域を共有）。スタックを左から中央へ移し現在の画面→スタック→遷移マップの
  // ミクロ→マクロの見え方にする（Task 14）。gate ドロワー（gateDrawerHtml）はグリッドの外に
  // 浮くオーバーレイ（position: fixed）のため、末尾に置いてもレイアウトに影響しない。各ペインに
  // 見出し・役割説明を添え、エリアの意味が一目で伝わるようにする。説明文にはオートマトンとしての
  // 読み方を一言添える（用語は現状のまま。ADR-0022）。
  app.innerHTML =
    '<div class="live-position">操作を続ける位置: ' + esc(pointDescription(view.summary.cursorObservationId)) + ' <button data-focus-key="current-position" onclick="focusCurrentHistory()">現在の操作位置を一覧で見る</button><p role="status">' + esc(historyNotice) + '</p></div>' +
    '<aside class="pane pane-trace" data-generation="' + sessionGeneration + '">' +
      '<div class="pane-title">操作来歴（統合ログ）</div>' +
      '<div class="pane-desc">ナビゲーション履歴。実行された遷移の列を操作ごとに表示します。新しい記録が上。記録の見出しで詳細を開閉し、結果ごとに画面を閲覧できます。操作を続ける位置の変更は別の確認で確定します。文章のみの地点は閲覧・再開できません。</div>' +
      '<label class="timeline-toggle"><input type="checkbox" ' + (showEvents ? 'checked' : '') + ' onchange="toggleShowEvents()"> イベントを表示</label><p class="pane-desc">effect・状態変更・診断などの状態点を切り替えます。操作・位置変更の記録は消しません。</p>' +
      renderProvenance(timelineHtml) +
    '</aside>' +
    '<main class="pane pane-center" data-view-key="' + screenViewKey() + '">' +
      '<section class="screen-section" data-view-key="' + screenViewKey() + '">' +
        '<div class="pane-title">' + (historySelection || resumeConfirmation ? '履歴の閲覧・位置の変更' : '操作を続ける画面') + '</div>' +
        '<p class="pane-desc">画面の流れと、状態が残る範囲を試します。商品や入力内容は模式表示で、読込完了や成功・失敗も自分で発生させます。</p>' +
        scenarioControls() +
        scenarioError() +
        (historySelection || resumeConfirmation ? historyPreviewHtml() : mainCardHtml + externalEventsHtml + overlayCardsHtml) +
        '<details data-state-key="display-trials"><summary>表示設定・検討用に状態を設定</summary>' +
        '<label class="action-toggle"><input type="checkbox" ' + (showActions ? 'checked' : '') + ' onchange="toggleShowActions()"> アクションを表示</label>' +
        '<label class="action-toggle"><input type="checkbox" ' + (showStates ? 'checked' : '') + ' onchange="toggleShowStates()"> 部品の状態を表示</label>' +
        (historySelection || resumeConfirmation ? '' : gateToggleHtml) + '</details>' +
        '<button data-focus-key="reset-session" onclick="requestReset()"' + (scenarioBusy ? ' disabled' : '') + '>初期状態から新しく試す…</button>' +
      '</section>' +
      '<div class="lower-section">' +
        stackSectionHtml +
        graphSectionHtml +
      '</div>' +
    '</main>' +
    gateDrawerHtml;

  restorePresentation(presentation);

  // マップ高さのツマミ調整（ResizeObserver）は innerHTML 差し替えのたびに要素が作り直される
  // ため、render() のたびに新しい要素へ張り直す。document.querySelector が無いテスト環境
  // （node:vm モック document）では何もしない。
  if (typeof document.querySelector === 'function') {
    const mapScrollEl = document.querySelector('.graph-map-scroll');
    if (mapScrollEl) attachGraphMapResizeObserver(mapScrollEl);
  }
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

render();
</script>
</body>
</html>`;
}
