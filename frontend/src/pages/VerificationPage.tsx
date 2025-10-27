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

type SimpleFormData = {
  id: string;
  name: string;
  credentialType: string;
  issuedBy: string;
  issuedAt: string;
  hash: string;
  details: Record<string, string>;
};

type SimpleFormErrors = Partial<Record<keyof SimpleFormData, string>>;

const SIMPLE_FIELD_LABELS: Record<keyof SimpleFormData, string> = {
  id: 'Id',
  name: 'Name',
  credentialType: 'Credential Type',
  issuedBy: 'Issued By',
  issuedAt: 'Issued At',
  hash: 'Hash',
  details: 'Details',
};

const REQUIRED_SIMPLE_FIELDS: Array<keyof SimpleFormData> = [
  'id',
  'name',
  'credentialType',
  'issuedBy',
  'issuedAt',
  'hash',
];

const EMPTY_SIMPLE_FORM: SimpleFormData = {
  id: '',
  name: '',
  credentialType: '',
  issuedBy: '',
  issuedAt: '',
  hash: '',
  details: {},
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

const VerificationPage = () => {
  const [rawJson, setRawJson] = useState<string>('');
  const [validation, setValidation] = useState<ValidationState>({ message: null });
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('simple');
  const [simpleFormData, setSimpleFormData] = useState<SimpleFormData>({
    id: '',
    name: '',
    credentialType: '',
    issuedBy: '',
    issuedAt: '',
    hash: '',
    details: {},
  });
  const [simpleErrors, setSimpleErrors] = useState<SimpleFormErrors>({});
  const [editorKey, setEditorKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isLoading = requestState.status === 'loading';
  const verificationResult = requestState.status === 'success' ? requestState.payload : null;
  const verifiedCredential = requestState.status === 'success' ? requestState.credential : null;
  const hasSimpleInput =
    simpleFormData.id.trim().length > 0 ||
    simpleFormData.name.trim().length > 0 ||
    simpleFormData.credentialType.trim().length > 0 ||
    simpleFormData.issuedBy.trim().length > 0 ||
    simpleFormData.issuedAt.trim().length > 0 ||
    simpleFormData.hash.trim().length > 0 ||
    Object.values(simpleFormData.details).some((value) => value.trim().length > 0);

  const parseJson = (value: string): ValidationState => {
    if (!value.trim()) {
      return { message: 'Credential JSON is required' };
    }

    try {
      const parsed = JSON.parse(value) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { message: 'Credential JSON must be an object' };
      }

      const missingFields = REQUIRED_SIMPLE_FIELDS.reduce<string[]>((acc, field) => {
        const raw = parsed[field];
        if (typeof raw !== 'string' || raw.trim().length === 0) {
          acc.push(SIMPLE_FIELD_LABELS[field]);
        }
        return acc;
      }, []);

      if (missingFields.length > 0) {
        return { message: `Missing required fields: ${missingFields.join(', ')}` };
      }

      const detailsValue = parsed.details;
      // Allow empty details or missing details field
      if (detailsValue !== undefined && (typeof detailsValue !== 'object' || Array.isArray(detailsValue))) {
        return { message: 'Details must be a JSON object' };
      }

      const normalizedDetails: Record<string, unknown> = {};
      
      // Process details only if they exist
      if (detailsValue && typeof detailsValue === 'object') {
        // Validate that if details exist, values are not empty
        for (const [key, value] of Object.entries(detailsValue as Record<string, unknown>)) {
          if (key.trim() && (value === null || value === undefined || value === '')) {
            return { message: `Detail value for "${key}" cannot be empty or null` };
          }
        }
        
        Object.entries(detailsValue as Record<string, unknown>).forEach(([key, value]) => {
          const trimmedKey = String(key).trim();
          const normalizedValue = typeof value === 'string' ? value.trim() : value;
          if (trimmedKey.length > 0 && (normalizedValue ?? '') !== '') {
            normalizedDetails[trimmedKey] = normalizedValue;
          }
        });
      }

      const credential: IssuedCredential = {
        id: String(parsed.id).trim(),
        name: String(parsed.name).trim(),
        credentialType: String(parsed.credentialType).trim(),
        details: normalizedDetails,
        issuedBy: String(parsed.issuedBy).trim(),
        issuedAt: String(parsed.issuedAt).trim(),
        hash: String(parsed.hash).trim(),
      };

      return { message: null, credential };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON payload';
      return { message: `Invalid JSON: ${message}` };
    }
  };

  const handleJsonChange = (value: string) => {
    setRawJson(value);
    setValidation({ message: null });
    setToastMessage(null);
    setSimpleErrors({});
    
    // Auto-validate on change
    if (value.trim()) {
      const result = parseJson(value);
      if (result.credential) {
        setValidation({ message: null, credential: result.credential });
      }
    }
  };

  const normalizeSimpleDetails = (details: Record<string, string>): Record<string, string> => {
    const normalized: Record<string, string> = {};
    Object.entries(details).forEach(([key, value]) => {
      const trimmedKey = key.trim();
      const trimmedValue = value.trim();
      if (trimmedKey.length > 0 && trimmedValue.length > 0) {
        normalized[trimmedKey] = trimmedValue;
      }
    });
    return normalized;
  };

  const handleModeChange = (newMode: InputMode) => {
    if (newMode === inputMode) return;

    setSimpleErrors({});

    if (newMode === 'raw') {
      const normalizedDetails = normalizeSimpleDetails(simpleFormData.details);
      const credential: IssuedCredential = {
        id: simpleFormData.id.trim(),
        name: simpleFormData.name.trim(),
        credentialType: simpleFormData.credentialType.trim(),
        details: normalizedDetails,
        issuedBy: simpleFormData.issuedBy.trim(),
        issuedAt: simpleFormData.issuedAt.trim(),
        hash: simpleFormData.hash.trim(),
      };
      setRawJson(JSON.stringify(credential, null, 2));
      setValidation({ message: null, credential });
      setInputMode('raw');
    } else {
      try {
        const parsed = JSON.parse(rawJson) as Partial<IssuedCredential> | null;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const details: Record<string, string> = {};
          if (parsed.details && typeof parsed.details === 'object') {
            Object.entries(parsed.details).forEach(([key, value]) => {
              details[String(key)] = String(value ?? '');
            });
          }

          setSimpleFormData({
            id: parsed.id ? String(parsed.id) : '',
            name: parsed.name ? String(parsed.name) : '',
            credentialType: parsed.credentialType ? String(parsed.credentialType) : '',
            issuedBy: parsed.issuedBy ? String(parsed.issuedBy) : '',
            issuedAt: parsed.issuedAt ? String(parsed.issuedAt) : '',
            hash: parsed.hash ? String(parsed.hash) : '',
            details: normalizeSimpleDetails(details),
          });
          setInputMode('simple');
          setEditorKey((prev) => prev + 1);
        }
      } catch (error) {
  setSimpleFormData(() => ({ ...EMPTY_SIMPLE_FORM }));
        setInputMode('simple');
        setEditorKey((prev) => prev + 1);
      }
    }

    setValidation({ message: null });
  };

  const handleSimpleFormChange = (
    field: 'id' | 'name' | 'credentialType' | 'issuedBy' | 'issuedAt' | 'hash'
  ) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setSimpleFormData((prev) => ({ ...prev, [field]: value }));
    setSimpleErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setValidation({ message: null });
    setToastMessage(null);
  };

  const handleDetailsChange = (pairs: Record<string, string>) => {
    setSimpleFormData((prev) => ({ ...prev, details: pairs }));
    setSimpleErrors((prev) => {
      if (!prev.details) {
        return prev;
      }
      const next = { ...prev };
      delete next.details;
      return next;
    });
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
              details[String(key)] = String(value ?? '');
            });
          }
          setSimpleFormData({
            id: result.credential.id || '',
            name: result.credential.name || '',
            credentialType: result.credential.credentialType || '',
            issuedBy: result.credential.issuedBy || '',
            issuedAt: result.credential.issuedAt || '',
            hash: result.credential.hash || '',
            details: normalizeSimpleDetails(details),
          });
          setSimpleErrors({});
          setEditorKey((prev) => prev + 1);
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
      const normalizedDetails = normalizeSimpleDetails(simpleFormData.details);
      const errors: SimpleFormErrors = {};

      REQUIRED_SIMPLE_FIELDS.forEach((field) => {
        const value = simpleFormData[field];
        if (typeof value !== 'string' || value.trim().length === 0) {
          errors[field] = `${SIMPLE_FIELD_LABELS[field]} is required`;
        }
      });

      // Allow empty details object
      // Validate that if details exist, values are not empty
      for (const [key, value] of Object.entries(simpleFormData.details)) {
        if (key.trim() && (!value || value.trim() === '')) {
          errors.details = `Detail value for "${key}" cannot be empty`;
          break;
        }
      }

      if (Object.keys(errors).length > 0) {
        setSimpleErrors(errors);
        
        // Separate missing required fields from details validation errors
        const missingFields: string[] = [];
        let detailsError: string | undefined;
        
        Object.keys(errors).forEach((field) => {
          if (field === 'details') {
            detailsError = errors.details;
          } else {
            missingFields.push(SIMPLE_FIELD_LABELS[field as keyof SimpleFormData]);
          }
        });
        
        let message = '';
        if (missingFields.length > 0) {
          message = `Missing required fields: ${missingFields.join(', ')}`;
        }
        if (detailsError) {
          message = message ? `${message}. ${detailsError}` : detailsError;
        }
        
        setValidation({ message });
        setToastMessage(message);
        return;
      }

      credential = {
        id: simpleFormData.id.trim(),
        name: simpleFormData.name.trim(),
        credentialType: simpleFormData.credentialType.trim(),
        details: normalizedDetails,
        issuedBy: simpleFormData.issuedBy.trim(),
        issuedAt: simpleFormData.issuedAt.trim(),
        hash: simpleFormData.hash.trim(),
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
    setSimpleFormData(() => ({ ...EMPTY_SIMPLE_FORM }));
    setSimpleErrors({});
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

  const handleVerifyAnother = () => {
    setRequestState({ status: 'idle' });
    setRawJson('');
    setSimpleFormData(() => ({ ...EMPTY_SIMPLE_FORM }));
    setSimpleErrors({});
    setValidation({ message: null });
    setToastMessage(null);
    setEditorKey(prev => prev + 1);
  };

  return (
    <>
      <ErrorToast message={toastMessage} onClose={handleToastClose} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-light sm:text-sm">Kube Credential</p>
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
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Credential Input</h2>
              <ModeToggle
                mode={inputMode}
                onModeChange={handleModeChange}
                disabled={isLoading}
              />
            </div>

            {inputMode === 'simple' ? (
              <div className="space-y-4 sm:space-y-5">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="simple-id">
                    Credential ID
                  </label>
                  <input
                    id="simple-id"
                    type="text"
                    placeholder="Enter the credential ID"
                    value={simpleFormData.id}
                    onChange={handleSimpleFormChange('id')}
                    disabled={isLoading}
                    className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                      simpleErrors.id
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                    }`}
                  />
                  {simpleErrors.id ? <p className="text-xs text-rose-600">{simpleErrors.id}</p> : null}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="simple-name">
                      Name
                    </label>
                    <input
                      id="simple-name"
                      type="text"
                      placeholder="Jaimin Detroja"
                      value={simpleFormData.name}
                      onChange={handleSimpleFormChange('name')}
                      disabled={isLoading}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                        simpleErrors.name
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                      }`}
                    />
                    {simpleErrors.name ? <p className="text-xs text-rose-600">{simpleErrors.name}</p> : null}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="simple-type">
                      Credential Type
                    </label>
                    <input
                      id="simple-type"
                      type="text"
                      placeholder="Administrator"
                      value={simpleFormData.credentialType}
                      onChange={handleSimpleFormChange('credentialType')}
                      disabled={isLoading}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                        simpleErrors.credentialType
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                      }`}
                    />
                    {simpleErrors.credentialType ? (
                      <p className="text-xs text-rose-600">{simpleErrors.credentialType}</p>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="simple-issued-by">
                      Issued By
                    </label>
                    <input
                      id="simple-issued-by"
                      type="text"
                      placeholder="Issuer name"
                      value={simpleFormData.issuedBy}
                      onChange={handleSimpleFormChange('issuedBy')}
                      disabled={isLoading}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                        simpleErrors.issuedBy
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                      }`}
                    />
                    {simpleErrors.issuedBy ? (
                      <p className="text-xs text-rose-600">{simpleErrors.issuedBy}</p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700" htmlFor="simple-issued-at">
                      Issued At
                    </label>
                    <input
                      id="simple-issued-at"
                      type="text"
                      placeholder="2024-01-01T12:00:00Z"
                      value={simpleFormData.issuedAt}
                      onChange={handleSimpleFormChange('issuedAt')}
                      disabled={isLoading}
                      className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                        simpleErrors.issuedAt
                          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                      }`}
                    />
                    {simpleErrors.issuedAt ? <p className="text-xs text-rose-600">{simpleErrors.issuedAt}</p> : null}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700" htmlFor="simple-hash">
                    Hash
                  </label>
                  <input
                    id="simple-hash"
                    type="text"
                    placeholder="64-character hash"
                    value={simpleFormData.hash}
                    onChange={handleSimpleFormChange('hash')}
                    disabled={isLoading}
                    className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:ring-2 disabled:opacity-60 ${
                      simpleErrors.hash
                        ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
                        : 'border-slate-300 focus:border-brand focus:ring-brand/40'
                    }`}
                  />
                  {simpleErrors.hash ? <p className="text-xs text-rose-600">{simpleErrors.hash}</p> : null}
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Details</label>
                  <KeyValueEditor
                    key={`verification-simple-form-${editorKey}`}
                    initialPairs={simpleFormData.details}
                    onChange={handleDetailsChange}
                    disabled={isLoading}
                  />
                  {simpleErrors.details ? <p className="text-xs text-rose-600">{simpleErrors.details}</p> : null}
                </div>

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
                  height="300px"
                  showFormatButton={true}
                />
                {validation.message ? <p className="text-xs text-red-600 sm:text-sm">{validation.message}</p> : null}
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
                  disabled={isLoading || (inputMode === 'raw' ? rawJson.length === 0 : !hasSimpleInput)}
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

            {requestState.status === 'error' ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {requestState.message}
              </div>
            ) : null}
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
