import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from './app';
import { config } from './config';
import type { CatalogBook, LoanRecord, MemberRecord } from './clients/downstream';

const SERVICE_KEY = config.serviceKey;

function makeToken(payload: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>): string =>
    Buffer.from(JSON.stringify(value)).toString('base64url');

  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.signature`;
}

const librarianToken = makeToken({ role: 'librarian', userId: 1 });
const memberToken = makeToken({ role: 'member', userId: 2 });

function librarianHeaders(token: string = librarianToken): Record<string, string> {
  return { 'x-service-key': SERVICE_KEY, authorization: `Bearer ${token}` };
}

type StubResponse = { status?: number; body: unknown } | 'reject';

function pathOf(url: string): string {
  return new URL(url).pathname;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Replaces the global fetch so no test touches the network. Each downstream
 * path has to be declared explicitly — an unexpected request fails the test
 * via the 502 it produces rather than silently hitting localhost.
 */
function stubDownstream(routes: Record<string, StubResponse>) {
  const fetchMock = vi.fn(async (url: string, init?: unknown) => {
    void init;

    const route = routes[pathOf(url)];
    if (!route) {
      throw new Error(`Unexpected downstream request: ${url}`);
    }

    if (route === 'reject') {
      throw new Error('network unreachable');
    }

    return jsonResponse(route.body, route.status ?? 200);
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const books: CatalogBook[] = [
  { id: 1, title: 'Dune' },
  { id: 2, title: 'Neuromancer' },
  { id: 3, title: 'Solaris' },
  { id: 4, title: 'Never borrowed' },
];

const loans: LoanRecord[] = [
  {
    id: 1,
    bookId: 1,
    memberId: 1,
    borrowedAt: '2024-01-01T00:00:00.000Z',
    returnedAt: '2024-01-05T00:00:00.000Z',
    dueDate: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 2,
    bookId: 1,
    memberId: 2,
    borrowedAt: '2024-01-06T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-20T00:00:00.000Z',
  },
  {
    id: 3,
    bookId: 2,
    memberId: 1,
    borrowedAt: '2024-01-07T00:00:00.000Z',
    returnedAt: '2024-01-09T00:00:00.000Z',
    dueDate: '2024-01-21T00:00:00.000Z',
  },
  {
    id: 4,
    bookId: 3,
    memberId: 3,
    borrowedAt: '2024-01-08T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-22T00:00:00.000Z',
  },
  {
    id: 5,
    bookId: 99,
    memberId: 1,
    borrowedAt: '2024-01-10T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-24T00:00:00.000Z',
  },
];

const members: MemberRecord[] = [
  { id: 2, name: 'Grace' },
  { id: 5, name: 'Ada' },
  { id: 6, name: 'Linus' },
];

const overdueLoans: LoanRecord[] = [
  {
    id: 10,
    bookId: 1,
    memberId: 5,
    borrowedAt: '2024-01-01T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-10T00:00:00.000Z',
  },
  {
    id: 11,
    bookId: 2,
    memberId: 2,
    borrowedAt: '2024-01-02T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-11T00:00:00.000Z',
  },
  {
    id: 12,
    bookId: 3,
    memberId: 5,
    borrowedAt: '2024-01-03T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-12T00:00:00.000Z',
  },
  {
    id: 13,
    bookId: 1,
    memberId: 99,
    borrowedAt: '2024-01-04T00:00:00.000Z',
    returnedAt: null,
    dueDate: '2024-01-13T00:00:00.000Z',
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('GET /health', () => {
  it('responds 200 without any header', async () => {
    const fetchMock = stubDownstream({});

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'reporting-service' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('service key gate', () => {
  it('responds 401 when x-service-key is missing', async () => {
    const fetchMock = stubDownstream({});

    const response = await request(app)
      .get('/reports/most-borrowed')
      .set({ authorization: `Bearer ${librarianToken}` });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid service key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responds 401 when x-service-key is wrong', async () => {
    const fetchMock = stubDownstream({});

    const response = await request(app)
      .get('/reports/most-borrowed')
      .set({ 'x-service-key': 'wrong-key', authorization: `Bearer ${librarianToken}` });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid service key' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responds 401 for an unknown path without a service key', async () => {
    stubDownstream({});

    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid service key' });
  });
});

describe('librarian guard on /reports', () => {
  it('responds 401 when the Authorization header is missing', async () => {
    const fetchMock = stubDownstream({});

    const response = await request(app)
      .get('/reports/most-borrowed')
      .set({ 'x-service-key': SERVICE_KEY });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid access token' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('responds 401 when the Authorization header is not a Bearer token', async () => {
    stubDownstream({});

    const response = await request(app)
      .get('/reports/overdue-summary')
      .set({ 'x-service-key': SERVICE_KEY, authorization: 'Basic abc' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid access token' });
  });

  it('responds 401 when the token payload cannot be decoded', async () => {
    stubDownstream({});

    const response = await request(app)
      .get('/reports/most-borrowed')
      .set({ 'x-service-key': SERVICE_KEY, authorization: 'Bearer not-a-jwt' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid access token' });
  });

  it('responds 403 for a member-role token', async () => {
    const fetchMock = stubDownstream({});

    const response = await request(app)
      .get('/reports/overdue-summary')
      .set(librarianHeaders(memberToken));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Librarian role required' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('GET /reports/most-borrowed', () => {
  it('counts every loan per book, joins the title and sorts by count then bookId', async () => {
    const fetchMock = stubDownstream({
      '/internal/loans': { body: loans },
      '/internal/books': { body: books },
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { bookId: 1, title: 'Dune', totalBorrows: 2 },
      { bookId: 2, title: 'Neuromancer', totalBorrows: 1 },
      { bookId: 3, title: 'Solaris', totalBorrows: 1 },
    ]);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      `${config.loanServiceUrl}/internal/loans`,
      `${config.catalogServiceUrl}/internal/books`,
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      headers: { 'x-service-key': SERVICE_KEY },
    });
  });

  it('skips a loan whose book no longer exists and omits books with no loans', async () => {
    const fetchMock = stubDownstream({
      '/internal/loans': { body: loans },
      '/internal/books': { body: books },
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(200);
    const body = response.body as { bookId: number }[];
    expect(body.map((row) => row.bookId)).not.toContain(99);
    expect(body.map((row) => row.bookId)).not.toContain(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('responds 200 with an empty array when there are no loans', async () => {
    stubDownstream({
      '/internal/loans': { body: [] },
      '/internal/books': { body: books },
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('issues both downstream calls in parallel', async () => {
    let releaseGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    let calls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      calls += 1;
      if (calls === 2) {
        releaseGate();
      }

      // Neither response settles until both requests have been issued.
      await gate;

      return pathOf(url) === '/internal/loans' ? jsonResponse([]) : jsonResponse(books);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('responds 502 with the upstream message when the loan service answers non-2xx', async () => {
    stubDownstream({
      '/internal/loans': { status: 500, body: { error: 'Loan service exploded' } },
      '/internal/books': { body: books },
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Loan service exploded' });
  });

  it('responds 502 when the catalog service fails even though the loan service succeeded', async () => {
    stubDownstream({
      '/internal/loans': { body: loans },
      '/internal/books': { status: 401, body: { error: 'Invalid service key' } },
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Invalid service key' });
  });

  it('responds 502 when an upstream is unreachable', async () => {
    stubDownstream({
      '/internal/loans': 'reject',
      '/internal/books': 'reject',
    });

    const response = await request(app).get('/reports/most-borrowed').set(librarianHeaders());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Loan service request failed' });
  });
});

describe('GET /reports/overdue-summary', () => {
  it('counts overdue loans per member, joins the name and sorts by memberId', async () => {
    const fetchMock = stubDownstream({
      '/internal/loans/overdue': { body: overdueLoans },
      '/internal/members': { body: members },
    });

    const response = await request(app).get('/reports/overdue-summary').set(librarianHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { memberId: 2, name: 'Grace', overdueCount: 1 },
      { memberId: 5, name: 'Ada', overdueCount: 2 },
    ]);

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual([
      `${config.loanServiceUrl}/internal/loans/overdue`,
      `${config.memberServiceUrl}/internal/members`,
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      headers: { 'x-service-key': SERVICE_KEY },
    });
  });

  it('skips an overdue loan whose member no longer exists', async () => {
    stubDownstream({
      '/internal/loans/overdue': { body: overdueLoans },
      '/internal/members': { body: members },
    });

    const response = await request(app).get('/reports/overdue-summary').set(librarianHeaders());

    expect(response.status).toBe(200);
    const body = response.body as { memberId: number }[];
    expect(body.map((row) => row.memberId)).toEqual([2, 5]);
    expect(body.map((row) => row.memberId)).not.toContain(99);
  });

  it('responds 200 with an empty array when no loan is overdue', async () => {
    stubDownstream({
      '/internal/loans/overdue': { body: [] },
      '/internal/members': { body: members },
    });

    const response = await request(app).get('/reports/overdue-summary').set(librarianHeaders());

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('responds 502 when the member service fails even though the loan service succeeded', async () => {
    stubDownstream({
      '/internal/loans/overdue': { body: overdueLoans },
      '/internal/members': { status: 500, body: { error: 'Member service exploded' } },
    });

    const response = await request(app).get('/reports/overdue-summary').set(librarianHeaders());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Member service exploded' });
  });

  it('responds 502 when an upstream is unreachable', async () => {
    stubDownstream({
      '/internal/loans/overdue': 'reject',
      '/internal/members': 'reject',
    });

    const response = await request(app).get('/reports/overdue-summary').set(librarianHeaders());

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Loan service request failed' });
  });
});
