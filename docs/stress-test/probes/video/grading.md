# video プローブ採点（被験者: sonnet / SPEC のみ / CLI 不可）

CLI check: pass（診断ゼロ）。SPEC 照合レビュー: gate・condition label・variant トグルは教科書的に正確。表現力ギャップの本命（PiP）を的確に言語化した。

## どう正解したか

- ダウンロード状態（未→中→済）・マイリストトグルを variant で、コントロール表示/非表示を variant + 対象なし行動（画面タップ）で — 原則 6 の模範解。「フォロー/フォロー解除の例が参照実装として機能し、型を 1 つ覚えるだけで書けた」という学習コストの証言つき。
- `タップ(小窓化ボタン?)` — component common に置いた gated 行動。SPEC が想定する gate の典型用法を高確信で正しく適用。
- 「エピソード終了→次を自動再生（プレイヤーはそのまま）」を transition verb なしの effect で表現 — 画面が変わらない遷移の正しい回避だが、本人は確信 中（self-transition の語彙欠如）。
- `back(作品詳細)`「何話再生してもスタック 1 段のまま」— フレーム木の説明から正しく導出。

## 検出された spec の穴

1. **オーバーレイ（PiP・ミニプレイヤー・トースト・通知バナー）が表現不能** — 「アクティブなフレームは常に 1 つ」の外側。document common で近似したが「PiP 有効時のみ」の条件が書けず、本人が不正確と自覚した回避。欲しい記法として「アクティブフレームと独立に表示され続ける軽い注記（評価しない、図示ヒント程度）」を提案。
2. **document common レベルに variant（状態）が無い** — gate は要素の存在チェックであり「アプリ全体がある状態か」は書けない。1 と同根。
3. **collection の順序が未規定** — 「次の/最終エピソード」を condition label の自然文で逃げた（妥当だが確証なし）。
4. **同一 component 内・別 inline の同名要素**（ジャンル行/マイリスト行 双方の `作品カード`）— `インスタンス.要素` で一意になるはずという類推。variant 跨ぎの規定はあるが inline 跨ぎの規定が無い。

## 確信度自己申告（座標）

高: component/variant・interaction・condition label・push/goto/back(X)。中: collection（順序）・inline 同名参照・effect による self-transition。低〜中: document common のオーバーレイ転用。present/dismiss/switch/@S は要件に無く未使用（タブ無し課題の設計どおり）。
