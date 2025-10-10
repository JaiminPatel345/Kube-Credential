import axios, { AxiosError } from 'axios';
import type {
  ApiErrorResponse,
  IssueCredentialPayload,
  IssueCredentialSuccessResponse,
  ParsedApiError,
  VerifyCredentialPayload,
  VerifyCredentialSuccessResponse
} from '../types/credential';

const issuanceBaseURL = import.meta.env.VITE_ISSUANCE_API_URL ?? 'http://localhost:3001';
const verificationBaseURL = import.meta.env.VITE_VERIFICATION_API_URL ?? 'http://localhost:3002';

const issuanceClient = axios.create({
  baseURL: issuanceBaseURL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json'
  }
});

const verificationClient = axios.create({
  baseURL: verificationBaseURL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json'
  }
});

const isApiErrorResponse = (data: unknown): data is ApiErrorResponse =>
  typeof data === 'object' && data !== null && 'success' in data && (data as ApiErrorResponse).success === false;

export const parseAxiosError = (error: unknown): ParsedApiError => {
  if (axios.isAxiosError(error)) {
    const err = error as AxiosError<ApiErrorResponse>;
    const responseData = err.response?.data;

    if (isApiErrorResponse(responseData)) {
      return {
        status: err.response?.status,
        message: responseData.message ?? 'Request failed',
        details: responseData.details,
        issues: responseData.errors
      };
    }

    const fallbackData = (responseData ?? {}) as Partial<ApiErrorResponse>;

    return {
      status: err.response?.status,
      message: fallbackData.message ?? err.message,
      details: fallbackData.details,
      issues: fallbackData.errors
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'Unknown error occurred' };
};

export const issueCredential = async (payload: IssueCredentialPayload) => {
  const { data } = await issuanceClient.post<IssueCredentialSuccessResponse>('/api/issue', payload);
  return data;
};

export const verifyCredential = async (payload: VerifyCredentialPayload) => {
  const { data } = await verificationClient.post<VerifyCredentialSuccessResponse>('/api/verify', payload);
  return data;
};
