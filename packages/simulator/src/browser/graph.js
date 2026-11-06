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
    '<div class="pane-desc">定義から得られる関係の静的な概観です。状態遷移図として読める一方、back・dismiss の戻り先や set による状態変更を含む、現在の試行の完全な実行経路ではありません。戻り先は操作と履歴、状態変更は状態表示、残存作業は「残っている作業」で確認します。</div>' +
    '<div class="pane-desc">遷移関係自体は閲覧専用です（ノードをクリックしても画面は遷移しません）。既定は現在の画面から近い範囲だけを表示し（近傍表示）、「全体を見る」で全ノードへ切替わります。現在の画面.本体に対応するノードを強調表示します。ノードにカーソルを合わせると詳細を表示し、クリックすると詳細を固定表示できます（variant を持つノードは、固定表示した詳細から分割 / 統合を切り替えられます）。</div>' +
    '<button class="graph-save-btn" onclick="saveGraphConfig()">設定を保存</button>' +
    '<label class="graph-scope-toggle"><input type="checkbox" ' + (graphShowAll ? 'checked' : '') +
      ' onchange="toggleGraphShowAll()"> 全体を見る</label>' +
    mapHtml +
  '</details>';
}
