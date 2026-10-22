import type { CatalogBook, LoanRecord, MemberRecord } from '../clients/downstream';

export interface MostBorrowedRow {
  bookId: number;
  title: string;
  totalBorrows: number;
}

export interface OverdueSummaryRow {
  memberId: number;
  name: string;
  overdueCount: number;
}

/**
 * Aggregates from the loans, never from the books: a book that was never
 * borrowed produces no row, and a loan whose book no longer exists in the
 * catalog is skipped silently.
 */
export function buildMostBorrowedReport(
  loans: readonly LoanRecord[],
  books: readonly CatalogBook[],
): MostBorrowedRow[] {
  const titlesById = new Map<number, string>();
  for (const book of books) {
    titlesById.set(book.id, book.title);
  }

  const counts = new Map<number, number>();
  for (const loan of loans) {
    if (!titlesById.has(loan.bookId)) {
      continue;
    }

    counts.set(loan.bookId, (counts.get(loan.bookId) ?? 0) + 1);
  }

  const rows: MostBorrowedRow[] = [];
  for (const [bookId, totalBorrows] of counts) {
    const title = titlesById.get(bookId);
    if (title === undefined) {
      continue;
    }

    rows.push({ bookId, title, totalBorrows });
  }

  rows.sort((a, b) => b.totalBorrows - a.totalBorrows || a.bookId - b.bookId);
  return rows;
}

/**
 * Same shape as the most-borrowed report: aggregated from the overdue loans,
 * so members without overdue loans are absent and overdue loans for a member
 * that no longer exists are skipped.
 */
export function buildOverdueSummary(
  loans: readonly LoanRecord[],
  members: readonly MemberRecord[],
): OverdueSummaryRow[] {
  const namesById = new Map<number, string>();
  for (const member of members) {
    namesById.set(member.id, member.name);
  }

  const counts = new Map<number, number>();
  for (const loan of loans) {
    if (!namesById.has(loan.memberId)) {
      continue;
    }

    counts.set(loan.memberId, (counts.get(loan.memberId) ?? 0) + 1);
  }

  const rows: OverdueSummaryRow[] = [];
  for (const [memberId, overdueCount] of counts) {
    const name = namesById.get(memberId);
    if (name === undefined) {
      continue;
    }

    rows.push({ memberId, name, overdueCount });
  }

  rows.sort((a, b) => a.memberId - b.memberId);
  return rows;
}
