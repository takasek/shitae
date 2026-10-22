# author-notes (dogfooding 2026-10-21, author 担当)

## 0. 事前記録（モデルを書く前）

### 自然文の要件
図書館アプリ「蔵書を検索して貸出予約する」。
- 検索画面で蔵書を探し、結果一覧から蔵書詳細を開く。
- 詳細は「未予約」なら「予約する」、「予約済み」なら「予約を取り消す」を持つ。
- どちらも確認モーダルを経る。モーダルには「確定」と「取消」がある。
- 予約の確定が通信失敗することがある（その場合はモーダルに留まり再試行できる）。
- 予約確定後は詳細に留まり、予約済み表示に変わる。詳細から戻ると検索結果に戻る。

### 確かめたい設計上の疑問
1. 予約済みかどうかを詳細の variant にして、確認モーダルの確定で変えるとき、モーダルから詳細の variant をどう変えるか。
2. 詳細を一度閉じて開き直しても予約済みは残るのか。
3. 確認モーダルの中で back したら外に漏れないか。取消のあと詳細はどの状態に戻るか。
4. 予約確認と取消確認を別モーダルにするか、1 つの component の variant にするか。
5. 詳細から戻ったとき検索結果（検索語）は保たれるか。

### 期待する状態の所属・寿命・戻り先
- 予約済みか否か: 本ごとの状態。アプリ全体に属し、詳細画面より寿命が長い（詳細を閉じても残る）。検索結果の一覧にも反映されるべき。
- 検索語・結果一覧: 検索画面に属し、詳細へ push している間は保たれる。
- 確認モーダル: 詳細の上に積まれる一時的なモード。確定・取消のどちらでも閉じて詳細に戻る。back では閉じない。
- 確定後の戻り先: 詳細（予約済み表示）。詳細の「戻る」で検索結果。

### 今回は表現しない
実際の蔵書データ、複数冊の本ごとの予約管理（shitae は本 ID を持てない前提で、代表の 1 冊として扱う）、予約待ち順位、通信処理そのもの、検索語の値、レイアウト。

### 読んだファイル（随時追記）
- README.md（全文）
- docs/AI_GUIDE.md（全文）
- .claude/skills/shitae-authoring/SKILL.md
- docs/GLOSSARY.md
- docs/examples/ecommerce.shitae
- 申告: `ls docs/dogfooding/2026-10-21-end-to-end/` を実行し、`evidence/ models/ scenarios/` というディレクトリ名が見えた。中身は開いていない。（自分の作業ディレクトリの親であり、ls で偶然見えた）

## 1. v1 段階

### モデル v1 と check
- ファイル: author/library-v1.shitae（詳細の variant `##未予約/##予約済み` を、確認モーダルの確定から `dismiss() ; goto(##予約済み)` で変える素朴な書き方）。
- コマンド: `node packages/cli/dist/index.js check author/library-v1.shitae 2> check-v1.txt` → exit=0。
- 診断: error 0 件、warning 2 件（author/check-v1.txt）。
  - library-v1.shitae:26 W105 `goto(##予約済み)` の '予約済み' は '予約確認' に定義されていない variant
  - library-v1.shitae:34 W105 `goto(##未予約)` の '未予約' は '取消確認' に定義されていない variant
- exit 0 でも warning が出る（README の説明どおり）。意図は「dismiss 後だから詳細に効く」だったが、check は書かれた component（モーダル）を receiver と見ている。
- HTML 生成: `simulate library-v1.shitae > library-v1.html` → exit=0、222108 bytes。check の warning とは独立に成功した（README の注意どおり）。
- 文書へ戻り 1 回目: docs/SPEC.md 291-332（variant はインスタンスごとに独立／singleton）と 361-374（variant の参照は必ず ##、裸 ##variant の receiver は実行時アクティブ component）。理由: W105 の文言だけでは「どう直すか」が分からず、モーダルから詳細の variant を変える正式な方法と、詳細を閉じて開き直したときの状態の寿命を知りたかったため。
  - 得たこと: 通常 component の variant は frame の生死で失われる（SPEC:291-297）。singleton は frame の生死をまたいで最後の variant を保つ（SPEC:313）。`set(X##v)` で遠隔から書ける（SPEC:316）。
  - W105 の診断自体は修正方針（set / singleton）に導かない。SPEC の導線（AI_GUIDE:69 に「singleton を指定して状態だけ変えるなら set」）はあるが、W105 の文言から AI_GUIDE:69 へは辿れない。
- 追加で読んだ: docs/SPEC.md の 291-332, 361-374, 764-775（W105 の行）。

