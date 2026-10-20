# shitae

UI フロー記述言語 `shitae`（ラフに書けて、遷移が動く）の処理系（TypeScript + pnpm モノレポ）。

## 入口

- `docs/SPEC.md` — 言語仕様。**唯一の正**。迷ったらここ。
- `docs/GLOSSARY.md` — 概念語の正準名（variant / barrier / presence gate 等）と旧称の対応。
- `docs/AI_GUIDE.md` — 読み書き要約 + チェックリスト。`.shitae` を扱う前に読む。
- `docs/examples/*.shitae` — 検証済みサンプル。

### 作業別の skill

追跡済みの手順書。agent が skill として自動で読み込まない環境でも、該当する作業の前にファイルを開いて従う。実体は `.agents/skills/` に置き、`.claude/skills/` からは symlink で参照する。

- [`.agents/skills/shitae-authoring/SKILL.md`](.agents/skills/shitae-authoring/SKILL.md) — `.shitae` の読み書き・レビュー。AI_GUIDE を読む順序、手本の example、頻出ミスの自己点検を示す。
- [`.agents/skills/spec-stress-test/SKILL.md`](.agents/skills/spec-stress-test/SKILL.md) — `docs/SPEC.md` 自体の変更・検討・負荷試験。成果物の置き場所と ADR の残し方を示す。

## 開発の規律

- **TDD 厳守**: red → green → refactor。production コードは失敗するテストの後にのみ書く（config 除く）。テスト先行の証跡がないコミットは差し戻し。
- **Conventional Commits で小さく**: 1 コミット = 1 論理変更、常に green。
- フェーズ用ブランチで進める（例 `phase1-parser`）。main 直接は避ける。
- 安易な機能追加を避ける。shitae は「削って設計してきた」言語。迷う設計判断は設計者に確認する。
- `docs/examples/*.shitae` は parser 統合テスト（`packages/parser/test/integration.test.ts`）のフィクスチャを兼ねる。example を変えたら期待値を追随させ `pnpm -r test` で確認する（理由: docs-only のつもりの変更がテストを割る。「docs のみ」というスコープはこの repo に存在しない）。
- 設計書から SPEC 等へ転記する計画は、実行前に転記元自体の内部整合を別視点（subagent）でレビューする（理由: タスク別レビューは転記の忠実性しか担保せず、源流の矛盾を素通しする。2026-07-11 の exit 走査矛盾が実例 — 6 タスクのレビューを全通過し最終ブランチレビューで初検出）。
