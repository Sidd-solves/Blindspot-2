import type { Request } from 'express';
import type { Sessions } from '../sessions';
import type { loadCaseStudy } from '../case-study';

/** What route modules share with the server: visitor sessions, logging and live events. */
export interface RouteContext {
  sessions: Sessions;
  sid: (req: Request) => string;
  log: (message: string) => void;
  broadcastTo: (sessionId: string, event: string, payload: unknown) => void;
  caseStudy: () => ReturnType<typeof loadCaseStudy>;
  uploadMaxRows: number;
}
