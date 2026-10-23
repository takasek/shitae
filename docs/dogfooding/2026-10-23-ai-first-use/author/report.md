# 初見のAIによる備品貸出の作成評価

公開ドキュメントからモデルを作り、check、HTML生成、公開CLIでの探索、scenario保存、同版の別process再生、要件変更と旧scenario拒否、新版の新規記録まで実施できた。実GUIは環境制約で未確認。CLIの成立だけからGUIを操作できたとも、引継ぎが成功したとも判断しない。

## 読取範囲と出発点

最初にREADMEを読み、その後に`initial.md`へ期待・疑問を書いた。厳密には記録保存はREADME読取より後であり、完全な事前アンケートではない。課題以外の既存解答モデル、親の補助スクリプト、過去評価、不具合候補、実装、テストは開いていない。公開ガイド本文には過去実測の要約とリンクがあり、本文は読取出力に含まれたがリンク先は開いていない。

読んだ公開資料の全パス（checkoutからの相対パス）:

- `README.md`
- `.agents/skills/shitae-authoring/SKILL.md`
- `docs/AI_GUIDE.md`
- `docs/HANDOFF.md`
- `docs/design/session-usage.md`
- `docs/SPEC.md`（検索結果と299–333行のsingleton節）

自分の出力ファイルは作成後の読戻し・JSON抽出・検証に利用した。その他にgitのHEADだけ取得した。TUTORIAL、GLOSSARY、既存examples、過去dogfooding、design/evidenceのリンクは開いていない。追跡スキルはAI_GUIDEを読むために利用した。

## 表現を決めた根拠と迷い

最初の疑問は「残る」が永続保存を意味するのか、実行中の保持なのかだった。READMEは状態パターンの模型であると説明し、AI_GUIDEはsingletonが永続保存ではないと明記する。固定1件だけなので、確認の仮選択を通常component、確定依頼をsingletonにした。AI_GUIDEの「取消で捨てたい受取場所」と「別画面でも共有したい予約状態」の説明が課題に直接対応しており、設計上の迷いはここでほぼ解消した。SPEC:299–333で共有範囲とsetの規則を確認した。

そのため、この試行は独力で難しいモデリング方式を発見できた証拠ではない。公開ガイドに近い問題への適用ができた証拠である。実API通信や保存を自由文effectで装う必要はなく、今回は自由文effectを使っていない。

初回に複数文書をまとめて読んだ出力が切り詰められた。HANDOFF全体とAI_GUIDEのチェックリストは範囲指定で読み直した。session-usageは出力に公開JSONL仕様が含まれ、同じprocessを保つこと、query後にhandleを取り直すこと、exportScenarioのscenario部分だけを保存することを採用した。薄いclientは14行で、stdinの各行をCLIへ送り、応答を一行読み、両方をファイルへ保存するだけ。操作選択・状態判定・scenario合成は行わない。

## 実際に検討した問いと観測

操作前の期待は`expectations.md`、変更前の新版期待は`change.md`。通常経路のみで、手動試験値、seek、reset、内部Session注入は使っていない。

v1は一覧から詳細と確認へ入り、ロッカーへ変更して取消した。取消後の詳細で未依頼を観測（`v1/cli.responses.jsonl` id q5）。確認を開き直すと窓口だった（id q6）。ロッカーへ変更して確定すると詳細へ戻りロッカー依頼済（id q8）。一覧でも同じ状態（id q9）、詳細へ開き直しても同じ状態だった（id q10）。これらの期待は公開CLI観測では合格。

一箇所の自然な要件変更は「新規確認の初期受取方法を窓口からロッカーへ」。通常componentの最初のvariantが初期値という公開規則に従い、確認画面の二つのvariantブロック順序だけを入れ替えた（各`equipment.shitae`:16–23）。取消・確定の結果式と共有依頼状況は変えていない。

v2は新規確認でロッカー（`v2/cli.responses.jsonl` id q3）。窓口へ変更して取消した後も依頼状況は未依頼（id q5）。開き直すとロッカー（id q6）。そのまま確定し、一覧でもロッカー依頼済（id q8）、詳細を開き直しても同じだった（id q9）。新版の期待も公開CLI観測では合格。

## 保存・版・再生

`confirmed.scenario.json`は両版とも公開CLIのexportScenario応答からscenarioキーをそのまま抽出した実保存物。手書きのscenarioではない。`cli.requests.jsonl`と`cli.responses.jsonl`が原本。書出しが大きくツール表示が切り詰められたので、ファイル全体を読み直してJSONを抽出し、全応答のokと件数を集計した。

v1は10 query・9 dispatch・1 export、v2は9 query・8 dispatch・1 export。全38応答はok:true。毎回の受理操作後に新しい一覧を照会し、17個のhandleをCLI応答から手転記した。操作要求の手入力は17回、JSON要求全体は38回。actionText自体の再入力はない。分岐なし。CLIで予期せぬエラーや要求の修正再送はなかった。追加の再生確認には各版1 queryを送り、保存記録の最終状態を別processで確認した（`replay.stdout.txt`）。この件数はliveの38応答とは別。

両版checkは終了0で診断なし。simulateはHTMLを生成し、v1は237398 bytes、v2は237404 bytes。各同版再生は終了0。v2へv1記録を渡すと終了1、MODEL_MISMATCHでsource bytesが異なるequipmentを指摘し、対応するHTMLを使うか新しく記録する案内が出た（`v2/old-replay.stderr.txt`）。新版の記録はこの旧記録を編集せず、初期状態から操作を選び直した。検証終了状態は`validation.json`。

処理系HEAD、engineVersion、modelId、source hashは`shitae-revision.txt`と各`metadata.json`。両版modelIdは異なりengineVersionは一致した。引継ぎの対応表は`handoff-brief.md`。importとsimconfigはない。

## 実GUIと未確認範囲

実GUIは新規タブ作成を3回試みた。Chrome不在、IABのsubagent表示制約、file: URLのセキュリティ拒否により開けなかった。API・URL・拒否文全文は`gui-blocker.md`。拒否後にHTTP配信や別surfaceへの回避はしなかった。人へ操作を依頼していない。既存の他者タブを取得・操作していない。

したがってHTMLの実表示、GUI操作、GUIからのscenario保存、GUI読込、CLI/GUI間の照合は未確認。今回の制約を製品不良とは扱わない。別AIがHTML/scenario/briefだけで継続できるかも、この作成担当単独では判定できない。

この模型は同じ実行内の固定1件の状態だけを扱う。窓口での確定、確定後の再取消、重複依頼制御、永続保存、実際の在庫・通信は検証していない。模型のcheck成功はこれらの業務上の妥当性を保証しない。
