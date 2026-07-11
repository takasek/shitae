export interface Span {
  offset: number;
  length: number;
  line: number;
  col: number;
}

export interface Diagnostic {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  span: Span;
}

export interface Document {
  imports: Import[];
  components: Component[];
}

export interface Import {
  module: string;
  alias: string;
  span: Span;
}

export interface Component {
  name: string;
  common: Body;
  variants: Variant[];
  span: Span;
}

export interface Variant {
  name: string;
  body: Body;
  span: Span;
}

export interface Body {
  elements: ElementLine[];
  interactions: Interaction[];
}

export interface ElementLine {
  collection: boolean;
  alias: string | null;
  value: Ref | Inline;
  span: Span;
}

export interface Ref {
  kind: 'ref';
  name: string;
  span: Span;
}

export interface Inline {
  kind: 'inline';
  elements: ElementLine[];
  span: Span;
}

export interface Interaction {
  action: Action;
  results: Result[];
  span: Span;
}

export interface Action {
  text: string;
  target: Reference | null;
  span: Span;
}

export interface Reference {
  module: string | null;
  name: string;
  member: string | null;
  existsGated: boolean;
  span: Span;
}

export interface Result {
  label: string | null;
  body: Transition | Effect;
  span: Span;
}

export type TransitionWord = 'push' | 'back' | 'goto' | 'exit' | 'present' | 'dismiss';

export const TRANSITION_WORDS: readonly TransitionWord[] = ['push', 'present', 'goto', 'back', 'exit', 'dismiss'];

export interface Transition {
  kind: 'transition';
  word: TransitionWord;
  target: NavTarget | null;
  session: Session | null;
  span: Span;
}

export interface Effect {
  kind: 'effect';
  text: string;
  span: Span;
}

export type NavTarget =
  | { kind: 'component'; module: string | null; name: string; variant: string | null }
  | { kind: 'variant'; name: string };

export interface Session {
  name: string | null;
  span: Span;
}
