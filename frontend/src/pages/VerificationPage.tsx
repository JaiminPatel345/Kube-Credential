import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { parseAxiosError, verifyCredential } from '../services/api';
import type { IssuedCredential, VerifyCredentialSuccessResponse } from '../types/credential';
import ErrorToast from '../components/ErrorToast';
import JsonEditor from '../components/JsonEditor';
import KeyValueEditor from '../components/KeyValueEditor';
import ModeToggle from '../components/ModeToggle';
import {
  validateVerificationCredential,
  normalizeVerificationFormData,
  detailsToKeyValuePairs,
  type VerificationCredentialData
} from '../services/validationService';

type FormData = {
  id: string;
  name: string;
  credentialType: string;
  issuedBy: string;
  issuedAt: string;
  hash: string;
  details: Record<string, string>;
};

type ValidationErrors = {
  id?: string;
  name?: string;
  credentialType?: string;
  issuedBy?: string;
  issuedAt?: string;
  hash?: string;
  details?: string;
};

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payload: VerifyCredentialSuccessResponse; credential: IssuedCredential };

const EMPTY_FORM: FormData = {
  id: '',
  name: '',
  credentialType: '',
  issuedBy: '',
  issuedAt: '',
  hash: '',
  details: {}
};

const VerificationPage = () => {
  // Single source of truth for form data
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'simple' | 'raw'>('simple');
  const [editorKey, setEditorKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = requestState.status === 'loading';
  const verificationResult = requestState.status === 'success' ? requestState.payload : null;
  const verifiedCredential = requestState.status === 'success' ? requestState.credential : null;

  // Compute raw JSON from formData (always in sync)
  const rawJsonValue = useMemo(() => {
    const credentialData: VerificationCredentialData = {
      id: formData.id,
      name: formData.name,
      credentialType: formData.credentialType,
      issuedBy: formData.issuedBy,
      issuedAt: formData.issuedAt,
      hash: formData.hash,
      details: formData.details
    };
    return JSON.stringify(credentialData, null, 2);
  }, [formData]);

  const handleFieldChange = (field: keyof FormData) => (event: ChangeEvent<HTMLInputElement>) => {
    if (field === 'details') return; // Details handled separately
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setToastMessage(null);
  };

  const handleDetailsChange = (pairs: Record<string, string>) => {
    setFormData((prev) => ({ ...prev, details: pairs }));
    setErrors((prev) => ({ ...prev, details: undefined }));
    setToastMessage(null);
  };

  const handleRawJsonChange = (value: string) => {
    // Parse and update formData from raw JSON (keeps data in sync)
    try {
      const parsed = JSON.parse(value);
      setFormData({
        id: parsed.id || '',
        name: parsed.name || '',
        credentialType: parsed.credentialType || '',
        issuedBy: parsed.issuedBy || '',
        issuedAt: parsed.issuedAt || '',
        hash: parsed.hash || '',
        details: detailsToKeyValuePairs(parsed.details || {})
      });
      setErrors({});
    } catch {
      // Invalid JSON - don't update state
    }
    setToastMessage(null);
  };

  const handleInputModeChange = (newMode: 'simple' | 'raw') => {
    if (newMode === inputMode) return;
    // No data conversion needed - both modes use same formData
    setInputMode(newMode);
    setErrors({});
    setEditorKey(prev => prev + 1);
  };

  const handleFileParse = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      
      setFormData({
        id: parsed.id || '',
        name: parsed.name || '',
        credentialType: parsed.credentialType || '',
        issuedBy: parsed.issuedBy || '',
        issuedAt: parsed.issuedAt || '',
        hash: parsed.hash || '',
        details: detailsToKeyValuePairs(parsed.details || {})
      });
      
      setErrors({});
      setToastMessage(null);
      setEditorKey(prev => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file';
      setToastMessage(`Invalid JSON file: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Use centralized validation (same for both modes)
    const normalized = normalizeVerificationFormData(formData);
    const validation = validateVerificationCredential(normalized);

    if (!validation.valid) {
      setErrors(validation.errors);
      const errorMessages = Object.values(validation.errors);
      if (errorMessages.length > 0) {
        setToastMessage(errorMessages[0]);
      }
      return;
    }

    setToastMessage(null);
    setRequestState({ status: 'loading' });

    try {
      const response = await verifyCredential({
        id: normalized.id,
        name: normalized.name,
        credentialType: normalized.credentialType,
        issuedBy: normalized.issuedBy,
        issuedAt: normalized.issuedAt,
        hash: normalized.hash,
        details: normalized.details
      });

      setRequestState({ 
        status: 'success', 
        payload: response,
        credential: {
          id: normalized.id,
          name: normalized.name,
          credentialType: normalized.credentialType,
          issuedBy: normalized.issuedBy,
          issuedAt: normalized.issuedAt,
          hash: normalized.hash,
          details: normalized.details
        }
      });
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
    setFormData(EMPTY_FORM);
    setErrors({});
    setToastMessage(null);
    setEditorKey(prev => prev + 1);
  };

  const handleVerifyAnother = () => {
    setRequestState({ status: 'idle' });
    setFormData(EMPTY_FORM);
    setErrors({});
    setToastMessage(null);
    setEditorKey(prev => prev + 1);
  };

  const handleToastClose = () => setToastMessage(null);

  const hasInput = useMemo(() => {
    return formData.id.trim().length > 0 ||
           formData.name.trim().length > 0 ||
           formData.credentialType.trim().length > 0 ||
           formData.issuedBy.trim().length > 0 ||
           formData.issuedAt.trim().length > 0 ||
           formData.hash.trim().length > 0 ||
           Object.values(formData.details).some(v => v.trim().length > 0);
  }, [formData]);

  const renderStatusBadge = () => {
    if (!verificationResult) return null;

    if (verificationResult.valid) {
      return (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
          <span className="text-2xl" aria-hidden>✅</span>
          <div>
            <p className="font-semibold">Credential is valid</p>
            <p className="text-sm text-emerald-600">{verificationResult.message}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
        <span className="text-2xl" aria-hidden>❌</span>
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-8 md:px-6 lg:px-8">
        <header className="flex flex-col gap-2 text-center md:text-left">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl md:text-4xl">Verify an Issued Credential</h1>
          <p className="text-sm text-slate-600 sm:text-base">
            Paste the signed credential payload below or import the JSON file exported from the issuance service.
            We&apos;ll validate the hash and metadata against the verification ledger.
          </p>
        </header>

        {/* Show loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-4">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
              <p className="text-lg font-semibold text-slate-700">Verifying Credential...</p>
            </div>
          </div>
        )}

        {/* Show form only when not loading and no result */}
        {!isLoading && !verificationResult && !verifiedCredential && (
          <div className="grid gap-6 lg:grid-cols-1">
            <section className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 mx-auto w-full max-w-3xl sm:p-6">
              <form className="space-y-4 sm:space-y-5" onSubmit={handleSubmit} noValidate>
                {/* Mode Toggle */}
                <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                  <h2 className="text-lg font-semibold text-slate-900">Credential Input</h2>
                  <ModeToggle
                    mode={inputMode}
                    onModeChange={handleInputModeChange}
                    disabled={isLoading}
                  />
                </div>

                {inputMode === 'simple' ? (
                  <div className="space-y-4 sm:space-y-5">
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700" htmlFor="id">
                        Credential ID
                      </label>
                      <input
                        id="id"
                        type="text"
                        placeholder="Enter the credential ID"
                        value={formData.id}
                        onChange={handleFieldChange('id')}
                        disabled={isLoading}
                        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                          errors.id
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                            : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                        }`}
                      />
                      {errors.id ? <p className="text-xs text-rose-600 sm:text-sm">{errors.id}</p> : null}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                          Name
                        </label>
                        <input
                          id="name"
                          type="text"
                          placeholder="Jaimin Detroja"
                          value={formData.name}
                          onChange={handleFieldChange('name')}
                          disabled={isLoading}
                          className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                            errors.name
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                          }`}
                        />
                        {errors.name ? <p className="text-xs text-rose-600 sm:text-sm">{errors.name}</p> : null}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700" htmlFor="credentialType">
                          Credential Type
                        </label>
                        <input
                          id="credentialType"
                          type="text"
                          placeholder="Administrator"
                          value={formData.credentialType}
                          onChange={handleFieldChange('credentialType')}
                          disabled={isLoading}
                          className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                            errors.credentialType
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                          }`}
                        />
                        {errors.credentialType ? <p className="text-xs text-rose-600 sm:text-sm">{errors.credentialType}</p> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700" htmlFor="issuedBy">
                          Issued By
                        </label>
                        <input
                          id="issuedBy"
                          type="text"
                          placeholder="Issuer name"
                          value={formData.issuedBy}
                          onChange={handleFieldChange('issuedBy')}
                          disabled={isLoading}
                          className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                            errors.issuedBy
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                          }`}
                        />
                        {errors.issuedBy ? <p className="text-xs text-rose-600 sm:text-sm">{errors.issuedBy}</p> : null}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700" htmlFor="issuedAt">
                          Issued At
                        </label>
                        <input
                          id="issuedAt"
                          type="text"
                          placeholder="2024-01-01T12:00:00Z"
                          value={formData.issuedAt}
                          onChange={handleFieldChange('issuedAt')}
                          disabled={isLoading}
                          className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                            errors.issuedAt
                              ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                          }`}
                        />
                        {errors.issuedAt ? <p className="text-xs text-rose-600 sm:text-sm">{errors.issuedAt}</p> : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-slate-700" htmlFor="hash">
                        Hash
                      </label>
                      <input
                        id="hash"
                        type="text"
                        placeholder="64-character hash"
                        value={formData.hash}
                        onChange={handleFieldChange('hash')}
                        disabled={isLoading}
                        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base ${
                          errors.hash
                            ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                            : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                        }`}
                      />
                      {errors.hash ? <p className="text-xs text-rose-600 sm:text-sm">{errors.hash}</p> : null}
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-slate-700">Details</label>
                      </div>
                      <KeyValueEditor
                        key={`verification-simple-${editorKey}`}
                        initialPairs={formData.details}
                        onChange={handleDetailsChange}
                        disabled={isLoading}
                      />
                      {errors.details ? <p className="text-sm text-red-600">{errors.details}</p> : null}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Raw JSON Payload
                    </label>
                    <JsonEditor
                      value={rawJsonValue}
                      onChange={handleRawJsonChange}
                      placeholder='{\n  "id": "",\n  "name": "",\n  "credentialType": "",\n  "details": {},\n  "issuedBy": "",\n  "issuedAt": "",\n  "hash": ""\n}'
                      disabled={isLoading}
                      height="400px"
                      showFormatButton={true}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleTriggerFile}
                      disabled={isLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Parse from File
                    </button>
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={isLoading || !hasInput}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clear
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:py-3 sm:text-base"
                  >
                    {isLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Verifying Credential…
                      </span>
                    ) : (
                      <>
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Verify Credential
                      </>
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

                {requestState.status === 'error' && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {requestState.message}
                  </div>
                )}
              </form>
            </section>
          </div>
        )}

        {/* Show results when verification is done */}
        {(verificationResult || verifiedCredential) && (
          <section className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 sm:p-6">
            <div className="flex flex-col gap-4 sm:gap-5">
              {renderStatusBadge()}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued By</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">
                    {verificationResult?.issuedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued At</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">
                    {verificationResult?.issuedAt ? new Date(verificationResult.issuedAt).toLocaleString() : 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Verified By</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">
                    {verificationResult?.verifiedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Credential Type</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">{verifiedCredential?.credentialType ?? 'Unknown'}</dd>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-900 sm:text-sm">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Credential Details
                  </h3>
                  {verifiedCredential?.details && typeof verifiedCredential.details === 'object' && Object.keys(verifiedCredential.details).length > 0 ? (
                    <ul className="space-y-2">
                      {Object.entries(verifiedCredential.details).map(([key, value]) => (
                        <li key={key} className="flex items-start gap-2 text-xs sm:text-sm">
                          <span className="text-slate-400">•</span>
                          <span className="font-medium text-slate-700">{key}:</span>
                          <span className="break-all text-slate-900">{String(value)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500 sm:text-sm">No additional details</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-300 bg-slate-900 p-4 text-slate-100 shadow-lg sm:p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Full Credential JSON
                  </h3>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950/70 p-3 text-[10px] leading-relaxed scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 sm:p-4 sm:text-xs">
                    <code>{JSON.stringify(verifiedCredential, null, 2)}</code>
                  </pre>
                </div>
              </div>

              {/* Verify Another Button */}
              <button
                type="button"
                onClick={handleVerifyAnother}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-emerald-600/40 transition hover:from-emerald-700 hover:to-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:px-6 sm:py-3 sm:text-base"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Verify Another Credential
              </button>
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default VerificationPage;
