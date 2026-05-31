# shitae

UI ラフスケッチ記述言語 `shitae` の処理系（TypeScript + pnpm モノレポ）。

## 入口

- `docs/SPEC.md` — 言語仕様。**唯一の正**。迷ったらここ。
- `docs/AI_GUIDE.md` — 読み書き要約 + チェックリスト。`.shitae` を扱う前に読む。
- `docs/example-*.shitae` — 検証済みサンプル。
- `.shitae` の読み書き・レビューは `shitae-authoring` スキル、検証は `/shitae-check`。

## 開発の規律

- **TDD 厳守**: red → green → refactor。production コードは失敗するテストの後にのみ書く（config 除く）。テスト先行の証跡がないコミットは差し戻し。
- **Conventional Commits で小さく**: 1 コミット = 1 論理変更、常に green。
- フェーズ用ブランチで進める（例 `phase1-parser`）。main 直接は避ける。
- 安易な機能追加を避ける。shitae は「削って設計してきた」言語。迷う設計判断は設計者に確認する。
