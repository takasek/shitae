// scope バッジの表示ラベル（有効範囲の明示。旧カテゴリ見出しの置き換え——Task 8 / ADR-0022 5）
const SCOPE_BADGE_LABELS = { variant: 'この状態で定義（variant固有）', component: '定義内の共通操作（component common）', document: '文書の共通操作（document common）' };
// scope バッジの title 属性（hover での一言説明。3種の見分けが初見では自明でないという
// 指摘への対応——UX round2 2-1、Task 18 受入基準c）
const SCOPE_BADGE_TITLES = {
  variant: 'この状態パターン（variant）で定義された操作。対象の存在判定は別に行います',
  component: 'この画面・部品の定義（component）の全状態パターンに共通する操作。対象の存在判定は別に行います',
  document: 'この文書の画面に共通する操作（document common）。上書きや対象の存在判定により有効性が変わります',
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
  return '<label class="gate-inline-setting" onclick="event.stopPropagation()">検討用の手動設定 <select class="gate-inline-select" aria-label="' + esc(component + ' の状態パターンを検討用に手動設定') + '" data-focus-key="' + esc(focusKey ?? ('gate:' + module + ':' + component)) + '" onclick="event.stopPropagation()" onchange="setInstanceVariant(' +
    esc(JSON.stringify(module)) + ', ' + esc(JSON.stringify(component)) + ', this.value)">' + options + '</select></label>';
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
  const offMark = gateOff ? '<span class="gate-off-mark">' + esc(inter.gate.targetComponent + '.' + inter.gate.name) + ' が参照先の状態パターンにないため無効（presence gate：画面上の可視性ではなく構造を判定）</span>' : '';
  const rowClass = 'action-row' + (gateOff ? ' action-row-disabled' : '');
  if (inter.choices.length === 0) {
    const onclickAttr = gateOff ? '' : ' onclick="' + renderedClick(item, 0, buildOnclick) + '"';
    return '<div class="' + rowClass + ' action-row-solo" data-focus-key="' + esc(focusKey) + '"' + (gateOff ? '' : ' role="button" tabindex="0" onkeydown="if(event.target === this && (event.key === &quot;Enter&quot; || event.key === &quot; &quot;)){event.preventDefault();this.click()}"') + onclickAttr + '>' +
      '<span class="action-text">' + esc(inter.actionText) + '</span>' + gateHtml + offMark + badge + '</div>' + operationDetails(inter);
  }
  const buttons = inter.choices.map((c, choiceIdx) =>
    '<button class="choice-chip" data-focus-key="' + esc(focusKey + ':' + c.id) + '" onclick="' + renderedClick(item, choiceIdx, buildOnclick) + '"' + (gateOff ? ' disabled' : '') + '>' +
    esc('[' + c.label + ']で実行') + '</button>'
  ).join('');
  return '<div class="' + rowClass + ' action-row-conditional"><span class="action-text">' + esc(inter.actionText) + '</span>' +
    gateHtml + offMark + badge + '<span class="action-choices" title="試すケースを選んで実行（condition label）。業務条件の自動判定ではありません">' + buttons + '</span></div>' + operationDetails(inter);
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
    els, items, buildOnclick, new Set([skey(entry.module, entry.component)]), cardIdx, [],
  );

  return renderScreenCard({
    title: (componentNameCounts.get(entry.component) > 1 ? entry.module + '::' : '') + entry.component,
    variant: v,
    stateHtml: rootStateLabel(view.data.state.inclusion.overlays[cardIdx]),
    elementsHtml,
    actionsHtml,
    badgeHtml: '<div class="overlay-badge">独立表示中（hide するまで残ります）</div>',
    extraClass: 'overlay-card',
  });
}
