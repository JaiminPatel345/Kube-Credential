import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { issueCredential, parseAxiosError } from '../services/api';
import type { IssuedCredential } from '../types/credential';
import ErrorToast from '../components/ErrorToast';
import JsonEditor from '../components/JsonEditor';
import KeyValueEditor from '../components/KeyValueEditor';
import ModeToggle from '../components/ModeToggle';

type FormValues = {
  name: string;
  credentialType: string;
  details: string;
};

type ValidationErrors = Partial<Record<keyof FormValues, string>>;

type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; credential: IssuedCredential }
  | { status: 'error'; message: string };

type DetailsMode = 'simple' | 'raw';

const EMPTY_FORM: FormValues = {
  name: '',
  credentialType: '',
  details: '{\n  \"attribute\": \"value\"\n}'
};

const truncateHash = (hash: string) => `${hash.slice(0, 12)}…${hash.slice(-8)}`;

const formatISODate = (iso: string) => new Date(iso).toLocaleString();

const validateDetails = (details: string) => {
  if (!details.trim()) {
    return 'Details are required';
  }

  try {
    const parsed = JSON.parse(details);
    if (!parsed || typeof parsed !== 'object') {
      return 'Details must be a JSON object';
    }
    if (Object.keys(parsed as Record<string, unknown>).length === 0) {
      return 'Details must include at least one property';
    }
    return null;
  } catch (error) {
    if (error instanceof Error) {
      return `Invalid JSON: ${error.message}`;
    }
    return 'Invalid JSON payload';
  }
};

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
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [detailsMode, setDetailsMode] = useState<DetailsMode>('simple');
  const [keyValuePairs, setKeyValuePairs] = useState<Record<string, string>>({});
  const [editorKey, setEditorKey] = useState(0);

  const isLoading = requestState.status === 'loading';
  const issuedCredential = requestState.status === 'success' ? requestState.credential : null;

  const handleChange = (field: keyof FormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setToastMessage(null);
  };

  const handleModeChange = (newMode: DetailsMode) => {
    if (newMode === detailsMode) return;

    if (newMode === 'raw') {
      // Convert key-value pairs to JSON
      const jsonString = JSON.stringify(keyValuePairs, null, 2);
      setValues((prev) => ({ ...prev, details: jsonString }));
      setDetailsMode('raw');
    } else {
      // Convert JSON to key-value pairs
      try {
        const parsed = JSON.parse(values.details);
        if (parsed && typeof parsed === 'object') {
          const pairs: Record<string, string> = {};
          Object.entries(parsed).forEach(([key, value]) => {
            pairs[key] = String(value);
          });
          setKeyValuePairs(pairs);
          setDetailsMode('simple');
          // Force remount of KeyValueEditor with new data
          setEditorKey(prev => prev + 1);
        }
      } catch (error) {
        // If JSON is invalid, switch anyway with empty pairs
        setKeyValuePairs({});
        setDetailsMode('simple');
        setEditorKey(prev => prev + 1);
      }
    }
    setErrors((prev) => ({ ...prev, details: undefined }));
  };

  const handleKeyValueChange = (pairs: Record<string, string>) => {
    setKeyValuePairs(pairs);
    // Update the details field with JSON representation
    setValues((prev) => ({ ...prev, details: JSON.stringify(pairs, null, 2) }));
    setErrors((prev) => ({ ...prev, details: undefined }));
    setToastMessage(null);
  };

  const validate = (formValues: FormValues) => {
    const validationErrors: ValidationErrors = {};
    if (!formValues.name.trim()) {
      validationErrors.name = 'Name is required';
    }
    if (!formValues.credentialType.trim()) {
      validationErrors.credentialType = 'Credential type is required';
    }
    
    // Validate based on mode
    if (detailsMode === 'simple') {
      const hasValidPairs = Object.entries(keyValuePairs).some(
        ([key, value]) => key.trim() !== '' || value.trim() !== ''
      );
      if (!hasValidPairs) {
        validationErrors.details = 'At least one field with a key is required';
      }
    } else {
      const detailsError = validateDetails(formValues.details);
      if (detailsError) {
        validationErrors.details = detailsError;
      }
    }
    return validationErrors;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setRequestState({ status: 'idle' });
      return;
    }

    let detailsPayload: Record<string, unknown>;
    try {
      detailsPayload = JSON.parse(values.details);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid JSON';
      setErrors((prev) => ({ ...prev, details: `Invalid JSON: ${message}` }));
      setRequestState({ status: 'idle' });
      return;
    }

    setToastMessage(null);
    setRequestState({ status: 'loading' });

    try {
      const response = await issueCredential({
        name: values.name.trim(),
        credentialType: values.credentialType.trim(),
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
      await navigator.clipboard.writeText(createCredentialJson(issuedCredential));
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

  return (
    <>
      <ErrorToast message={toastMessage} onClose={handleToastClose} />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-light">Kube Credential</p>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Issue a New Credential</h1>
        <p className="text-base text-slate-600">
          Provide the credential details below. The issuance service will generate a deterministic ID
          and securely hash the payload before syncing it with the verification network.
        </p>
      </header>

      <div className={`grid gap-6 ${issuedCredential ? 'lg:grid-cols-[2fr,3fr]' : 'lg:grid-cols-1'}`}>
        <section className={`rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200 ${!issuedCredential ? 'mx-auto w-full max-w-3xl' : ''}`}>
          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                placeholder="Jane Doe"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                value={values.name}
                onChange={handleChange('name')}
                disabled={isLoading}
                required
              />
              {errors.name ? <p className="text-sm text-red-600">{errors.name}</p> : null}
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
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                value={values.credentialType}
                onChange={handleChange('credentialType')}
                disabled={isLoading}
                required
              />
              {errors.credentialType ? <p className="text-sm text-red-600">{errors.credentialType}</p> : null}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700" htmlFor="details">
                  Details
                </label>
                <ModeToggle
                  mode={detailsMode}
                  onModeChange={handleModeChange}
                  disabled={isLoading}
                />
              </div>

              {detailsMode === 'simple' ? (
                <KeyValueEditor
                  key={`issuance-simple-form-${editorKey}`}
                  initialPairs={keyValuePairs}
                  onChange={handleKeyValueChange}
                  disabled={isLoading}
                />
              ) : (
                <JsonEditor
                  value={values.details}
                  onChange={(value) => {
                    setValues((prev) => ({ ...prev, details: value }));
                    setErrors((prev) => ({ ...prev, details: undefined }));
                    setToastMessage(null);
                  }}
                  placeholder='{\n  "attribute": "value"\n}'
                  disabled={isLoading}
                  height="280px"
                  showFormatButton={true}
                />
              )}
              
              {errors.details ? <p className="text-sm text-red-600">{errors.details}</p> : null}
            </div>

            <div className="flex flex-col gap-3">
              {formFeedback && (
                <div className={`rounded-lg border px-4 py-2.5 text-sm font-medium ${
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-blue-700 px-6 py-3 text-base font-semibold tracking-wide text-white shadow-lg shadow-brand/40 transition hover:from-brand-dark hover:to-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
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

        {issuedCredential && (
          <section className="flex h-full flex-col rounded-2xl border border-dashed border-brand/30 bg-white/80 p-6 shadow-inner backdrop-blur">
            {issuedCredential ? (
            <div className="flex h-full flex-col gap-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-slate-900">Issued Credential</h2>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Success
                </span>
              </div>

              <dl className="grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Credential ID</dt>
                  <dd className="truncate text-sm font-semibold text-slate-900" title={issuedCredential.id}>
                    {issuedCredential.id}
                  </dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued By</dt>
                  <dd className="text-sm font-semibold text-slate-900">{issuedCredential.issuedBy}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Issued At</dt>
                  <dd className="text-sm font-semibold text-slate-900">{formatISODate(issuedCredential.issuedAt)}</dd>
                </div>
                <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-slate-100 p-4 shadow-sm">
                  <dt className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-500">Hash</dt>
                  <dd className="text-sm font-semibold text-slate-900" title={issuedCredential.hash}>
                    {truncateHash(issuedCredential.hash)}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Credential Details
                  </h3>
                  {issuedCredential.details && typeof issuedCredential.details === 'object' && Object.keys(issuedCredential.details).length > 0 ? (
                    <ul className="space-y-2">
                      {Object.entries(issuedCredential.details).map(([key, value]) => (
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

                <div className="grow rounded-xl border border-slate-300 bg-slate-900 p-5 text-slate-100 shadow-lg">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Full Credential JSON
                  </h3>
                  <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950/70 p-4 text-xs leading-relaxed scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
                    <code>{createCredentialJson(issuedCredential)}</code>
                  </pre>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 shadow-sm transition hover:border-blue-300 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => issuedCredential && downloadCredential(issuedCredential)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-700 shadow-sm transition hover:border-purple-300 hover:bg-purple-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download JSON
                </button>
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

export default IssuancePage;
