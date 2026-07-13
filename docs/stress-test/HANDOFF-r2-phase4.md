# 引き継ぎ — spec-stress-test r2 Phase 4 の残り実装

作成 2026-07-13。ブランチ `spec-stress-test-r2`（HEAD = `acf55a0`）。作業ツリーはクリーン、`pnpm -r test` は全 8 パッケージ green。

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

## 残り 1: runtime singleton 共有レジストリ（ADR-0011。最深部・要注意）

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

## 残り 2: simulator の viewer 追随（表示層。意味論オラクル runtime は完了済み）

`packages/simulator/src/simulator.ts`（ブラウザ側 JS 文字列）と `extract.ts`。r2 で未追随:
- **presence gate `?`**: 現状 gate 付き interaction を常時有効表示（`existsGated` を評価していない）。SPEC「操作は variant に属する」の構造的 presence 判定（実効 body に対象要素があるか）で有効/無効を切る。
- **3 階層 shadow**: 現状 variant×common の 2 階層のみ（`extract.ts` の `mergeInteractions`）。document common 階層を最外として合流させる（SPEC「document common」の shadow 拡張）。今は doc common を別枠「どの画面でも」帯に出すだけで component 側の同一(行動,対象)と照合しない。
- **overlay variant**: 帯表示が component 名のみ。runtime は Map 化済みなので、掲示 variant と interaction 操作可能化を追随。
- singleton: runtime 完了後、共有 variant を simulator にも反映。

simulator はユニットテストが薄い（`extract.test.ts` のみ）。`docs/examples/*.shitae` 統合テストが load-bearing。

## 残り 3: 良品プローブの examples 昇格

- 候補: `docs/stress-test/probes/delivery-r2/delivery.shitae`（CLI check 診断ゼロ、overlay・出口固定慣用句・gate を正確運用）。podcast-r2 は quoted variant `"1.5x"` で **mermaid のノード ID 不一致バグ**を踏むため、昇格前に transpiler-mermaid の quoted-name sanitize 修正が要る（`spec-review-2026-07-r2.md` S 参照）。
- 昇格 = `docs/examples/` へ移し `packages/parser/test/integration.test.ts` 等の期待値を追随。`docs/examples/*.shitae` は parser/checker/cli/mermaid/xstate フィクスチャ。触ると `pnpm -r test` が割れる。

## 環境の落とし穴（今セッションで実害）

**harness が Edit の一部・全 git commit・inline テスト結果を断続的に捏造した**。存在しない 6 コミットを一度信じて進めた。対策として確立した検証法を必ず使う:
- テスト結果: `pnpm ... test > /tmp/x.txt 2>&1` → **Read /tmp/x.txt**。inline stdout は信用しない。
- 編集の着地: `grep -n ... src > /tmp/x 2>&1` → Read。
- コミット: `git log --oneline > /tmp/x 2>&1` → Read で HEAD 確認。「commit done」の inline 表示は信用しない。
- Bash の cwd が前コマンドの `cd` で移動している場合あり → **絶対パス**を使う。
