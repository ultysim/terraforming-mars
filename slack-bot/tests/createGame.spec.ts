import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  createGame,
  DEFAULT_TM_BASE_URL,
  hostGameUrl,
  playerUrl,
  spectatorUrl,
  TmApiError,
  tmBaseUrl,
} from '../src/tm/createGame.js';
import {buildNewGameConfig} from '../src/tm/defaults.js';

const minimalConfig = buildNewGameConfig({
  players: [
    {name: 'Alice', color: 'red', beginner: false, handicap: 0, first: false},
    {name: 'Bob', color: 'blue', beginner: false, handicap: 0, first: false},
  ],
});

const okResponse = {
  id: 'g123',
  name: 'Mars-2026',
  activePlayer: 'red',
  phase: 'research',
  spectatorId: 's456',
  players: [
    {id: 'pAAA', name: 'Alice', color: 'red'},
    {id: 'pBBB', name: 'Bob', color: 'blue'},
  ],
  gameOptions: {},
  lastSoloGeneration: 0,
  expectedPurgeTimeMs: 0,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TM_BASE_URL;
});

describe('tmBaseUrl', () => {
  it('returns the default when TM_BASE_URL is unset', () => {
    delete process.env.TM_BASE_URL;
    expect(tmBaseUrl()).toBe(DEFAULT_TM_BASE_URL);
  });

  it('strips trailing slashes from the env value', () => {
    process.env.TM_BASE_URL = 'https://example.org///';
    expect(tmBaseUrl()).toBe('https://example.org');
  });
});

describe('createGame', () => {
  it('POSTs JSON to /api/creategame at the configured base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(okResponse), {
        status: 200,
        headers: {'content-type': 'application/json'},
      }),
    );

    const game = await createGame(minimalConfig, {
      fetchImpl: fetchMock as unknown as typeof fetch,
      baseUrl: 'https://tm.example.com',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://tm.example.com/api/creategame');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.players).toHaveLength(2);
    expect(body.players[0]).toMatchObject({name: 'Alice', color: 'red'});
    expect(body.board).toBe('tharsis');
    expect(body.startingCeos).toBe(3);

    expect(game.id).toBe('g123');
    expect(game.players[0]!.id).toBe('pAAA');
  });

  it('throws TmApiError on non-2xx', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('quota exceeded', {status: 429})),
    );

    let caught: unknown;
    try {
      await createGame(minimalConfig, {fetchImpl: fetchMock as unknown as typeof fetch});
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(TmApiError);
    expect((caught as TmApiError).status).toBe(429);
    expect((caught as TmApiError).responseBody).toBe('quota exceeded');
  });
});

describe('URL helpers', () => {
  it('builds well-formed player/host/spectator URLs', () => {
    const base = 'https://tm.example.com';
    expect(playerUrl(base, 'pABC')).toBe('https://tm.example.com/player?id=pABC');
    expect(hostGameUrl(base, 'gXYZ')).toBe('https://tm.example.com/game?id=gXYZ');
    expect(spectatorUrl(base, 'sQQQ')).toBe('https://tm.example.com/spectator?id=sQQQ');
  });

  it('URL-encodes ids with special characters', () => {
    expect(playerUrl('https://a', 'p?abc')).toBe('https://a/player?id=p%3Fabc');
  });
});
