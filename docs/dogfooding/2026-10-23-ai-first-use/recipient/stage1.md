# 初見AI受取側 stage1

## 初期知識と条件

shitaeを使った経験、記法やscenario形式の事前知識はない利用者として開始した。親から受け取ったのは対象checkout、固定HEAD、HTML・scenario・処理系版の3パスと評価手順だけで、作者の会話・brief・report・操作ログ・補助scriptは見ていない。環境のAGENTS指示とスキル一覧にはshitaeがUIフロー記述言語であること、SPECが正準であることの説明が含まれていたため、完全な無知ではない。既存記憶にshitae関連の履歴が注入されているが、この評価の根拠には利用していない。

対象checkoutは `/Users/m5/.codex/worktrees/issue-69-reevaluation/shitae`。`git rev-parse HEAD` は `85f502b69ba66c5629c24524ff74aaa76ee3d196` を返した。固定された受取評価として扱い、fetch・ブランチ判断・元モデルの読取はしていない。受領 `author/shitae-revision.txt:1` は `1eed5fb0330d8c61206ab8632de8ee1e5085044e` であり、評価checkoutと生成処理系の版は別に記録されている。

## 最初に説明できたこと

これは科学館の見学予約に関するUIフローの操作記録と読める。施設一覧から詳細を開き、現地案内からオンライン案内へ切り替え、確認をいったん閉じ、再度開いた現地案内から予約状態を変更している。その後、確定通知を閉じ、一覧に戻って詳細を開き直している。これを「予約確認の再入場でどの案内になるか」と「予約後に一覧往復して状態が残るか」の検討だったと推測するが、作者の明示した問いではない。根拠は `author/v2/visit.scenario.json:712` 以降のtimelineと、同ファイルfinal内の「科学館の見学案内」「科学館の見学予約がある」の文字列。

保存時点の現在地は施設詳細、スタックは施設一覧→施設詳細、共有の予約状態は予約済、表示中overlayは空、testVariantsも空である。cursorはstep 9 / observation 0。施設詳細には予約済という共有状態を含む構造が記録されている。これはJSONに保存された最終状態の読取りであり、HTML再生で観測した結果ではない。根拠は `author/v2/visit.scenario.json:434`、`:475`、`:476`、`:486`、`:594`、`:989`。

## 読み取った経路

| step | 記録から読めたこと | 根拠（同scenario） |
| --- | --- | --- |
| 0 | 施設一覧から起動 | :712 |
| 1 | 施設詳細へpush | :736 |
| 2 | 予約確認 / 現地案内をpresent | :760 |
| 3 | 予約確認 / オンライン案内へgoto | :784 |
| 4 | 施設詳細へexit | :808 |
| 5 | 予約確認 / 現地案内を再度present | :832 |
| 6 | 予約状態をsetし、施設詳細へexitし、確定通知をshow | :856、:880、:904 |
| 7 | 確定通知をhide | :928 |
| 8 | 施設一覧へback | :952 |
| 9 | 施設詳細を再度push | :976 |

全9コマンドのbranchはnullで、コマンドに明示的な条件分岐の選択は見当たらなかった。step 3の状態切替とstep 4/5の閉じる・開き直す経路は分かるが、どのラベルのボタンを押したかはstepsのoperation識別子だけでは直接分からない。全9ステップのoutput.effectsとdiagnosticsは空。これは業務要件を満たした、または予約サービスで予約が成立したという証明にはならない。README:5はデータ値や業務条件式を計算しないと説明している。

## 不明点と追加情報が必要な点

