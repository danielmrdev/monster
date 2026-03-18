'use client';

import { useActionState } from 'react';
import { checkDomainAvailability, registerDomain } from './actions';

interface DomainManagementProps {
  siteId?: string;
  existingDomain?: string | null;
}

type CheckState = {
  domain?: string;
  available?: boolean;
  price?: string;
  error?: string;
} | null;

type RegisterState = {
  success?: boolean;
  nameservers?: string[];
  error?: string;
} | null;

// Wrapper so useActionState gets the right shape
async function checkAction(
  _prev: CheckState,
  formData: FormData,
): Promise<CheckState> {
  const domain = (formData.get('domain') as string | null)?.trim() ?? '';
  if (!domain) return { error: 'Enter a domain name.' };
  const result = await checkDomainAvailability(domain);
  return { domain, ...result };
}

async function registerAction(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const siteId = formData.get('siteId') as string;
  const domain = formData.get('domain') as string;
  return await registerDomain(siteId, domain);
}

export default function DomainManagement({ siteId, existingDomain }: DomainManagementProps) {
  const [checkState, checkDispatch, checkPending] = useActionState(checkAction, null);
  const [registerState, registerDispatch, registerPending] = useActionState(registerAction, null);

  const isAvailable = checkState?.available === true;
  const domainToRegister = checkState?.domain;

  return (
    <div className="space-y-4">
      {/* Existing domain indicator */}
      {existingDomain && (
        <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm">
          <span className="font-medium text-green-800">Domain assigned:</span>
          <span className="font-mono text-green-700">{existingDomain}</span>
        </div>
      )}

      {/* --- Availability Check --- */}
      <div>
        <form action={checkDispatch} className="flex gap-2">
          <input
            type="text"
            name="domain"
            placeholder="example.com"
            defaultValue={checkState?.domain ?? ''}
            required
            className="flex-1 rounded-md border border-border px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={checkPending}
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {checkPending ? 'Checking…' : 'Check Availability'}
          </button>
        </form>

        {/* Check result */}
        {checkState && !checkPending && (
          <div className="mt-2">
            {checkState.error ? (
              <p className="text-sm text-red-600">{checkState.error}</p>
            ) : checkState.available ? (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                  ✓ Available
                </span>
                {checkState.price && (
                  <span className="text-sm text-muted-foreground">{checkState.price}</span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                ✗ Taken
              </span>
            )}
          </div>
        )}
      </div>

      {/* --- Approve & Register (only when a siteId context exists) --- */}
      {siteId && (
        <>
          {isAvailable && domainToRegister && !registerState?.success && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-3">
              <p className="text-sm font-semibold text-red-800">⚠️ Real registration</p>
              <p className="text-sm text-red-700">
                Clicking <strong>Approve &amp; Register</strong> will register{' '}
                <strong className="font-mono">{domainToRegister}</strong> through your Spaceship
                account. <strong>Charges will apply to your Spaceship account.</strong> This action
                cannot be undone.
              </p>
              <form action={registerDispatch}>
                <input type="hidden" name="siteId" value={siteId} />
                <input type="hidden" name="domain" value={domainToRegister} />
                <button
                  type="submit"
                  disabled={registerPending}
                  className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {registerPending ? 'Registering… (this may take ~20s)' : 'Approve & Register'}
                </button>
              </form>
            </div>
          )}

          {/* Registration result */}
          {registerState && !registerPending && (
            <div>
              {registerState.error ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm font-semibold text-red-800">Registration failed</p>
                  <p className="text-sm text-red-700 mt-1">{registerState.error}</p>
                </div>
              ) : registerState.success ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 space-y-2">
                  <p className="text-sm font-semibold text-green-800">
                    ✓ Domain registered successfully
                  </p>
                  {registerState.nameservers && registerState.nameservers.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-green-700 mb-1">
                        Nameservers updated to:
                      </p>
                      <ul className="space-y-0.5">
                        {registerState.nameservers.map((ns) => (
                          <li
                            key={ns}
                            className="font-mono text-xs text-green-800 bg-green-100 rounded px-2 py-1 border border-green-200"
                          >
                            {ns}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}
