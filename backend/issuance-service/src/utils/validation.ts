import { z } from 'zod';
import { createDetailsSchema, createRequiredStringSchema } from './validationHelpers';

const detailsSchema = createDetailsSchema();

export const IssueCredentialSchema = z.object({
  name: createRequiredStringSchema('Name', 255),
  credentialType: createRequiredStringSchema('Credential Type', 255),
  details: detailsSchema
});

export type IssueCredentialInput = z.infer<typeof IssueCredentialSchema>;
