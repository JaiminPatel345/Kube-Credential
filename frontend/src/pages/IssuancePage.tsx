import { useMemo, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { issueCredential, parseAxiosError } from '../services/api';
import type { IssuedCredential } from '../types/credential';

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

const downloadCredential = (credential: IssuedCredential) => {
  const blob = new Blob([createCredentialJson(credential)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${credential.id}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const IssuancePage = () => {
  const [values, setValues] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [requestState, setRequestState] = useState<RequestState>({ status: 'idle' });

  const isLoading = requestState.status === 'loading';
  const issuedCredential = requestState.status === 'success' ? requestState.credential : null;

  const handleChange = (field: keyof FormValues) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((prev) => ({ ...prev, [field]: event.target.value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const validate = (formValues: FormValues) => {
    const validationErrors: ValidationErrors = {};
    if (!formValues.name.trim()) {
      validationErrors.name = 'Name is required';
    }
    if (!formValues.credentialType.trim()) {
      validationErrors.credentialType = 'Credential type is required';
    }
    const detailsError = validateDetails(formValues.details);
    if (detailsError) {
      validationErrors.details = detailsError;
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

    setRequestState({ status: 'loading' });

    try {
      const response = await issueCredential({
        name: values.name.trim(),
        credentialType: values.credentialType.trim(),
        details: detailsPayload
      });

      setRequestState({ status: 'success', credential: response.credential });
    } catch (error) {
      const parsed = parseAxiosError(error);
      setRequestState({ status: 'error', message: parsed.message });
    }
  };

  const handleCopy = async () => {
    if (!issuedCredential) return;
    try {
      await navigator.clipboard.writeText(createCredentialJson(issuedCredential));
      setRequestState({ status: 'success', credential: issuedCredential });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to copy to clipboard';
      setRequestState({ status: 'error', message });
    }
  };

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
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-6 lg:px-8">
      <header className="flex flex-col gap-2 text-center md:text-left">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand-light">Kube Credential</p>
        <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">Issue a New Credential</h1>
        <p className="text-base text-slate-600">
          Provide the credential details below. The issuance service will generate a deterministic ID
          and securely hash the payload before syncing it with the verification network.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[2fr,3fr]">
        <section className="rounded-2xl bg-white p-6 shadow-card ring-1 ring-slate-200">
          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
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

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700" htmlFor="details">
                Details (JSON)
              </label>
              <textarea
                id="details"
                name="details"
                rows={8}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/40 disabled:opacity-60"
                value={values.details}
                onChange={handleChange('details')}
                disabled={isLoading}
                required
              />
              <p className="text-xs text-slate-500">Paste a JSON object containing credential attributes.</p>
              {errors.details ? <p className="text-sm text-red-600">{errors.details}</p> : null}
            </div>

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              {formFeedback ? (
                <span className={`text-sm font-medium ${formFeedback.color}`}>{formFeedback.message}</span>
              ) : (
                <span className="text-sm text-slate-500">All fields are required.</span>
              )}
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold tracking-wide text-white shadow-lg shadow-brand/30 transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Issuing…
                  </span>
                ) : (
                  'Issue Credential'
                )}
              </button>
            </div>
          </form>
        </section>

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

              <dl className="grid grid-cols-1 gap-4 text-sm text-slate-700 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Credential ID</dt>
                  <dd className="truncate text-base font-semibold text-slate-900" title={issuedCredential.id}>
                    {issuedCredential.id}
                  </dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Issued By</dt>
                  <dd className="text-base font-semibold text-slate-900">{issuedCredential.issuedBy}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Issued At</dt>
                  <dd className="text-base font-semibold text-slate-900">{formatISODate(issuedCredential.issuedAt)}</dd>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 shadow-sm">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Hash</dt>
                  <dd className="text-base font-semibold text-slate-900" title={issuedCredential.hash}>
                    {truncateHash(issuedCredential.hash)}
                  </dd>
                </div>
              </dl>

              <div className="grow rounded-xl bg-slate-900 p-4 text-slate-100 shadow-inner">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Payload</h3>
                <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950/70 p-4 text-xs leading-relaxed">
                  <code>{createCredentialJson(issuedCredential)}</code>
                </pre>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex grow items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  Copy JSON
                </button>
                <button
                  type="button"
                  onClick={() => issuedCredential && downloadCredential(issuedCredential)}
                  className="inline-flex grow items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                >
                  Download JSON
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-slate-500">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
                <span className="text-3xl">🔐</span>
              </div>
              <div className="space-y-1">
                <p className="text-lg font-semibold text-slate-700">No credential issued yet</p>
                <p className="text-sm text-slate-500">
                  Fill out the form to issue a credential. You&apos;ll see the payload and download options once
                  issuance completes.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default IssuancePage;
