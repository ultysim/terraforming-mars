/**
 * Custom Bolt receiver for Vercel functions using the Web standards
 * Request/Response API.
 *
 * Why a custom receiver?
 * - Bolt's built-in HTTPReceiver wraps Node's http.createServer and can't run
 *   in a per-request serverless environment.
 * - Vercel's auto body-parsing breaks Slack signature verification (we need
 *   the raw bytes). Reading from a Web standard Request via `await req.text()`
 *   gives us the raw body cleanly.
 */

import crypto from 'node:crypto';
import type {App, Receiver, ReceiverEvent} from '@slack/bolt';

export interface VercelReceiverOptions {
  signingSecret: string;
  /** Max seconds a Slack request timestamp can lag before we reject it. */
  signatureToleranceSeconds?: number;
}

export class VercelReceiver implements Receiver {
  private bolt?: App;
  private readonly signingSecret: string;
  private readonly toleranceSeconds: number;

  public constructor(options: VercelReceiverOptions) {
    this.signingSecret = options.signingSecret;
    this.toleranceSeconds = options.signatureToleranceSeconds ?? 60 * 5;
  }

  public init(app: App): void {
    this.bolt = app;
  }

  // Bolt's Receiver contract; not used in serverless.
  public async start(): Promise<this> {
    return this;
  }
  public async stop(): Promise<void> {}

  /** Entry point invoked by the Vercel function handler. */
  public async handle(request: Request): Promise<Response> {
    if (!this.bolt) {
      return new Response('Bolt App not initialized', {status: 500});
    }

    const rawBody = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');

    if (!timestamp || !signature) {
      return new Response('Missing Slack signature headers', {status: 401});
    }

    if (!this.verifySignature(timestamp, rawBody, signature)) {
      return new Response('Invalid Slack signature', {status: 401});
    }

    const contentType = request.headers.get('content-type') ?? '';
    let body: Record<string, unknown>;
    try {
      body = parseSlackBody(contentType, rawBody);
    } catch (err) {
      console.error('[slack-bot] failed to parse body', err);
      return new Response('Bad request', {status: 400});
    }

    // Slack Events API URL-verification handshake (defensive; not used today).
    if (body.type === 'url_verification' && typeof body.challenge === 'string') {
      return new Response(body.challenge, {
        status: 200,
        headers: {'content-type': 'text/plain'},
      });
    }

    return new Promise<Response>((resolve) => {
      let settled = false;
      const event: ReceiverEvent = {
        body,
        ack: async (response) => {
          if (settled) return;
          settled = true;
          resolve(buildAckResponse(response));
        },
      };

      this.bolt!.processEvent(event).then(
        () => {
          if (!settled) {
            settled = true;
            resolve(new Response('', {status: 200}));
          }
        },
        (err) => {
          console.error('[slack-bot] processEvent error', err);
          if (!settled) {
            settled = true;
            resolve(new Response('Internal error', {status: 500}));
          }
        },
      );
    });
  }

  private verifySignature(timestamp: string, body: string, signature: string): boolean {
    const ts = Number.parseInt(timestamp, 10);
    if (!Number.isFinite(ts)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - ts) > this.toleranceSeconds) return false;

    const baseString = `v0:${timestamp}:${body}`;
    const expected = `v0=${crypto.createHmac('sha256', this.signingSecret).update(baseString).digest('hex')}`;

    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }
}

export function parseSlackBody(contentType: string, rawBody: string): Record<string, unknown> {
  if (contentType.includes('application/json')) {
    return JSON.parse(rawBody) as Record<string, unknown>;
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawBody);
    const obj: Record<string, string> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    // Interactive payloads (view_submission, block_actions, etc.) come as a
    // form-urlencoded body with a single `payload` field whose value is JSON.
    if (typeof obj.payload === 'string') {
      return JSON.parse(obj.payload) as Record<string, unknown>;
    }
    return obj;
  }
  throw new Error(`Unsupported content-type: ${contentType}`);
}

function buildAckResponse(response: unknown): Response {
  if (response === undefined || response === null || response === '') {
    return new Response('', {status: 200});
  }
  if (typeof response === 'string') {
    return new Response(response, {status: 200, headers: {'content-type': 'text/plain'}});
  }
  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {'content-type': 'application/json'},
  });
}
