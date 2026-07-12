---
name: spec-stress-test
description: Use when hardening shitae's SPEC.md before or after a change — adding/changing a constraint, introducing a construct, or when a section feels "complete but untested". Also for reviewing spec usability or when asked to stress-test / pressure-test the language.
---

# shitae SPEC stress-test

SPEC.md（唯一の正）の normative な記述は、散文として完結して見えても未定義動作と誤読誘発点を含む。3 系統を独立に走らせて検出する — 手法が違うので同じ穴に独立到達したものは確度が高い。

1. **手トレース + CLI 実測**（規則の穴）
2. **agent 実書きプローブ**（読者の躓き・表現力ギャップ）
3. **frame 意味論オラクル**（runtime を正解器にした予測課題）

正解器は 2 つ: `node packages/cli/dist/index.js check|mermaid|simulate`（要 `pnpm -r build`）と `packages/runtime` の `reduce`。**spec の字義と実測の食い違いはそれ自体が finding。**

成果物は `docs/stress-test/` に恒久保存（`cases/` 境界例・`probes/<product>/` プローブ・`oracle/` 予測と正解）。設計判断は `docs/adr/` に 1 判断 1 ADR。

## 高くつく教訓（先に読む）

- **subagent は session limit で途中死する**。委譲前に**検証可能な受け入れ基準を自分で確定**し（手トレース正解表など）、戻り後に一次資料で検収する。死んだら部分成果を検分して自分で引き取る。**コア/リスキーな書き換え（runtime 中核・example フィクスチャ）は自分でやる**。
- **`docs/examples/*.shitae` は統合テストのフィクスチャ**（parser/checker/cli/mermaid/xstate）。触ると `pnpm -r test` が割れる。「docs のみ」の変更はこの repo に存在しない。
- **SPEC へ転記する前に転記元（ADR・findings）の内部整合を別視点でレビュー**（源流の矛盾は転記で素通しされる）。
- **迷う設計判断は設計者に確認**。驚き最小で一意に決まるものは機械的に確定してよいが、原則（「専用記法を増やさない」等）と衝突する判断・新記法・不変条件への例外は設計者マター。
- **runtime の判断は ADR に残す**（根拠の記録なき実装判断が stress-test で露見した実例あり）。

## Phase 0: 準備

`git fetch origin`。**起点は「現行 SPEC を含む最新コミット」**（通常 `origin/main`、ただし前ラウンドが未 push でローカルが先行していることがある — `git log --oneline origin/main..HEAD` で差分を見て、現行 SPEC.md を持つ側を起点にする。判断がつかなければ設計者に確認）。`git switch -c spec-stress-test <起点>` → `pnpm -r build`。以降ブランチに直接コミット（Conventional Commits、常に green）。

**2 周目以降**（新構文が実装された後の再 stress-test）は、変わった/加わった構文に**焦点を絞ってよい**（全カテゴリを毎回やり直さない）。既存の `cases/` `probes/` `oracle/` は上書きせず並存させ、成果物ファイル名にはラウンドを識別できる接尾辞を付ける（`spec-review-<date>-r2.md` 等。同月・同日再実行での上書き事故を防ぐ）。同名プロダクトで再プローブするなら `probes/<product>-r2/` に分ける。

## Phase 1: 境界例の手トレース + CLI 実測

normative 制約ごとに境界カテゴリを機械的に列挙し具体例 `.shitae`（`cases/c*.shitae`）を作る → 手トレースで pass/error/未定義まで詰める → CLI 実測で突合。AST を見たいときは `parse(src)` を tsx で直呼び。

