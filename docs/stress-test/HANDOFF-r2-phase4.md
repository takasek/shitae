# 引き継ぎ — spec-stress-test r2 Phase 4 の残り実装

作成 2026-07-13、更新 2026-07-13（**残り1・残り2・残り3 すべて完了**）。ブランチ `spec-stress-test-r2`（HEAD = `1270257`）。作業ツリーはクリーン、`pnpm -r test` は全パッケージ green。

## 更新サマリ（2026-07-13 第3セッション）

- **残り2（simulator viewer 追随）完了**。commit `d8f0ccd`〜`1270257`（TDD・RGRごとに6コミット）。
  - overlay 表示variant・掲示中interaction操作可能化（A8）: `d8f0ccd`
  - singleton 共有レジストリのデータ抽出: `fbd488a`
  - singleton 共有レジストリのクライアント配線（displayVariant/resolveEntryVariant。switch resume でも明示 X##v の書換は効く）: `e881092`
  - document common の3階層shadow合流（A5。同名ボタン重複解消）: `bd3a608`
  - presence gate 構造的判定（host/member/indeterminate）データ抽出: `3ad4387`
  - presence gate のクライアント側フィルタ適用（A1）: `1270257`
  - **設計判断（Fable相談）**: presence gate の member 参照（`対象.要素?`）は「対象インスタンスの variant 追跡機構が無い」ため、ADR-0002 の always-on フォールバックを転用せず、`sharedVariants` レジストリ（デフォルト＝対象 component の initialVariant）で決定的に判定する方式を採用。手動トグル UI（ADR-0002 Consequence が言う「インスタンス variant の手動トグルで観測可能にする」）は本パスでは実装せず、**未着手のまま次回に持ち越し**（判定ロジック自体は完成、トグルは純UIとして後付け可能な設計）。
  - **検証**: 既存テストは HTML/JS 文字列への `toContain` 方式（jsdom 不在のため）。それに加えて `docs/examples/delivery.shitae` を実際に parse→`toSimulator`→`node:vm` で実行し、singleton 共有（2 回目の `present(クーポン)` が `##受取済` を共有レジストリから直接表示）と presence gate（`品目.在庫あり?` が初期姿次第でON/OFF）を実機動作で確認済み（再現手順は本ファイル末尾の「動作確認の再現手順」参照）。
- **残り1（runtime singleton）完了**（前セッション）。commit `08bdb3b`〜`709ee53` + ADR 追記 `e349aaa`。受け入れ基準1-3 と Fable 指摘（presence gate・seed・snapshot 不在・back 除外）を runtime.test.ts で全固定。設計者確定: `switch(X##v,@S)` は resume 経路でも共有 variant を書換（SPEC 301 優先。ADR-0011 に明記）。
- **残り3（examples 昇格）完了 = singleton showcase 新規作成**（前セッション）。commit `1d5fd45`。**handoff の 2 前提が調査で崩れた**ので方針変更した:
  - podcast の「mermaid quoted-name ノード ID 不一致バグ」は**再現しない**（ADR A4 canonical quoted name で解消済み。podcast/delivery とも診断ゼロ・dangling node なしを確認）。→ podcast のブロッカーは存在しない。
  - delivery-r2 プローブは `# クーポン`（通常 component）で **singleton を使っていなかった** → そのまま昇格しても r2 目玉を実演しない。
  - 対応: プローブ本体は証跡として不変のまま、`docs/examples/delivery.shitae` を**新規 curated example** として作り、クーポンを `#! クーポン` へ昇格。parser integration・checker clean-list のフィクスチャに追加済み。

## 次に着手する候補（本パスのスコープ外として残したもの）

