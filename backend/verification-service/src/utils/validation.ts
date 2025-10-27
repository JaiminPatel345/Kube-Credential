import { z } from 'zod';
import {
  createDetailsSchema,
  createRequiredStringSchema,
  createISODateSchema,
  createHashSchema
} from './validationHelpers';

const detailsSchema = createDetailsSchema();

export const CredentialPayloadSchema = z.object({
  id: createRequiredStringSchema('Id'),
  name: createRequiredStringSchema('Name'),
  credentialType: createRequiredStringSchema('Credential Type'),
  details: detailsSchema,
  hash: createHashSchema(),
  issuedBy: createRequiredStringSchema('Issued By'),
  issuedAt: createISODateSchema('Issued At')
});

export type CredentialPayload = z.infer<typeof CredentialPayloadSchema>;

export const VerifyRequestSchema = CredentialPayloadSchema;

export type VerifyRequest = z.infer<typeof VerifyRequestSchema>;

export const SyncRequestSchema = CredentialPayloadSchema;

export type SyncRequest = z.infer<typeof SyncRequestSchema>;
