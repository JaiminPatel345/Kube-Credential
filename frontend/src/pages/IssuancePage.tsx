import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { issueCredential, parseAxiosError } from '../services/api';
import type { IssuedCredential } from '../types/credential';
import ErrorToast from '../components/ErrorToast';
import JsonEditor from '../components/JsonEditor';
import KeyValueEditor from '../components/KeyValueEditor';
import ModeToggle from '../components/ModeToggle';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  validateIssuanceCredential,
  normalizeIssuanceFormData,
  detailsToKeyValuePairs,
  type IssuanceCredentialData
} from '../services/validationService';
import { detectDuplicateKeysInArray, removeDuplicateKeys } from '../utils/validation';

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
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'simple' | 'raw'>('simple');
  const [editorKey, setEditorKey] = useState(0);
  
  // Store raw pairs array from KeyValueEditor for duplicate detection
  const [detailsPairsArray, setDetailsPairsArray] = useState<Array<{ key: string; value: string }>>([]);
  
  // Duplicate key warning state
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicateWarningMessage, setDuplicateWarningMessage] = useState('');
  const [pendingAction, setPendingAction] = useState<'submit' | 'modeSwitch' | null>(null);
  const [pendingMode, setPendingMode] = useState<'simple' | 'raw' | null>(null);

  const isLoading = requestState.status === 'loading';
  const issuedCredential = requestState.status === 'success' ? requestState.credential : null;

  // Compute raw JSON from formData (always in sync)
  const rawJsonValue = useMemo(() => {
    const credentialData: IssuanceCredentialData = {
      name: formData.name,
      credentialType: formData.credentialType,
      details: formData.details
    };
    return JSON.stringify(credentialData, null, 2);
  }, [formData]);

  const handleFieldChange = (field: 'name' | 'credentialType') => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setShowValidationErrors(false);
    setToastMessage(null);
  };

  const handleKeyValueChange = (pairs: Record<string, string>) => {
    setFormData((prev) => ({ ...prev, details: pairs }));
    setErrors((prev) => ({ ...prev, details: undefined }));
    setShowValidationErrors(false);
    setToastMessage(null);
  };
  
  const handleKeyValuePairsChange = (pairs: Array<{ key: string; value: string }>) => {
    setDetailsPairsArray(pairs);
  };

  const handleRawJsonChange = (value: string) => {
    // Parse and update formData from raw JSON (keeps data in sync)
    try {
      const parsed = JSON.parse(value);
      setFormData({
        name: parsed.name || '',
        credentialType: parsed.credentialType || '',
        details: detailsToKeyValuePairs(parsed.details || {})
      });
      setErrors({});
      setShowValidationErrors(false);
    } catch {
      // Invalid JSON - don't update state
    }
    setToastMessage(null);
  };

  const handleInputModeChange = (newMode: 'simple' | 'raw') => {
    if (newMode === inputMode) return;
    
    // Check for duplicate keys before switching mode (only in simple mode)
    if (inputMode === 'simple') {
      const duplicateCheck = detectDuplicateKeysInArray(detailsPairsArray);
      if (duplicateCheck.hasDuplicates) {
        // Build warning message
        const messages = duplicateCheck.duplicates.map(dup => {
          return `• Key "${dup.key}" conflicts with ${dup.values.join(', ')}`;
        });
        
        setDuplicateWarningMessage(
          `Duplicate keys detected in details:\n\n${messages.join('\n')}\n\nOnly the last value for each key will be kept. Continue?`
        );
        setPendingMode(newMode);
        setPendingAction('modeSwitch');
        setShowDuplicateDialog(true);
        return;
      }
    }
    
    // No data conversion needed - both modes use same formData
    setInputMode(newMode);
    setErrors({});
    setShowValidationErrors(false);
    setEditorKey(prev => prev + 1);
  };
  
  const handleDuplicateConfirm = () => {
    setShowDuplicateDialog(false);
    
    if (pendingAction === 'modeSwitch' && pendingMode) {
      // Remove duplicates and switch mode
      const cleaned = removeDuplicateKeys(formData.details);
      setFormData(prev => ({ ...prev, details: cleaned }));
      setInputMode(pendingMode);
      setErrors({});
      setShowValidationErrors(false);
      setEditorKey(prev => prev + 1);
      setPendingAction(null);
      setPendingMode(null);
    } else if (pendingAction === 'submit') {
      // Remove duplicates and proceed with submission directly
      const cleaned = removeDuplicateKeys(formData.details);
      
      // Perform submission directly instead of clicking submit button
      submitFormWithData(cleaned);
      
      setPendingAction(null);
      setPendingMode(null);
    }
  };
  
  const handleDuplicateCancel = () => {
    setShowDuplicateDialog(false);
    setPendingAction(null);
    setPendingMode(null);
  };

  // Helper function to submit form with specific details
  const submitFormWithData = async (details: Record<string, string>) => {
    // Use centralized validation (same for both modes)
    const normalized = normalizeIssuanceFormData({ ...formData, details });
    const validation = validateIssuanceCredential(normalized);

    if (!validation.valid) {
      setErrors(validation.errors);
      setShowValidationErrors(true);
      const errorMessages = Object.values(validation.errors);
      if (errorMessages.length > 0) {
        setToastMessage(errorMessages[0]);
      }
      return;
    }

    setShowValidationErrors(false);
    setToastMessage(null);
    setRequestState({ status: 'loading' });

    try {
      const response = await issueCredential({
        name: normalized.name,
        credentialType: normalized.credentialType,
        details: normalized.details
      });

      setRequestState({ status: 'success', credential: response.credential });
      setToastMessage(null);
    } catch (error) {
      const parsed = parseAxiosError(error);
      setRequestState({ status: 'error', message: parsed.message });
      setToastMessage(parsed.message);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    // Check for duplicate keys before submission (only in simple mode)
    if (inputMode === 'simple') {
      const duplicateCheck = detectDuplicateKeysInArray(detailsPairsArray);
      if (duplicateCheck.hasDuplicates) {
        // Build warning message
        const messages = duplicateCheck.duplicates.map(dup => {
          return `• Key "${dup.key}" conflicts with ${dup.values.join(', ')}`;
        });
        
        setDuplicateWarningMessage(
          `Duplicate keys detected in details:\n\n${messages.join('\n')}\n\nOnly the last value for each key will be kept. Continue with submission?`
        );
        setPendingAction('submit');
        setShowDuplicateDialog(true);
        return;
      }
    }

    // Submit with current formData.details
    await submitFormWithData(formData.details);
  };

  const handleCopy = async () => {
    if (!issuedCredential) return;
    try {
      const text = createCredentialJson(issuedCredential);
      
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
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

  const handleIssueAnother = () => {
    setRequestState({ status: 'idle' });
    setFormData(EMPTY_FORM);
    setErrors({});
    setShowValidationErrors(false);
    setToastMessage(null);
    setEditorKey(prev => prev + 1);
  };

  return (
    <>
      <ErrorToast message={toastMessage} onClose={handleToastClose} />
      <ConfirmDialog
        isOpen={showDuplicateDialog}
        title="Duplicate Keys Detected"
        message={duplicateWarningMessage}
        variant="warning"
        confirmText="Continue"
        cancelText="Cancel"
        onConfirm={handleDuplicateConfirm}
        onCancel={handleDuplicateCancel}
      />
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
                value={formData.name}
                onChange={handleFieldChange('name')}
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
                value={formData.credentialType}
                onChange={handleFieldChange('credentialType')}
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
                initialPairs={formData.details}
                onChange={handleKeyValueChange}
                onPairsChange={handleKeyValuePairsChange}
                disabled={isLoading}
                showErrors={showValidationErrors}
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
