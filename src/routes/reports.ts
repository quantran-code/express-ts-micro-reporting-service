import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getAllBooks, getAllLoans, getAllMembers, getOverdueLoans } from '../clients/downstream';
import { HttpError } from '../errors/httpError';
import { buildMostBorrowedReport, buildOverdueSummary } from '../services/reportService';

export const mostBorrowedHandler: RequestHandler<Record<string, never>> = async (req, res, next) => {
  try {
    const [loansResult, booksResult] = await Promise.all([getAllLoans(), getAllBooks()]);

    if (!loansResult.ok) {
      throw new HttpError(502, loansResult.error);
    }

    if (!booksResult.ok) {
      throw new HttpError(502, booksResult.error);
    }

    res.status(200).json(buildMostBorrowedReport(loansResult.data, booksResult.data));
  } catch (err) {
    next(err);
  }
};

export const overdueSummaryHandler: RequestHandler<Record<string, never>> = async (req, res, next) => {
  try {
    const [loansResult, membersResult] = await Promise.all([getOverdueLoans(), getAllMembers()]);

    if (!loansResult.ok) {
      throw new HttpError(502, loansResult.error);
    }

    if (!membersResult.ok) {
      throw new HttpError(502, membersResult.error);
    }

    res.status(200).json(buildOverdueSummary(loansResult.data, membersResult.data));
  } catch (err) {
    next(err);
  }
};

export const reportsRouter = Router();

reportsRouter.get('/most-borrowed', mostBorrowedHandler);
reportsRouter.get('/overdue-summary', overdueSummaryHandler);
