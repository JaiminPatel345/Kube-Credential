import { RequestHandler } from 'express';
import { credentialModel } from '../models/credentialModel';
import { canonicalize, generateIntegrityHash } from '../utils/hash';
import { AppError } from '../utils/errors';
import { CredentialPayloadSchema, SyncRequestSchema, VerifyRequestSchema } from '../utils/validation';
import { getWorkerLabel, serviceConfig } from '../config';

const buildCanonicalPayload = (payload: {
  id: string;
  name: string;
  credentialType: string;
  details: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string;
}) => ({
  id: payload.id,
  name: payload.name,
  credentialType: payload.credentialType,
  details: payload.details,
  issuedBy: payload.issuedBy,
  issuedAt: payload.issuedAt
});

export const verifyCredential: RequestHandler = async (req, res, next) => {
  try {
    const payload = VerifyRequestSchema.parse(req.body);

    const record = await credentialModel.findById(payload.id);

    if (!record) {
      return res.status(200).json({
        valid: false,
        message: 'Credential not found',
        issuedBy: null,
        issuedAt: null,
        verifiedBy: getWorkerLabel()
      });
    }

    const canonicalRecord = buildCanonicalPayload(record);
    const canonicalPayload = buildCanonicalPayload(payload);

    const expectedRecordHash = generateIntegrityHash(canonicalRecord);
    const payloadHash = generateIntegrityHash(canonicalPayload);

    const fieldsMatch =
      record.name === payload.name &&
      record.credentialType === payload.credentialType &&
      record.issuedBy === payload.issuedBy &&
      record.issuedAt === payload.issuedAt &&
      canonicalize(record.details) === canonicalize(payload.details);

    const hashValid =
      record.hash === expectedRecordHash &&
      payload.hash === payloadHash &&
      record.hash === payload.hash;

    if (!fieldsMatch || !hashValid) {
      return res.status(200).json({
        valid: false,
        message: 'Credential data mismatch',
        issuedBy: record.issuedBy,
        issuedAt: record.issuedAt,
        verifiedBy: getWorkerLabel()
      });
    }

    return res.status(200).json({
      valid: true,
      message: 'Credential verified successfully',
      issuedBy: record.issuedBy,
      issuedAt: record.issuedAt,
      verifiedBy: getWorkerLabel()
    });
  } catch (error) {
    next(error);
  }
};

export const syncCredential: RequestHandler = async (req, res, next) => {
  try {
    if (serviceConfig.syncSecret) {
      const headerSecret = req.header('x-internal-sync-key');
      if (headerSecret !== serviceConfig.syncSecret) {
        throw new AppError('Unauthorized sync request', 401);
      }
    }

    const payload = SyncRequestSchema.parse(req.body);

    const canonicalPayload = buildCanonicalPayload(payload);
    const expectedHash = generateIntegrityHash(canonicalPayload);

    if (payload.hash !== expectedHash) {
      throw new AppError('Invalid credential hash', 400);
    }

    await credentialModel.upsert({ ...payload });

    return res.status(200).json({
      success: true,
      message: 'Credential synchronized successfully'
    });
  } catch (error) {
    next(error);
  }
};
