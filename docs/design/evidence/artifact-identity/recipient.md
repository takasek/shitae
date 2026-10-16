# 共有HTML・scenarioの受取人による初回回答

評価日: 2026-10-16。モデル作者・実装担当の説明、モデル本文、scenario JSON本文、実装、oracleは読まず、専用のiabタブ（tab 1）と画面の文言だけで評価した。使用した選択ファイルは全て /private/tmp/shitae-issue24-01a14372-browser/A.scenario.json。B–G.scenario.jsonは選択も閲覧もしていない。HTMLは http://127.0.0.1:8764/A.html ～ G.html を順に同じ専用タブで開いた。

## 再開する組の判断

A.htmlでA.scenario.jsonの読込みが成功した。この組なら、保存時の停止状態・ライブラリから操作を継続できる。B–Gはこのscenarioでは再開できない。

このHTMLの表示はAが main / model bf4eafb726e7 / engine 278103a97da5。版の詳細には「短縮IDは対応付けの補助」「読込時は完全な識別情報で厳密に照合」とある。実際の保存名 main.bf4eafb726e7.278103a97da5.scenario.json は組を探す目印にはなる。ただし短縮IDや保存名だけでは同一性の保証にならない。配布名A.scenario.jsonにも識別情報はないため、読み込んだ完全照合の成功を確認して使う。

画面の共有案内は、再開には完全一致するHTMLとscenarioの組、編集・再生成やCLI再開には全モデル・参照moduleと対応する処理系、遷移マップの分割設定も渡すならsimconfigを添える、と区別している。engineのhashだけではcommitを特定できない。

## B–Gで読めた拒否理由と次の行動

|HTML|表示の短縮識別|読めた短い理由|受取人の判断|
|---|---|---|---|
|B|main / model 25b744075a4a / engine aaaaaaaaaaaa|ENGINE_MISMATCH: 処理系が異なります。モデルは未照合です。|処理系の段階で拒否。拒否結果からモデルが一致するとも、不一致箇所がどこかとも言えない。|
|C|player / model b18d706b5548 / engine 278103a97da5|MODEL_MISMATCH: エントリが異なります: main → player|起動入口が異なる。|
|D|main / model 3b199d638db8 / engine 278103a97da5|MODEL_MISMATCH: 現在のモデルで追加されたmodule: extra|現在側のmodule集合が増えている。|
|E|main / model 0f7052f9b524 / engine 278103a97da5|MODEL_MISMATCH: 現在のモデルで不足するmodule: player / source bytesが異なるmodule: main（空白・コメントも照合対象）|playerが不足し、mainの元ソースも一致しない。|
|F|main / model b837ee065d3d / engine 278103a97da5|MODEL_MISMATCH: source bytesが異なるmodule: player（空白・コメントも照合対象）|参照先playerの元ソースが違う。|
|G|main / model 1bc5d4456e0b / engine 278103a97da5|MODEL_MISMATCH: source bytesが異なるmodule: main（空白・コメントも照合対象）|mainの元ソースが違う。|

どれも長い期待/実際JSONを開かずに判断できた。F/Gの理由はバイト差であり、挙動が変わったか、空白・コメントだけが変わったかまでは示さない。

案内された次の行動は共通して具体的だった。元の続きなら保存時と完全一致するHTMLとscenarioの組を用意する。今回はAで成功したのでAを使えばよい。CLIなら対応する元モデル一式と処理系を用意する。別版で検討したいなら新しく記録し、旧版の検討手順を人が選び直すための参照にする。任意の古いHTMLや短縮IDが似たHTMLで代用しない。

## Aで引き継げた内容と実操作

読込成功表示: 「シナリオを読み込みました（dispatch 4件 / seek 0件 / reset 1件 / 手動試験 1件を照合）」。

保存位置は「停止 / 記録6 / 観測1 / ライブラリ」。ライブラリには停止の表示があり、掲示中プレイヤーも停止中。現在まで5観測点、ghost 0観測点、破棄済み3観測点と表示された。

