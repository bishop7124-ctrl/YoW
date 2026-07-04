import { Component, useMemo, useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useStore } from './store/useStore'
import { loadUserData } from './utils/firestoreSync'
import NovelManager from './components/NovelManager'
import SeriesDashboard from './components/series/SeriesDashboard'
import Layout from './components/Layout'
import LoginPage from './components/auth/LoginPage'
import SignedOutPage from './components/auth/SignedOutPage'
import AIPanel from './components/ai/AIPanel'
import AccountSettings from './components/account/AccountSettings'
import HelpContact from './components/help/HelpContact'
import CookieBanner from './components/legal/CookieBanner'
import BetaBanner from './components/legal/BetaBanner'
import LegalModal from './components/legal/LegalModal'
import AboutPage from './components/about/AboutPage'
import YOWLogo from './components/brand/YOWLogo'
import FreeProjectSelector from './components/account/FreeProjectSelector'
import WelcomeWizard from './components/onboarding/WelcomeWizard'
import OnboardingTour from './components/onboarding/OnboardingTour'
import { useTourStore } from './components/onboarding/useTourStore'
import { WELCOME_TOUR } from './components/onboarding/tourDefinitions'
import PricingPage from './components/pricing/PricingPage'
import FeaturesPage from './components/features/FeaturesPage'
import FAQPage from './components/faq/FAQPage'
import FoundersPage from './components/founders/FoundersPage'
import FounderProfilePage from './components/founders/FounderProfilePage'
import { getMembership } from './utils/membership'
import { STORAGE_MODES, isLocalFirstMode, loadLocalFirstSnapshot, loadStorageMode, saveLocalFirstSnapshot, saveStorageMode } from './utils/storageMode'
import { estimateStoreSize, formatBytes, formatQuotaLabel } from './utils/storageQuota'
import {
  DEFAULT_CUSTOM_COLORS,
  DEFAULT_THEME,
  DEFAULT_THEME_TUNING,
  applyThemeToDocument,
  applyThemeTuning,
  getThemeColors,
  loadThemeChoice,
  loadThemeTuning,
  saveThemeChoice,
  saveThemeTuning,
} from './utils/theme'

const APP_FONT_OPTIONS = {
  system: 'system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", monospace',
  dyslexia: 'Dyslexie, "OpenDyslexic", "Atkinson Hyperlegible", Verdana, Arial, sans-serif',
}

function isPricingPath(path) {
  return path === '/pricing' || path === '/pricing/'
}

function isFeaturesPath(path) {
  return path === '/features' || path === '/features/'
}

function isFAQPath(path) {
  return path === '/faq' || path === '/faq/'
}

function isFoundersPath(path) {
  return path === '/founders' || path === '/founders/'
}

function getFounderProfileSlug(path) {
  const m = path.match(/^\/founders\/([^/]+)\/?$/)
  if (!m) return null
  const slug = m[1]
  return (slug === '' || slug === 'founders') ? null : slug
}

function getAuthRouteMode(path) {
  if (path === '/login' || path === '/login/') return 'login'
  if (path === '/signup' || path === '/signup/') return 'signup'
  return null
}

const ACCOUNT_SETTINGS_TABS = new Set(['profile', 'appearance', 'preferences', 'membership'])

function getLocalModeNoticeKey(userId, membership, storageMode) {
  if (!userId) return null
  const modeKey = membership?.isLocalMode ? 'account-local-mode' : storageMode
  return `nf_localModeNoticeDismissed:${userId}:${modeKey}`
}

