import { RequestHandler } from 'express';
import { IssueCredentialInput, IssueCredentialSchema } from '../utils/validation';
import { generateDeterministicId, generateIntegrityHash } from '../utils/hash';
import { credentialModel } from '../models/credentialModel';
import { AppError } from '../utils/errors';
import { getWorkerLabel, serviceConfig } from '../config';
import { syncCredentialWithVerificationService } from '../utils/sync';

const buildCredentialPayload = (
  data: IssueCredentialInput,
  id: string
) => ({
  id,
  name: data.name,
  credentialType: data.credentialType,
  details: data.details,
  issuedBy: serviceConfig.workerId,
  issuedAt: new Date().toISOString().split('T')[0]
});

export const issueCredential: RequestHandler = async (req, res, next) => {
  try {
    const input = IssueCredentialSchema.parse(req.body);

    const credentialId = generateDeterministicId(input);
    const existing = credentialModel.findById(credentialId);

    if (existing) {
      throw new AppError('Credential already issued', 409);
    }

    const credentialWithoutHash = buildCredentialPayload(input, credentialId);
    const hash = generateIntegrityHash(credentialWithoutHash);

    const credential = credentialModel.create({
      ...credentialWithoutHash,
      hash
    });

    await syncCredentialWithVerificationService(credential);

    res.status(201).json({
      success: true,
      message: `credential issued by ${getWorkerLabel()}`,
      credential
    });
  } catch (error) {
    next(error);
  }
};
