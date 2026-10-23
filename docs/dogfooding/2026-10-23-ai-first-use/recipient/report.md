# 初見AI受取側の継続・変更評価

追記：本試行は目的・問いを渡さず、今回の作成担当とは別の見学予約資料を使った探索である。正式な作業Cの引継ぎ条件を満たさない。以下の情報不足の観察を製品負担・開発優先度の根拠から除外する。実行ログ・初期推測は当時の証拠として保持する。

## 結果

初期のHTML・scenario・処理系版だけでは、保存された操作経路と最終状態をJSONから説明できた。何を合格条件とした検討かは明示されておらず、案内の寿命と共有予約状態の保持を確かめた記録と推測した。これはstage1で元モデルを読む前に固定した見解である（stage1.md:9）。

元モデルの追加提供を1回求め、公開ガイドとCLIだけで再生・経緯の確認・自分で選んだ継続操作・保存・別process再開・小変更・再生成・旧scenario拒否・新規記録まで到達した。作者の意図や操作方法について作者の回答は受けていない。ブラウザー表示はポリシー拒否のため未確認であり、CLI達成と区別する（stage1.md:37）。

## 追加提供と参照資料

追加要求は1回、提供は1回。ブラウザーでHTMLを開くAPIが拒否された後、CLIにはsource bytesが必要だとREADMEから分かったため、元モデル一式を親へ求めた。親から `author/v2/visit.shitae` の提供許可とimport・simconfigなしの説明を受けた。提供前に元モデルや埋込モデルは読んでいない。固定HTMLとscenarioだけでCLIを起動する公開経路はREADMEから見つけられなかった。追加の業務要件・合格条件・作者の意図は求めていない。

stage1後に読んだ資料は次の範囲である。

- `/Users/m5/works/shitae/.agents/skills/shitae-authoring/SKILL.md` 全体。
- 対象checkoutの `docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae` 全32行。
- 対象checkoutの `docs/AI_GUIDE.md` 全体。
- 対象checkoutの `docs/design/session-usage.md` 全体（1–250行を要求）。過去評価の説明やリンクが本文に含まれていたが、リンク先は開いていない。公開CLIの手順、保存とreplay、観測点照会の説明を使用した。
- 対象checkoutの `docs/design/session-provenance.md` 全体（1–210行を要求）。queryのreview/provenanceSummaryの使い方を使用した。リンク先は開いていない。
- 自分のrecipient出力のみ。作者のreport・brief・操作ログ・補助script、処理系実装・テストは読んでいない。

モデル読取りは提供直後に1回、変更コピー作成時に機械的なread_textを1回。前者で32行のモデルを理解でき、後者でvariant節の並べ替えを行った。sessionのhandleや内部状態は公開CLIのquery応答からのみ得た。

## 受領記録の再生と自分の次の操作

最初に公開CLIの `session .../author/v2/visit.shitae --replay .../author/v2/visit.scenario.json` にstate/actions/metadata/provenanceSummary/reviewを照会した。起動は成功し、9 dispatch・12観測点・ghostなし・discardedなし、施設詳細、共有予約状態は予約済、overlayなしを確認した。reviewには「詳細を見る」「見学を予約する」「オンライン案内を選ぶ」「取り消す」「確定する」「通知を閉じる」「一覧へ戻る」という操作名が再構成され、stage1では識別子だけで不明だった押下名が分かった（continued.jsonの最初のqueryとreview）。

次の問いを自分で選んだ。「予約済のまま確認画面で案内だけを変えて取り消したとき、予約済は失われないか」。actions queryのラベルを見て「見学を予約する → オンライン案内を選ぶ → 取り消す」を選び、毎回queryで新しいhandleを取得した。共有予約状態は予約済、通知なし、戻り先は施設詳細だった。12操作の記録としてcontinued.scenario.jsonへexportし、processを終了。別processで再生し、再exportしたresumed.scenario.jsonは元の保存物と全JSONで一致した（continued.json、resumed.json、verification.json）。

「取り消す」はこのモデルでは予約そのものの取消ではなく、確認作業を閉じる操作だと元モデルのexit定義と実測から分かる。ただし作者がその意味を利用者にどう伝えたいかまでは判断していない。

## 一件の小さな要件変更

要件は「予約確認を新しく開いた直後の案内をオンラインにする」。variant節の順序だけを入れ替え、変更モデルをchanged/visit.shitaeへ作った。予約済の共有状態や通知、present/exitは変えていない（expectations.md、changed/visit.shitae:17）。

変更前に元モデルで「詳細を見る → 見学を予約する」を実行し、オンラインという期待に対して現地が返るRedを記録した（new-requirement-red.json）。これは製品の不具合ではなく、新要件を満たす前の対照。評価scriptのresult.successはfalseだが、CLI自体は正常動作なのでprocess exitCodeは0である。

変更後のcheckはexit0・診断なし。simulateはexit0、238103 bytesのHTMLを生成した（changed-generate.json、changed/visit.html）。同名entry visitを保った変更モデルで旧scenarioを読み込むと、source bytesの相違を挙げたMODEL_MISMATCHでexit1、stdout 0 bytesとなり、部分的な操作受付をしなかった（old-scenario-rejected.json、old-scenario-rejected.stderr.txt）。空白やコメントも照合対象であること、同じHTMLとscenarioの組で再開するか、変更後モデルで新しく記録することがエラーに案内され、次の進め方が分かった。

