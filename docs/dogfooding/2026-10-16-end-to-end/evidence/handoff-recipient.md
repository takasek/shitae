# 独立した受取人による引継ぎ確認

2026-10-16。元会話を受け取らず、最初に `handoff-brief.md` を読んだ。そこで指定された共有モデル・scenario・HTMLと、公開利用説明だけを入口にした。作者の補助script、他evidence、過去レポート、元の操作列は参照していない。実行対象は固定版を用意した `/private/tmp/shitae-e2e-20261016-01a1424a`。build、製品編集、commit、push、issue操作は行っていない。

## 何を検討した記録か

文書編集UIで外部変更が起き、エディタ版とディスク版を比較した後に編集を続ける流れと、図表示からソースへ戻る流れの検討。単一の架空文書を扱うラフな画面モデルであり、実ファイルの読書き、競合検出、保存、ソース位置へのfocusは実行しない。コメントにあるソース本文・undo・選択・graph viewportの保持も、記載された設計意図として読む。

## 保存された現在地と由来

再開直後は `Workspace / Diagram`。overlayは空、`DocumentStatus / Conflict` はsingleton共有値で由来はDSL、`DiagramView / Ready` はsingleton共有値で由来は初期。文書競合が解決した状態ではない。図表示への切替はDSLによるframeの置換で、組込みbackは戻り先がない。

共有scenarioは5操作を保存していた。SplitからConflictを発生させて競合状態と通知を設定し、Reviewで通知を隠してVersionReviewをpresent、KeepEditingでdismissした。その操作の完了後ではなく、step 3 / observation 0、すなわち `dismiss → Workspace / Split` の直後へseekしている。KeepEditingの後半 `show(RecoveryNotice)` より前からDiagramOnlyを実行したため、Conflictは残るが通知はない。これは比較取消しの完了状態そのものではなく、結果途中から分岐した検討状態である。

condition labelの選択は存在しない（4件のdispatchのbranchはnull、残り1件はseek）。選んだ「分岐」は成功／失敗条件ではなく、KeepEditingの結果列の途中へ戻ってから図表示へ進む経路。履歴の現在表示だけでなく、scenarioのseekと元の操作定義を突き合わせる必要があった。

GUIログに見えたのは `set(DocumentStatus)`、`show/hide(RecoveryNotice)`、`present → VersionReview`、`dismiss → Workspace / Split`、`goto → Workspace / Diagram` という結果名だった。Review、KeepEditing、DiagramOnlyという操作名も、「KeepEditingの後半の通知表示を実行した後、dismiss直後へseekした」という経緯も、そのログだけでは確定できなかった。操作名は共有モデルの結果列、途中の経緯は共有scenarioのstep 3・4・5で補った。公開CLIのhistory照会は0回で、scenarioとモデルによる補足で足りた。

## 公開CLIでの再開と次の一操作

モデルを `evidence/handoff-model/proposed.shitae` へbytesを変えずコピーし、その別directoryのentryと共有scenarioを指定して、新しい公開CLI processを `session … --replay …` で開始した。独自clientは `handoff-client.py` の薄い送受信だけ。最初のqueryでactions/state/metadataを一度だけ取り、以後はdispatch、既定summary query、明示exportのみ。全状態・全履歴を毎回取得するharnessは使っていない。

次は「図からソースへ戻れるか」を試すため `SourceOnly` を選んだ。query応答から得たhandleをそのままdispatchし、`Workspace / Source`、revision 6、observation 9へ到達。receiptはchanged=`frames`、1観測、effects/diagnosticsなし。手順や過去のhandleの再入力は不要だった。process終了コードは0。

再開後のscenarioは `scenarios/handoff-resumed.scenario.json` に保存した。6操作になり、受領した5操作（途中seekを含む）を保ったままSourceOnlyが追加された。CLI往復と完全応答は `handoff-cli.json`、clientの出力は `handoff-cli-console.txt`。

## ブラウザでの再開

HTTPの `http://127.0.0.1:8766/evidence/sol-proposed.html` を新タブで開いた。subagentではvisible指定が使えず初回は失敗した。非表示タブの作成後、変数束縛の失敗を既存URLへの再束縛で直した。タブを作り直したり、製品を変更したりしていない。

公開の「シナリオを読み込む」から共有scenarioを選び、「シナリオを読み込みました（5操作を照合）」と `Workspace / Diagram` を確認した。読込直後は部品の状態表示がoffで、状態の由来を読むために手動でonにした。`DocumentStatus / Conflict / 共有 / DSL` と `DiagramView / Ready / 共有 / 初期` を確認した後、ブラウザでもSourceOnlyを1回選び `Workspace / Source` とsource包含、Conflictの継続を確認した。

