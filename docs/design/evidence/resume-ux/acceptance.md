# #28 受入記録（読込後のsingleton要約・共有HTMLのパス整理・skill導線）

処理系は `issue-28-resume-ux` の `5a7c370`（engine `278103a97da5…`、確認用モデルの modelId `3d086aa741aa…`）。確認用モデルは [model/](model/)（`main.shitae` と同名component `Cart` を持つ `shop/cart.shitae`、overlay `Menu` に singleton `Theme`、本文に `/Users/someone/notes.shitae` という文字列）。

## 検証の種類

| 種類 | 対象 | 結果 |
| --- | --- | --- |
| headless（vm） | `packages/simulator/test/load-summary.test.ts` 8件 | 実装前に8件とも要約のassertionで失敗し、実装後に通過。overlay群の欠落・module修飾の無視・重複排除の無効化を注入すると失敗する |
| CLI統合 | `packages/cli/test/portable-html.test.ts` 5件、`packages/simulator/test/portable-files.test.ts` 3件 | 実装前にHTML同一性・相対表示・非破壊の各テストが失敗し、実装後に通過。旧 `simulator.ts` に戻すと同じテストが失敗する |
| 実ブラウザ | 下記 | 手動確認とページ上の照会値の照合 |
| 文脈を共有しない担当 | 下記「skill導線」 | 新規 clone で入口の発見を確認 |

全体は `pnpm -r --no-bail test` で simulator 242件が通過・1件失敗、ほかの package は全件通過。`pnpm -r typecheck` は成功。失敗した1件は `simulator.test.ts` の「2 カラムレイアウト」で、本変更より前の PR #30 head（`67adf63`）でも同じassertionで失敗する既存の不具合。

## 1. 読込後のsingleton要約

「関係するsingleton」は、本体の包含木と掲示中の各overlayの包含木について、根がsingletonならその根、加えて子孫の component 要素のうち singleton のものを (module, component) で重複排除したもの。component名が複数のmoduleにあるときだけ `module::` を付ける。値は読込直後の Session query から一度だけ取り、次の操作・保存・次の読込開始で消える。5件以下は1行、6件以上は件数行と `<details data-state-key="load-singletons">` の一覧に分ける。

実ブラウザ（`build-browser-fixtures.mjs` で作ったHTMLを localhost で配信）での確認は次の通り。シナリオはファイル選択ダイアログを操作できないため、ページ内の `loadScenarioText` に取得したJSONを渡した。読込処理はファイル選択時と同じ `replaceScenario` を通る。

- 読込前に「部品の状態を表示」を実クリックでonにした。どの読込の後も `[showEvents, showActions, showStates]` は `[true, true, true]` のまま。
- `Detail` 画面のシナリオ: `読込地点の表示中の部品にsingletonはありません`。
- source を変えたモデルのシナリオ: `MODEL_MISMATCH` を表示し、要約は出ない。state・actions・history の照会結果は読込前と一致し、既存 Session が保持された。
- Buy→Menu のシナリオ（CLI側のloaderで別directoryから作成）: `読込地点のsingleton: 本体: main::Cart ##Full, shop/cart::Cart ##Full / overlay Menu: Theme ##Dark`。Session の `componentValues` の singleton 値（`main::Cart ##Full`、`main::Theme ##Dark`、`shop/cart::Cart ##Full`）と一致。画面は [browser-loaded-summary.jpg](browser-loaded-summary.jpg)。読込直後の `buildScenarioJson()` は読み込んだテキストと一致した。
- overlay の `Close` を実クリックすると通知と要約が消えた。

## 2. 共有HTMLのファイル情報

`MODEL.files` と `MODEL.metadata.manifest[].file` を、HTMLへ埋め込むコピーでだけ正準module IDの相対表示（`main.shitae`、`shop/cart.shitae`）に置き換える。CLIの `modulePaths` と `loadModel` の metadata は変更しない。

- `build-browser-fixtures.mjs` は同じモデルを `作業 A/` と `dir-B/` に置いてCLIで生成する。2つのHTMLはbyte単位で一致し、どちらのdirectoryの絶対パス（realpath形を含む）も含まない。本文の `/Users/someone/notes.shitae` はそのまま残る。
- CLI統合テストでは、同名basename（`screens/list` と `parts/list`）、symlinkで別名importした同一ファイル（1 moduleに集約）、日本語と空白を含むdirectoryも扱う。modelId・engineVersion・sourceBasis・各sourceSha256は `loadModel` の値と一致する。
- 往復: CLI側（`作業 A/`）で作ったシナリオを `dir-B/` のHTMLで読み込めた。実ブラウザで操作してから保存した [browser-saved.scenario.json](browser-saved.scenario.json) を `作業 A/` のモデルで `replayScenario` すると、export全体が保存物と一致した。CLIの `session --replay` も同じ保存物を受け付けた（revision 3）。

## 3. AGENTSから追跡済みskillへの導線

AGENTS.md の「作業別の skill」から `.claude/skills/shitae-authoring/SKILL.md` と `.claude/skills/spec-stress-test/SKILL.md` へリポジトリ相対でリンクした。リンク先はどちらも `git ls-files` に含まれる。

Codex は利用上限のため実行できなかった。代わりに、追跡済みファイルだけの新規 clone で、Skill ツールの使用を禁じた Claude subagent 2体に、どこを読むかを伏せた課題を与えた。

- 「ecommerce.shitae に画面を追加する」課題: AGENTS.md のリンクから shitae-authoring を開き、AI_GUIDE・手本・チェックリストの順に従う計画を立てた。spec-stress-test は対象外と判断した。
- 「言語仕様の制約追加を検討・負荷試験する」課題: AGENTS.md のリンクから spec-stress-test を主手順として開き、成果物を `docs/stress-test/` と `docs/adr/` に置く計画を立てた。

この方法には限界がある。ハーネスは subagent に skill 一覧を注入しており、authoring 側の担当は一覧に `shitae-authoring` が見えていたと報告した（無視して AGENTS.md 経由で読んだ）。完全に独立した文脈での発見としては扱わない。

両担当とも、`.claude/CLAUDE.md` と shitae-authoring が参照する `/shitae-check` がリポジトリに存在しないことを指摘した。authoring 側の担当は、`docs/check_refs.py` が実在しない旧パスを開くことも指摘した。どちらも本issueの範囲外として残す。
