import type { Diagnostic, Document, NavTarget, Span, Transition, TransitionWord } from '@shitae/ast';

// ──────────────────────────────────────────────────
// 型定義
// ──────────────────────────────────────────────────

/** 画面位置。module=null は同一ファイル内 */
export interface Location {
  module: string | null;
  component: string;
  variant: string | null;
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
  return { module: null, component: comp.name, variant: null };
}

// ──────────────────────────────────────────────────
// 内部ユーティリティ
// ──────────────────────────────────────────────────

function warn(code: string, message: string, span: Span): Diagnostic {
  return { severity: 'warning', code, message, span };
}

function closeSession(
  frames: Frame[],
  state: RuntimeState,
  sessionName: string | null,
  twistWord: TransitionWord,
  twistMsg: string,
  closerLabel: string,
  span: Span,
  diags: Diagnostic[],
): ReduceResult {
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i]!;
    if (f.beginsSession !== null && f.beginsSession.name === sessionName) {
      if (f.word === twistWord) {
        diags.push(warn('R001', twistMsg, span));
      }
      return { state: { frames: frames.slice(0, i) }, diagnostics: diags };
    }
  }
  const label = sessionName !== null ? `@${sessionName}` : '(無名セッション)';
  diags.push(warn('R002', `${closerLabel} 対象セッション ${label} がスタックに不在`, span));
  return { state, diagnostics: diags };
}

/** NavTarget を現在の Location を踏まえて Location へ正規化する */
function navTargetToLocation(target: NavTarget, current: Location): Location {
  if (target.kind === 'variant') {
    // ##姿 — 同一 component 内の姿切替
    return { module: current.module, component: current.component, variant: target.name };
  }
  return {
    module: target.module ?? current.module,
    component: target.name,
    variant: target.variant ?? null,
  };
}

// ──────────────────────────────────────────────────
// reduce — 純粋スタックマシン
// ──────────────────────────────────────────────────

export function reduce(state: RuntimeState, transition: Transition): ReduceResult {
  const { word, target, session, span } = transition;
  const frames = state.frames;
  const current = frames[frames.length - 1]!.location;
  const diags: Diagnostic[] = [];

  switch (word) {
    case 'push': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      return {
        state: {
          frames: [
            ...frames,
            {
              location: loc,
              wall: false,
              beginsSession: session ? { name: session.name } : null,
              word: 'push',
            },
          ],
        },
        diagnostics: diags,
      };
    }

    case 'present': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      return {
        state: {
          frames: [
            ...frames,
            {
              location: loc,
              wall: true,
              beginsSession: session ? { name: session.name } : { name: null },
              word: 'present',
            },
          ],
        },
        diagnostics: diags,
      };
    }

    case 'goto': {
      if (!target) return { state, diagnostics: diags };
      const loc = navTargetToLocation(target, current);
      const top = frames[frames.length - 1]!;
      // SPEC:264 — ##姿 への goto は「積まれた時点のスタックエントリの姿を書き換える」だけ。
      // wall・beginsSession・word（begin 地点であること自体）は保存する。
      // component への goto（別 component への置換）は begin 地点を消す全置換のまま。
      const newTop: Frame =
        target.kind === 'variant'
          ? { ...top, location: loc }
          : { location: loc, wall: false, beginsSession: null, word: 'goto' };
      return {
        state: { frames: [...frames.slice(0, -1), newTop] },
        diagnostics: diags,
      };
    }

    case 'back': {
      if (!target) {
        // back() — 壁を越えずに1段 pop
        if (frames.length <= 1) {
          // 最小スタック維持
          return { state, diagnostics: diags };
        }
        const top = frames[frames.length - 1]!;
        if (top.wall) {
          // 壁の内側: no-op + R003
          diags.push(warn('R003', 'back() が壁に阻まれ no-op', span));
          return { state, diagnostics: diags };
        }
        return { state: { frames: frames.slice(0, -1) }, diagnostics: diags };
      } else {
        // back(X) — 明示先まで pop（壁を越えてよい）
        const targetLoc = navTargetToLocation(target, current);
        // 末尾から targetComponent を探す
        for (let i = frames.length - 1; i >= 0; i--) {
          if (frames[i]!.location.component === targetLoc.component) {
            return { state: { frames: frames.slice(0, i + 1) }, diagnostics: diags };
          }
        }
        // 見つからない → R004
        diags.push(warn('R004', `back 対象 "${targetLoc.component}" がスタックに不在`, span));
        return { state, diagnostics: diags };
      }
    }

    case 'exit':
      // exit は push で開いたセッションを閉じる正規形。present で開いたのを exit で閉じるとねじれ(R001)
      return closeSession(
        frames, state, session?.name ?? null,
        'present', 'ねじれ: present で開いたセッションを exit で閉じている',
        'exit', span, diags,
      );

    case 'dismiss':
      // dismiss は present で開いたセッションを閉じる正規形。push で開いたのを dismiss で閉じるとねじれ(R001)
      return closeSession(
        frames, state, session?.name ?? null,
        'push', 'ねじれ: push で開いたセッションを dismiss で閉じている',
        'dismiss', span, diags,
      );
  }
}
