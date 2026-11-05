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
    '<summary class="pane-title" title="外部イベントを発生させる — この文書の画面に共通する操作（document common）。対象の存在判定や上書きにより有効性は変わります。プッシュ通知やセッション切れなど、稀に起こる外的要因を模す">外部イベントを発生させる</summary>' +
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
    '<button class="gate-drawer-toggle" onclick="toggleGatePanel()">参照先の状態パターンを手動で変える（presence gate の試験）</button>' +
    '<p class="gate-panel-desc">参照先の状態パターン（variant）を検討用に設定します。下書きに書いた操作の実行とは別です。presence gate（?）は参照先に対象要素があるかを判定し、画面上の可視性は判定しません。</p>' +
  '</div>';
  const gateDrawerHtml = gatePanelOpen
    ? '<div class="gate-drawer-backdrop" onclick="toggleGatePanel()"></div>' +
      '<div class="gate-drawer">' +
        '<div class="gate-drawer-header">' +
          '<span class="pane-title">参照先の状態パターンを手動で変える（presence gate の試験）</span>' +
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
        '<p class="pane-desc">操作して、表示・戻り先・状態の残り方を確かめるUIフローの下書きです。商品や入力内容は模式表示です。</p>' +
        '<details data-state-key="concept-guide"><summary>下書き・残り方・試し方を理解する</summary>' +
        '<h3>下書きを書く</h3><p>画面・部品の定義（component）に、状態パターン（variant）ごとの表示内容と操作を書きます。画面と部品は同じ定義単位です。</p>' +
        '<h3>動かしたときの残り方を決める</h3><p>作業のまとまり（session）は内側の作業と一緒に終了します。状態を共有する部品（singleton）と、画面とは独立して残る表示（overlay）は別に残ります。共有は同じ実行内で、永続保存ではありません。</p>' +
        '<h3>設計を確かめる</h3><p>分岐の目印（condition label）は試すケースを人が選びます。成功・失敗を自動判定しません。対象の存在判定（presence gate）は、参照先の状態パターンに対象要素があるかを処理系が調べます。</p><p>状態の手動設定は検討用の試験です。履歴を見るだけでは操作位置は変わらず、そこから続けるには別の確認が必要です。</p></details>' +
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
        renderRemainingWork() +
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
