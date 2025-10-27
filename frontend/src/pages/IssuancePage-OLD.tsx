import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { issueCredential, parseAxiosError } from '../services/api';
import type { IssuedCredential } from '../types/credential';
import ErrorToast from '../components/ErrorToast';
import JsonEditor from '../components/JsonEditor';
import KeyValueEditor from '../components/KeyValueEditor';
import ModeToggle from '../components/ModeToggle';
import {
  validateIssuanceCredential,
  parseAndValidateIssuanceJSON,
  normalizeIssuanceFormData,
  detailsToKeyValuePairs,
  type IssuanceCredentialData
} from '../services/validationService';

type FormData = {
  name: string;
  credentialType: string;
  details: Record<string, string>;
};

type ValidationErrors = {
  name?: string;
  credentialType?: string;
  details?: string;
};

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; credential: IssuedCredential }
  | { status: 'error'; message: string };

const EMPTY_FORM: FormData = {
  name: '',
  credentialType: '',
  details: {}
};

const truncateHash = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-8)}`;

const formatISODate = (iso: string) => new Date(iso).toLocaleString();

const createCredentialJson = (credential: IssuedCredential) =>
  JSON.stringify(credential, null, 2);

const sanitizeFilename = (str: string) => {
  return str
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
};

const downloadCredential = (credential: IssuedCredential) => {
  const blob = new Blob([createCredentialJson(credential)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  
  // Create filename based on name and credential type
  const namePart = sanitizeFilename(credential.name);
  const typePart = sanitizeFilename(credential.credentialType);
  link.download = `credential-${namePart}-${typePart}.json`;
  
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const IssuancePage = () => {
  // Single source of truth for form data
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'simple' | 'raw'>('simple');
  const [editorKey, setEditorKey] = useState(0);

  const isLoading = requestState.status === 'loading';
  const issuedCredential = requestState.status === 'success' ? requestState.credential : null;

  // Compute raw JSON from formData for raw mode
  const rawJsonValue = useMemo(() => {
    const credentialData: IssuanceCredentialData = {
      name: formData.name,
      credentialType: formData.credentialType,
      details: formData.details
    };
    return JSON.stringify(credentialData, null, 2);
  }, [formData]);

  const handleChange = (field: keyof FormData) => (event: ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setToastMessage(null);
  };

  const handleKeyValueChange = (pairs: Record<string, string>) => {
    setFormData((prev) => ({ ...prev, details: pairs }));
    setErrors((prev) => ({ ...prev, details: undefined }));
    setToastMessage(null);
  };

  const handleRawJsonChange = (value: string) => {
    // Parse and update formData from raw JSON
    const parseResult = parseAndValidateIssuanceJSON(value);
    
    if (parseResult.valid && parseResult.data) {
      setFormData({
        name: parseResult.data.name,
        credentialType: parseResult.data.credentialType,
        details: detailsToKeyValuePairs(parseResult.data.details)
      });
      setErrors({});
    } else {
      // Store partial/invalid JSON - still update what we can parse
      try {
        const parsed = JSON.parse(value);
        setFormData({
          name: parsed.name || '',
          credentialType: parsed.credentialType || '',
          details: detailsToKeyValuePairs(parsed.details || {})
        });
      } catch {
        // Invalid JSON - keep current state
      }
    }
    setToastMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    let name: string;
    let credentialType: string;
    let detailsPayload: Record<string, unknown>;

    if (inputMode === 'raw') {
      // Parse from raw JSON
      try {
        const parsed = JSON.parse(rawJsonInput);
        if (!parsed.name || !parsed.credentialType) {
          setErrors({ details: 'JSON must include "name" and "credentialType" fields' });
          setToastMessage('JSON must include "name" and "credentialType" fields');
          return;
        }
        
        // Validate details object using utility
        if (parsed.details && typeof parsed.details === 'object') {
          const detailsValidation = validateDetails(parsed.details);
          if (!detailsValidation.valid && detailsValidation.errors.length > 0) {
            const errorMsg = detailsValidation.errors[0];
            setErrors({ details: errorMsg });
            setToastMessage(errorMsg);
            return;
          }
        }
        
        name = parsed.name;
        credentialType = parsed.credentialType;
        detailsPayload = parsed.details || {};
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON';
        setErrors({ details: `Invalid JSON: ${message}` });
        setToastMessage(`Invalid JSON: ${message}`);
        return;
      }
    } else {
      // Validate simple form
      const validationErrors = validate(values);
      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setRequestState({ status: 'idle' });
        return;
      }

      try {
        detailsPayload = JSON.parse(values.details);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON';
        setErrors((prev) => ({ ...prev, details: `Invalid JSON: ${message}` }));
        setRequestState({ status: 'idle' });
        return;
      }

      name = values.name.trim();
      credentialType = values.credentialType.trim();
    }

    setToastMessage(null);
    setRequestState({ status: 'loading' });

    try {
      const response = await issueCredential({
        name,
        credentialType,
        details: detailsPayload
      });

      setRequestState({ status: 'success', credential: response.credential });
      setToastMessage(null);
    } catch (error) {
      const parsed = parseAxiosError(error);
      setRequestState({ status: 'error', message: parsed.message });
      setToastMessage(parsed.message);
    }
  };

  const handleCopy = async () => {
    if (!issuedCredential) return;
    try {
      const text = createCredentialJson(issuedCredential);
      
      // Try modern clipboard API first (requires HTTPS or localhost)
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (HTTP)
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } finally {
          document.body.removeChild(textArea);
        }
      }
      
      setRequestState({ status: 'success', credential: issuedCredential });
      setToastMessage(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy to clipboard';
      setRequestState({ status: 'error', message });
      setToastMessage(message);
    }
  };

  const handleToastClose = () => setToastMessage(null);

  const formFeedback = useMemo(() => {
    if (requestState.status === 'loading') {
      return { color: 'text-blue-600', message: 'Issuing credential…' } as const;
    }
    if (requestState.status === 'error') {
      return { color: 'text-red-600', message: requestState.message } as const;
    }
    if (requestState.status === 'success') {
      return { color: 'text-emerald-600', message: 'Credential issued successfully' } as const;
    }
    return null;
  }, [requestState]);

  const handleInputModeChange = (newMode: 'simple' | 'raw') => {
    if (newMode === inputMode) return;

    if (newMode === 'raw') {
      // Convert simple form to JSON
      const credential = {
        name: values.name,
        credentialType: values.credentialType,
        details: keyValuePairs
      };
      setRawJsonInput(JSON.stringify(credential, null, 2));
      setInputMode('raw');
    } else {
      // Convert JSON to simple form
      try {
        const parsed = JSON.parse(rawJsonInput);
        setValues({
          name: parsed.name || '',
          credentialType: parsed.credentialType || '',
          details: JSON.stringify(parsed.details || {}, null, 2)
        });
        setKeyValuePairs(parsed.details || {});
        setInputMode('simple');
        setEditorKey(prev => prev + 1);
      } catch (error) {
        // If JSON is invalid, switch anyway with empty values
        setInputMode('simple');
        setEditorKey(prev => prev + 1);
      }
    }
    setErrors({});
  };

  const handleIssueAnother = () => {
    setRequestState({ status: 'idle' });
    setValues({ name: '', credentialType: '', details: '{}' });
    setKeyValuePairs({});
    setRawJsonInput('');
    setErrors({});
    setToastMessage(null);
    setEditorKey(prev => prev + 1);
  };

  return (
    <>
      <ErrorToast message={toastMessage} onClose={handleToastClose} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl md:text-4xl">Issue a New Credential</h1>
        <p className="text-sm text-slate-600 sm:text-base">
          Provide the credential details below. The issuance service will generate a deterministic ID
          and securely hash the payload before syncing it with the verification network.
        </p>
      </header>

      {/* Show loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-brand border-t-transparent"></div>
            <p className="text-lg font-semibold text-slate-700">Issuing Credential...</p>
          </div>
        </div>
      )}

      {/* Show form only when not loading and no credential issued */}
      {!isLoading && !issuedCredential && (
        <div className="grid gap-6 lg:grid-cols-1">
        <section className={`rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 sm:p-6 ${!issuedCredential ? 'mx-auto w-full max-w-3xl' : ''}`}>
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
                  <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                    Name
                  </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jaimin Detroja"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base"
                value={values.name}
                onChange={handleChange('name')}
                disabled={isLoading}
                required
              />
              {errors.name ? <p className="text-xs text-red-600 sm:text-sm">{errors.name}</p> : null}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="credentialType">
                Credential Type
              </label>
              <input
                id="credentialType"
                name="credentialType"
                type="text"
                placeholder="Kube Cluster Admin"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60 sm:px-4 sm:py-3 sm:text-base"
                value={values.credentialType}
                onChange={handleChange('credentialType')}
                disabled={isLoading}
                required
              />
              {errors.credentialType ? <p className="text-xs text-red-600 sm:text-sm">{errors.credentialType}</p> : null}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700" htmlFor="details">
                  Details
                </label>
              </div>

              <KeyValueEditor
                key={`issuance-simple-form-${editorKey}`}
                initialPairs={keyValuePairs}
                onChange={handleKeyValueChange}
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
                  value={rawJsonInput}
                  onChange={(value) => {
                    setRawJsonInput(value);
                    setErrors({});
                    setToastMessage(null);
                  }}
                  placeholder='{\n  "name": "John Doe",\n  "credentialType": "Degree",\n  "details": {\n    "course": "Computer Science"\n  }\n}'
                  disabled={isLoading}
                  height="300px"
                  showFormatButton={true}
                />
                {errors.details ? <p className="text-xs text-red-600 sm:text-sm">{errors.details}</p> : null}
              </div>
            )}

            <div className="flex flex-col gap-3">
              {formFeedback && (
                <div className={`rounded-lg border px-3 py-2 text-xs font-medium sm:px-4 sm:py-2.5 sm:text-sm ${
                  formFeedback.color === 'text-blue-600' 
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : formFeedback.color === 'text-red-600'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}>
                  {formFeedback.message}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-blue-700 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-brand/40 transition hover:from-brand-dark hover:to-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 sm:px-6 sm:py-3 sm:text-base"
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Issuing Credential…
                  </span>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Issue Credential
                  </>
                )}
              </button>
            </div>
          </form>
        </section>
        </div>
      )}

      {/* Show results when credential is issued */}
      {issuedCredential && (
        <section className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-4 shadow-card ring-1 ring-slate-200 sm:p-6">
          <div className="flex flex-col gap-5 sm:gap-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">Issued Credential</h2>
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Success
                </span>
              </div>

              <dl className="grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Credential ID</dt>
                  <dd className="break-all text-xs font-semibold text-slate-900 sm:text-sm" title={issuedCredential.id}>
                    {issuedCredential.id}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued By</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">{issuedCredential.issuedBy}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued At</dt>
                  <dd className="text-xs font-semibold text-slate-900 sm:text-sm">{formatISODate(issuedCredential.issuedAt)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-3 shadow-sm sm:p-4">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Hash</dt>
                  <dd className="break-all text-xs font-semibold text-slate-900 sm:text-sm" title={issuedCredential.hash}>
                    {truncateHash(issuedCredential.hash)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-900 sm:text-sm">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Credential Details
                  </h3>
                  {issuedCredential.details && typeof issuedCredential.details === 'object' && Object.keys(issuedCredential.details).length > 0 ? (
                    <ul className="space-y-2">
                      {Object.entries(issuedCredential.details).map(([key, value]) => (
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

                <div className="grow rounded-xl border border-slate-300 bg-slate-900 p-4 text-slate-100 shadow-lg sm:p-5">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Full Credential JSON
                  </h3>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950/70 p-3 text-[10px] leading-relaxed scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600 sm:p-4 sm:text-xs">
                    <code>{createCredentialJson(issuedCredential)}</code>
                  </pre>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-4 sm:py-3 sm:text-sm"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => issuedCredential && downloadCredential(issuedCredential)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-xs font-semibold text-purple-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:px-4 sm:py-3 sm:text-sm"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON
                </button>
              </div>

              {/* Issue Another Button */}
              <button
                type="button"
                onClick={handleIssueAnother}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-blue-700 px-4 py-2.5 text-sm font-semibold tracking-wide text-white shadow-lg shadow-brand/40 transition hover:from-brand-dark hover:to-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-6 sm:py-3 sm:text-base"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Issue Another Credential
              </button>
            </div>
        </section>
      )}
      </div>
    </>
  );
};

export default IssuancePage;
