import { Component, useMemo, useState, useEffect, useRef } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useStore } from './store/useStore'
import { loadUserData } from './utils/firestoreSync'
import NovelManager from './components/NovelManager'
import SeriesDashboard from './components/series/SeriesDashboard'
import Layout from './components/Layout'
import LoginPage from './components/auth/LoginPage'
import SignedOutPage from './components/auth/SignedOutPage'
import MaintenanceLapsedScreen from './components/auth/MaintenanceLapsedScreen'
import AIPanel from './components/ai/AIPanel'
import AccountSettings from './components/account/AccountSettings'
import HelpContact from './components/help/HelpContact'
import CookieBanner from './components/legal/CookieBanner'
import BetaBanner from './components/legal/BetaBanner'
import LegalModal from './components/legal/LegalModal'
import AboutPage from './components/about/AboutPage'
import YOWLogo from './components/brand/YOWLogo'
import FreeProjectSelector from './components/account/FreeProjectSelector'
import PricingPage from './components/pricing/PricingPage'
import FeaturesPage from './components/features/FeaturesPage'
import FAQPage from './components/faq/FAQPage'
import { getMembership } from './utils/membership'
import { estimateStoreSize } from './utils/storageQuota'
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

const ACCOUNT_SETTINGS_TABS = new Set(['profile', 'appearance', 'preferences', 'membership'])

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
  let path = '/'
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
  const devStorageExceeded = localStorage.getItem('__yow_storage_test') === '1'
  if (devStorageExceeded) console.warn('[YOW] storageTest mode: quota forced to 1 byte')
  const store = useStore(userId, { readOnly: membership.isReadOnly, freeProjectId: membership.freeProjectId, storageQuotaBytes: devStorageExceeded ? 1 : membership.storageQuotaBytes })
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
  const [libraryAiOpen, setLibraryAiOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(() => initialRouteSnapshot.accountOpen)
  const [accountTab, setAccountTab] = useState(() => initialRouteSnapshot.accountTab)
  const [projectSettingsOpen, setProjectSettingsOpen] = useState(() => initialRouteSnapshot.projectSettingsOpen)
  const [helpOpen, setHelpOpen] = useState(false)
  const [readOnlyNotice, setReadOnlyNotice] = useState('')
  const [freeProjectBusy, setFreeProjectBusy] = useState(false)
  const [legalPage, setLegalPage] = useState(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const firstUrlSync = useRef(true)
  const loadedUid = useRef(null)

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
    if (firstUrlSync.current) { firstUrlSync.current = false; return }
    const url = buildRoute(viewMode, store.activeNovelId, activeSeriesId, section, layoutViewMode, {
      accountOpen,
      accountTab,
      projectSettingsOpen,
    })
    const current = `${window.location.pathname}${window.location.search}`
    if (current !== url) history.pushState(null, '', url)
  }, [viewMode, store.activeNovelId, activeSeriesId, section, layoutViewMode, accountOpen, accountTab, projectSettingsOpen])

  // Restore state from browser back/forward navigation (including /pricing)
  useEffect(() => {
    const handlePop = () => {
      const path = window.location.pathname
      if (isPricingPath(path)) {
        setShowPricing(true); setShowFeatures(false); setShowFAQ(false)
        return
      }
      if (isFeaturesPath(path)) {
        setShowFeatures(true); setShowPricing(false); setShowFAQ(false)
        return
      }
      if (isFAQPath(path)) {
        setShowFAQ(true); setShowPricing(false); setShowFeatures(false)
        return
      }
      setShowPricing(false); setShowFeatures(false); setShowFAQ(false)
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
      const reason = event.detail?.reason
      let msg = 'Your trial has ended. Upgrade in Account settings to edit again.'
      if (reason === 'free-project') msg = 'This project is view-only on your free plan. Upgrade to edit all projects.'
      if (reason === 'free-limit') msg = 'Free plan includes one active project. Upgrade to create unlimited projects.'
      if (reason === 'storage-exceeded') msg = 'Storage limit reached. Delete some content or upgrade your plan to continue.'
      setReadOnlyNotice(msg)
      window.clearTimeout(handleReadOnly.timeout)
      handleReadOnly.timeout = window.setTimeout(() => setReadOnlyNotice(''), 4000)
    }
    window.addEventListener('membership-read-only', handleReadOnly)
    return () => {
      window.removeEventListener('membership-read-only', handleReadOnly)
      window.clearTimeout(handleReadOnly.timeout)
    }
  }, [])

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

    // Don't reload if we already fetched for this uid
    if (loadedUid.current === userId) return
    loadedUid.current = userId

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
        finishRemoteLoad()
      })
      .finally(() => setDataLoading(false))
  }, [user, userId, importData, finishRemoteLoad, clearData])

  // Pricing page is accessible regardless of auth state
  if (showPricing) {
    return (
      <>
        <PricingPage
          user={user}
          onGetStarted={() => {
            window.history.pushState(null, '', '/')
            setShowPricing(false)
          }}
          onSignIn={() => {
            window.history.pushState(null, '', '/')
            setShowPricing(false)
          }}
        />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (showFeatures) {
    const goHome = () => { window.history.pushState(null, '', '/'); setShowFeatures(false) }
    return (
      <>
        <FeaturesPage user={user} onGetStarted={goHome} onLogin={goHome} />
        <CookieBanner onOpenPolicy={() => setLegalPage('cookies')} />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
        <BetaBanner />
      </>
    )
  }

  if (showFAQ) {
    const goHome = () => { window.history.pushState(null, '', '/'); setShowFAQ(false) }
    return (
      <>
        <FAQPage user={user} onGetStarted={goHome} onLogin={goHome} />
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

  if (membership.isMaintenanceLapsed) {
    return <MaintenanceLapsedScreen store={store} user={user} />
  }

  if (!user || recoveryMode) {
    if (signedOut && !recoveryMode) return (
      <>
        <SignedOutPage
          onLoginAgain={() => { setOpenLoginAfterSignOut(true); setSignedOut(false) }}
          onGoHome={() => { setOpenLoginAfterSignOut(false); setSignedOut(false); window.location.href = '/' }}
        />
        <LegalModal page={legalPage} onClose={() => setLegalPage(null)} onNavigate={setLegalPage} />
      </>
    )
    return (
      <>
        <LoginPage
          onOpenLegal={setLegalPage}
          onOpenAbout={() => setAboutOpen(true)}
          recoveryMode={recoveryMode}
          initialScreen={openLoginAfterSignOut ? 'auth' : 'home'}
          initialMode="login"
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
      />
      <HelpContact open={helpOpen} onClose={() => setHelpOpen(false)} />
      {readOnlyNotice && (
        <div role="alert" className="membership-toast">{readOnlyNotice}</div>
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

  // Open a book from within a Series Dashboard — remembers which series to return to
  const handleOpenBookFromSeries = (novelId) => {
    setSeriesEntryNovelId(activeSeriesId)
    store.setActiveNovelId(novelId)
    setSection('dashboard')
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

  return (
    <>
      <NovelManager store={store} user={user} onOpenProject={handleOpenProject} onOpenSeries={handleOpenSeries} onOpenChat={() => setLibraryAiOpen(true)} onOpenAccount={() => setAccountOpen(true)} onOpenHelp={() => setHelpOpen(true)} onOpenLegal={setLegalPage} onOpenAbout={() => setAboutOpen(true)} membership={membership} />
      <AIPanel
        store={store}
        open={libraryAiOpen}
        onClose={() => setLibraryAiOpen(false)}
        initialContext={{ characterIds: [], locationIds: [], loreEntryIds: [], chapterIds: [], customInstruction: '' }}
        membership={membership}
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
