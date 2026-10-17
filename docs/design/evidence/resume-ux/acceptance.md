# #28 受入記録（読込後のsingleton要約・共有HTMLのパス整理・skill導線）

処理系は `issue-28-resume-ux` の `f890695`（engine `278103a97da5…`）。確認用モデルは [model/](model/) で modelId は `057c73d66ca0…`。構成は次の通り。

- `main.shitae` と、同名component `Cart` を持つ `shop/cart.shitae`。
- overlay `Menu` に singleton `Theme`。
- `Detail` 画面には `Theme` を参照するmember gate `Dim(Theme.d?)` と、本文の文字列 `/Users/someone/notes.shitae`。
- singletonと関係しない `Plain` 画面。

## 検証の種類

| 種類 | 対象 | 結果 |
| --- | --- | --- |
| headless（vm） | `packages/simulator/test/load-summary.test.ts` 13件 | 各機能・修正の前に要約のassertionで失敗し、実装後に通過。overlay群の欠落・module修飾の無視・重複排除の無効化を注入すると失敗する |
| CLI統合 | `packages/cli/test/portable-html.test.ts` 6件、`packages/simulator/test/portable-files.test.ts` 3件 | 実装前にHTML同一性・相対表示・非破壊の各テストが失敗し、実装後に通過。旧 `simulator.ts` に戻すと同じテストが失敗する。禁止されたHTML全文置換の実装を一時的に入れると、自分のdirectoryを本文に書いたモデルの検査が失敗する |
| 実ブラウザ | 下記 | 手動確認とページ上の照会値の照合 |
| 文脈を共有しない担当 | 下記「skill導線」 | 新規 clone で入口の発見を確認 |

全体は `pnpm -r --no-bail test` で simulator 247件が通過・1件失敗、ほかの package は全件通過。`pnpm -r typecheck` は成功。失敗した1件は `simulator.test.ts` の「2 カラムレイアウト」で、本変更より前の PR #30 head（`67adf63`）でも同じassertionで失敗する既存の不具合。

## 1. 読込後のsingleton要約

「関係するsingleton」は、本体と掲示中の各overlayについて、次の2つを (module, component) で重複排除したもの。

- 包含木に出るsingleton。根がsingletonならその根、加えて子孫の component 要素のうち singleton のもの。
- その根に配置された操作のmember gateが参照するsingleton。操作できるかどうかを左右するため含める。

component名が複数のmoduleにあるときだけ、項目とoverlayの見出しに `module::` を付ける。値は読込直後に、差替え前の再生済み Session の query から一度だけ取る。要約は次の操作・保存・次の読込開始で消える。5件以下は1行で示し、6件以上は件数行と `<details data-state-key="load-singletons">` の一覧に分ける。件数は本体・overlayのグループごとに数えるので、両方に出る同じsingletonは2件と数える。

### 実ブラウザでの確認

`build-browser-fixtures.mjs` で作ったHTMLを localhost で配信した。ファイル選択ダイアログは操作できないため、ページ内の `loadScenarioText` に取得したJSONを渡した。読込処理はファイル選択時と同じ `replaceScenario` を通る。

- 読込前に「部品の状態を表示」を実クリックでonにした。どの読込の後も `[showEvents, showActions, showStates]` は `[true, true, true]` のまま。
- `Plain` 画面のシナリオ: `読込地点の画面と操作条件に関係するsingletonはありません`。
- `Detail` 画面のシナリオ: `読込地点のsingleton: 本体: Theme ##Light`。包含木にない `Theme` が gate の参照先として出る。
- source を変えたモデルのシナリオ: `MODEL_MISMATCH` を表示し、要約は出ない。state・actions・history の照会結果は読込前と一致し、既存 Session が保持された。
- Buy→Menu のシナリオ（CLI側のloaderで別directoryから作成）: `読込地点のsingleton: 本体: main::Cart ##Full, shop/cart::Cart ##Full / overlay Menu: Theme ##Dark`。Session の singleton 値（`main::Cart ##Full`、`main::Theme ##Dark`、`shop/cart::Cart ##Full`）と一致した。画面は [browser-loaded-summary.jpg](browser-loaded-summary.jpg)。読込直後の `buildScenarioJson()` は読み込んだテキストと一致した。
- overlay の `Close` を実クリックすると、通知と要約が消えた。

