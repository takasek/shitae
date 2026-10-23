# AI引継ぎの独立評価（CLI限定、2026-10-23）

提供された目的・問いと3成果物だけから検討内容・保存地点・選択経路を読み取り、元scenarioを公開CLIで再生して、自分で選んだ6操作を続けて保存できた。その保存物を別processで再生し、再exportのJSON全体とファイルbytesの双方が一致した。この固定1件・有限経路について、別AIが検討を継続できるという肯定的な観察を得た。汎用的なAI引継ぎ成功率・他モデル・GUIの成功は示さない（comparison.json、session-a.responses.jsonl、session-b.responses.jsonl）。

## 事前の情報と独立性

目的・問いは最初から提示されていた。会議用プロジェクター1件について、仮の受取方法の取消、ロッカーの初期値、確定後の一覧/詳細往復の保持が対象。同じ実行内の状態であり、実在庫・通信・永続DBは対象外。処理系は固定HEAD 3e4175b827477ed4fee8bdcd55f9c8eaef4af2ba、既build済みCLIを使用した。固定版のためfetch・checkout変更・buildは行っていない。

実行前の読取・期待・独自の続行候補は before-replay.md に先に記録した。親の会話や結論を継承しないbriefで開始し、作者report・期待・操作ログ・補助script、他評価report/evidenceを読んでいない。注入memoryは根拠に使っていない。親から後に届いたHTML名・製品版同一という補足は入力を変更するものではなく、独自操作の指定もなかった。履歴観測と新規継続を区別する補足は受けたが、その区別と観測照会は既に開始していた。

shitae-authoring を適用した。今回必要な記法・公開CLIは公開ガイドで足りたためSPECの本文は参照していない。最初の複数文書結合読取は表示が途中省略されたため、全てを精読したとは扱わない。必要なJSONL操作とreplay節は改めて絞って読んだ。

## 読取から分かったこと

モデルは通常component「貸出確認」のvariantを仮選択に使い、singleton「依頼状況」を確定状態に使う。取消はexitだけ、確定はset→exitである（author/v2/equipment.shitae:15、:19、:23、:25）。一覧と詳細の両方に依頼状況を置く（同:4、:9）。新規確認の最初のvariantはロッカー（同:16）。

confirmed.scenario.json の8操作は、詳細→確認ロッカー→窓口→取消→新規確認ロッカー→ロッカー確定→一覧→詳細。最終は備品詳細、依頼状況=ロッカー依頼済、origin=dsl、確認sessionはない。条件ラベルのbranchは全てnullであり、窓口/ロッカーは操作による選択である。単に最終画面だけを見てこの経路を推測せず、保存されたsteps・timelineを読んだ。

初期の迷いは、取消直後の未依頼を元ファイルのdigestだけで断定できるかだった。最終stateしか全文ではないため、公開replayで得るhistory/observationを調べる方針を採った。追加質問は不要。確定済みでも依頼を再度開けるが、二重依頼禁止や既存依頼編集という要件は与えられていないため追加しなかった。

## 実行前期待と観測

公開プロトコルのquery/dispatch/exportScenarioだけを使用。自作client.pyはJSONL転送・idを保持したファイル記録・scenario部だけの一時ファイル経由保存を行う。状態判定・操作選択・handle選択・分岐の自動決定は持たない。操作後はactionsを再照会し、その応答にあるhandleを自分で選んで送った。状態を変えない観測queryの後に、直前に得た有効handleでdispatchした場合もある。requestとresponseの対応は保存したidで確認した。

|対象|操作前の期待|観測と証拠|
|---|---|---|
|元記録の再生|8操作後の詳細・ロッカー依頼済へ戻る|a1でrevision=8、詳細、singleton=ロッカー依頼済/dsl、history10件、nextAfter=null（session-a.responses.jsonl:1）|
|元記録の取消直後|窓口仮選択を捨て、詳細で未依頼|a1のhistoryからid=5を選んでa2で照会。詳細、frame1個、依頼状況=未依頼/initial、表示「貸出依頼はまだない」（同:2）|
|元記録の新規確認|ロッカー初期値、まだ未依頼|a1のhistoryからid=6を選びa3で照会。貸出確認/ロッカー、依頼状況=未依頼/initial（同:3）|
|独自継続1:再確認を開く|ロッカーで開く|a4のdispatch後に貸出確認/ロッカー、a5で新handleを取得（同:4–5）|
|独自継続2:窓口を選ぶ|確認の仮選択だけ窓口になる|a6で貸出確認/窓口、changed=frames、a7で新handle取得（同:6–7）|
|独自継続3:取り消す|詳細へ戻り、確定済みロッカー依頼を消さない|a8→a9で詳細、確認frameなし、ロッカー依頼済/dslと表示文を保持（同:8–9）|
|独自継続4:一覧へ戻る|一覧にも確定依頼が残る|a10→a11で一覧、ロッカー依頼済/dsl、表示文保持（同:10–11）|
|独自継続5:詳細を開く|再び詳細でも保持|a12→a13で詳細、ロッカー依頼済/dsl、表示文保持（同:12–13）|
|独自継続6:確認を再び開く|前の窓口仮選択は復活せずロッカー|a14→a15で確認/ロッカー、origin=initial。確定依頼はロッカー依頼済/dslのまま（同:14–15）|
|独自継続を保存|元8+新規6の14操作をexportできる|a16成功、session-a.scenario.jsonを保存（同:16、comparison.json）|
|さらに別processで再生|14操作の保存状態を再現し再export全体が一致|b1でrevision=14、確認/ロッカー、新Sessionのhandle。b2で再export。session-b.scenario.jsonはJSON全体・bytes双方一致（session-b.responses.jsonl:1–2、comparison.json）|