画面で開いた検討手順から、手動でプレイヤーを再生中にして操作可能の確認を試し、初期状態へ戻した後に再生→詳細→組込みback→ライブラリ→停止、と検討した記録だと読めた。手動試験と確認の観測点は破棄済みの記録として残っている。検討の目的・問い・期待は利用者が指定するもので、版をまたぐ自動再生や意味の一致を保証しない、と明記されていた。

保存対象はdispatch/seek/reset/手動試験の全記録。条件選択はdispatchの内訳。破棄経路、reset前、ghost、手動試験も含む。モデル本文、DOM、表示設定は含まれない。現在までの可視履歴だけを保存するものではない。

次の一操作として「再生」を押した。現在地が「再生 / 記録7 / 観測2 / 詳細」へ進み、掲示中プレイヤーは再生中になった。保存範囲は dispatch 5件 / seek 0件 / reset 1件 / 手動試験 1件。そこで「シナリオを保存」を実行し、「シナリオの保存ファイルを作成しました」と表示された。

再保存の実ファイル: /Users/m5/Downloads/main.bf4eafb726e7.278103a97da5.scenario.json

表示設定の扱いも追加確認した。Aを開き直して「アクションを表示」をOFF、「部品の状態を表示」をONにした状態で元のA.scenario.jsonを読み込み、両方の設定が読込後もそのまま残った。表示設定をscenarioから復元するのではなく、受取側の現在設定を使うという案内と一致した。遷移マップの分割設定は別のsimconfigが必要という案内を確認したが、simconfigの保存・読込そのものは今回操作していない。

## 拒否後の保全と続行

B.htmlの起動状態で先に「再生」を一度押し、詳細 / 記録1 / 観測2、dispatch 1件を作った。その後A.scenario.jsonを選択してENGINE_MISMATCHとなった。失敗直後も詳細画面、再生中プレイヤー、記録1の再生、起点、dispatch 1件がそのまま残った。続けて「← 戻る」を押すとライブラリ / 記録2 / 観測1となり、記録1の再生に加えて記録2の組込みbackが残った。拒否で既存状態を失わず、その続きから操作できた。

## 迷い・追加質問・未達

判断に追加質問は不要だった。モデルの意味の差や設計意図までは短い拒否理由から断定できないが、再開する組を選ぶ判断には足りた。別版でどの確認をやり直すかは、表示された検討手順を参照して人が選ぶ必要がある。

最初のiab visible:true指定だけは「IAB visibility is not supported in a subagent thread」と失敗した。これは表示オプション未対応で、同じ正規iabのvisible:falseで専用タブを作成すると操作できた。別ブラウザ、直接DOM書換え、実装読取への切替は行っていない。

再保存はブラウザが返した実パスと保存成功表示を確認した。内容のJSON解析や再保存ファイルの再読込は行っていない。

## スクリーンショット

- /private/tmp/shitae-issue24-recipient-A-loaded-01a14372.jpg （Aの正常読込）
- /private/tmp/shitae-issue24-recipient-A-resaved-01a14372.jpg （一操作後の保存成功）
- /private/tmp/shitae-issue24-recipient-A-display-retained-01a14372.jpg （表示設定維持と検討手順）
- /private/tmp/shitae-issue24-recipient-B-before-01a14372.jpg （Bの先行操作）
- /private/tmp/shitae-issue24-recipient-B-rejected-01a14372.jpg （Bの拒否直後）
- /private/tmp/shitae-issue24-recipient-B-continued-01a14372.jpg （Bで続きの戻る成功）
- /private/tmp/shitae-issue24-recipient-C-rejected-01a14372.jpg
- /private/tmp/shitae-issue24-recipient-D-loaded-01a14372.jpg
- /private/tmp/shitae-issue24-recipient-E-loaded-01a14372.jpg
- /private/tmp/shitae-issue24-recipient-F-loaded-01a14372.jpg
- /private/tmp/shitae-issue24-recipient-G-loaded-01a14372.jpg

## 初回回答保存後の証拠範囲の注記

親担当から、Bはmetadataだけを変えた制御fixtureであり、過去の処理系リリースを再現したものではないとの説明を受けた。この情報は上の初回判断には使っていない。Bの確認が示す範囲は、この制御fixture上のENGINE_MISMATCH表示と既存状態の保持・続行であり、過去リリースの互換性や旧実装の再現ではない。