6件以上の件数行と一覧は headless でだけ確認し、実ブラウザでは確認していない。

## 2. 共有HTMLのファイル情報

`MODEL.files` と `MODEL.metadata.manifest[].file` は、HTMLへ埋め込むコピーでだけ正準module IDの相対表示に置き換える（例: `main.shitae`、`shop/cart.shitae`）。CLIの `modulePaths` と `loadModel` の metadata は変更しない。

- `build-browser-fixtures.mjs` は同じモデルを `作業 A/` と `dir-B/` に置き、CLIでHTMLを生成する。2つのHTMLはbyte単位で一致した。どちらにも両directoryの絶対パス（realpath形を含む）は含まれない。本文の `/Users/someone/notes.shitae` はそのまま残る。
- CLI統合テストは次の場合も扱う。どの場合も modelId・engineVersion・sourceBasis・各sourceSha256 は `loadModel` の値と一致する。
  - 同名basename（`screens/list` と `parts/list`）。
  - symlinkで別名importした同一ファイル（1 moduleに集約）。
  - 日本語と空白を含むdirectory。
  - 自分の絶対directoryを本文に書いたモデル。本文の文字列は残し、ファイル情報からだけ除く。
- 往復は両方向で確認した。
  - CLI→GUI: CLI側（`作業 A/`）で作ったシナリオを、`dir-B/` のHTMLで読み込めた。
  - GUI→CLI: 実ブラウザで操作してから保存した [browser-saved.scenario.json](browser-saved.scenario.json) を、`作業 A/` のモデルで `replayScenario` すると export 全体が保存物と一致した。CLIの `session --replay` も同じ保存物を受け付けた（revision 3）。

## 3. AGENTSから追跡済みskillへの導線

AGENTS.md の「作業別の skill」から、`.claude/skills/shitae-authoring/SKILL.md` と `.claude/skills/spec-stress-test/SKILL.md` へリポジトリ相対でリンクした。リンク先はどちらも `git ls-files` に含まれる。

Codex は利用上限のため実行できなかった。代わりに、追跡済みファイルだけの新規 clone で Claude subagent 2体に課題を与えた。どちらも Skill ツールの使用を禁じ、どこを読むかは伏せた。

- 「ecommerce.shitae に画面を追加する」課題: AGENTS.md のリンクから shitae-authoring を開いた。AI_GUIDE・手本・チェックリストの順に従う計画を立て、spec-stress-test は対象外と判断した。
- 「言語仕様の制約追加を検討・負荷試験する」課題: AGENTS.md のリンクから spec-stress-test を主手順として開いた。成果物を `docs/stress-test/` と `docs/adr/` に置く計画を立てた。

この方法には限界がある。ハーネスは subagent に skill 一覧を注入しており、authoring 側の担当は一覧に `shitae-authoring` が見えていたと報告した（それは無視し、AGENTS.md 経由で読んだ）。このため完全に独立した文脈での発見としては扱わない。

範囲外として残すもの:

- 両担当とも、`.claude/CLAUDE.md` と shitae-authoring が参照する `/shitae-check` がリポジトリに存在しないことを指摘した。
- authoring 側の担当は、`docs/check_refs.py` が実在しない旧パスを開くことも指摘した。

## 独立レビュー

別コンテキストのレビューで6件の指摘を受けた。

| 指摘 | 内容 | 対応 |
| --- | --- | --- |
| F1 | gate の参照先 singleton が要約から漏れ、「ありません」と表示される | 要約に含めた。空の場合の文言も変更 |
| F2 | HTML全文置換の実装でもテストが通ってしまう | 検査を追加 |
| F3 | Session 非変更の検査が要約計算を通っていない | GUI外の再生との比較に置き換え |
| F4 | 本体とoverlayに同じsingletonがあると2件と数える | グループ別の表示として意図どおり。上記の定義に明記 |
| F5 | 要約計算の失敗時に Session が差し替わり得る | 差替え前に計算 |
| F6 | overlay見出しがmoduleで修飾されない | 修飾した |
