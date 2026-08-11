import { useMemo, useState } from 'react'
import { supabase } from '../../supabase'
import { PLANS } from '../../utils/membership'

const DEFAULT_PLAN_LABELS = {
  premium_monthly: 'Monthly',
  premium_plus_lifetime: 'Lifetime',
  founder: 'Founder',
  hosting_renewal: 'Cloud Mode renewal',
}

// Selectable plan options for the interest picker — paid plans only, and no
// pricing shown here (this is a "what do you get" hover, not a price list).
const PICKABLE_PLANS = PLANS.filter(plan => plan.key !== 'free').map(plan => ({
  key: plan.key,
  label: plan.label,
  badge: plan.badge,
  description: plan.description,
  features: (plan.features || []).filter(feature => !feature.includes('£')),
}))

const INTEREST_ENDPOINT = import.meta.env.VITE_REGISTER_PAID_INTEREST_URL || '/api/register-paid-interest'

function getRegisterError(response, body) {
  if (body?.error) return body.error
  if (response.status === 404) {
    return 'The interest form API is not available on this local server. Restart the dev server and try again.'
  }
  return `Could not register your interest right now. (${response.status})`
}

export default function BetaInterestModal({
  open,
  user,
  planKey = '',
  planLabel,
  onClose,
  onGranted,
  onCreateAccount,
}) {
  // A caller that already knows which plan the user wants (e.g. a specific
  // plan card on the pricing page) pins it and skips the picker. A generic
  // entry point (the beta disclaimer) leaves it open for the user to choose.
  const showPlanPicker = !planKey
  const [form, setForm] = useState(() => ({
    name: user?.user_metadata?.full_name || '',
    email: user?.email || '',
    projectType: '',
    message: '',
  }))
  const [selectedPlanKey, setSelectedPlanKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [granted, setGranted] = useState(false)
  const [betaActivated, setBetaActivated] = useState(false)

  const effectivePlanKey = planKey || selectedPlanKey
  const selectedPlan = planLabel || DEFAULT_PLAN_LABELS[effectivePlanKey] || 'a paid plan'

  const title = useMemo(() => (
    granted
      ? betaActivated ? 'Beta tester access is active' : 'Interest registered'
      : 'Paid plans are coming soon'
  ), [granted, betaActivated])

  if (!open) return null

  const updateField = (field, value) => {
    setForm(current => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(INTEREST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          plan: effectivePlanKey,
          planLabel: selectedPlan,
          page: window.location.pathname,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(getRegisterError(response, json))

      setBetaActivated(json.betaTester === true)
      setGranted(true)
      await onGranted?.(json)
    } catch (err) {
      setError(err.message || 'Could not register your interest right now.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="beta-interest-backdrop" role="dialog" aria-modal="true" aria-labelledby="beta-interest-title">
      <div className="beta-interest-modal">
        <header className="beta-interest-header">
          <div>
            <p className="eyebrow">Beta access</p>
            <h1 id="beta-interest-title">{title}</h1>
          </div>
          <button className="account-icon-button" type="button" onClick={onClose} aria-label="Close beta access modal">
            ×
          </button>
        </header>

        <main>
          {!granted ? (
            <section>
              <p className="beta-interest-copy">
                Paid plans are coming soon. Register your interest here and we’ll email you when {selectedPlan} is ready.
              </p>
              <form className="beta-interest-form" onSubmit={handleSubmit}>
                {showPlanPicker && (
                  <div className="beta-interest-field">
                    <span>Which plan are you interested in?</span>
                    <div className="beta-interest-plan-options">
                      {PICKABLE_PLANS.map(plan => (
                        <button
                          key={plan.key}
                          type="button"
                          className={`beta-interest-plan-option${selectedPlanKey === plan.key ? ' is-selected' : ''}`}
                          onClick={() => setSelectedPlanKey(plan.key)}
                          aria-pressed={selectedPlanKey === plan.key}
                        >
                          {plan.badge && <span className="beta-interest-plan-badge">{plan.badge}</span>}
                          <span className="beta-interest-plan-name">{plan.label}</span>
                          <div className="beta-interest-plan-tooltip" role="tooltip">
                            <p className="beta-interest-plan-tooltip-desc">{plan.description}</p>
                            <ul>
                              {plan.features.map(feature => <li key={feature}>{feature}</li>)}
                            </ul>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <label className="beta-interest-field">
                  <span>Name</span>
                  <input value={form.name} onChange={e => updateField('name', e.target.value)} maxLength={120} />
                </label>
                <label className="beta-interest-field">
                  <span>Email</span>
                  <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)} maxLength={254} required />
                </label>
                <label className="beta-interest-field">
                  <span>What are you building?</span>
                  <input value={form.projectType} onChange={e => updateField('projectType', e.target.value)} maxLength={160} placeholder="Novel, campaign, comic, series..." />
                </label>
                <label className="beta-interest-field">
                  <span>Anything you want us to know?</span>
                  <textarea value={form.message} onChange={e => updateField('message', e.target.value)} maxLength={1200} rows={4} />
                </label>
                {error && <p className="account-error">{error}</p>}
                <button type="submit" className="account-primary-button" disabled={busy || (showPlanPicker && !selectedPlanKey)}>
                  {busy ? 'Registering...' : 'Register interest'}
                </button>
              </form>
            </section>
          ) : (
            <section>
              {betaActivated ? (
                <>
                  <p className="beta-interest-copy">
                    Thanks, you’re now marked as a beta tester. Your account has full product access while YOW remains in beta.
                  </p>
                  <p className="beta-interest-copy">
                    Beta tester status is temporary and may be revoked when we move out of beta. We’ll give clearer paid-plan options before that happens.
                  </p>
                </>
              ) : (
                <p className="beta-interest-copy">
                  Thanks, your interest has been registered. Sign in or create a free account, then
                  register again from inside the app to activate beta tester access.
                </p>
              )}
              {!betaActivated && onCreateAccount ? (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="account-primary-button" onClick={() => onCreateAccount(form.email)}>
                    Create a free account
                  </button>
                  <button type="button" className="account-secondary-button" onClick={onClose}>
                    I'll do this later
                  </button>
                </div>
              ) : (
                <button type="button" className="account-primary-button" onClick={onClose}>
                  Continue with beta access
                </button>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
