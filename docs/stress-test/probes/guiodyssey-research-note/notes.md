# GUIOdyssey research-to-note probe

## Source

出典は [GUIOdyssey 公式リポジトリ](https://github.com/OpenGVLab/GUI-Odyssey) と [GUIOdyssey データセット](https://huggingface.co/datasets/hflqf88888/GUIOdyssey) で、データセットのライセンスは CC BY 4.0 である。

## Preconditions

対象は episode 7872483543119388（Opera と Simplenote、Pixel 7 Pro、18 steps、circle research-to-note）である。プローブは、検索結果の選択とコピー、別アプリのノート編集と貼り付けを抽象 UI 状態として保持する。

## Expected trace and success criteria

Opera で円の性質を調べて本文をコピーし、Simplenote の新規ノートへ貼り付けて保存することが成功条件である。

## Representation gaps

アプリ間のクリップボード因果と保存内容は自然言語の副作用であり、shitae はクリップボード assertion を評価しない。実機の座標・スクリーンショット・raw data は保持しない。