### v1 のブラウザ操作の予測（実行前）
URL: http://127.0.0.1:8765/author/library-v1.html（tabId tab-1）。
- 画面操作はカード状の「アクション」を押す形（ボタン表示名はアクション文言そのもの）。
- 予測 A: 「タップ(結果)」→蔵書詳細。「タップ(予約する)」→予約確認モーダル。「タップ(確定)」で [成功] を選ぶと、dismiss() で詳細に戻ってから goto(##予約済み) が詳細の variant を変える（AI_GUIDE:69 の「アクティブな component」を字義どおり読めば）。ただし W105 は逆の読みを示唆しており、どちらか分からない。
- 予測 B: 予約済みにした後 back で検索へ戻り、「タップ(結果)」で開き直すと、通常 component の variant は独立なので「未予約」に戻る（SPEC:291-297）。これは期待（予約は残る）と食い違う見込み。
- 予測 C: モーダル内で back は無い（モーダルに back の行動を書いていない）ので漏れの検証は行動が無い。

### v1 ブラウザ操作の実際（tab-1）
操作列（ボタン／カードの表示名はそのまま）: 「タップ(結果)」→「タップ(予約する)」→「タップ(確定)」の分岐ボタン「[成功]」→「← 前の画面へ（画面内の操作）」→「タップ(結果)」→「タップ(予約する)」→「[失敗]」→「タップ(取消)」。
（注: アクションは read_page で role=generic のカードとして出る。coordinate クリックか find の ref で押す。ボタンは分岐ラベルと「← 前の画面へ」のみ button。）
- 予測 A 的中: [成功] 後のスタックは `蔵書詳細 / 予約済み ; 検索`（author/v1-after-confirm.txt）。`dismiss() ; goto(##予約済み)` は dismiss 後のアクティブ画面である詳細に効いた。したがって check の W105（library-v1.shitae:26,34、author/check-v1.txt）は、実行時に効く正しい書き方に対する警告になっている。診断が実行順の receiver を見ていない。
- 予測 B 的中（期待とは食い違い）: 予約済みにして戻り、開き直すと `蔵書詳細 / 未予約`（author/v1-reopen.txt）。予約状態を詳細の variant に置くと、詳細を閉じた時点で失われる。自然文だけでは「予約済みが残るか」を曖昧にしたまま v1 を書いていた。操作して初めて確認できた。
- [失敗]: モーダルに留まる（スタック `▌予約確認 ; 蔵書詳細 / 未予約 ; 検索`）。「通信エラーを表示する」は main 本文に出ず、操作来歴の展開内にだけ出る（author/v1-failure-log.txt）。自然文 effect は画面には現れない仕様。
- 「タップ(取消)」→ 詳細（未予約）に戻る（author/v1-failure-log.txt）。モーダルは取消でも確定でも閉じて詳細に戻る（疑問 3 のうち取消後の戻り先）。
- モーダル内の back: モデルにモーダルの back 行動を書いていないため、シミュレータ上に back の操作自体が現れず「漏れ」の確認は行動が無くて検証不能。barrier を試すには `> 戻る -> back()` をモーダルに書く必要があった（未検証）。
- 検索結果への反映（期待のひとつ）は v1 では扱っていないのと同じ。

## 2. v2 段階
### v1 から v2 への変更と理由
変更: 予約状態を `#! 予約状況`（singleton、`##未予約`/`##予約済み`）へ移し、蔵書詳細は `状態: 予約状況` として埋め込む。確定時は `dismiss() ; set(予約状況##予約済み)` / `set(予約状況##未予約)`。
理由: v1 の予測 B（開き直しで失われる）と W105 の警告。SPEC:291-297,313,316（singleton は frame の生死をまたぐ、set は遷移なしで共有 variant を書く）。新しい名前: `予約状況`（v1 には無い。v2 の HTML で画面テキストに現れることを確認する）。
- library-v2.shitae を check → exit=0、warning 0 件、error 0 件（author/check-v2.txt は空）。
- simulate library-v2.shitae > library-v2.html → exit=0、HTML 生成成功。
- 本当に singleton が必要だった／過剰だったか: 「予約は本ごと」の要件に対し singleton は代表 1 冊を表すだけ。本ごとの予約管理は shitae では表現できない。限界として記録。

### v2 ブラウザ操作の予測（実行前）
http://127.0.0.1:8765/author/library-v2.html（tab-1 を navigate。「このHTML: library-v2 · model 3f05d7396c4f」で v1（model f043dd6991cd）と取り違えていないことを確認済み。初期の 検索 画面の本文には 予約状況 の語は出ない）。
- 予測 D: 「タップ(結果)」で蔵書詳細に入ると、本文に `予約状況` と `予約する` が出る（埋め込んだ singleton の要素が見える）。ただし埋め込み側の `タップ(予約する)` が詳細のアクションとして出るかは不明。
- 予測 E: 予約確認 →[成功] で詳細に戻り、`予約済み表示` `予約を取り消す` が出る。戻って開き直しても `予約済み` のまま（v1 との差分）。
- 予測 F: 取消確認 →[成功] で `未予約` に戻る。

### v2 ブラウザ操作の実際（tab-1、author/v2-states.txt）
操作列: navigate library-v2.html →「タップ(結果)」→「タップ(予約する)」→「[成功]」→「← 前の画面へ（画面内の操作）」→「タップ(結果)」→「タップ(予約を取り消す)」→「タップ(取消)」→「タップ(予約を取り消す)」→「[成功]」。
- 予測 D 的中: 詳細に `予約する` と `タップ(予約する)`（variant固有）が出る。埋め込んだ singleton の interaction が詳細のアクションになる。表示名は alias `状態` で、`予約状況` という名前は画面に出ない。
- 予測 E 的中: [成功] 後に `予約済み表示 / 予約を取り消す`。戻って開き直しても予約済みのまま（v1 の `未予約` に戻る挙動との差分。author/v2-states.txt）。
- 予測 F 的中: 取消確認 の [成功] で `予約する` に戻る。「タップ(取消)」では予約済みのまま。
- v2 では `set` を使うので W105 は出ない（author/check-v2.txt が空）。

### session での補助確認（author/session-probe.txt、author/session-driver.py は自作ドライバ）
- モーダル内 back（疑問 3）: library-v2b-barrier.shitae（v2 のモーダル 2 つに `> 戻る -> back()` を足した検証用。check は warning/error 0、author/check-v2b.txt）で、予約確認 から「戻る」を実行 → location は 予約確認 のまま、receipt の changed は空。barrier が効いて外へ漏れない。
- v2 の予約→戻る→開き直し: session でも location が 蔵書詳細 で actions が `戻る / タップ(予約を取り消す)`（予約済みが残る）。ブラウザの結果と一致。

## 3. 設計疑問への答え（根拠付き）
1. 疑問 1（モーダルから詳細の variant を変える）: `dismiss() ; goto(##予約済み)` は実行時に詳細に効く（author/v1-after-confirm.txt）。しかし check は W105 を出す（check-v1.txt:1-2）。誤解を招くので v2 では `set` + singleton に切替えた。
2. 疑問 2（開き直しで残るか）: v1 では残らない（author/v1-reopen.txt）、v2 では残る（author/v2-states.txt）。自然文では曖昧だった点で、操作して初めて見えた。
3. 疑問 3: 取消・確定とも詳細へ戻る（v1-failure-log.txt, v2-states.txt）。back の barrier は session で確認（session-probe.txt）。モーダルに back の行動を書かないと「back 操作」自体が現れない。
4. 疑問 4（確認モーダルの統合）: 今回は未検証（別 component のまま）。
5. 疑問 5（検索結果が保たれるか）: 検索語は表現していないので未検証。
- 期待しつつ満たせなかったこと: 検索結果の一覧に予約済みバッジを出す（本ごとの状態）。`*結果: 蔵書カード` は collection で、singleton には `*` を付けられない（SPEC:328 E028）ため、本ごとの予約状態は shitae では書けない。v2 の `予約状況` は代表 1 冊の状態でしかなく、複数冊で同時に使えない。設計の限界として記録（未検証だが SPEC:328 の記述による推論。E028 は実際には発火させていない）。

## 4. 総括
- warning/error と生成成功の区別: できた。v1 は check exit=0 だが warning 2 件、simulate は別に成功。README の説明どおりで、exit code だけ見ると W105 を見落としうる。
- 文書へ戻った回数: 計 2 回（SPEC 291-332/361-374 と 764-775 を W105 の後に 1 回、session-usage の CLI 節を barrier 確認で 1 回）。ほかに docs/AI_GUIDE.md の 69 行と 101-141 行の自然文で singleton と set の導線を再確認（一度読んだものの再読は数えない）。
- 診断・導線の評価: W105 は原因（モーダルの variant 集合に無い）を示すが、書き換え先（set / singleton）には導かない。AI_GUIDE:69 の説明は役立った。W105 が実行順（dismiss 後に詳細へ効く）を考慮しない点は、誤警告の可能性として要確認。
- ツール都合の回避策: アクションが role=generic のカードで button でないため、find の ref か座標で押した。ボタンとして取れるのは分岐ラベルと「← 前の画面へ」のみ。モデルの不要な書き換えはなし（v2b は検証専用で採用していない）。
- 自由文 effect（通信エラーを表示する）は画面本文に出ず、操作来歴にのみ出る（v1-failure-log.txt）。モーダル内のエラー表示の見え方を画面上で確認したい設計では不足を感じる。

### 読んだファイル（最終）
README.md / docs/AI_GUIDE.md / .claude/skills/shitae-authoring/SKILL.md / docs/GLOSSARY.md / docs/examples/ecommerce.shitae / docs/SPEC.md の 291-332, 361-374, 764-775 行 / docs/design/session-usage.md の 1-90 行（session の使い方）。docs/dogfooding/2026-10-21-end-to-end/ を ls（evidence/ models/ scenarios/ の名前のみ確認、中身は未読）。禁止対象は開いていない。
