# #11 の別 agent による独立再現（環境制限により部分確認）

これは人間の利用評価ではなく、別 agent による再現である。親の結果、製品ソース、旧レポート、モデル本文を参照せず、指定されたテキストの操作手順と生成 simulator の UI だけを使用して操作を始めた。UI 操作はすべて cua_repl で行った。

対象として指定されたモデル SHA256 は `acc1cd09372ee07d350ae9cdb0283fd7080fa7f53263dc53cb1bf5cc166edc3b`、shitae SHA は `e985f4ee58ab76339df5b0f59144e1f1a5da91c8`。URL は `http://127.0.0.1:8768/generated/sol-models-proposed.html`。この再現ではモデルファイルの内容・ハッシュを別途読み取らず、指定 URL の対象情報として記録する。

## 環境と準備

cua_repl の `iab` browser は利用不可で、browser inventory は空だった。利用可能なアプリに Google Chrome があったため、親の許可を得た native Chrome の専用ウィンドウに新しいタブを作り、指定 URL を開いた。親のタブは操作していない。

Google Chrome の版はアプリの `Info.plist` から取得した値を末尾の版記録に記載する。UI で版確認画面を開く追加操作は行わなかった。

起動時の AX と screenshot は、ともに `Workspace / Split` を示した。source、diagram、save、format、Normalize の要素を確認した。統合ログは起動のみだった。

## 操作前の予測と観測

| 順序 | 指定操作 | 操作前の予測 | 観測と判定 |
| --- | --- | --- | --- |
| 1 | SourceOnly | source を残して diagram を隠し、Workspace がソース表示になる | AX の SourceOnly 行を1回クリック。直後の AX は変化なし。その後の UI 位置確認中に、AX は `goto → Workspace / Source`、現在画面・スタックは `Workspace / Source` となり、source はあり diagram はなかった。一方、screenshot は `Workspace / Split` のままで、ログも起動だけに見えた。AX 上の遷移は部分確認だが、表示の一致は未確認。 |
| 2 | DiagramOnly | source を隠して diagram を表示し、Workspace が図のみ表示になる | AX の DiagramOnly 行を2回クリックした。AX は `Workspace / Source` のままで、新しい遷移ログを確認できなかった。screenshot は引き続き起動時の `Workspace / Split` を示した。環境上の不一致のため結果未確認。 |
| 3–11 | NodeDoubleClick(DiagramView.graph) → Conflict → Review → KeepEditing → ParseError → DiagramOnly → ValidInput → NodeDoubleClick(DiagramView.graph) → CloseLastDocument | 最後は NoDocument になり、文書用 Save/Format/図と RecoveryNotice がなくなることを最終受入条件とした | 未操作。UI 接続の不一致が繰り返したため、親の停止指示に従い追加試行を止めた。各未操作ステップの個別予測は立てていない。 |

SourceOnly の初期予測では表示名を SourceOnly と考えたが、実際の AX variant 名は Source だった。この名称差は操作の曖昧さではない。SourceOnly と DiagramOnly は表示された同名アクション行を一意に選べた。NodeDoubleClick 以降の操作名については、未到達なので曖昧さの有無を判定していない。

## UI 接続の問題と操作数

アクション行は初期 screenshot の表示領域より下にあった。AX クリック後の状態確認に加え、スクロール、ブラウザ内検索、アプリへの再接続、専用窓の Raise を用いて表示位置と接続を確認した。

- simulator のアクションクリックは **3回**：SourceOnly 1回、DiagramOnly 2回。指定手順の **11操作中、2種類まで試行**した。AX 上で SourceOnly の遷移1件を部分確認したが、画面との一致を確認した完了操作は0件とする。
- スクロールは **3回**試行し、座標2回と AX 要素1回のすべてで `Computer Use server error -10005: noWindowsAvailable` になった。
- 補助的な UI 入力は **14回**：専用窓と URL の準備4回、失敗したスクロール3回、ブラウザ内検索2セット6回、Raise 1回。simulator の3クリックを含む UI 入力・試行の合計は **17回**。観測、inventory、接続取得はこの入力数に含めない。
- browser inventory が空で `iab` が利用不可だったこと、AX と screenshot が異なる variant を示したこと、スクロール時の同一エラーが繰り返したことを、環境上の制限として記録する。

モデルの操作順序の修正はしていない。製品ソース・モデル本文の確認も行っていない。操作が不明でソースを読まなければ進めない状況ではなく、UI 操作・観測の接続に問題があった。

## 結果の範囲

この独立再現は未完了であり、成功とは扱わない。NoDocument、文書用 Save/Format/図の不在、RecoveryNotice の不在はすべて未確認である。

AX と画像の不一致、および操作 API のエラーが同時に生じているため、DiagramOnly の未反映を製品の再現失敗へ算入しない。原因を製品の不具合とも断定しない。親が別環境で得た結果は、この独立再現の完了根拠には使用していない。

専用 Chrome 窓は開いたまま残した。追加 UI 操作を止める指示を優先し、終了のためのクリックも行っていない。親のタブは触っていない。

## Chrome の版記録

版の取得元：`/Applications/Google Chrome.app/Contents/Info.plist`（アプリ metadata。製品ソースではない）。

取得値：`CFBundleIdentifier = com.google.Chrome`、`CFBundleShortVersionString = 155.0.8059.40`、`CFBundleVersion = 8059.40`。
