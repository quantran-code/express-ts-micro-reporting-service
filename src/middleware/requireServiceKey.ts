import type { RequestHandler } from 'express';
import { config } from '../config';
import { HttpError } from '../errors/httpError';

export const requireServiceKey: RequestHandler = (req, res, next) => {
  const provided = req.header('x-service-key');

  if (!provided || provided !== config.serviceKey) {
    next(new HttpError(401, 'Invalid service key'));
    return;
  }

  next();
};