- **presence gate の手動トグル UI**: `sharedVariants`（member gate のデフォルト解決にも流用）を simulator 画面上からユーザーが書き換えられる UI が無い。今は常に「対象 component の initialVariant」のまま固定 — ADR-0002 Consequence の「インスタンス variant の手動トグルで観測可能にする」を完全には満たさない。判定ロジックは完成しているので、追加は UI 層のみで閉じる想定。
- **document common のモジュール切替**: SPEC「実行時に有効な document common はアクティブフレームの最上段 component が定義されているファイルのもの」— 現状 simulator は常に entry モジュールの document common のみを見る（多モジュール時の切替は未実装。今回のスコープ外・pre-existing）。

## 動作確認の再現手順（jsdom 不在のため node:vm で実行）

```
pnpm --filter @shitae/parser build && pnpm --filter @shitae/simulator build
node -e "
const { parse } = require('/Users/m5/works/shitae/packages/parser/dist/index.js');
"
```
上記は ESM のため実際は `.mjs` で `import` を使う（本セッションでは `/tmp/gen_sim.mjs` に生成スクリプト、`/tmp/run_sim2.mjs` に singleton 共有の walkthrough、`/tmp/run_sim4.mjs` に presence gate off ケースを書いて確認した。いずれも `/tmp` 配下の使い捨てスクリプトで、リポジトリには残していない）。

## まず読む

- `docs/SPEC.md`（唯一の正。r2 改訂反映済み）
- `docs/adr/0007〜0012`（r2 の設計判断。特に **0011 singleton** と 0009 overlay）
- `docs/stress-test/findings-2026-07-r2.md`・`spec-review-2026-07-r2.md`（証拠）
- 本ファイル

## 完了済み（実コミット・file 検証済み。6da848d 以降が r2 実装）

| commit | 内容 |
|---|---|
| 6da848d | SPEC r2 小物 pass（ADR-0012） |
| 2d17cc8 | SPEC r2 意味論 pass（ADR 0007-0011） |
| 308442d | parser: singleton `#!` パース・E022（doc common 裸##）・E023（フレーム新規作成系 裸##） |
| bc51d6f | runtime: switch 兄弟規則の anchor 補正（ADR-0008）・overlay を Map<name,variant> 化 + `overlayVariant()`（ADR-0009） |
| a9489ba | parser: E024（overlay 引数 *）・E025（要素行末尾 ?）・E026（空対象 `行動()`）・W104（要素名 `[` 始まり） |
| acf55a0 | resolver: shadow 一致に collection(`*`) を含める（ADR-0010） |

parser の `#!` は AST に `Component.singleton: boolean` として乗る（`#!` ファイルは valid にパースされる）。

## 残り 1: runtime singleton 共有レジストリ（ADR-0011。最深部・要注意）— ✅ 完了（commit 08bdb3b〜709ee53, e349aaa）

**現状**: `packages/runtime/src/index.ts` に singleton の概念は無い（`grep singleton` → 0 件）。`#!` component もパース後は通常 component と同じ挙動。

**やること**（ADR-0011 + 整合レビュー I1-I3 が仕様）:
- runtime に **document 内の singleton 名の集合**と **共有 variant レジストリ**（component 名 → 現在 variant）を持たせる。`reduce(state, action)` は今 component メタを知らない → `initialState` に singleton 名集合を渡すか、`RuntimeState` に `singletons: Set<string>` と `sharedVariants: Map<string,string|null>` を追加。
- **参照は値でなくレジストリ参照**（I1-I3 の核。スナップショット禁止）: singleton がフレームスタックに積まれても、overlay 集合に載っても、variant は共有レジストリの現在値を映す。
  - `activeLocation` / `formatTree`: singleton フレームの variant は `sharedVariants.get(name)` を見る。
  - push/present/goto/switch で singleton に遷移: variant 省略時は共有現在値（初回は initial）、`##v` 指定・`goto(##v)` は**共有レジストリを書き換え**（全所在に即時反映）。
  - overlay（ADR-0009 と合流）: singleton の show は共有 variant を映す。ADR-0009 規則3「initial 上書き」は singleton に適用しない。
- 「戻り系は積まれた時点の variant」「新規作成は initial」は singleton には**適用しない**（SPEC「singleton component」節に明記済み）。