- 作者が何を合格条件としていたか、どの開始状態・期待結果・不変条件を置いたかは、この3ファイルから明示的には読み取れていない。上記の目的は経路からの推測に留める。README:109では問い・開始状態・期待結果・不変条件を引継ぎに含めると案内されている。
- オンライン案内へ切り替えてから閉じた理由、開き直したときに現地案内になることが期待どおりか、オンライン案内で予約を完了する経路も評価対象かは不明。
- HTMLが実際にscenarioと対応し、全9ステップを再生できるか、現在地・共有状態・通知が画面でどう読めるかは未検証。scenarioのdigest等を処理系で検証したわけではない。
- 自分で公開CLIを用いて再生・継続する次段階には、元 `.shitae`、全参照module、隣接simconfigがあればその追加提供が必要。初期推測を固める前に元モデルは読んでいない。README:103には編集・再生成時の配布物が説明されている。

## ブラウザー試行と制約

1. `cua.createBrowserTab("iab", "file:///Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.html", { visible: true })` は失敗し、`IAB visibility is not supported in a subagent thread` を返した。
2. 同じ新規タブAPIで `visible: false` に訂正したところ、次の拒否を返した。

> Browser Use rejected this action due to browser security policy. Reason: The browser URL policy blocks this action. Browser use could not acquire authority to trigger network egress. The URL policy gate did not grant access. The requested URL protocol is not allowed. Allowed protocols: "http:", "https:". The agent must not attempt to achieve the same outcome via workaround, indirect execution, raw CDP or browser commands, alternate browser surfaces, or policy circumvention. Proceed only with a materially safer alternative that does not require this blocked browser action; if none exists, stop and request user input.

ブラウザーでHTMLを表示できたという証拠はない。他者のタブの取得・操作、Session内部注入、別surfaceの操作、HTTP配信への切替は行っていない。後から親にlocalhost経路が手順に含まれると連絡されたが、既に出た回避禁止文言を踏まえて実施しなかった。

## 実際に読んだ資料

- `docs/dogfooding/2026-10-23-end-to-end/author/shitae-revision.txt` 全1行。
- `docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json` 全体をJSONとして読み、stepsとfinalを抽出して表示。冒頭1–160行と末尾800–996行は本文として読んだ。
- `docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.html` 1–100行だけ。titleとCSSを見た段階でブラウザー表示へ進んだ。埋込モデル・runtimeのロジックは調査していない。
- `README.md` 全体（1–240行を要求、実ファイルはその範囲内）。リンク先は開いていない。過去評価へのリンクは表示されたが遷移していない。
- `/Users/m5/.codex/guides/pfdsl-and-worktree.md` 全体。環境指示により読んだ作業手順であり、製品評価の根拠ではない。リンク先は開いていない。

## コマンド記録

すべて対象checkoutをworkdirに指定。以下のshellコマンドはすべて終了コード0。

1. `git rev-parse HEAD` — 固定HEAD一致。
2. `wc -l docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.html docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json docs/dogfooding/2026-10-23-end-to-end/author/shitae-revision.txt` — 3499 / 996 / 1行。
3. `cat /Users/m5/.codex/guides/pfdsl-and-worktree.md` — worktree手順の読取。
4. 同じshell呼出しで `cat docs/dogfooding/2026-10-23-end-to-end/author/shitae-revision.txt`、`sed -n '1,160p' docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json`、`sed -n '1,100p' docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.html` を改行で実行。
5. 同じshell呼出しで `sed -n '1,240p' README.md`、`sed -n '800,996p' docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json` を改行で実行。
6. `python3` のstdin scriptで標準ライブラリjson/pathlibを用いscenarioのみをread_text/json.loads。top-level keys、各stepのstep/command/output、steps/model以外の全top-level値（finalを含む）を表示。ファイル変更なし。
7. scenarioに対して `rg -n` でfinal、sharedVariants、testVariants、施設詳細、予約済、空overlays、label、cursor、null branch、空diagnosticsの行番号を取得。READMEに対して同様に共有・分岐・引継ぎ・条件式・sessionの行番号を取得。
8. `python3` のstdin scriptでこの `stage1.md` だけを新規作成（既存ファイルがあれば拒否するガード付き）。

この記録を保存した時点でstage1を終了する。継続操作・再保存・設計変更の評価は未実施。
