import YOWLogo from '../brand/YOWLogo'

export default function SignedOutPage({ onLoginAgain, onGoHome }) {
  return (
    <div className="auth-shell min-h-screen flex items-center justify-center p-6">
      <div className="auth-frame w-full max-w-sm text-center" style={{ padding: '2.5rem 2rem' }}>
        <div className="flex justify-center mb-6">
          <div className="studio-logo"><YOWLogo /></div>
        </div>

        <h1 className="font-serif text-2xl font-medium mb-2" style={{ color: 'var(--text-main)' }}>
          You've been signed out
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-muted)' }}>
          Your session has ended. Come back whenever you're ready to keep writing.
        </p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="btn-primary w-full"
            onClick={onLoginAgain}
          >
            Log in again
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={onGoHome}
          >
            Go to homepage
          </button>
        </div>
      </div>
    </div>
  )
}
