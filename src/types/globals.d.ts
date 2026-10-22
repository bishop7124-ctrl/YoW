// Ambient declarations for browser globals the app adds or reads, so type-checked modules (see
// tsconfig.contracts.json) do not need casts.
interface Window {
  gtag?: (...args: unknown[]) => void
  __yowStorageBridge?: unknown
}
interface ImportMeta {
  env: Record<string, string | boolean | undefined>
}