元記録中の未依頼段階の取消と再確認は、今回の新規dispatchとして再探索したのではなく、元8操作のreplayが生成した過去観測を読取専用queryで確認した。確定済みの保存地点から続けた新規6操作は別の検討であり、両者を混ぜて今回の継続だけで全問を実証したとはしない。

## 得られた設計上の判断と限界

問いの有限経路では、仮選択は確認作業の寿命に従って捨て、確定状態はsingletonへ書く構成で要求された差を表せている。取消で未依頼を維持する元経路と、取消で既存確定依頼を維持する今回の続きの両方を観測できた。確定状態は一覧/詳細の包含表示にも反映する。一方で確認画面自体には既存確定依頼の表示がなく、確定済みでも再度開ける。これはモデルから分かる現状であり、重複依頼を禁止するか、変更として扱うかは今回の問いに含めていない。

別AIが継続するには、問いと期待範囲、モデル、scenario、処理系版が必要だった。今回は全て最初から提供され、モデルとscenarioを突き合わせて、どの経路を選びどこに残ったかを把握できた。scenarioだけに人間の目的を自動復元できたとは主張しない。HTMLの存在と埋込のengine/model/source識別値の一致は文字列検査で確認したが、ブラウザーを起動せず、描画・クリック・GUI保存読込・見やすさは未確認。CLIとHTMLの実行動作が同じと今回の観測だけから断定しない。

未確認は窓口確定、確認内の往復切替を繰り返す場合、reset、seek、ghost、複数備品、別処理系版、実サービスと永続保存。追加の実装・製品テストは行っていない。

## コマンド・読取範囲・保存物

実行コマンドは作業checkoutをworkdirに固定した。主な再現コマンドは下記。CLIへ実際に送った全JSONはsession-a.requests.jsonlとsession-b.requests.jsonlに、全応答は対応responses.jsonlに保存した。CLI引数の絶対パスはsession-a.command.jsonとsession-b.command.jsonに保存した。

```sh
pwd
ls docs/dogfooding/2026-10-23-ai-first-use/author/v2
cat README.md docs/AI_GUIDE.md docs/design/session-usage.md docs/design/scenario-replay-contract.md
cat /Users/m5/works/shitae/.agents/skills/shitae-authoring/SKILL.md /Users/m5/.codex/guides/pfdsl-and-worktree.md
cat docs/dogfooding/2026-10-23-ai-first-use/author/v2/equipment.shitae
rg -n 'query|exportScenario|replay|JSON|dispatch|actions|state|detail' docs/design/session-usage.md
git rev-parse HEAD
sed -n '1,70p' docs/design/session-usage.md
sed -n '110,145p' docs/design/session-usage.md
python3 docs/dogfooding/2026-10-23-ai-first-use/corrected-handoff/client.py session-a docs/dogfooding/2026-10-23-ai-first-use/author/v2/confirmed.scenario.json
python3 docs/dogfooding/2026-10-23-ai-first-use/corrected-handoff/client.py session-b docs/dogfooding/2026-10-23-ai-first-use/corrected-handoff/session-a.scenario.json
```

その他のPython inline処理は3入力のSHA256計算、元scenarioのJSON表示、HTML中のengineVersion/modelId/sourceSha256と画面名の文字列件数確認、出力ディレクトリとclient・事前メモ作成、保存物の全JSON・bytes比較、今回のreportとcomparison保存である。client起動後はJSON行をツールstdinで送り、各processにEOFを送り終了コード0を得た。AのCLI pid=87779、B=89491で別process。両stderrは0bytes（session-a.exit.json、session-b.exit.json、comparison.json）。

読んだ入力全パス（ディレクトリの一覧以外に作者v2の他ファイルは読んでいない）：

- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/README.md
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/AI_GUIDE.md
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/design/session-usage.md
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/design/scenario-replay-contract.md
- /Users/m5/works/shitae/.agents/skills/shitae-authoring/SKILL.md
- /Users/m5/.codex/guides/pfdsl-and-worktree.md
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v2/equipment.shitae
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v2/equipment.html
- /Users/m5/.codex/worktrees/issue-69-reevaluation/shitae/docs/dogfooding/2026-10-23-ai-first-use/author/v2/confirmed.scenario.json

今回作成・実行または比較読取したパスは全てこのcorrected-handoff配下：client.py、before-replay.md、input-start.json、input-end.json、session-a.command.json、session-a.requests.jsonl、session-a.responses.jsonl、session-a.stderr.txt、session-a.exit.json、session-a.scenario.json、session-b.command.json、session-b.requests.jsonl、session-b.responses.jsonl、session-b.stderr.txt、session-b.exit.json、session-b.scenario.json、comparison.json、report.md。一時保存用session-a.scenario.tmpとsession-b.scenario.tmpは保存時に置換済み。製品CLIは指定されたpackages/cli/dist/index.jsを実行したがソースを読んでいない。

入力SHA256の開始・終了比較は3ファイル全て一致（input-start.json、input-end.json、comparison.json）。開始hashは最初のモデル読取後、CLI replayや成果物生成の前に取得したため、読取開始そのものより少し後である。今回原物への書込は行っていない。出力は全て指定された新規directory内に限定し、commit/push/外部書込なし。