境界カテゴリ（shitae 語彙）:
- **shadow**: (行動文字列, 対象参照) 完全一致の判定単位（空白・quote・`?` の有無）× 3 階層
- **presence gate**: 対象の存在判定（alias 名 vs 実体名、inline 内、collection、別 component の variant）、nav-target への `?`
- **variant 参照**: 裸名 goto の誤読、未定義 variant への遷移、単一 variant component への `##` 指定
- **frame 木**: switch 兄弟規則の訪問順、exit 遠隔破棄、dismiss 無名 LIFO × 名前付き、同名 @S、goto の begin マーカー、barrier なし子の底の back
- **collection / alias / inline**: `*` の掛かり先、inline 入れ子、`.` 1 段制約との交差、対称参照 `*x`
- **quoted name**: エスケープ機構なしの帰結（`//` `->` `;` `"` を含む名）、正準値
- **import**: 循環、同名 alias 再定義、`::`/`.`/`##` 合成
- **result-list**: label の掛かり範囲・再出現、`;` と継続行、`->` 重複、逐次遷移
- **document common**: エントリとの交差、裸 `##variant`、前方参照
- **overlay**: show/hide の集合更新、frame 走査との独立性

記録は `docs/stress-test/spec-review-<date>.md`（❌矛盾 / ⚠️未定義 / 💭議論、実測サマリ表つき）。加えて SPEC 単体の内部整合を subagent（sonnet）1 体でレビューさせ `spec-internal-review.md` に。

## Phase 2: agent 実書きプローブ

spec だけを読ませた subagent を被験者に、CLI を正解器として採点する。

**プロトコル（固定）**:
- 被験者: general-purpose subagent、実験ごと独立コンテキスト。モデル勾配を測るなら 1 体を haiku に。
- 入力制限を prompt に明記: 「読んでよいのは `docs/SPEC.md` のみ。GLOSSARY・AI_GUIDE・examples・packages・.claude・docs/stress-test の参照禁止。CLI・テスト実行禁止」
- 課題: 実在アプリの画面フロー（音楽/送金/メッセンジャー/動画/語学/予約 等、各 stress 軸を分散）。
- 出力: `.shitae` + notes.md（参照節・曖昧点・確信度 高/中/低・**書けなくて諦めた表現／欲しかった記法** ← DSL 改善アイデアの主経路）。
- 採点（`probes/<product>/grading.md`）: CLI check/mermaid/simulate + 自分の SPEC 照合。**正誤だけでなく「どう正解したか」を読む** — 回避行動（表現を捨てて通す）や類推による正答は pass でも spec 欠陥の証拠。**複数被験者が独立に同じ回避に至ったら最強シグナル**。

## Phase 2b: frame 意味論オラクル

runtime `reduce` を正解器に、「遷移列 → 最終アクティブ画面・frame 木・警告」の予測課題を作る。正解は `reduce` を直呼びする mjs（`oracle/run-oracle.mjs` を踏襲）で確定。subagent に SPEC のみで予測させ確信度を自己申告させる — **確信度「高」で実装と乖離した設問が最も危険**（読者期待と実装の衝突）。「決められない」の申告は曖昧座標の正解報告。

## Phase 3: findings 集約 →【設計者レビューで停止】

全 findings を `docs/stress-test/findings-<date>.md` に統合分類し設計者に提示:
- **A** 実装が SPEC に未追随（黙って落ちる系 — 修正は実装側）。既存 ADR の決定に実装が違反している regression もここ（「A: regression」と印を付け、ADR 自体の再考が要るなら設計者へエスカレート）
- **B** SPEC の明示決定が要る未規定（驚き最小で決まるもの / 判断が要るもの を仕分け）
- **C** 表現力ギャップ（DSL 改善アイデア、後方互換不問）
- **D** 文書改善

spec 修正・新機能はここで承認を得てから Phase 4 へ。

## Phase 4: 承認済み修正の適用

判断を ADR 化（`docs/adr/NNNN-*.md`）→ SPEC 改訂（意味論 pass と小物 pass に分け、転記元整合レビューを挟む）→ 実装を TDD で追随（parser→runtime→simulator の順。frame 木のような中核は受け入れ基準を手トレースで先に確定）→ 良品プローブを `docs/examples/` に昇格し統合テストに追加 → `pnpm -r test` green。

## 完了条件

`pnpm -r test` green、findings が設計者に提示済み、承認分が SPEC + 実装 + ADR に反映済み。
