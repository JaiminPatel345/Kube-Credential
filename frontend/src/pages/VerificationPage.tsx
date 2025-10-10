import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { parseAxiosError, verifyCredential } from '../services/api';
import type { IssuedCredential, VerifyCredentialSuccessResponse } from '../types/credential';
import ErrorToast from '../components/ErrorToast';

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payload: VerifyCredentialSuccessResponse; credential: IssuedCredential };

type ValidationState = {
  message: string | null;
  credential?: IssuedCredential;
};

const EMPTY_EXAMPLE = `{
  "id": "",
  "name": "",
  "credentialType": "",
  "details": {},
  "issuedBy": "",
  "issuedAt": "",
  "hash": ""
}`;

const isIssuedCredential = (data: unknown): data is IssuedCredential => {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.credentialType === 'string' &&
    typeof obj.details === 'object' &&
    obj.details !== null &&
    typeof obj.issuedBy === 'string' &&
    typeof obj.issuedAt === 'string' &&
    typeof obj.hash === 'string'
  );
};

const VerificationPage = () => {
  const [rawJson, setRawJson] = useState<string>('');
  const [validation, setValidation] = useState<ValidationState>({ message: null });
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = requestState.status === 'loading';
  const verificationResult = requestState.status === 'success' ? requestState.payload : null;
  const verifiedCredential = requestState.status === 'success' ? requestState.credential : null;

  const parseJson = (value: string): ValidationState => {
    if (!value.trim()) {
      return { message: 'Credential JSON is required' };
    }

    try {
      const parsed = JSON.parse(value);
      if (!isIssuedCredential(parsed)) {
        return { message: 'Credential JSON must include id, name, credentialType, details, issuedBy, issuedAt, and hash fields' };
      }
      return { message: null, credential: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON payload';
      return { message: `Invalid JSON: ${message}` };
    }
  };

  const handleTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const { value } = event.target;
    setRawJson(value);
    setValidation({ message: null });
    setToastMessage(null);
  };

  const handleTextareaBlur = () => {
    const result = parseJson(rawJson);
    if (result.credential) {
      setRawJson(JSON.stringify(result.credential, null, 2));
      setValidation({ message: null, credential: result.credential });
      setToastMessage(null);
    } else if (result.message) {
      setValidation(result);
      setToastMessage(result.message);
    }
  };

  const handleFileParse = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const result = parseJson(text);
      if (result.credential) {
        setRawJson(JSON.stringify(result.credential, null, 2));
        setValidation({ message: null, credential: result.credential });
        setRequestState({ status: 'idle' });
        setToastMessage(null);
      } else if (result.message) {
        setRawJson(text);
        setValidation(result);
        setToastMessage(result.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file';
      setValidation({ message });
      setToastMessage(message);
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = parseJson(rawJson);
    if (!result.credential) {
      setValidation(result);
      setRequestState({ status: 'idle' });
      setToastMessage(result.message ?? 'Invalid credential JSON');
      return;
    }

    setValidation({ message: null, credential: result.credential });
    setRequestState({ status: 'loading' });
    setToastMessage(null);

    try {
      const response = await verifyCredential(result.credential);
      setRequestState({ status: 'success', payload: response, credential: result.credential });
      setToastMessage(null);
    } catch (error) {
      const parsed = parseAxiosError(error);
      setRequestState({ status: 'error', message: parsed.message });
      setToastMessage(parsed.message);
    }
  };

  const handleTriggerFile = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setRawJson('');
    setValidation({ message: null });
    setRequestState({ status: 'idle' });
    setToastMessage(null);
  };

  const handleToastClose = () => setToastMessage(null);

  const renderStatusBadge = () => {
    if (!verificationResult) {
      return null;
    }

    if (verificationResult.valid) {
      return (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          <span className="text-2xl" aria-hidden>
            ✅
          </span>
          <div>
            <p className="font-semibold">Credential is valid</p>
            <p className="text-sm text-emerald-600">{verificationResult.message}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        <span className="text-2xl" aria-hidden>
          ❌
        </span>
        <div>
          <p className="font-semibold">Credential is invalid</p>
          <p className="text-sm text-red-600">{verificationResult.message}</p>
        </div>
      </div>
    );
  };

  return (
    <>
      <ErrorToast message={toastMessage} onClose={handleToastClose} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-light">Kube Credential</p>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Verify an Issued Credential</h1>
        <p className="text-base text-slate-600">
          Paste the signed credential payload below or import the JSON file exported from the issuance service.
          We&apos;ll validate the hash and metadata against the verification ledger.
        </p>
      </header>

  <div className="grid gap-8 lg:grid-cols-[2fr,3fr]">
        <section className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="credential-json">
                Credential JSON
              </label>
              <textarea
                id="credential-json"
                name="credential-json"
                placeholder={EMPTY_EXAMPLE}
                rows={12}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                value={rawJson}
                onChange={handleTextareaChange}
                onBlur={handleTextareaBlur}
                disabled={isLoading}
                required
              />
              {validation.message ? <p className="text-sm text-red-600">{validation.message}</p> : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleTriggerFile}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  disabled={isLoading}
                >
                  Parse from File
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-red-300 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
                  disabled={isLoading && rawJson.length === 0}
                >
                  Clear
                </button>
              </div>

              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Verifying…
                  </span>
                ) : (
                  'Verify Credential'
                )}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={handleFileParse}
            />

            {requestState.status === 'error' ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {requestState.message}
              </div>
            ) : null}

            {requestState.status === 'loading' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                Verifying credential…
              </div>
            ) : null}
          </form>
        </section>

        <section className="flex h-full flex-col gap-5 rounded-2xl border border-dashed border-brand/30 bg-white/80 p-6 shadow-inner backdrop-blur">
          {renderStatusBadge()}

          {verificationResult && verifiedCredential ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Issued By</dt>
                  <dd className="text-base font-semibold text-slate-900">
                    {verificationResult.issuedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Issued At</dt>
                  <dd className="text-base font-semibold text-slate-900">
                    {verificationResult.issuedAt ? new Date(verificationResult.issuedAt).toLocaleString() : 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Verified By</dt>
                  <dd className="text-base font-semibold text-slate-900">
                    {verificationResult.verifiedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Credential Type</dt>
                  <dd className="text-base font-semibold text-slate-900">{verifiedCredential.credentialType}</dd>
                </div>
              </div>

              <div className="rounded-xl bg-slate-900 p-4 text-slate-100 shadow-inner">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Credential Payload</h3>
                <pre className="max-h-72 overflow-auto rounded-lg bg-slate-950/70 p-4 text-xs leading-relaxed">
                  <code>{JSON.stringify(verifiedCredential, null, 2)}</code>
                </pre>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-slate-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <span className="text-3xl">🛡️</span>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-slate-700">Awaiting verification</p>
                <p className="text-sm text-slate-500">
                  Import a credential JSON to validate its authenticity and see verification details here.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>
    </>
  );
};

export default VerificationPage;
