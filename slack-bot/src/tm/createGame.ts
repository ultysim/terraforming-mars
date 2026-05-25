/**
 * Thin HTTP client for the Terraforming Mars `POST /api/creategame` route.
 *
 * Defaults TM_BASE_URL to the community-run Heroku instance. Throws on any
 * non-2xx response so the caller can surface the error back to the host
 * via Slack DM.
 */

import type {NewGameConfig, SimpleGameModel} from './types.js';

export const DEFAULT_TM_BASE_URL = 'https://terraforming-mars.herokuapp.com';

export class TmApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(`Terraforming Mars API returned ${status}: ${responseBody.slice(0, 200)}`);
    this.name = 'TmApiError';
  }
}

export function tmBaseUrl(): string {
  const raw = process.env.TM_BASE_URL?.trim();
  if (raw === undefined || raw === '') return DEFAULT_TM_BASE_URL;
  return raw.replace(/\/+$/, '');
}

export async function createGame(
  config: NewGameConfig,
  options: {fetchImpl?: typeof fetch; baseUrl?: string} = {},
): Promise<SimpleGameModel> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.baseUrl ?? tmBaseUrl();
  const url = `${base}/api/creategame`;

  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const text = await safeText(res);
    throw new TmApiError(res.status, text);
  }

  return (await res.json()) as SimpleGameModel;
}

/** Build the player share URL the bot DMs to each player. */
export function playerUrl(baseUrl: string, playerId: string): string {
  return `${baseUrl}/player?id=${encodeURIComponent(playerId)}`;
}

/** Build the host dashboard URL (lists every player link). */
export function hostGameUrl(baseUrl: string, gameId: string): string {
  return `${baseUrl}/game?id=${encodeURIComponent(gameId)}`;
}

/** Build the spectator URL. */
export function spectatorUrl(baseUrl: string, spectatorId: string): string {
  return `${baseUrl}/spectator?id=${encodeURIComponent(spectatorId)}`;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
