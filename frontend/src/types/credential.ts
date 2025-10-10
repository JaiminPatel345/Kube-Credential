export type CredentialDetails = Record<string, unknown>;

export interface IssueCredentialPayload {
  name: string;
  credentialType: string;
  details: CredentialDetails;
}

export interface IssuedCredential {
  id: string;
  name: string;
  credentialType: string;
  details: CredentialDetails;
  issuedBy: string;
  issuedAt: string;
  hash: string;
}

export interface IssueCredentialSuccessResponse {
  success: true;
  message: string;
  credential: IssuedCredential;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  details?: unknown;
  errors?: unknown;
}

export type IssueCredentialResponse = IssueCredentialSuccessResponse | ApiErrorResponse;

export type VerifyCredentialPayload = IssuedCredential;

export interface VerifyCredentialSuccessResponse {
  valid: boolean;
  message: string;
  issuedBy: string | null;
  issuedAt: string | null;
  verifiedBy: string | null;
}

export type VerifyCredentialResponse =
  | VerifyCredentialSuccessResponse
  | ApiErrorResponse;

export interface ParsedApiError {
  status?: number;
  message: string;
  details?: unknown;
  issues?: unknown;
}
