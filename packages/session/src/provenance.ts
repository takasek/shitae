import type { Location } from '@shitae/runtime';
import type { Result } from '@shitae/ast';
import type { Source, Operation } from './index.js';
import type { ObservationRef } from './scenario.js';

export interface PointCounts { retained: number; ghost: number; discarded: number }
export interface RecordedPoint {
  id: number; ref: ObservationRef; resultPosition: number | null; ordinal: number;
  kind: 'transition' | 'event'; label: string; location: Location;
}
export interface ProvenancePoint extends RecordedPoint {
  status: keyof PointCounts; seekable: boolean; current: boolean;
}
export interface RecordedResult { position: number; resultIndex: number; source: Source | null; label: string; observationIds: number[] }
export interface StepRecord {
  step: number; kind: 'dispatch' | 'seek' | 'reset' | 'setTestVariant'; operationId: number | null;
  actionText: string; branch: string | null; host: Location; placement: Pick<Operation['placement'], 'root' | 'path'> | null;
  from: ObservationRef; target: (RecordedPoint & { actionText: string }) | null;
  discarded: ObservationRef[]; results: RecordedResult[]; observations: RecordedPoint[];
}
export interface ProvenanceStep extends Omit<StepRecord, 'observations' | 'results'> {
  observations: ProvenancePoint[];
  results: Array<Omit<RecordedResult, 'observationIds'> & { observations: ProvenancePoint[]; counts: PointCounts }>;
  counts: PointCounts; completionObservationId: number | null;
}
export type ProvenanceItem = Omit<ProvenanceStep, 'observations' | 'results'> & { resultCount: number; observationCount: number };
export interface Availability { available: boolean; reason: string | null }
export interface ProvenanceSummary extends Availability {
  steps: Record<StepRecord['kind'], number>; resultCount: number; observations: PointCounts;
  cursor: (RecordedPoint & { actionText: string }) | null;
}
export interface ProvenancePage extends Availability { items: ProvenanceItem[]; nextAfter: number | null }
export interface ReviewText extends Availability { text: string }
export const provenanceAvailability = (available: boolean): Availability => ({ available, reason: available ? null : 'Source-byte model metadata is required' });
export const pointCounts = (): PointCounts => ({ retained: 0, ghost: 0, discarded: 0 });
const countsOf = (points: ProvenancePoint[]) => points.reduce((counts, p) => { counts[p.status]++; return counts; }, pointCounts());
const refText = (p: RecordedPoint) => `記録${p.ref.step} / 観測${p.ref.observation + 1}`;
const locText = (loc: Location) => `${loc.module}::${loc.component}${loc.variant === null ? '' : '##' + loc.variant}`;
const statusText = { retained: '現在まで', ghost: 'ghost（先の経路）', discarded: '破棄済み（記録のみ）' };
export function resultLabel(body: Result['body']): string {
  if (body.kind === 'effect') return body.text;
  const target = body.target;
  const name = target ? (target.module ? target.module + '::' : '') +
    ('kind' in target && target.kind === 'variant' ? '##' + target.name : target.name + ('variant' in target && target.variant ? '##' + target.variant : '')) : '';
  const session = body.kind === 'transition' && body.session?.name != null ? (name ? ', ' : '') + '@' + body.session.name : '';
  return (body.kind === 'transition' ? body.word : body.verb) + '(' + name + session + ')';
}

/** Display annotations only. Never consumed by execution or the scenario hash projection. */
export class Provenance {
  readonly steps: StepRecord[] = [];
  readonly points = new Map<number, RecordedPoint>();
  constructor(initial: RecordedPoint) { this.points.set(initial.id, initial); }
  locate(id: number): RecordedPoint & { actionText: string } {
    const point = this.points.get(id)!;
    return { ...point, actionText: point.ref.step === 0 ? '起動' : this.steps[point.ref.step - 1]!.actionText };
  }
  record(record: StepRecord) {
    this.steps.push(structuredClone(record));
    for (const point of record.observations) this.points.set(point.id, structuredClone(point));
  }
  projectPoint(point: RecordedPoint, retained: Map<number, boolean>, cursor: number): ProvenancePoint {
    const status = retained.has(point.id) ? retained.get(point.id) ? 'ghost' : 'retained' : 'discarded';
    return { ...point, status, seekable: status !== 'discarded', current: point.id === cursor };
  }
  detail(step: number, retained: Map<number, boolean>, cursor: number): ProvenanceStep {
    const record = this.steps[step - 1]!;
    const observations = record.observations.map(p => this.projectPoint(p, retained, cursor));
    const results = record.results.map(({ observationIds, ...r }) => {
      const points = observations.filter(p => observationIds.includes(p.id));
      return { ...r, observations: points, counts: countsOf(points) };
    });
    const completion = observations.at(-1);
    return { ...record, observations, results, counts: countsOf(observations),
      completionObservationId: completion && completion.seekable ? completion.id : null };
  }
  item(step: number, retained: Map<number, boolean>, cursor: number): ProvenanceItem {
    const { observations, results, ...item } = this.detail(step, retained, cursor);
    return { ...item, resultCount: results.length, observationCount: observations.length };
  }
  summary(retained: Map<number, boolean>, cursor: number): ProvenanceSummary {
    const steps = { dispatch: 0, seek: 0, reset: 0, setTestVariant: 0 };
    for (const step of this.steps) steps[step.kind]++;
    return { ...provenanceAvailability(true), steps, resultCount: this.steps.reduce((n, s) => n + s.results.length, 0),
      observations: countsOf([...this.points.values()].map(p => this.projectPoint(p, retained, cursor))), cursor: this.locate(cursor) };
  }
  review(retained: Map<number, boolean>, cursor: number): ReviewText {
    const current = this.locate(cursor);
    const lines = ['検討手順', '変更後モデルで人が選び直すための参照です。版をまたぐ自動再生や意味の一致を保証しません。目的・問い・期待は利用者が指定してください。',
      `現在地: ${locText(current.location)} / ${refText(current)} / ${current.actionText}`, '保存範囲: 巻戻し・破棄済み経路・reset前・手動試験も含む全記録。'];
    for (const record of this.steps) {
      const d = this.detail(record.step, retained, cursor);
      lines.push(`${d.step}. ${d.actionText}${d.branch === null ? '' : ' / 条件: ' + d.branch} / ${locText(d.host)}${d.placement ? ' / 配置: ' + d.placement.root + '[' + d.placement.path.join('.') + ']' : ''}`);
      if (d.target) lines.push(`  巻戻し/やり直し先: ${d.target.actionText} / ${refText(d.target)} / ${d.target.resultPosition === null ? '結果なし' : '結果' + (d.target.resultPosition + 1)} / ${d.target.label}`);
      if (d.discarded.length) lines.push(`  分岐・破棄 ${d.discarded.length}観測点: ${d.discarded.map(r => `記録${r.step}/観測${r.observation + 1}`).join(', ')}`);
      for (const r of d.results) lines.push(`  結果${r.position + 1}: ${r.label}${r.observations.length ? '' : ' / 観測なし'}`);
      for (const p of d.observations) lines.push(`  ${refText(p)}${p.resultPosition === null ? '' : ' / 結果' + (p.resultPosition + 1)}: ${p.label} / ${locText(p.location)} / ${statusText[p.status]}${p.current ? ' / 現在地' : ''}`);
      if (!d.observations.length && d.kind === 'dispatch') lines.push('  観測なし（移動先なし）');
    }
    return { ...provenanceAvailability(true), text: lines.join('\n') + '\n' };
  }
}
