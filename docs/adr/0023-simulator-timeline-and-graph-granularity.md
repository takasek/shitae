# ADR-0023: simulator の統合タイムラインと遷移マップ粒度設定

- Status: accepted（2026-07-19、設計者確定）
- 出典: ADR-0022 の観測 UI に対する設計者フィードバック第 3 弾。本 ADR は ADR-0022 の「確定判断 1〜3」の一部（トレースログ/イベントログの分離と巻き戻し規則）を supersede する

## 1. トレースログとイベントログは単一タイムラインへ統合

遷移イベントと出力イベント（効果・set/show/hide・警告）を時系列 1 本の統合ログ（timeline）で扱う。イベント行はトグルで表示/非表示できる（ノイズ対策。遷移行は常時表示）。

- 理由: 巻き戻しで「トレースだけ戻りイベントログが残る」のは実行記録として不整合。統合すれば巻き戻しがログ全体で一貫する
- 全エントリ（イベント含む）が適用後スナップショット { stack, sharedVariants, overlays } を持つ。set/show/hide は状態を変えるためイベントでも巻き戻し先になる — ADR-0022 時代の「trace 末尾スナップショット陳腐化」問題はこれで根治

## 2. 巻き戻しはゴースト保持（cursor 方式）

タイムラインのエントリクリックで状態を復元しても、未来のエントリは削除せず半透明（ghost）で保持する。現在位置は cursor で管理し視覚的に明示する。ghost エントリもクリック可能で時間軸を前後に行き来できる（undo/redo）。新しい操作で実際に追記が起きた瞬間に ghost を破棄して新履歴を積む。

- 理由: 「戻るポイントをクリックしながら模索する」「過去のイベント時点の状態を確認する」という探索的な使い方を成立させる。即時 truncate では巻き戻しが破壊的すぎる
- 「末尾が常に現在地」不変条件は「cursor 位置のエントリ＝現在地」に一般化された

## 3. 遷移マップのノード粒度は可変（component 統合 ↔ variant 分割）

ノード粒度には本質的な任意性がある（設計者指摘: variant で分けたいこともあり、component 内 component まで考えると粒度は非自明）。第一歩として component ごとに「統合（1 ノード）」↔「variant 分割（姿ごとのノード）」をマップのノードメニューで切り替えられるようにする。

- extract は最細粒度（from/to とも variant 付き）のエッジを出し、ブラウザ側が粒度設定に応じて集約する
- 分割時のエッジ規則: to の variant 省略は初期姿ノードへ、component common 由来（from の variant なし）は全 variant ノードから
- component 内 component の粒度問題は将来課題

## 4. 粒度設定は兄弟 config ファイルへ永続化

設定は entry の .shitae の兄弟 `<basename>.simconfig.json` に記録する。形式:

```json
{ "graph": { "split": [ { "module": "main", "component": "プレイヤー" } ] } }
```

- CLI `simulate` が生成時に読んで初期反映する（不正 JSON は警告して無視）
- ブラウザからの保存は File System Access API（初回のみ保存ダイアログ、以後ワンクリック上書き）。非対応ブラウザはダウンロード fallback
- 理由: 生成 HTML は self-contained な静的ファイルでありブラウザから兄弟ファイルを直接書けない。FS Access API が「記録され、シミュレータに反映される」体験に最も近い

## Consequences

- simulator.shitae（仕様スケッチ）はトレースログ/イベントログ 2 ブロックを統合ログへ改稿済み
- ADR-0022 の「確定判断 1」のうち back の trace 追記化は有効なまま。「確定判断 2」の巻き戻し規則（truncate）は本 ADR の ghost 方式へ置き換え
- .simconfig.json は shitae 言語仕様の外側（ツール設定）であり SPEC.md には載せない
