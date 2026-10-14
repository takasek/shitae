import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { Session, SessionError, type QueryOptions } from '@shitae/session';

function invalid(message: string): never { throw new SessionError('INVALID_REQUEST', message); }
function fields(request: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(request).some((key) => !allowed.includes(key))) invalid('Unexpected request field');
}

/** Each input line is one request; queries never mutate the Session.
 * Request failures are protocol responses. Unexpected internal errors stop the process. */
export async function serveSession(session: Session): Promise<void> {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    let id: string | number | null = null;
    let response: unknown;
    try {
      let raw: unknown;
      try { raw = JSON.parse(line); } catch { invalid('Invalid JSON'); }
      if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) invalid('Request must be an object');
      const request = raw as Record<string, unknown>;
      if (typeof request.id !== 'string' && !(typeof request.id === 'number' && Number.isFinite(request.id))) invalid('id must be a string or finite number');
      id = request.id;
      if (typeof request.command !== 'string') invalid('command must be a string');
      let result;
      if (request.command === 'query') {
        fields(request, ['id', 'command', 'select', 'history', 'observationId']);
        if (request.select !== undefined && (!Array.isArray(request.select) || request.select.some((s) => typeof s !== 'string'))) invalid('select must be an array of strings');
        result = session.query({ select: request.select as string[] | undefined, history: request.history as QueryOptions['history'], observationId: request.observationId as number | undefined });
      } else if (request.command === 'dispatch') {
        fields(request, ['id', 'command', 'handle', 'branch']);
        if (typeof request.handle !== 'string') invalid('handle must be a string');
        if (request.branch !== undefined && typeof request.branch !== 'string') invalid('branch must be a string');
        result = session.dispatch({ handle: request.handle, branch: request.branch as string | undefined });
      } else if (request.command === 'reset') {
        fields(request, ['id', 'command']); result = session.reset();
      } else if (request.command === 'setTestVariant') {
        fields(request, ['id', 'command', 'module', 'component', 'variant']);
        if (typeof request.module !== 'string' || typeof request.component !== 'string' || typeof request.variant !== 'string') invalid('module/component/variant must be strings');
        result = session.setTestVariant({ module: request.module, component: request.component, variant: request.variant });
      } else {
        throw new SessionError('UNKNOWN_COMMAND', 'Unknown command');
      }
      response = { id, ok: true, protocolVersion: 1, ...result };
    } catch (error) {
      if (!(error instanceof SessionError)) throw error;
      response = { id, ok: false, protocolVersion: 1, error: { code: error.code, message: error.message.slice(error.code.length + 2) }, revision: session.query().revision };
    }
    if (!process.stdout.write(JSON.stringify(response) + '\n')) await once(process.stdout, 'drain');
  }
}