DOM記録は `handoff-browser-loaded.txt`、`handoff-browser-origin.txt`、`handoff-browser-source.txt`。同名のPNGも保存した。これは固定版から生成された共有HTMLとscenarioによる、実ブラウザでの閲覧・読込・SourceOnly操作の確認である。再生成HTMLをブラウザで再度開く確認はしていない。

## 別directoryでのcheckと再生成

briefで全モデルが一枚・importなし・simconfigなしと示され、モデルにもimportはなかった。共有元とコピーのSHA-256は共に `acc1cd09372ee07d350ae9cdb0283fd7080fa7f53263dc53cb1bf5cc166edc3b`。コピーで公開CLIのcheckは終了0、error 0、空部品を示すW103が31件。simulateは終了0、stderrなし、225177 bytesのHTMLを生成した。

生成結果 `handoff-regenerated.html` のhashは共有HTMLと異なる。HTML差分は埋込みsource pathの2箇所だけで、その移動元パスを移動先へ置換すると全文一致した。engineVersion/modelId/source hashは一致し、別directoryのモデルで共有scenarioを再開できた。証拠は `handoff-checks.json`、`handoff-hashes.json`、`handoff-html-diff.json`、`handoff-regeneration-result.json`。こちらは必要モデルを受け取った編集・再生成側の受渡し根拠で、今回はモデルの内容編集自体は行っていない。

今回のbriefではHTML・scenario・版と必要モデルを最初から一括で渡された。HTMLだけを先に受け取った人が段階的に初見で理解できるか、モデルなしでも過去の操作名やseekの経緯を説明できるか、という評価は行っていない。

## 参照・迷い・再入力

以下の回数は人が内容を探した読取／検索の呼出し回数。CLI内部やhash計算のファイル読取は別に扱う。README、session-usage、AI_GUIDEは1回目が合同の検索、2回目が必要部分の読取。

| 資料 | 回数 | 理由・迷い |
| --- | ---: | --- |
| handoff-brief | 1 | 共有物と固定処理系の指定を得る |
| 共有モデル | 1 | 画面と結果列を読む。scenarioとの一括catは出力量が大きかった |
| 共有scenario | 2 | 一括catが途中省略されたため、2回目はkeys/steps/location/cursor/timeline/overlay/sharedを抜き出した |
| README | 2 | check/simulateと共有時に必要なモデル一式の条件を確認 |
| session-usage | 2 | JSONL形式、replay/export、途中seek、保存対象外を確認。過去の証拠リンクは開かなかった |
| AI_GUIDE | 2 | singleton、set、goto、dismissと結果列の読解を確認 |
| SPEC | 0 | 今回の操作と解釈は公開ガイドとモデルで判断できた |
| shitae-authoring skill | 成功1・失敗1 | 固定checkout内のskillは存在せず、提供された絶対pathのskillを読んだ |
| worktree共通ガイド | 1 | 指示された操作対象の境界を確認 |

モデル本文の再入力は0、scenarioの手修正は0、条件ラベルの再入力は0。CLIの操作は1回、GUIの操作は1回、双方SourceOnly。GUI読込みに指定するscenario pathは1回入力した。保存後の自分の証拠は要約とhashの検証のために読み戻した。共有HTMLはブラウザで閲覧した後、再生成差分の確認にだけ読み込んだ。HTMLに埋め込まれた古いsource pathの先は開いていない。

## 保存契約の理解と残る限界

scenarioのmodel欄はidentity/manifestであり、モデル本文は同梱されない。HTMLだけなら閲覧できるが、編集・再生成・CLI再開には別途同じentry名・全source bytes・同じengineVersionのモデル一式が必要。scenarioだけを送れば再開できるとは考えない。

受理操作、手選択条件、試験値、reset、結果途中のseekは保存され、reset前や廃棄した経路も保存対象である。今回の共有物にresetはなく、この確認のために追加resetはしていない。受領したstep 3の結果列の後半を越えてからstep 4で途中へ戻った経緯は、再export後にも残る。最終timelineに通知再表示が見えないことを、その操作が一度も走らなかった証拠にしない。

query、拒否、部品状態表示checkbox、fold/focus、graph設定などの表示設定はscenarioに保存されない。今回も部品状態表示は再開後に手動でonにした。DOM・PNGはscenarioと別の証拠。ソース本文保持、実ディスクの保存、focus、任意数の実文書管理まで確認した結果ではない。

引継ぎは成立した。briefから検討の目的・途中分岐・現在地・状態の由来を説明でき、公開CLIと実ブラウザで次の1操作を実行できた。一方、scenarioのJSONを最初に全量読むと大きく、結果途中の分岐は現在地とtimelineだけでは読み違えやすい。どの結果直後へseekしたかを最小限の説明に添える価値がある。
