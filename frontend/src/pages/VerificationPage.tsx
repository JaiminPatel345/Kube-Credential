import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { parseAxiosError, verifyCredential } from '../services/api';
import type { IssuedCredential, VerifyCredentialSuccessResponse } from '../types/credential';
import ErrorToast from '../components/ErrorToast';
import JsonEditor from '../components/JsonEditor';
import KeyValueEditor from '../components/KeyValueEditor';
import ModeToggle from '../components/ModeToggle';

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; payload: VerifyCredentialSuccessResponse; credential: IssuedCredential };

type ValidationState = {
  message: string | null;
  credential?: IssuedCredential;
};

type InputMode = 'simple' | 'raw';

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
  const [inputMode, setInputMode] = useState<InputMode>('simple');
  const [simpleFormData, setSimpleFormData] = useState({
    name: '',
    credentialType: '',
    details: {} as Record<string, string>,
  });
  const [editorKey, setEditorKey] = useState(0);
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

  const handleJsonChange = (value: string) => {
    setRawJson(value);
    setValidation({ message: null });
    setToastMessage(null);
    
    // Auto-validate on change
    if (value.trim()) {
      const result = parseJson(value);
      if (result.credential) {
        setValidation({ message: null, credential: result.credential });
      }
    }
  };

  const handleModeChange = (newMode: InputMode) => {
    if (newMode === inputMode) return;

    if (newMode === 'raw') {
      // Convert simple form to JSON
      const credential = {
        id: '',
        name: simpleFormData.name,
        credentialType: simpleFormData.credentialType,
        details: simpleFormData.details,
        issuedBy: '',
        issuedAt: '',
        hash: '',
      };
      setRawJson(JSON.stringify(credential, null, 2));
      setInputMode('raw');
    } else {
      // Convert JSON to simple form
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === 'object') {
          const details: Record<string, string> = {};
          if (parsed.details && typeof parsed.details === 'object') {
            Object.entries(parsed.details).forEach(([key, value]) => {
              details[key] = String(value);
            });
          }
          setSimpleFormData({
            name: parsed.name || '',
            credentialType: parsed.credentialType || '',
            details,
          });
          setInputMode('simple');
          setEditorKey(prev => prev + 1);
        }
      } catch (error) {
        // If JSON is invalid, switch anyway with empty form
        setSimpleFormData({ name: '', credentialType: '', details: {} });
        setInputMode('simple');
        setEditorKey(prev => prev + 1);
      }
    }
    setValidation({ message: null });
  };

  const handleSimpleFormChange = (field: 'name' | 'credentialType') => (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    setSimpleFormData((prev) => ({ ...prev, [field]: event.target.value }));
    setValidation({ message: null });
    setToastMessage(null);
  };

  const handleDetailsChange = (pairs: Record<string, string>) => {
    setSimpleFormData((prev) => ({ ...prev, details: pairs }));
    setValidation({ message: null });
    setToastMessage(null);
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
        // Update raw JSON
        setRawJson(JSON.stringify(result.credential, null, 2));
        
        // If in simple mode, also update the simple form data
        if (inputMode === 'simple') {
          const details: Record<string, string> = {};
          if (result.credential.details && typeof result.credential.details === 'object') {
            Object.entries(result.credential.details).forEach(([key, value]) => {
              details[key] = String(value);
            });
          }
          setSimpleFormData({
            name: result.credential.name || '',
            credentialType: result.credential.credentialType || '',
            details,
          });
          setEditorKey(prev => prev + 1);
        }
        
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

    let credential: IssuedCredential;

    if (inputMode === 'simple') {
      // Build credential from simple form
      if (!simpleFormData.name.trim() || !simpleFormData.credentialType.trim()) {
        setValidation({ message: 'Name and Credential Type are required' });
        setToastMessage('Name and Credential Type are required');
        return;
      }

      const hasValidDetails = Object.entries(simpleFormData.details).some(
        ([key, value]) => key.trim() !== '' || value.trim() !== ''
      );
      if (!hasValidDetails) {
        setValidation({ message: 'At least one detail field is required' });
        setToastMessage('At least one detail field is required');
        return;
      }

      // Create credential object (fields like id, hash may be empty for lookup)
      credential = {
        id: '',
        name: simpleFormData.name.trim(),
        credentialType: simpleFormData.credentialType.trim(),
        details: simpleFormData.details,
        issuedBy: '',
        issuedAt: '',
        hash: '',
      };
    } else {
      // Parse JSON mode
      const result = parseJson(rawJson);
      if (!result.credential) {
        setValidation(result);
        setRequestState({ status: 'idle' });
        setToastMessage(result.message ?? 'Invalid credential JSON');
        return;
      }
      credential = result.credential;
    }

    setValidation({ message: null, credential });
    setRequestState({ status: 'loading' });
    setToastMessage(null);

    try {
      const response = await verifyCredential(credential);
      setRequestState({ status: 'success', payload: response, credential });
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
    // Clear both raw JSON and simple form data
    setRawJson('');
    setSimpleFormData({ name: '', credentialType: '', details: {} });
    setValidation({ message: null });
    setRequestState({ status: 'idle' });
    setToastMessage(null);
    // Force remount of KeyValueEditor to clear it
    setEditorKey(prev => prev + 1);
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-light">Kube Credential</p>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Verify an Issued Credential</h1>
        <p className="text-base text-slate-600">
          Paste the signed credential payload below or import the JSON file exported from the issuance service.
          We&apos;ll validate the hash and metadata against the verification ledger.
        </p>
      </header>

  <div className={`grid gap-6 ${verificationResult || verifiedCredential ? 'lg:grid-cols-[2fr,3fr]' : 'lg:grid-cols-1'}`}>
        <section className={`rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200 ${!(verificationResult || verifiedCredential) ? 'mx-auto w-full max-w-3xl' : ''}`}>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Credential Input</h2>
              <ModeToggle
                mode={inputMode}
                onModeChange={handleModeChange}
                disabled={isLoading}
              />
            </div>

            {inputMode === 'simple' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="simple-name">
                    Name
                  </label>
                  <input
                    id="simple-name"
                    type="text"
                    placeholder="John Doe"
                    value={simpleFormData.name}
                    onChange={handleSimpleFormChange('name')}
                    disabled={isLoading}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="simple-type">
                    Credential Type
                  </label>
                  <input
                    id="simple-type"
                    type="text"
                    placeholder="Admin"
                    value={simpleFormData.credentialType}
                    onChange={handleSimpleFormChange('credentialType')}
                    disabled={isLoading}
                    className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Details</label>
                  <KeyValueEditor
                    key={`verification-simple-form-${editorKey}`}
                    initialPairs={simpleFormData.details}
                    onChange={handleDetailsChange}
                    disabled={isLoading}
                  />
                </div>

                {validation.message ? <p className="text-sm text-red-600">{validation.message}</p> : null}
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-700" htmlFor="credential-json">
                  Credential JSON
                </label>
                <JsonEditor
                  value={rawJson}
                  onChange={handleJsonChange}
                  placeholder={EMPTY_EXAMPLE}
                  disabled={isLoading}
                  height="400px"
                  showFormatButton={true}
                />
                {validation.message ? <p className="text-sm text-red-600">{validation.message}</p> : null}
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
                  disabled={isLoading || (inputMode === 'raw' ? rawJson.length === 0 : !simpleFormData.name && !simpleFormData.credentialType)}
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-emerald-600/30 transition hover:from-emerald-700 hover:to-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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

        {(verificationResult || verifiedCredential) && (
          <section className="flex h-full flex-col gap-5 rounded-2xl border border-dashed border-brand/30 bg-white/80 p-6 shadow-inner backdrop-blur">
            {renderStatusBadge()}

            {verificationResult && verifiedCredential ? (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued By</dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {verificationResult.issuedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued At</dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {verificationResult.issuedAt ? new Date(verificationResult.issuedAt).toLocaleString() : 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Verified By</dt>
                  <dd className="text-sm font-semibold text-slate-900">
                    {verificationResult.verifiedBy ?? 'Unknown'}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Credential Type</dt>
                  <dd className="text-sm font-semibold text-slate-900">{verifiedCredential.credentialType}</dd>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Credential Details
                  </h3>
                  {verifiedCredential.details && typeof verifiedCredential.details === 'object' && Object.keys(verifiedCredential.details).length > 0 ? (
                    <ul className="space-y-2">
                      {Object.entries(verifiedCredential.details).map(([key, value]) => (
                        <li key={key} className="flex items-start gap-2 text-sm">
                          <span className="text-slate-400">•</span>
                          <span className="font-medium text-slate-700">{key}:</span>
                          <span className="text-slate-900">{String(value)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-500">No additional details</p>
                  )}
                </div>

                <div className="rounded-xl border border-slate-300 bg-slate-900 p-5 text-slate-100 shadow-lg">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Full Credential JSON
                  </h3>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950/70 p-4 text-xs leading-relaxed scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
                    <code>{JSON.stringify(verifiedCredential, null, 2)}</code>
                  </pre>
                </div>
              </div>
            </div>
          ) : null}
          </section>
        )}
      </div>
      </div>
    </>
  );
};

export default VerificationPage;