新規に「詳細を見る → 見学を予約する → 現地案内を選ぶ → 取り消す → 見学を予約する → 確定する → 通知を閉じる → 一覧へ戻る → 詳細を見る」の9操作を実行した。初回・再入場ともオンライン案内、現地への切替、取消後の施設詳細復帰が確認できた。確定直後の観測点9を公開queryで照会し、施設詳細・予約済・確定通知ありを確認した。最後は施設詳細・予約済・通知なしだった（changed.json、changed-confirm-observation.json）。changed.scenario.jsonを別processで再生して再exportしたchanged-resumed.scenario.jsonは全JSONで一致した（verification.json）。

check・新要件の対照・変更後の操作観測は実施したが、製品ソースや共通テストは変更せず、全件テストは走らせていない。HTML生成成功はブラウザー表示を確かめたことにはならない。

## 自力で進められた範囲と負担

READMEから公開Sessionガイドへの導線があり、ガイドにquery/dispatch/export/replayがそろっていたので、操作名と現在状態を読み取り、その応答から次を選べた。人の操作や作者の補助scriptは不要だった。モデル変更も「最初のvariantが初期値」というAI_GUIDEの一規則で済み、内部実装を調査せずに結果を確認できた。

一方、scenarioのJSONを直接読む段階では操作名が識別子に埋もれ、timelineから経路を推測する負担があった。reviewを公開CLIで読むと説明が容易になったが、今回のブラウザー制約下では元モデルの追加提供とガイド参照が必要だった。保存物だけから作者の問い・期待・不変条件は復元できず、この不足は元モデルを読んでも解消しない。受取物に短い問いと期待結果があると、作者の意図を推測する工程が減ると考える。これは一人のAI受取側、一つの32行モデル、CLI中心の観察であり、一般的な時間短縮やブラウザー初見利用の容易さは測っていない。

公開ガイドの中に過去の受入実績の説明があったが、今回の成功判定は自分のCLI応答と保存物比較に基づく。作者の過去評価記録は参照していない。

## 実行記録と成果物

stage1後のshell作業はすべて対象checkoutをworkdirに指定した。ファイル作成・CLI実行結果の保存はrecipient配下だけで行った。初回直接CLI照会を除き、要求・応答・processコマンドを各JSONに保存した。評価scriptは標準ライブラリのsubprocessで公開CLIを起動し、JSON Linesだけを使う。sourceから処理系をimportしていない。

1. `cat` / `sed` で上記5資料を読取、exit0。
2. `node packages/cli/dist/index.js session docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.shitae --replay docs/dogfooding/2026-10-23-end-to-end/author/v2/visit.scenario.json` に1 queryをstdin送信、exit0。
3. Python標準ライブラリでcli-recipient.pyを新規作成、exit0。script内の正確なCLIコマンドは各JSONのcommand配列に保存。
4. `python3 docs/dogfooding/2026-10-23-ai-first-use/recipient/cli-recipient.py continue` / `resume` / `baseline` を順に実行。各wrapper exit0、各CLI exit0。baselineだけ意図した期待不一致をresult.success:falseで記録。
5. Pythonで期待表と変更モデルを新規作成。`node packages/cli/dist/index.js check docs/dogfooding/2026-10-23-ai-first-use/recipient/changed/visit.shitae`、exit0。
6. Python subprocessでsimulateと旧scenario再生を実行。前者exit0、後者期待どおりexit1。stdout/stderrとcommandはchanged-generate.json / old-scenario-rejected.jsonへ保存。
7. cli-recipient.pyの `changed` / `changed-resume` を順に実行、各exit0。
8. Pythonで自分の5ログだけを読み、stateとreceiptを要約表示、exit0。
9. Python subprocessで変更後scenarioを再生し、観測点9をquery。exit0。2組のscenario全体のJSON比較も一致し、verification.jsonへ保存。
10. このreport.mdとchanged/shitae-revision.txtを新規作成。revision取得の `git rev-parse HEAD` は固定HEAD一致。

HTMLとモデルはchanged/、継続保存物はcontinued.scenario.json、新モデル保存物はchanged.scenario.json。再開確認はそれぞれresumed / changed-resumedの同名ログ・scenarioに残る。ブラウザーAPIの正確な拒否文言はstage1.mdにある。

## 未確認

ブラウザーの見た目・操作・ファイル保存・読込・再読込は未確認。作者の本来の合格条件、現実の予約処理、複数施設、実サービスとの統合、永続保存は評価していない。製品・既存資料・作者成果物の変更、commit/push、外部書込みは行っていない。

## 操作の意思決定と補助コードの分担（追記）

操作意図とラベルの順序（既存記録の続きで確認を開く・オンラインへ変える・取り消す、新モデルで既定案内を変えて確定まで歩く）は受取側AIが選んだ。実行時は自作cli-recipient.pyが、その事前に選んだactionTextとenabled:trueに一致する公開actions項目を1件選び、返されたhandleをdispatch要求へ自動転記した。各dispatch前にqueryを取り直すこと、応答IDとokの照合、初期variantのassertion、要求・応答の保存も補助コードが行った。人が各handleを手で転記した実測ではない。後段の最終状態抽出・観測点の確認・scenario全JSON比較にも補助コードのassertionを使った（cli-recipient.py:14以降、verification.json）。

したがって本評価から「手転記の負担が小さい」「補助コードなしでも同じ容易さで進められる」とは結論しない。公開CLIだけで自動化できたこと、操作意図をAIが選べたこと、実行結果を照合できたことが確認範囲である。自作scriptの準備は利用負担に含まれる。

期待表の保存時点にも差がある。継続の問い・期待は実行scriptのplanを作るときに選んだが、expectations.mdという独立ファイルは継続実行後に作成した。新要件は変更前対照（Red）の実行前にscriptのbaselineへ期待variantとして記入し、独立したexpectations.mdはRedの後、変更モデルコピーと同じshell実行内でコピー作成の直後・変更後実行の前に保存した。stage1.mdの初期推測は追加資料・CLI実行前のまま保持している。