function isLocalModeNoticeDismissed(key) {
  if (!key) return false
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

function loadStorageModeState(userId) {
  return { userId: userId || null, mode: loadStorageMode(userId) }
}

function parseRoute() {
  const path = window.location.pathname
  const params = new URLSearchParams(window.location.search)
  const accountTab = params.get('tab')
  const settings = params.get('settings')
  const overlay = {
    accountOpen: settings === 'account',
    accountTab: ACCOUNT_SETTINGS_TABS.has(accountTab) ? accountTab : 'profile',
    projectSettingsOpen: settings === 'project',
  }

  const seriesMatch = path.match(/^\/series\/([^/]+)(?:\/([^/]+))?$/)
  if (seriesMatch) {
    return { novelId: null, seriesId: decodeURIComponent(seriesMatch[1]), section: 'dashboard', layoutViewMode: 'planning', ...overlay, projectSettingsOpen: false }
  }

  const m = path.match(/^\/project\/([^/]+)(?:\/(.+))?$/)
  if (!m) return { novelId: null, seriesId: null, section: 'dashboard', layoutViewMode: 'planning', ...overlay, projectSettingsOpen: false }
  const novelId = decodeURIComponent(m[1])
  const sub = m[2]
  if (sub === 'writing') return { novelId, seriesId: null, section: 'dashboard', layoutViewMode: 'writing', ...overlay }
  return { novelId, seriesId: null, section: sub || 'dashboard', layoutViewMode: 'planning', ...overlay }
}

function buildRoute(viewMode, novelId, seriesId, section, layoutViewMode, overlays = {}) {
  let path = '/dashboard'
  if (viewMode === 'series' && seriesId) {
    path = `/series/${encodeURIComponent(seriesId)}`
  } else if (viewMode === 'editor' && novelId) {
    if (layoutViewMode === 'writing') path = `/project/${encodeURIComponent(novelId)}/writing`
    else if (!section || section === 'dashboard') path = `/project/${encodeURIComponent(novelId)}`
    else path = `/project/${encodeURIComponent(novelId)}/${section}`
  }
  const params = new URLSearchParams()
  if (overlays.accountOpen) {
    params.set('settings', 'account')
    if (ACCOUNT_SETTINGS_TABS.has(overlays.accountTab) && overlays.accountTab !== 'profile') {
      params.set('tab', overlays.accountTab)
    }
  } else if (overlays.projectSettingsOpen && viewMode === 'editor' && novelId) {
    params.set('settings', 'project')
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#0f1115] flex flex-col items-center justify-center gap-4 p-8 text-center">
          <span className="w-12 h-12 text-[#f59e0b]"><YOWLogo /></span>
          <p className="text-[#f8fafc] font-semibold">Something went wrong.</p>
          <p className="text-[#64748b] text-sm max-w-sm">{this.state.error?.message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-2 px-4 py-2 rounded-lg bg-[#f59e0b] text-[#0f1115] font-bold text-sm"
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function AppInner() {
  const { user, loading: authLoading, updateProfile, recoveryMode } = useAuth()
  const [signedOut, setSignedOut] = useState(false)
  const [openLoginAfterSignOut, setOpenLoginAfterSignOut] = useState(false)
  const prevUserRef = useRef(null)
  useEffect(() => {
    if (prevUserRef.current && !user && !authLoading && !recoveryMode) setSignedOut(true)
    if (user) { setSignedOut(false); setOpenLoginAfterSignOut(false); prevUserRef.current = user }
  }, [user, authLoading, recoveryMode])
  const userId = user?.uid || user?.id || null
  const membership = getMembership(user)
  const [storageModeState, setStorageModeState] = useState(() => loadStorageModeState(userId))
  const storageMode = storageModeState.userId === (userId || null)
    ? storageModeState.mode
    : loadStorageMode(userId)
  const userLocalFirstMode = isLocalFirstMode(storageMode)
  const effectiveLocalMode = membership.isLocalMode || userLocalFirstMode
  const devStorageExceeded = localStorage.getItem('__yow_storage_test') === '1'
  if (devStorageExceeded) console.warn('[YOW] storageTest mode: quota forced to 1 byte')
  const store = useStore(userId, {
    readOnly: membership.isReadOnly,
    freeProjectId: membership.freeProjectId,
    storageQuotaBytes: devStorageExceeded ? 1 : membership.storageQuotaBytes,
    cloudSyncEnabled: membership.canSyncCloud && !userLocalFirstMode,
  })
  const { importData, finishRemoteLoad, clearData } = store
  const [dataLoading, setDataLoading] = useState(false)
  const initialRouteSnapshot = useMemo(() => parseRoute(), [])
  const initialRoute = useRef(initialRouteSnapshot)
  const [section, setSection] = useState(() => initialRouteSnapshot.section)
  const [viewMode, setViewMode] = useState(() => {
    if (initialRouteSnapshot.seriesId) return 'series'
    if (initialRouteSnapshot.novelId) return 'editor'
    return 'manager'
  })
  const [activeSeriesId, setActiveSeriesId] = useState(() => initialRouteSnapshot.seriesId || null)
  const [seriesEntryNovelId, setSeriesEntryNovelId] = useState(null)
  const [layoutViewMode, setLayoutViewMode] = useState(() => initialRouteSnapshot.layoutViewMode)
  const [showPricing, setShowPricing] = useState(() => isPricingPath(window.location.pathname))
  const [showFeatures, setShowFeatures] = useState(() => isFeaturesPath(window.location.pathname))
  const [showFAQ, setShowFAQ] = useState(() => isFAQPath(window.location.pathname))
  const [showFounders, setShowFounders] = useState(() => isFoundersPath(window.location.pathname))
  const [founderProfileSlug, setFounderProfileSlug] = useState(() => getFounderProfileSlug(window.location.pathname))
  const [authRouteMode, setAuthRouteMode] = useState(() => getAuthRouteMode(window.location.pathname))
  const [libraryAiOpen, setLibraryAiOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(() => initialRouteSnapshot.accountOpen)
  const [accountTab, setAccountTab] = useState(() => initialRouteSnapshot.accountTab)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(() => initialRouteSnapshot.projectSettingsOpen)
  const [helpOpen, setHelpOpen] = useState(false)
  const [readOnlyNotice, setReadOnlyNotice] = useState(null)
  const [dismissedLocalModeNotices, setDismissedLocalModeNotices] = useState({})
  const [emailConfirmed, setEmailConfirmed] = useState(() => {
    const hash = window.location.hash
    const search = window.location.search
    const isConfirmation =
      hash.includes('type=signup') || hash.includes('type=email_change') ||
      search.includes('type=signup') || search.includes('type=email_change')
    if (!isConfirmation) return false
    history.replaceState(null, '', window.location.pathname)
    return true
  })
  const [freeProjectBusy, setFreeProjectBusy] = useState(false)
  const [legalPage, setLegalPage] = useState(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const tourStore = useTourStore()
  const firstUrlSync = useRef(true)
  const loadedUid = useRef(null)
  const localModeNoticeKey = useMemo(
    () => getLocalModeNoticeKey(userId, membership, storageMode),
    [userId, membership, storageMode]
  )
  const localModeNoticeDismissed = effectiveLocalMode && localModeNoticeKey
    ? (dismissedLocalModeNotices[localModeNoticeKey] ?? isLocalModeNoticeDismissed(localModeNoticeKey))
    : false

  useEffect(() => {
    setStorageModeState(prev => {
      const next = loadStorageModeState(userId)
      return prev.userId === next.userId && prev.mode === next.mode ? prev : next
    })
  }, [userId])

  const handleStorageModeChange = (nextMode) => {
    const savedMode = saveStorageMode(userId, nextMode)
    setStorageModeState({ userId: userId || null, mode: savedMode })
    const nextNoticeKey = getLocalModeNoticeKey(userId, membership, nextMode)
    if (nextNoticeKey) {
      setDismissedLocalModeNotices(prev => ({ ...prev, [nextNoticeKey]: false }))
      try { localStorage.removeItem(nextNoticeKey) } catch { /* storage unavailable */ }
    }
    if (nextMode === STORAGE_MODES.CLOUD_SYNC) {
      // Cloud Sync resumes from the current browser copy. We avoid pulling remote
      // data over local work when the user intentionally leaves Local-first mode.
      finishRemoteLoad(true)
      loadedUid.current = userId ? `${userId}:cloud-sync` : null
    } else {
      saveLocalFirstSnapshot(userId, store.getLocalSnapshot?.())
      finishRemoteLoad(false)
      loadedUid.current = userId ? `${userId}:local-first` : null
    }
  }

  const openCloudSettings = () => {
    setAccountTab('membership')
    setAccountOpen(true)
  }

  const dismissLocalModeNotice = () => {
    if (!localModeNoticeKey) return
    setDismissedLocalModeNotices(prev => ({ ...prev, [localModeNoticeKey]: true }))
    try { localStorage.setItem(localModeNoticeKey, '1') } catch { /* storage unavailable */ }
  }

  const localModeNotice = effectiveLocalMode
    ? {
        label: membership.isLocalMode ? 'Local Mode' : 'Local-first',
        message: membership.isLocalMode
          ? 'Your lifetime licence is active. Cloud hosting is inactive, so YOW is running in Local Mode on this device.'
          : 'Local-first mode is active. Your writing is saved on this device and cloud sync is paused.',
        onOpenSettings: openCloudSettings,
      }
    : null

  const navigatePublic = (path) => {
    window.history.pushState(null, '', path)
    setShowPricing(isPricingPath(path))
    setShowFeatures(isFeaturesPath(path))
    setShowFAQ(isFAQPath(path))
    setShowFounders(isFoundersPath(path))
    setFounderProfileSlug(getFounderProfileSlug(path))
    setAuthRouteMode(getAuthRouteMode(path))
  }

  // Estimate store size for storage quota display (recalculated when account opens).
  const storageUsedBytes = useMemo(() => {
    if (!accountOpen) return 0
    return estimateStoreSize(store)
  }, [accountOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const savedTheme = loadThemeChoice()
    const customColors = (() => {
      try { return JSON.parse(localStorage.getItem('nf-custom-colors') || '{}') }
      catch { return {} }
    })()
    applyThemeToDocument(savedTheme, customColors)
    applyThemeTuning(loadThemeTuning(), getThemeColors(savedTheme, customColors))
    const fontChoice = localStorage.getItem('nf-font') || 'system'
    document.documentElement.style.setProperty('--font', APP_FONT_OPTIONS[fontChoice] || APP_FONT_OPTIONS.system)
    document.documentElement.removeAttribute('data-radius')
  }, [])

  useEffect(() => {
    if (!store.activeNovelId) {
      if (viewMode === 'editor') {
        setViewMode(activeSeriesId ? 'series' : 'manager')
      }
      setLayoutViewMode('planning')
      setProjectSettingsOpen(false)
    }
  }, [store.activeNovelId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // If the URL pointed to a specific project on load, keep that view active;
    // it will be fully restored once data finishes loading below.
    if (initialRoute.current.novelId || initialRoute.current.seriesId) return
    setViewMode('manager')
    setLayoutViewMode('planning')
  }, [userId])

  // On mount: if URL points to a project or series, activate it
  useEffect(() => {
    const { novelId, seriesId } = initialRoute.current
    if (novelId && novelId !== store.activeNovelId) store.setActiveNovelId(novelId)
    if (seriesId) setActiveSeriesId(seriesId)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync browser URL with navigation state
  useEffect(() => {
    if (firstUrlSync.current) {
      firstUrlSync.current = false
      // Redirect bare "/" to "/dashboard" when logged in
      if (user && (window.location.pathname === '/' || window.location.pathname === '')) {
        history.replaceState(null, '', '/dashboard')
      }
      return
    }
    if (!user && authRouteMode) return
    const url = buildRoute(viewMode, store.activeNovelId, activeSeriesId, section, layoutViewMode, {
      accountOpen,
      accountTab,
      projectSettingsOpen,
    })
    const current = `${window.location.pathname}${window.location.search}`
    if (current !== url) history.pushState(null, '', url)
  }, [viewMode, store.activeNovelId, activeSeriesId, section, layoutViewMode, accountOpen, accountTab, projectSettingsOpen, user, authRouteMode])

  // Restore state from browser back/forward navigation (including /pricing)
  useEffect(() => {
    const handlePop = () => {
      const path = window.location.pathname
      if (isPricingPath(path)) {
        setShowPricing(true); setShowFeatures(false); setShowFAQ(false); setShowFounders(false); setAuthRouteMode(null)
        return
      }
      if (isFeaturesPath(path)) {
        setShowFeatures(true); setShowPricing(false); setShowFAQ(false); setShowFounders(false); setAuthRouteMode(null)
        return
      }
      if (isFAQPath(path)) {
        setShowFAQ(true); setShowPricing(false); setShowFeatures(false); setShowFounders(false); setAuthRouteMode(null)
        return
      }
      if (isFoundersPath(path)) {
        setShowFounders(true); setFounderProfileSlug(null); setShowPricing(false); setShowFeatures(false); setShowFAQ(false); setAuthRouteMode(null)
        return
      }
      const profileSlug = getFounderProfileSlug(path)
      if (profileSlug) {
        setFounderProfileSlug(profileSlug); setShowFounders(false); setShowPricing(false); setShowFeatures(false); setShowFAQ(false); setAuthRouteMode(null)
        return
      }
      const nextAuthRouteMode = getAuthRouteMode(path)
      if (nextAuthRouteMode) {
        setShowPricing(false); setShowFeatures(false); setShowFAQ(false); setAuthRouteMode(nextAuthRouteMode)
        return
      }
      setShowPricing(false); setShowFeatures(false); setShowFAQ(false); setShowFounders(false); setAuthRouteMode(null)
      const route = parseRoute()
      setSection(route.section)
      setLayoutViewMode(route.layoutViewMode)
      setAccountOpen(route.accountOpen)
      setAccountTab(route.accountTab)
      setProjectSettingsOpen(route.projectSettingsOpen)
      if (route.novelId) {
        store.setActiveNovelId(route.novelId)
        setViewMode('editor')
      } else if (route.seriesId) {
        store.setActiveNovelId(null)
        setActiveSeriesId(route.seriesId)
        setViewMode('series')
      } else {
        store.setActiveNovelId(null)
        setActiveSeriesId(null)
        setViewMode('manager')
      }
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  }, [store])

  useEffect(() => {
    const handleOpenAccount = (event) => {
      const tab = event.detail?.tab
      if (ACCOUNT_SETTINGS_TABS.has(tab)) setAccountTab(tab)
      setAccountOpen(true)
    }
    window.addEventListener('open-account-settings', handleOpenAccount)
    return () => window.removeEventListener('open-account-settings', handleOpenAccount)
  }, [])

  useEffect(() => {
    const handleReadOnly = (event) => {
      const { reason, usedBytes, quotaBytes } = event.detail || {}
      let msg = 'Your trial has ended. Upgrade in Account settings to edit again.'
      if (reason === 'free-project') msg = 'This project is view-only on your free plan. Upgrade to edit all projects.'
      if (reason === 'free-limit') msg = 'Free plan includes one active project. Upgrade to create unlimited projects.'
      if (reason === 'storage-exceeded') msg = 'Storage limit reached. Delete some content or upgrade your plan to continue.'
      setReadOnlyNotice({
        msg,
        storage: reason === 'storage-exceeded' && usedBytes != null && quotaBytes != null
          ? { used: usedBytes, quota: quotaBytes }
          : null,
      })
      window.clearTimeout(handleReadOnly.timeout)
      handleReadOnly.timeout = window.setTimeout(() => setReadOnlyNotice(null), 4000)
    }
    window.addEventListener('membership-read-only', handleReadOnly)
    return () => {
      window.removeEventListener('membership-read-only', handleReadOnly)
      window.clearTimeout(handleReadOnly.timeout)
    }
  }, [])

  // Force default theme on all public/marketing pages so user theme choices
  // never leak into the landing experience.
  const isPublicPage = showPricing || showFeatures || showFAQ || showFounders || !!founderProfileSlug || !user
  useEffect(() => {
    if (isPublicPage) {
      applyThemeToDocument(DEFAULT_THEME, {})
      applyThemeTuning(DEFAULT_THEME_TUNING, getThemeColors(DEFAULT_THEME, {}))
    } else {
      const savedTheme = loadThemeChoice()
      const customColors = (() => {
        try { return JSON.parse(localStorage.getItem('nf-custom-colors') || '{}') }
        catch { return {} }
      })()
      applyThemeToDocument(savedTheme, customColors)
      applyThemeTuning(loadThemeTuning(), getThemeColors(savedTheme, customColors))
    }
  }, [isPublicPage]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply account-owned appearance on login. New accounts should not inherit
  // a previous user's browser-local theme choice.
  useEffect(() => {
    if (!user?.id) return

    const profileTheme = user?.user_metadata?.theme
    const profileCustomColors = user?.user_metadata?.custom_theme_colors || {}
    if (profileTheme) {
      const appliedTheme = saveThemeChoice(profileTheme, profileCustomColors)
      const profileTuning = {
        ...loadThemeTuning(),
        ...(Number.isFinite(Number(user?.user_metadata?.theme_radius_unit)) ? { radiusUnit: Number(user.user_metadata.theme_radius_unit) } : {}),
        ...(Number.isFinite(Number(user?.user_metadata?.theme_visual_strength)) ? { visualStrength: Number(user.user_metadata.theme_visual_strength) } : {}),
      }
      saveThemeTuning(profileTuning, getThemeColors(appliedTheme, profileCustomColors))
      if (appliedTheme === 'custom') {
        localStorage.setItem('nf-custom-colors', JSON.stringify(profileCustomColors))
      }
    } else {
      const appliedTheme = saveThemeChoice(DEFAULT_THEME, DEFAULT_CUSTOM_COLORS)
      localStorage.setItem('nf-custom-colors', JSON.stringify({}))
      saveThemeTuning(DEFAULT_THEME_TUNING, getThemeColors(appliedTheme))
    }
  }, [
    user?.id,
    user?.user_metadata?.theme,
    user?.user_metadata?.custom_theme_colors,
    user?.user_metadata?.theme_radius_unit,
    user?.user_metadata?.theme_visual_strength,
  ])

  useEffect(() => {
    if (!user) {
      loadedUid.current = null
      clearData()
      finishRemoteLoad()
      return
    }

    const loadKey = `${userId}:${userLocalFirstMode ? 'local-first' : 'cloud-sync'}`
    if (loadedUid.current === loadKey) return
    if (userLocalFirstMode) {
      loadedUid.current = loadKey
      const localFirstSnapshot = loadLocalFirstSnapshot(userId)
      if (localFirstSnapshot) importData(localFirstSnapshot)
      finishRemoteLoad(false)
      window.setTimeout(() => finishRemoteLoad(false), 650)
      setDataLoading(false)
      return
    }
    if (loadedUid.current === `${userId}:local-first`) {
      loadedUid.current = loadKey
      finishRemoteLoad(true)
      setDataLoading(false)
      return
    }
    loadedUid.current = loadKey

    setDataLoading(true)
    loadUserData(userId)
      .then(data => {
        importData(data)
        // URL takes priority over remote last-active project; also restore the view/section
        const urlNovelId = initialRoute.current.novelId
        if (urlNovelId) {
          store.setActiveNovelId(urlNovelId)
          setViewMode('editor')
          setLayoutViewMode(initialRoute.current.layoutViewMode)
          setProjectSettingsOpen(initialRoute.current.projectSettingsOpen)
        }
      })
      .catch(error => {
        console.error(error)
        finishRemoteLoad(false)
      })
      .finally(() => setDataLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userId, userLocalFirstMode, importData, finishRemoteLoad, clearData])

  // Pricing page is accessible regardless of auth state
  if (showPricing) {
    return (
      <>
        <PricingPage
          user={user}
          onGetStarted={() => navigatePublic(user ? '/' : '/signup')}
          onSignIn={() => navigatePublic(user ? '/' : '/login')}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (showFeatures) {
    return (
      <>
        <FeaturesPage
          user={user}
          onGetStarted={() => navigatePublic(user ? '/' : '/signup')}
          onLogin={() => navigatePublic(user ? '/' : '/login')}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (showFAQ) {
    return (
      <>
        <FAQPage
          user={user}
          onGetStarted={() => navigatePublic(user ? '/' : '/signup')}
          onLogin={() => navigatePublic(user ? '/' : '/login')}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (showFounders) {
    return (
      <>
        <FoundersPage
          user={user}
          onGetStarted={() => navigatePublic(user ? '/' : '/signup')}
          onLogin={() => navigatePublic(user ? '/' : '/login')}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (founderProfileSlug) {
    return (
      <>
        <FounderProfilePage
          slug={founderProfileSlug}
          user={user}
          onGetStarted={() => navigatePublic(user ? '/' : '/signup')}
          onLogin={() => navigatePublic(user ? '/' : '/login')}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-[var(--bg-main)] flex flex-col items-center justify-center gap-4">
        <span className="w-12 h-12 text-[var(--accent)]"><YOWLogo /></span>
        <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user || recoveryMode) {
    if (signedOut && !recoveryMode) return (
      <>
        <SignedOutPage
          onLoginAgain={() => { setOpenLoginAfterSignOut(true); setSignedOut(false); navigatePublic('/login') }}
          onGoHome={() => { setOpenLoginAfterSignOut(false); setSignedOut(false); navigatePublic('/') }}
        />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
      </>
    )
    return (
      <>
        <LoginPage
          key={recoveryMode ? 'recovery' : authRouteMode || (openLoginAfterSignOut ? 'login' : 'home')}
          onOpenLegal={setLegalPage}
          onOpenAbout={() => setAboutOpen(true)}
          onNavigateHome={() => navigatePublic('/')}
          onAuthModeChange={(mode) => navigatePublic(mode === 'signup' ? '/signup' : '/login')}
          onSignedUp={() => setEmailConfirmed(true)}
          recoveryMode={recoveryMode}
          initialScreen={recoveryMode || authRouteMode || openLoginAfterSignOut ? 'auth' : 'home'}
          initialMode={authRouteMode || 'login'}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <AboutPage open={aboutOpen} onClose={() => setAboutOpen(false)} />
        <BetaBanner />
      </>
    )
  }

  const showFreeSelector = membership.isFree && !membership.freeProjectId && store.novels.length >= 1

  const handleFreeProjectConfirm = async (projectId) => {
    try {
      setFreeProjectBusy(true)
      await updateProfile({ ...(user.user_metadata || {}), free_project_id: projectId })
    } catch {
      // non-fatal — user can retry on next load
    } finally {
      setFreeProjectBusy(false)
    }
  }

  const accountPage = (
    <>
      <AccountSettings
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        storageUsedBytes={storageUsedBytes}
        activeTab={accountTab}
        onTabChange={setAccountTab}
        store={store}
        tourStore={tourStore}
        storageMode={storageMode}
        onStorageModeChange={handleStorageModeChange}
        effectiveLocalMode={effectiveLocalMode}
      />
      <HelpContact open={helpOpen} onClose={() => setHelpOpen(false)} />
      {emailConfirmed && (
        <div role="status" className="membership-toast membership-toast--success">
          <span>Email confirmed successfully. Welcome to Your Own World!</span>
          <button type="button" className="membership-toast-link" onClick={() => setEmailConfirmed(false)}>
            Dismiss
          </button>
        </div>
      )}
      {readOnlyNotice && (
        <div role="alert" className="membership-toast">
          <span>{readOnlyNotice.msg}</span>
          {readOnlyNotice.storage && (
            <span className="membership-toast-storage">
              {formatBytes(readOnlyNotice.storage.used)} of {formatQuotaLabel(readOnlyNotice.storage.quota)} used.
            </span>
          )}
          {readOnlyNotice.storage && (
            <button
              type="button"
              className="membership-toast-link"
              onClick={() => {
                setAccountTab('membership')
                setAccountOpen(true)
              }}
            >
              Plan settings
            </button>
          )}
        </div>
      )}
      {effectiveLocalMode && !localModeNoticeDismissed && (
        <div role="status" className="membership-toast">
          <span>{localModeNotice.message}</span>
          <button
            type="button"
            className="membership-toast-link"
            onClick={openCloudSettings}
          >
            Cloud settings
          </button>
          <button type="button" className="membership-toast-link" onClick={dismissLocalModeNotice}>
            Dismiss
          </button>
        </div>
      )}
      {showFreeSelector && (
        <FreeProjectSelector
          novels={store.novels}
          onConfirm={handleFreeProjectConfirm}
          busy={freeProjectBusy}
        />
      )}
    </>
  )

  const handleOpenProject = (id) => {
    store.setActiveNovelId(id)
    setSection('dashboard')
    setViewMode('editor')
    setLayoutViewMode('planning')
    setProjectSettingsOpen(false)
    setSeriesEntryNovelId(null)
  }

  const handleOpenSeries = (id) => {
    setActiveSeriesId(id)
    setViewMode('series')
    store.setActiveNovelId(null)
  }

  const applyProjectEntryTarget = (target = {}) => {
    if (!target?.type || !target?.itemId) return
    if (target.type === 'character') store.setSelectedCharacterId?.(target.itemId)
    if (target.type === 'location') store.setSelectedLocationId?.(target.itemId)
    if (target.type === 'lore') store.setSelectedLoreEntryId?.(target.itemId)
    if (target.type === 'timeline' || target.type === 'history') store.setSelectedTimelineEventId?.(target.itemId)
    if (target.type === 'map') store.selectMap?.(target.itemId)
  }

  // Open a book from within a Series Dashboard — remembers which series to return to
  const handleOpenBookFromSeries = (novelId, target = {}) => {
    setSeriesEntryNovelId(activeSeriesId)
    applyProjectEntryTarget(target)
    store.setActiveNovelId(novelId)
    setSection(target.section || 'dashboard')
    setViewMode('editor')
    setLayoutViewMode('planning')
    setProjectSettingsOpen(false)
  }

  const handleBackToSeries = () => {
    store.setActiveNovelId(null)
    setViewMode('series')
    setSeriesEntryNovelId(null)
  }

  const globalOverlays = (
    <>
      <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
      <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
      <AboutPage open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <BetaBanner />
    </>
  )

  // Resolve which series context the current book was entered from (for breadcrumb)
  const seriesContextId = seriesEntryNovelId ?? (store.activeNovel?.seriesId || null)
  const seriesContext = seriesContextId ? store.series?.find(s => s.id === seriesContextId) ?? null : null

  if (viewMode === 'editor' && store.activeNovel) {
    return (
      <>
        <Layout
          key={store.activeNovelId}
          store={store}
          userId={userId}
          section={section}
          setSection={setSection}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenLegal={setLegalPage}
          onOpenAbout={() => setAboutOpen(true)}
          membership={membership}
          viewMode={layoutViewMode}
          setViewMode={setLayoutViewMode}
          projectSettingsOpen={projectSettingsOpen}
          setProjectSettingsOpen={setProjectSettingsOpen}
          seriesContext={seriesContext}
          onOpenSeries={seriesContext ? handleBackToSeries : null}
          onGoHome={() => { store.setActiveNovelId(null); setViewMode('manager') }}
          tourStore={tourStore}
          localModeBubble={localModeNoticeDismissed ? localModeNotice : null}
        />
        {accountPage}
        {globalOverlays}
      </>
    )
  }

  if (viewMode === 'series' && activeSeriesId) {
    return (
      <>
        <SeriesDashboard
          store={store}
          seriesId={activeSeriesId}
          onOpenBook={handleOpenBookFromSeries}
          onBack={() => { setActiveSeriesId(null); setViewMode('manager') }}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
          onOpenLegal={setLegalPage}
          onOpenAbout={() => setAboutOpen(true)}
          membership={membership}
        />
        {accountPage}
        {globalOverlays}
      </>
    )
  }

  const showWelcomeTour = user && tourStore.toursEnabled && !tourStore.welcomeShown(userId) && !dataLoading
  const closeWelcomeTour = () => tourStore.markWelcomeShown(userId)
  const disableWelcomeTours = () => {
    tourStore.setToursEnabled(false)
    tourStore.markWelcomeShown(userId)
  }
  const isFirstRun = !showWelcomeTour && !tourStore.wizardShown && store.novels.length === 0 && !dataLoading

  return (
    <>
      <NovelManager store={store} user={user} onOpenProject={handleOpenProject} onOpenSeries={handleOpenSeries} onOpenChat={() => setLibraryAiOpen(true)} onOpenAccount={() => setAccountOpen(true)} onOpenHelp={() => setHelpOpen(true)} onOpenLegal={setLegalPage} onOpenAbout={() => setAboutOpen(true)} membership={membership} tourStore={tourStore} suppressAutoTour={showWelcomeTour} localModeBubble={localModeNoticeDismissed ? localModeNotice : null} />
      {showWelcomeTour && (
        <OnboardingTour
          steps={WELCOME_TOUR}
          onFinish={closeWelcomeTour}
          onSkip={closeWelcomeTour}
          onDisableTours={disableWelcomeTours}
        />
      )}
      {isFirstRun && (
        <WelcomeWizard
          store={store}
          onOpenProject={(id) => { tourStore.markWizardShown(); handleOpenProject(id) }}
          onSkip={() => tourStore.markWizardShown()}
        />
      )}
      <AIPanel
        store={store}
        open={libraryAiOpen}
        onClose={() => setLibraryAiOpen(false)}
        initialContext={{ characterIds: [], locationIds: [], loreEntryIds: [], chapterIds: [], customInstruction: '' }}
        membership={membership}
        userId={userId}
      />
      {accountPage}
      {globalOverlays}
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </ErrorBoundary>
  )
}
