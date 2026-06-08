import type { Diagnostic, Document, TransitionWord } from '@shitae/ast';

// ──────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────

/** 画面位置。module=null は同一ファイル内 */
export interface Location {
  module: string | null;
  component: string;
  variation: string | null;
}

/** present/dismiss 由来は name=null（無名セッション） */
export interface SessionMarker {
  name: string | null;
}

/** 画面スタックの1フレーム */
export interface Frame {
  location: Location;
  /** push→false / present→true（back の壁）*/
  wall: boolean;
  /** この遷移が begin したセッション（SPEC:219）*/
  beginsSession: SessionMarker | null;
  /** 振る舞い正規化後も元語を保持 */
  word: TransitionWord;
}

/** runtime 実行状態。frames 末尾 = 現在地。空禁止 */
export interface RuntimeState {
  frames: Frame[];
}

export interface ReduceResult {
  state: RuntimeState;
  diagnostics: Diagnostic[];
}

// ──────────────────────────────────────────────────
// initialState
// ──────────────────────────────────────────────────

/** エントリ画面から初期状態を構築する。起点は呼び手が決める（SPEC 未規定）。 */
export function initialState(entry: Location): RuntimeState {
  return {
    frames: [
      {
        location: entry,
        wall: false,
        beginsSession: null,
        word: 'push',
      },
    ],
  };
}

/** 便宜ヘルパ: Document の最初の component をエントリとする Location を返す。
 *  コアの initialState とは分離して提供する。 */
export function entryFromDocument(doc: Document): Location {
  const comp = doc.components[0];
  if (!comp) throw new Error('Document に component が存在しない');
  return { module: null, component: comp.name, variation: null };
}
