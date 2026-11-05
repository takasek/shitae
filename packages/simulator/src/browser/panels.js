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
