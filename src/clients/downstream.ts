import { config } from '../config';

export interface LoanRecord {
  id: number;
  bookId: number;
  memberId: number;
  borrowedAt: string;
  returnedAt: string | null;
  dueDate: string;
}

export interface CatalogBook {
  id: number;
  title: string;
}

export interface MemberRecord {
  id: number;
  name: string;
}

export type DownstreamResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

const LOAN_SERVICE_ERROR = 'Loan service request failed';
const CATALOG_SERVICE_ERROR = 'Catalog service request failed';
const MEMBER_SERVICE_ERROR = 'Member service request failed';

/**
 * The sibling services answer errors as `{ error: '<message>' }`; anything else
 * (HTML, an empty body, a non-object) falls back to the caller's own message.
 */
async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const error = (body as Record<string, unknown>).error;
      if (typeof error === 'string' && error.length > 0) {
        return error;
      }
    }
  } catch {
    // Body was not JSON — use the fallback message below.
  }

  return fallback;
}

async function fetchDownstream<T>(url: string, fallbackError: string): Promise<DownstreamResult<T>> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'x-service-key': config.serviceKey },
    });

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: await readErrorMessage(response, fallbackError),
      };
    }

    const body: unknown = await response.json();
    // The payload shape is owned by the sibling service; the report builders
    // narrow it defensively when they read individual records.
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 502, error: fallbackError };
  }
}

export function getAllLoans(): Promise<DownstreamResult<LoanRecord[]>> {
  return fetchDownstream<LoanRecord[]>(`${config.loanServiceUrl}/internal/loans`, LOAN_SERVICE_ERROR);
}

export function getOverdueLoans(): Promise<DownstreamResult<LoanRecord[]>> {
  return fetchDownstream<LoanRecord[]>(
    `${config.loanServiceUrl}/internal/loans/overdue`,
    LOAN_SERVICE_ERROR,
  );
}

export function getAllBooks(): Promise<DownstreamResult<CatalogBook[]>> {
  return fetchDownstream<CatalogBook[]>(`${config.catalogServiceUrl}/internal/books`, CATALOG_SERVICE_ERROR);
}

export function getAllMembers(): Promise<DownstreamResult<MemberRecord[]>> {
  return fetchDownstream<MemberRecord[]>(
    `${config.memberServiceUrl}/internal/members`,
    MEMBER_SERVICE_ERROR,
  );
}
