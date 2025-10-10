import { RequestHandler } from 'express';
import { credentialModel } from '../models/credentialModel';
import { AppError } from '../utils/errors';
import { serviceConfig } from '../config';

const validateSyncKey = (headerValue: string | undefined) => {
  if (!serviceConfig.syncSecret) {
    return true;
  }

  return headerValue === serviceConfig.syncSecret;
};

export const listCredentials: RequestHandler = (req, res, next) => {
  try {
    if (!validateSyncKey(req.header('x-internal-sync-key'))) {
      throw new AppError('Unauthorized access', 401);
    }

    const sinceParam = req.query.since;
    let since: string | undefined;

    if (typeof sinceParam === 'string' && sinceParam.trim().length > 0) {
      const parsedDate = Date.parse(sinceParam);
      if (Number.isNaN(parsedDate)) {
        throw new AppError('Invalid since parameter. Expect ISO-8601 string.', 400);
      }
      since = new Date(parsedDate).toISOString();
    }

    const credentials = credentialModel.listIssuedAfter(since);

    res.json({
      success: true,
      count: credentials.length,
      data: credentials
    });
  } catch (error) {
    next(error);
  }
};
