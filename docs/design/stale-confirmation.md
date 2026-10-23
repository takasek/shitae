# 長く残る確認と、作業・索引・存在行の同期

古い確認を開いたまま別の作業へ移ると、確認時には正しかった補助状態が、確定時には別の作業を指していることがあります。
対象不在の `exit(@workA)` は no-op と R002 の警告になり、後続の `set` は実行されます。
結果列を巻き戻す保証も、補助索引を自動で直す保証もありません（[逐次適用の SPEC](../SPEC.md#未定分岐)）。
このガイドは模型側の同期責任を点検する小例であり、runtime の不具合修正ではありません。

## 別々に観測する対象

固定の代表予約 A・B と、A の窓口（Desk）・電話（Phone）という二起点だけを扱います。
任意個の予約 ID、実際の予約保存、通信、世代 ID は表現していません。
同時に保持する下書きは一つとし、開始操作の `ReturnIndex.free?` で索引が None のときだけ新規開始を許します。
実作業と索引が既に食い違っていれば、この入口の制限も正しさを保証しません。

| 対象 | 小例での表現 | 維持したい関係 |
| --- | --- | --- |
| 実作業 | フレーム木の `@workA` / `@workB` | 生存・中断・破棄は state の frames で確認する |
| 復帰索引 | singleton `ReturnIndex` の None / A / B | 保持する下書きに一致する。ResumeA / ResumeB の gate に使う |
| 存在行 | singleton RowA / RowB の None / Desk / Phone | 作業の有無と起点を表す。Desk の body だけに `desk: Marker` がある |
| 確定値 | singleton CommittedA の Unreserved / Reserved | 下書き取消では変更しない |
| 確認の掲示 | overlay ConfirmA | 作業終了と独立に残る。掲示中でも古い対象が生存するとは限らない |

存在行は実フレームの直接照会ではなく、作者が同期する補助状態です。
開始では作業・索引・行を対応させ、完了・取消では三者を更新します。
この例の FinishA は A を確定して作業を終了し、行と索引を None にします。
確定値と確認の掲示はそれぞれ独立に残ります。
新しい出口や外部からの終了を足すときも、どの結果列がこの同期を担うかを確認してください。

## 反例と gate の範囲

入口は [unsafe.shitae](stale-confirmation/unsafe.shitae)、対策版は [guarded.shitae](stale-confirmation/guarded.shitae) です。
各版を新しく始め、通常経路で `Boot → StartA → AskDiscardA → FinishA` と操作します。
確認は A の窓口の下書きを対象として開いたものですが、A の実作業はもう終了しています。
次に Home で下表の開始操作を行い、残っている overlay 側の DiscardA を選びます。

| 版・次の開始操作 | 古い確認を確定する直前（作業 / 索引 / 行 / 確定値） | 期待・観測した確定後 |
| --- | --- | --- |
| unsafe・StartB | B / B / A=None、B=Desk / A=Reserved | B の作業と行、A の確定値は残るが、索引が None になり不変条件に違反する。確認は消える |
| guarded・StartB | B / B / A=None、B=Desk / A=Reserved | 古い確認の操作は無効。作業・索引・両行・確定値・確認は全てそのまま |
| guarded・StartAOther | A / A / A=Phone、B=None / A=Reserved | 別起点なので無効。作業・索引・両行・確定値・確認は全てそのまま |
| guarded・StartA | 新しい A / A / A=Desk、B=None / A=Reserved | 現在の同予約・同起点を対象とする政策に従い、新しい A も破棄する。索引と A 行は None、確定値は Reserved、確認は消える |

対策の差は、遠隔取消を `DiscardA(RowA.desk?)` とすることです。
RowA の現在 variant の実効 body に desk がある場合だけ、結果列全体を選べるようにします（[presence gate の契約](../SPEC.md#操作は-variant-に属する条件式を持たない理由)）。
取消の結果は次の順です。

```shitae
> DiscardA(RowA.desk?) -> exit(@workA) ; set(RowA##None) ; set(ReturnIndex##None) ; hide(ConfirmA)
```

unsafe の遠隔取消には `?` がありません。
対象不在の exit が警告されても索引を消す set は続きます。
gate は画面上の可視性、overlay の掲示、生存フレーム、予約の世代を検査しません。
無効時は取消列も hide も適用されないため、古い確認は残ります。
確認を閉じるだけの操作を足すなら、取消や索引更新とは分けて設計します。

**補助状態が誤っていれば防げません。**
guarded の StartB の直後に、手動試験で RowA を Desk に変えると、実作業 A が無いのに gate が有効になります。
そのまま DiscardA を実行すると R002 の後で B の索引を None にしてしまいます。
これは setTestVariant による不整合の注入試験で、通常操作からその不整合へ到達した証拠ではありません。
行の更新漏れがあった場合の防御の限界を示すものです。
反対に実作業 A があっても行が None なら、必要な取消が無効になります。

## 新しい下書きを守る政策

| 利用者が決める政策 | この例での扱い |
| --- | --- |
| 現在ある「予約＋起点」の下書きを取り消す | 採用。同予約・同起点の新しい A も古い確認から破棄できる |
| 確認を開いた旧世代の instance だけを取り消す | 未実現。同名 session と行の member gate だけでは旧世代と新世代を区別できない |

後者が要件なら、上表の StartA 経路は合格にできません。
この gate を世代保護として説明せず、確認の寿命や作業の作り直しを含む設計判断を利用者へ戻してください。
ここでは新しい生存 API、変数、ガード式、自動索引同期、scenario 移行を追加しません。

## 取消政策を包含部品へまとめる

[maintained.shitae](stale-confirmation/maintained.shitae) は、guarded の DraftA と ConfirmA に重複していた取消列を、同じファイルの CancelA へ移しています。
両方の host が CancelA を包含します。
別 module へ移していないので、無修飾の RowA、ReturnIndex、@workA の所有・解決先を保ちます。
包含部品の操作も、遠隔からは中断中の A を終了し、A 上からは現在の作業を終了します。
裸の goto(##variant) で包含部品自身を変えようとはしていません。

| 比較点 | guarded | maintained |
| --- | --- | --- |
| 取消の gate・exit・行・索引・確認を直す場所 | DraftA と ConfirmA の二箇所 | CancelA の一箇所 |
| 完了政策を直す場所 | DraftA の FinishA | 同じ。確定処理を取消と混ぜない |
| 開始・完了・取消の同期責任 | 作者が対応を保つ | 同じ。包含部品化で自動同期になるわけではない |

行数の減少を目的にせず、取消を変更するときの修正箇所と責任の重複で比較します。
両版の上表三経路と、maintained の局所取消を確認しましたが、全状態の同値証明ではありません。
別 module を組み合わせた大きな予約模型や、元レポートの模型を公式 example として認定したものでもありません。

## 公開 CLI での再確認と引継ぎ

リポジトリ root で依存準備と build を済ませてから実行します。

```sh
pnpm install --frozen-lockfile
pnpm build
node docs/design/stale-confirmation/verify.mjs
node --test docs/design/stale-confirmation/verify.test.mjs
node packages/cli/dist/index.js session docs/design/stale-confirmation/guarded.shitae
```

verify.mjs は公開 check と session の CLI を子 process として起動します。
操作ごとに actions を再取得し、overlay の操作を選び、通常経路と手動試験を区別して state を検査します。
[results.json](stale-confirmation/results.json) は本変更で保存した9ケースの結果です。
取消後の作業・現在画面・全共有値・確認表示を期待値と照合します。
verify.test.mjs は正常な9ケースの記録一致と、行の誤更新または確認の閉じ忘れを入れた4変異が検証に失敗することを確認します。
check は各模型で error なしですが、内容を省略した CommittedA と Marker の W103 は残ります。
固定経路の成功は、模型全体の正しさ、人間の初学者の理解度、実ブラウザーでの保存・読込の受入を意味しません。

[HANDOFF の形式](../HANDOFF.md#コピーして記入する形式)を使い、問い・不変条件・上記の政策・模型の版と処理系の完全な commit SHA を添えます。
この記録の問いは「古い A 窓口の確認が別予約・別起点を壊すか」、期待と不変条件は上表、政策は「現在の予約＋起点」です。
開始は各版の Boot、設定は simconfig.json なし、手動試験は9ケース中の1ケースだけです。
CLI の処理系は main の `82dfa08d5ea01af8495ceefc9e3aec2e98f27e1c` を基に本変更を加えた checkout で build しました。
この記録には生成 HTML や scenario を添付していません。

同じ意味を保つ包含部品化でも source bytes が変わるので、旧 scenario は MODEL_MISMATCH となり得ます。
旧 HTML・元モデル・全 import・設定・scenario・処理系の版を一式で保持し、新版では初期状態から新規記録します。
hash や ID を編集したり照合を緩めたりせず、旧版の操作手順と新版の期待を突き合わせます。
修正後はこの小例に加え、実際の複数 module の模型で、確認を残して別作業を始める経路を探索します。
人による利用評価と保存・共有の未確認事項は [#27](https://github.com/takasek/shitae/issues/27)・[#35](https://github.com/takasek/shitae/issues/35)・[#44](https://github.com/takasek/shitae/issues/44) に残ります。