**受け入れ基準（先に手トレース正解表を作ってから実装）**:
1. `#! クーポン` を 2 箇所から present → 一方で `goto(##受取済)` → 他方を開くと `##受取済`（共有）。
2. singleton をタブ A に push、A で `goto(##v2)`、タブ B へ switch、A へ戻ると variant は v2（スナップショットでなく参照）。
3. singleton を `show` 中に `goto(##v)`（アクティブ画面が別 singleton フレーム）→ overlay 表示も追随。
- runtime は AST を直接受けないので、singleton 名集合をどこで注入するか（CLI/simulator が Document から `components.filter(c=>c.singleton)` で渡す）を先に設計。

**注意**: skill の教訓「コア/リスキーな書き換え（runtime 中核）は自分でやる」。subagent に丸投げしない。TDD で受け入れ基準を先に確定。

## 残り 2: simulator の viewer 追随（表示層。意味論オラクル runtime は完了済み）— 未着手・次にやる本体

`packages/simulator/src/simulator.ts`（ブラウザ側 JS 文字列）と `extract.ts`。r2 で未追随:
- **presence gate `?`**: 現状 gate 付き interaction を常時有効表示（`existsGated` を評価していない）。SPEC「操作は variant に属する」の構造的 presence 判定（実効 body に対象要素があるか）で有効/無効を切る。
- **3 階層 shadow**: 現状 variant×common の 2 階層のみ（`extract.ts` の `mergeInteractions`）。document common 階層を最外として合流させる（SPEC「document common」の shadow 拡張）。今は doc common を別枠「どの画面でも」帯に出すだけで component 側の同一(行動,対象)と照合しない。
- **overlay variant**: 帯表示が component 名のみ。runtime は Map 化済みなので、掲示 variant と interaction 操作可能化を追随。
- **singleton**: runtime 側は完了済み（`packages/runtime/src/index.ts` の `resolveLocation` / `overlayVariant` / `singletonNames(doc)` を参照）。simulator は Document から `singletonNames(doc)` を集めて `initialState(entry, singletons)` に渡し、共有 variant を表示に反映する配線が要る。`docs/examples/delivery.shitae`（`#! クーポン`）が手元の実例。

simulator はユニットテストが薄い（`extract.test.ts` のみ）。`docs/examples/*.shitae` 統合テストが load-bearing。

## 残り 3: 良品プローブの examples 昇格 — ✅ 完了（commit 1d5fd45。下記の当初計画は前提が崩れ、singleton showcase 新規作成に変更。冒頭「更新サマリ」参照）

- 候補: `docs/stress-test/probes/delivery-r2/delivery.shitae`（CLI check 診断ゼロ、overlay・出口固定慣用句・gate を正確運用）。podcast-r2 は quoted variant `"1.5x"` で **mermaid のノード ID 不一致バグ**を踏むため、昇格前に transpiler-mermaid の quoted-name sanitize 修正が要る（`spec-review-2026-07-r2.md` S 参照）。
- 昇格 = `docs/examples/` へ移し `packages/parser/test/integration.test.ts` 等の期待値を追随。`docs/examples/*.shitae` は parser/checker/cli/mermaid/xstate フィクスチャ。触ると `pnpm -r test` が割れる。

## 環境の落とし穴（今セッションで実害）

**harness が Edit の一部・全 git commit・inline テスト結果を断続的に捏造した**。存在しない 6 コミットを一度信じて進めた。対策として確立した検証法を必ず使う:
- テスト結果: `pnpm ... test > /tmp/x.txt 2>&1` → **Read /tmp/x.txt**。inline stdout は信用しない。
- 編集の着地: `grep -n ... src > /tmp/x 2>&1` → Read。
- コミット: `git log --oneline > /tmp/x 2>&1` → Read で HEAD 確認。「commit done」の inline 表示は信用しない。
- Bash の cwd が前コマンドの `cd` で移動している場合あり → **絶対パス**を使う。
