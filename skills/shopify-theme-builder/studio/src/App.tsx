import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CompassIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LayoutListIcon,
  LoaderCircleIcon,
  MonitorIcon,
  PaletteIcon,
  PlusIcon,
  Redo2Icon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import fontLibrary from '../server/shopify-fonts.json'
import type { PreviewState } from '../server/preview.mjs'
import type {
  Brand,
  Direction,
  Group,
  MediaSetting,
  Offense,
  Page,
  SectionDetails,
  Setting,
  StoreResources,
  StyleGroup,
  TemplateSection,
  ThemeState,
} from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { layoutWireframe, wireframes, type PresetWireframe, type Tone } from '@/wireframes.mjs'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; state: ThemeState }
type Frame = { url: string; paths: Record<Page, string>; editor: Record<Page, string> | null }
type Tab = 'sections' | 'brand' | 'directions' | 'style' | 'checks'
type Device = 'desktop' | 'mobile'

// In the page switcher's order; a Record would list 404 first.
const pageItems: { value: Page; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'product', label: 'Product' },
  { value: 'collection', label: 'Collection' },
  { value: 'page', label: 'Page' },
  { value: 'contact', label: 'Contact' },
  { value: 'cart', label: 'Cart' },
  { value: 'search', label: 'Search' },
  { value: 'blog', label: 'Blog' },
  { value: 'article', label: 'Article' },
  { value: '404', label: '404' },
  { value: 'collections', label: 'Collections list' },
]
const pageNames = Object.fromEntries(pageItems.map((item) => [item.value, item.label])) as Record<Page, string>

/** The Studio: the page's sections on the left, the live preview in the middle, the selected section on the right. */
export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const preview = usePreview()
  const frame = useFrame(preview)
  const [page, setPage] = useState<Page>('home')
  const [tab, setTab] = useState<Tab>('sections')
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const showState = (state: ThemeState) => setLoad({ status: 'ready', state })

  // Reads the Theme at start and again whenever its files change elsewhere. The Studio always runs on
  // Vite's dev server, so the server's change events come over Vite's HMR connection.
  useEffect(() => {
    let controller = new AbortController()
    function read() {
      // Only the latest read may show, so an older answer arriving late is dropped.
      controller.abort()
      controller = new AbortController()
      const { signal } = controller
      fetch('/api/theme', { signal })
        .then(async (response) => {
          const body = await response.json()
          if (!response.ok) throw new Error(body.error)
          setLoad({ status: 'ready', state: body })
        })
        .catch((error: Error) => {
          if (!signal.aborted) setLoad({ status: 'error', message: error.message })
        })
    }
    read()
    import.meta.hot?.on('studio:theme', read)
    return () => {
      controller.abort()
      import.meta.hot?.off('studio:theme', read)
    }
  }, [])

  // Closing or reloading the Studio asks first while the Theme has changes not saved, or an edit not written yet.
  const unsaved = load.status === 'ready' && !load.state.saved
  const onBeforeUnload = useEffectEvent((event: BeforeUnloadEvent) => {
    if (unsaved || unwritten.size > 0) event.preventDefault()
  })
  useEffect(() => {
    const listener = (event: BeforeUnloadEvent) => onBeforeUnload(event)
    addEventListener('beforeunload', listener)
    return () => removeEventListener('beforeunload', listener)
  }, [])

  function openPage(next: Page) {
    setPage(next)
    setSelectedId(null)
  }

  function select(id: string | null) {
    setSelectedId(id)
    if (id) setTab('sections')
  }

  if (load.status !== 'ready') {
    return (
      <main className="flex h-screen items-center justify-center p-6">
        {load.status === 'loading' ? (
          <Skeleton className="h-64 w-full max-w-3xl" />
        ) : (
          <Alert variant="destructive" className="max-w-xl">
            <AlertTitle>The Studio could not read the Theme</AlertTitle>
            <AlertDescription>{load.message}</AlertDescription>
          </Alert>
        )}
      </main>
    )
  }
  const { state } = load

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <span className="font-heading font-medium">Studio</span>
        <Select items={pageItems} value={page} onValueChange={(next) => next !== null && openPage(next)}>
          <SelectTrigger size="sm" aria-label="Page" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {pageItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <SaveButton saved={state.saved} onSaved={showState} />
          <DownloadZipButton />
          <UndoRedo history={state.history} onSaved={showState} />
          <PreviewBadge preview={preview} />
          <ChecksBadge offenses={state.validation} onClick={() => setTab('checks')} />
          <div className="flex rounded-md border p-0.5">
            <Button size="icon-sm" variant={device === 'desktop' ? 'secondary' : 'ghost'} aria-label="Desktop preview" onClick={() => setDevice('desktop')}>
              <MonitorIcon />
            </Button>
            <Button size="icon-sm" variant={device === 'mobile' ? 'secondary' : 'ghost'} aria-label="Mobile preview" onClick={() => setDevice('mobile')}>
              <SmartphoneIcon />
            </Button>
          </div>
          {preview?.status === 'running' && typeof frame === 'object' && frame ? (
            <a href={preview.url + frame.paths[page]} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <ExternalLinkIcon data-icon="inline-start" />
              Open
            </a>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-76 shrink-0 flex-col border-r">
          <div role="tablist" className="flex gap-1 border-b p-2">
            <TabButton tab="sections" current={tab} onSelect={setTab} icon={<LayoutListIcon />} label="Sections" />
            <TabButton tab="brand" current={tab} onSelect={setTab} icon={<PaletteIcon />} label="Brand" />
            <TabButton tab="directions" current={tab} onSelect={setTab} icon={<CompassIcon />} label="Directions" />
            <TabButton tab="style" current={tab} onSelect={setTab} icon={<SlidersHorizontalIcon />} label="Style" />
            <TabButton tab="checks" current={tab} onSelect={setTab} icon={<CircleCheckIcon />} label="Checks" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'sections' ? (
              <SectionsPanel state={state} page={page} selectedId={selectedId} onSelect={select} onSaved={showState} />
            ) : tab === 'brand' ? (
              <BrandPanel brand={state.brand} onSaved={showState} />
            ) : tab === 'directions' ? (
              <DirectionsPanel directions={state.directions} onSaved={showState} onChosen={() => setTab('style')} />
            ) : tab === 'style' ? (
              <StylePanel style={state.style} onSaved={showState} />
            ) : (
              <ThemeCheck offenses={state.validation} />
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 justify-center overflow-hidden bg-muted p-4">
          {typeof frame === 'string' ? (
            <p className="max-w-md self-center text-center text-destructive">The Studio could not show the preview: {frame}</p>
          ) : preview?.status === 'running' && frame ? (
            <PreviewFrame
              src={frame.url + frame.paths[page]}
              device={device}
              selectedId={selectedId}
              onSelect={select}
            />
          ) : (
            <PreviewWaiting preview={preview} />
          )}
        </main>
        <aside className="w-84 shrink-0 overflow-y-auto border-l">
          {selectedId ? (
            <Inspector
              key={`${page}/${selectedId}`}
              state={state}
              page={page}
              sectionId={selectedId}
              editor={typeof frame === 'object' && frame?.editor ? frame.editor[page] : null}
              onClose={() => setSelectedId(null)}
              onSaved={showState}
            />
          ) : (
            <EmptyState title="No section selected" description="Click a section in the preview or in the list to edit it." />
          )}
        </aside>
      </div>
    </div>
  )
}

function TabButton({
  tab,
  current,
  onSelect,
  icon,
  label,
}: {
  tab: Tab
  current: Tab
  onSelect: (tab: Tab) => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <Button
      role="tab"
      aria-selected={tab === current}
      size="sm"
      variant={tab === current ? 'secondary' : 'ghost'}
      // Icon over label, each as wide as it needs, so five tabs fit the sidebar.
      className="h-auto flex-auto flex-col gap-0.5 px-1 py-1.5 text-xs"
      onClick={() => onSelect(tab)}
    >
      {icon}
      {label}
    </Button>
  )
}

/** Whether the Theme has changes since its last commit, whoever made them, and Save, which commits them as a checkpoint. */
function SaveButton({ saved, onSaved }: { saved: boolean; onSaved: (state: ThemeState) => void }) {
  const { saving, error, write } = useWrite(onSaved)
  return (
    <>
      {error ? (
        <p role="alert" title={error} className="max-w-xs truncate text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <span role="status" className="text-sm text-muted-foreground">
        {saved ? null : '● Unsaved changes'}
      </span>
      <Button size="sm" disabled={saving || saved} onClick={() => write('/api/save', { method: 'POST' })}>
        {saving ? 'Saving…' : 'Save'}
      </Button>
    </>
  )
}

/** Downloads the Theme as Shopify's zip, packaged from what is on disk (what the preview shows), saved or not. */
function DownloadZipButton() {
  const [packaging, setPackaging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function download() {
    setPackaging(true)
    setError(null)
    try {
      const response = await fetch('/api/package')
      if (!response.ok) throw new Error((await response.json()).error)
      const name = /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('Content-Disposition') ?? '')?.[1]
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download = name ? decodeURIComponent(name) : 'theme.zip'
      link.click()
      // Once the browser took the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setPackaging(false)
    }
  }
  return (
    <>
      {error ? (
        <p role="alert" title={error} className="max-w-xs truncate text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button size="sm" variant="outline" disabled={packaging} onClick={download}>
        {packaging ? <LoaderCircleIcon data-icon="inline-start" className="animate-spin" /> : <DownloadIcon data-icon="inline-start" />}
        {packaging ? 'Packaging…' : 'Download zip'}
      </Button>
    </>
  )
}

/** Undo and Redo of the Studio's writes, with Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z outside text fields. */
function UndoRedo({ history, onSaved }: { history: ThemeState['history']; onSaved: (state: ThemeState) => void }) {
  const { saving, error, write } = useWrite(onSaved)
  const travel = (to: 'undo' | 'redo') => {
    if (!saving && history[to]) void write(`/api/${to}`, { method: 'POST' })
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== 'z') return
    // A text field keeps its own undo.
    const target = event.target as HTMLElement
    if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
    event.preventDefault()
    travel(event.shiftKey ? 'redo' : 'undo')
  })
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {error ? (
        <p role="alert" title={error} className="max-w-xs truncate text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex rounded-md border p-0.5">
        <Button size="icon-sm" variant="ghost" aria-label="Undo" title="Undo" disabled={saving || !history.undo} onClick={() => travel('undo')}>
          <Undo2Icon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Redo" title="Redo" disabled={saving || !history.redo} onClick={() => travel('redo')}>
          <Redo2Icon />
        </Button>
      </div>
    </>
  )
}

type Answer = ThemeState | { error: string }

// Each write waits for the one before, so the Studio records them in order and the latest answer shows last.
let writes: Promise<unknown> = Promise.resolve()

/** Sends a write to the Studio API: the Theme state it returns, or the error. */
function send(url: string, init: RequestInit): Promise<Answer> {
  const answer = writes.then(async (): Promise<Answer> => {
    try {
      const response = await fetch(url, init)
      const body = await response.json()
      return response.ok ? body : { error: body.error }
    } catch (error) {
      return { error: (error as Error).message }
    }
  })
  writes = answer
  return answer
}

/** Sends writes to the Studio API and hands the Theme state each returns to onSaved. */
function useWrite(onSaved: (state: ThemeState) => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Resolves to the Theme state the write returned, or null when it failed; a failure shows in error. */
  async function write(url: string, init: RequestInit): Promise<ThemeState | null> {
    setSaving(true)
    setError(null)
    const answer = await send(url, init)
    setSaving(false)
    if ('error' in answer) {
      setError(answer.error)
      return null
    }
    onSaved(answer)
    return answer
  }

  return { saving, error, write }
}

// How long typing pauses before a text field writes.
const typing = 600
/** The fields whose live edit waits to be written, or for its answer: closing the Studio then asks first. */
const unwritten = new Set<string>()

/**
 * Writes each field as it changes: at once, or `delay` ms after its latest change, and at once on flush (on blur).
 * Until then, and when the Studio refuses it, the field shows its edit; the refusal shows under it. Each write
 * names its field, so the Studio makes a burst of edits to it one undo step. A pending write goes out on unmount.
 * @param settleOnSave Drops an edit once its write succeeds, for a panel whose values come with the Theme state;
 *   one that reads them after calls settle() then.
 */
function useLiveEdits(onSaved: (state: ThemeState) => void, settleOnSave = true) {
  const [edits, setEdits] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const failed = useRef(new Set<string>())
  // Counts each field's edits, so an answer knows whether a newer edit follows it.
  const versions = useRef(new Map<string, number>())
  const timers = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; run: () => void }>())

  function change<T>(field: string, value: T, request: (value: T) => [string, RequestInit], delay = 0) {
    setEdits((current) => ({ ...current, [field]: value }))
    const version = (versions.current.get(field) ?? 0) + 1
    versions.current.set(field, version)
    unwritten.add(field)
    clearTimeout(timers.current.get(field)?.timer)
    async function run() {
      timers.current.delete(field)
      const [url, init] = request(value)
      const answer = await send(url, { ...init, headers: { ...init.headers, 'X-Studio-Field': field } })
      const newest = versions.current.get(field) === version
      if ('error' in answer) {
        if (!newest) return
        failed.current.add(field)
        setErrors((current) => ({ ...current, [field]: answer.error }))
      } else {
        failed.current.delete(field)
        setErrors(({ [field]: _, ...rest }) => rest)
        onSaved(answer)
        if (newest && settleOnSave) setEdits(({ [field]: _, ...rest }) => rest)
      }
      if (newest) unwritten.delete(field)
    }
    if (delay > 0) timers.current.set(field, { timer: setTimeout(run, delay), run })
    else void run()
  }

  function flush(field: string) {
    const pending = timers.current.get(field)
    clearTimeout(pending?.timer)
    pending?.run()
  }

  /** Drops the edits already written, once the values they changed are read again. */
  function settle() {
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([field]) => unwritten.has(field) || failed.current.has(field))))
  }

  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const { timer, run } of pending.values()) {
        clearTimeout(timer)
        run()
      }
    }
  }, [])

  return {
    /** The field's edit, else its value in the Theme. */
    value: <T,>(field: string, value: T) => (field in edits ? (edits[field] as T) : value),
    error: (field: string): string | undefined => errors[field],
    change,
    flush,
    settle,
  }
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/** The status of `shopify theme dev`, kept up to date by the Studio server. */
function usePreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    function update(state: PreviewState) {
      // A pushed status is newer than the one being fetched.
      controller.abort()
      setPreview(state)
    }
    fetch('/api/preview', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        setPreview(body)
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setPreview({ status: 'error', message: error.message, uploadErrors: [] })
      })
    import.meta.hot?.on('studio:preview', update)
    return () => {
      controller.abort()
      import.meta.hot?.off('studio:preview', update)
    }
  }, [])
  return preview
}

/** Where the Studio's iframe loads the preview, once theme dev runs, or why it can't. */
function useFrame(preview: PreviewState | null) {
  const [frame, setFrame] = useState<Frame | string | null>(null)
  const running = preview?.status === 'running'
  useEffect(() => {
    if (!running) return
    const controller = new AbortController()
    fetch('/api/frame', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        setFrame(response.ok ? body : body.error)
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setFrame(error.message)
      })
    return () => controller.abort()
  }, [running])
  return running ? frame : null
}

function PreviewBadge({ preview }: { preview: PreviewState | null }) {
  const labels: Record<PreviewState['status'], string> = {
    starting: 'Starting',
    running: 'Live',
    'login-required': 'Login required',
    reconnecting: 'Reconnecting',
    error: 'Preview error',
  }
  const status = preview?.status ?? 'starting'
  const uploadErrors = preview?.uploadErrors ?? []
  return (
    <>
      <Badge variant={status === 'error' ? 'destructive' : status === 'running' ? 'secondary' : 'outline'}>{labels[status]}</Badge>
      {uploadErrors.length > 0 ? (
        <Badge variant="destructive" title={uploadErrors.map((error) => `${error.file}: ${error.message}`).join('\n')}>
          {plural(uploadErrors.length, 'upload')} failed
        </Badge>
      ) : null}
    </>
  )
}

function ChecksBadge({ offenses, onClick }: { offenses: Offense[]; onClick: () => void }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  return (
    <Button size="sm" variant={errors > 0 ? 'destructive' : 'ghost'} onClick={onClick}>
      <CircleCheckIcon data-icon="inline-start" />
      {errors > 0 ? plural(errors, 'error') : 'Theme Check passes'}
    </Button>
  )
}

function PreviewWaiting({ preview }: { preview: PreviewState | null }) {
  return (
    <div className="flex max-w-md items-center text-center">
      {preview && preview.status !== 'running' ? (
        <p className={preview.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{preview.message}</p>
      ) : (
        <p className="text-muted-foreground">Starting the preview…</p>
      )}
    </div>
  )
}

/**
 * The Theme's page as Shopify renders it, through the Studio's proxy. A script the proxy adds reports the
 * section the Creator clicks, and outlines the selected one.
 */
function PreviewFrame({
  src,
  device,
  selectedId,
  onSelect,
}: {
  src: string
  device: Device
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  // Changes on each page load, including theme dev's reloads after a Theme change.
  const [loads, setLoads] = useState(0)
  const onMessage = useEffectEvent((event: MessageEvent) => {
    if (event.source !== frame.current?.contentWindow) return
    if (event.data?.type === 'studio:select' && typeof event.data.id === 'string') onSelect(event.data.id)
    if (event.data?.type === 'studio:loaded') setLoads((n) => n + 1)
  })

  useEffect(() => {
    const listener = (event: MessageEvent) => onMessage(event)
    addEventListener('message', listener)
    return () => removeEventListener('message', listener)
  }, [])

  // Scrolls to the selected section when it changes; after a reload it only outlines it again.
  const scrolledTo = useRef<string | null>(null)
  useEffect(() => {
    const scroll = selectedId !== scrolledTo.current
    scrolledTo.current = selectedId
    frame.current?.contentWindow?.postMessage({ type: 'studio:selected', id: selectedId, scroll }, new URL(src).origin)
  }, [selectedId, loads, src])

  return (
    <iframe
      ref={frame}
      src={src}
      title="Theme preview"
      className="h-full max-w-full rounded-md border bg-white shadow-sm transition-[width]"
      style={{ width: device === 'mobile' ? 390 : '100%' }}
    />
  )
}

const sectionLabel = (state: ThemeState, type: string) => state.sectionInfo[type]?.name || type

/** Where a section is: the page's template, else the header or footer group every page shares; null when none has it. */
function scopeOf(state: ThemeState, page: Page, id: string): Page | Group | null {
  return ([page, 'header', 'footer'] as const).find((scope) => state[scope].some((section) => section.id === id)) ?? null
}

/** The header's, the page's and the footer's sections in order, and the sections the page can add. */
function SectionsPanel({
  state,
  page,
  selectedId,
  onSelect,
  onSaved,
}: {
  state: ThemeState
  page: Page
  selectedId: string | null
  onSelect: (id: string) => void
  onSaved: (state: ThemeState) => void
}) {
  const item = (scope: Page | Group, section: TemplateSection) => (
    <li key={`${scope}/${section.id}`}>
      <button
        type="button"
        onClick={() => onSelect(section.id)}
        aria-current={selectedId === section.id ? 'true' : undefined}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted ${
          selectedId === section.id ? 'bg-muted font-medium' : ''
        }`}
      >
        <LayoutListIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{sectionLabel(state, section.type)}</span>
      </button>
    </li>
  )

  return (
    <div className="flex flex-col gap-3 p-2">
      <ol className="flex flex-col gap-0.5" aria-label={`${pageNames[page]} page sections`}>
        <li className="px-2 py-1 text-xs text-muted-foreground">Header</li>
        {state.header.map((section) => item('header', section))}
        <li className="px-2 py-1 text-xs text-muted-foreground">{pageNames[page]} page</li>
        {state[page].map((section) => item(page, section))}
        <li className="px-2 py-1 text-xs text-muted-foreground">Footer</li>
        {state.footer.map((section) => item('footer', section))}
      </ol>
      <Separator />
      {state.catalog[page].length + state.custom[page].length > 0 ? (
        <SectionPicker state={state} page={page} onAdded={onSelect} onSaved={onSaved} />
      ) : (
        <p className="px-2 text-muted-foreground">The Section Catalog has no sections for this page.</p>
      )}
    </div>
  )
}

// A section without a wireframe, like a Custom Section, shows a plain heading and text.
const plainWireframe: PresetWireframe = { wireframe: 'center heading text' }
const toneClasses: Record<Tone, string> = {
  image: 'fill-current opacity-15',
  strong: 'fill-current opacity-50',
  text: 'fill-current opacity-25',
  outline: 'fill-none stroke-current opacity-40',
  panel: 'fill-background',
}

/** A preset's layout drawn in greys, from its wireframe. */
function Wireframe({ wireframe, className }: { wireframe: string; className?: string }) {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" className={`rounded-md bg-muted text-muted-foreground ${className ?? ''}`}>
      {layoutWireframe(wireframe).map((shape, index) => (
        <rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={1} className={toneClasses[shape.tone]} />
      ))}
    </svg>
  )
}

/**
 * The page's catalog sections, each with its presets as wireframe thumbnails (a list on narrow screens), and its
 * Custom Sections. Picking one adds it at the end of the page.
 */
function SectionPicker({
  state,
  page,
  onAdded,
  onSaved,
}: {
  state: ThemeState
  page: Page
  onAdded: (id: string) => void
  onSaved: (state: ThemeState) => void
}) {
  const { saving, error, write } = useWrite(onSaved)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = query.trim().toLowerCase()
  const sections = [
    ...state.catalog[page],
    // A Custom Section is added with its first preset, drawn plain.
    ...state.custom[page].map((type) => ({ type, presets: [] })),
  ].filter(
    ({ type, presets }) =>
      !search || [type, sectionLabel(state, type), ...presets.map((preset) => preset.name)].some((text) => text.toLowerCase().includes(search)),
  )

  async function add(type: string, preset?: string) {
    const saved = await write(`/api/${page}/sections`, jsonRequest('POST', { type, preset }))
    const added = saved?.[page].at(-1)
    if (!added) return
    setOpen(false)
    onAdded(added.id)
  }

  // A preset's line under its name tells it from its section's other presets.
  const choice = (key: string, label: string, { wireframe, description }: PresetWireframe, onPick: () => void) => (
    <li key={key} className="sm:w-40">
      <button
        type="button"
        disabled={saving}
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-lg border p-2 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 sm:flex-col sm:items-stretch"
      >
        <Wireframe wireframe={wireframe} className="w-20 shrink-0 sm:w-full" />
        <span className="flex flex-col text-sm">
          {label}
          {description ? <span className="text-xs text-muted-foreground">{description}</span> : null}
        </span>
      </button>
    </li>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Add a section
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Add a section to the {pageNames[page].toLowerCase()} page</DialogTitle>
          <DialogDescription>Pick a layout. It starts with its settings and blocks, which you then change in the inspector.</DialogDescription>
        </DialogHeader>
        <Input type="search" aria-label="Filter sections" placeholder="Filter sections" value={query} onChange={(event) => setQuery(event.target.value)} />
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>The section was not added</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {/* On a wide screen the sections flow side by side, each as wide as its row of thumbnails. */}
        <div className="-mx-4 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-1 sm:flex-row sm:flex-wrap sm:content-start sm:gap-x-8">
          {sections.map(({ type, presets }) => (
            <section key={type} aria-labelledby={`picker-${type}`} className="flex max-w-full flex-col gap-2">
              <div>
                <h3 id={`picker-${type}`} className="font-medium">
                  {sectionLabel(state, type)}
                </h3>
                {state.sectionInfo[type]?.description ? <p className="text-xs text-muted-foreground sm:w-0 sm:min-w-full">{state.sectionInfo[type].description}</p> : null}
              </div>
              <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {presets.length > 0
                  ? presets.map((preset) =>
                      choice(preset.key, preset.name, wireframes[type]?.[preset.key] ?? plainWireframe, () => add(type, preset.name)),
                    )
                  : choice(type, sectionLabel(state, type), plainWireframe, () => add(type))}
              </ul>
            </section>
          ))}
          {sections.length === 0 ? <p className="text-muted-foreground">No section matches “{query}”.</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// richtext settings hold HTML paragraphs; the inspector edits them as plain paragraphs split by blank lines.
const paragraphsOnly = /^\s*(<p>[\s\S]*?<\/p>\s*)*$/
const toParagraphs = (html: string) =>
  html
    .trim()
    .replace(/^<p>|<\/p>$/g, '')
    .split(/<\/p>\s*<p>/)
    .map((paragraph) => paragraph.replaceAll('<br>', '\n'))
    .join('\n\n')
const fromParagraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replaceAll('\n', '<br>')}</p>`)
    .join('')

type Value = Setting['value']
const isParagraphs = (setting: Setting) => setting.type === 'richtext' && typeof setting.value === 'string' && paragraphsOnly.test(setting.value)

/** A setting's value as the inspector edits it, and back. */
function editable(setting: Setting) {
  return isParagraphs(setting) ? toParagraphs(setting.value as string) : setting.value
}
function stored(setting: Setting, value: Value) {
  // A list typed by hand is its handles separated by commas.
  if (Array.isArray(setting.value) && typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean)
  return isParagraphs(setting) ? fromParagraphs(value as string) : value
}

// The settings that pick from the store, and what they pick.
const storeKinds: Record<string, keyof StoreResources> = {
  collection: 'collections',
  collection_list: 'collections',
  product: 'products',
  product_list: 'products',
  link_list: 'menus',
}

/** The store's collections, products and menus, fetched once `needed`, or why they can't be listed. */
function useStore(needed: boolean) {
  const [store, setStore] = useState<StoreResources | { error: string } | null>(null)
  useEffect(() => {
    if (!needed) return
    const controller = new AbortController()
    fetch('/api/store', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        setStore(response.ok ? body : { error: body.error })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setStore({ error: error.message })
      })
    return () => controller.abort()
  }, [needed])
  return store
}

/** The selected section: color scheme, settings (its own and its blocks'), its blocks, order and removal. */
function Inspector({
  state,
  page,
  sectionId,
  editor,
  onClose,
  onSaved,
}: {
  state: ThemeState
  page: Page
  sectionId: string
  /** The Theme Editor on this page's template, once the preview runs. */
  editor: string | null
  onClose: () => void
  onSaved: (state: ThemeState) => void
}) {
  const [details, setDetails] = useState<SectionDetails | { error: string } | null>(null)
  const [addingBlock, setAddingBlock] = useState<string | null>(null)
  const { saving, error, write } = useWrite(onSaved)
  // Its edits show until the section is read again after their write.
  const live = useLiveEdits(onSaved, false)
  const { settle } = live
  const scope = scopeOf(state, page, sectionId)
  // The header and footer groups' sections are edited here, but not moved or removed.
  const inGroup = scope === 'header' || scope === 'footer'
  const sections = scope ? state[scope] : []
  const index = sections.findIndex((section) => section.id === sectionId)
  const url = `/api/${scope ?? page}/sections/${encodeURIComponent(sectionId)}`

  // Read again after every change to the Theme, so the inspector shows what the files hold.
  useEffect(() => {
    if (index === -1) return
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        setDetails(response.ok ? body : { error: body.error })
        settle()
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setDetails({ error: error.message })
      })
    return () => controller.abort()
  }, [url, index, state])

  const ready = details !== null && !('error' in details)
  const store = useStore(
    ready && [details.settings, ...details.blocks.map((block) => block.settings)].some((settings) => settings.some((setting) => setting.type in storeKinds)),
  )

  if (index === -1) {
    return (
      <InspectorFrame title={sectionLabel(state, sectionId)} onClose={onClose}>
        <p className="text-muted-foreground">
          This section is not in the page's template nor in the header or footer group. Edit it in Shopify's Theme Editor.
        </p>
      </InspectorFrame>
    )
  }
  if (details === null) return <Skeleton className="m-4 h-48" />
  if ('error' in details) {
    return (
      <InspectorFrame title={sectionLabel(state, sectionId)} onClose={onClose}>
        <p className="text-destructive">{details.error}</p>
      </InspectorFrame>
    )
  }

  const schemes = Object.keys(state.brand.colorSchemes).map((scheme) => ({ value: scheme, label: scheme }))

  function move(offset: number) {
    const order = sections.map((section) => section.id)
    ;[order[index], order[index + offset]] = [order[index + offset], order[index]]
    write(`/api/${page}/order`, jsonRequest('PUT', { order }))
  }

  async function remove() {
    if (!confirm(`Remove ${sectionLabel(state, sections[index].type)} from the ${pageNames[page].toLowerCase()} page? Its settings and blocks are deleted too.`)) return
    if (await write(url, { method: 'DELETE' })) onClose()
  }

  function moveBlock(blockIndex: number, offset: number) {
    if (details === null || 'error' in details) return
    const order = details.blocks.map((block) => block.id)
    ;[order[blockIndex], order[blockIndex + offset]] = [order[blockIndex + offset], order[blockIndex]]
    write(`${url}/order`, jsonRequest('PUT', { order }))
  }

  async function removeBlock(blockId: string, name: string) {
    if (!confirm(`Remove ${name} from this section? Its settings are deleted too.`)) return
    await write(`${url}/blocks/${encodeURIComponent(blockId)}`, { method: 'DELETE' })
  }

  async function addBlock() {
    if (await write(`${url}/blocks`, jsonRequest('POST', { type: addingBlock }))) setAddingBlock(null)
  }

  /** A section's setting, or a block's when blockId is given, written as it changes. */
  function settingField(setting: Setting, blockId?: string) {
    const key = blockId ? `${blockId}/${setting.id}` : setting.id
    const field = `${url}/${key}`
    const patch = (value: Value) => {
      const values = { [setting.id]: stored(setting, value) }
      return jsonRequest('PATCH', blockId ? { blocks: { [blockId]: values } } : { settings: values })
    }
    return (
      <SettingField
        key={key}
        id={`setting-${key}`}
        setting={setting}
        value={live.value(field, editable(setting))}
        store={store}
        error={live.error(field)}
        onChange={(next, delay) => live.change(field, next, (value) => [url, patch(value)], delay)}
        onFlush={() => live.flush(field)}
      />
    )
  }

  return (
    <InspectorFrame title={details.name} onClose={onClose}>
      <FieldGroup className="gap-4">
        {details.colorScheme !== undefined ? (
          <Field>
            <FieldLabel htmlFor="section-color-scheme">Color scheme</FieldLabel>
            <Select
              items={schemes}
              value={details.colorScheme}
              disabled={saving}
              onValueChange={(colorScheme) => colorScheme && write(url, jsonRequest('PATCH', { colorScheme }))}
            >
              <SelectTrigger id="section-color-scheme" className="w-full">
                <SchemeSwatch brand={state.brand} scheme={details.colorScheme ?? ''} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {schemes.map((scheme) => (
                    <SelectItem key={scheme.value} value={scheme.value}>
                      <SchemeSwatch brand={state.brand} scheme={scheme.value} />
                      {scheme.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <MediaSettings media={details.media} editor={editor} />
      </FieldGroup>
      {details.settings.length > 0 || details.blocks.length > 0 ? (
        <div className="flex flex-col gap-4">
          <Separator />
          {store && 'error' in store ? (
            <Alert>
              <AlertTitle>The store's collections, products and menus are not listed</AlertTitle>
              <AlertDescription>{store.error} Until then, type their handles.</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="gap-4">
            {details.settings.map((setting) => settingField(setting))}
            {details.blocks.map((block, blockIndex) => {
              const name = `${block.name} ${blockIndex + 1}`
              return (
                <FieldSet key={block.id} className="gap-3 rounded-md border p-3">
                  <FieldLegend variant="label" className="flex w-full items-center gap-1">
                    <span className="mr-auto">{name}</span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Move ${name} up`}
                      disabled={saving || blockIndex === 0}
                      onClick={() => moveBlock(blockIndex, -1)}
                    >
                      <ArrowUpIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Move ${name} down`}
                      disabled={saving || blockIndex === details.blocks.length - 1}
                      onClick={() => moveBlock(blockIndex, 1)}
                    >
                      <ArrowDownIcon />
                    </Button>
                    <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${name}`} disabled={saving} onClick={() => removeBlock(block.id, name)}>
                      <Trash2Icon />
                    </Button>
                  </FieldLegend>
                  {block.settings.map((setting) => settingField(setting, block.id))}
                  <MediaSettings media={block.media} editor={editor} />
                </FieldSet>
              )
            })}
          </FieldGroup>
        </div>
      ) : null}
      {details.blockTypes.length > 0 ? (
        <Field>
          <FieldLabel htmlFor="add-block">Add a block</FieldLabel>
          <div className="flex gap-2">
            <Select
              items={details.blockTypes.map((type) => ({ value: type.type, label: type.name }))}
              value={addingBlock}
              disabled={saving || details.blocks.length >= details.maxBlocks}
              onValueChange={setAddingBlock}
            >
              <SelectTrigger id="add-block" className="min-w-0 flex-1">
                <SelectValue placeholder="Pick a block" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {details.blockTypes.map((type) => (
                    <SelectItem key={type.type} value={type.type}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={saving || !addingBlock || details.blocks.length >= details.maxBlocks} onClick={addBlock}>
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
          </div>
          {details.blocks.length >= details.maxBlocks ? (
            <FieldDescription>This section holds at most {plural(details.maxBlocks, 'block')}.</FieldDescription>
          ) : null}
        </Field>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The section was not saved</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Separator />
      {inGroup ? (
        <p className="text-muted-foreground">Every page shares the {scope}, so a change here shows on all of them.</p>
      ) : (
        <div className="flex gap-1">
          <Button size="sm" variant="outline" disabled={saving || index === 0} onClick={() => move(-1)}>
            <ArrowUpIcon data-icon="inline-start" />
            Up
          </Button>
          <Button size="sm" variant="outline" disabled={saving || index === sections.length - 1} onClick={() => move(1)}>
            <ArrowDownIcon data-icon="inline-start" />
            Down
          </Button>
          <Button
            size="sm"
            variant="destructive"
            className="ml-auto"
            // Shopify needs at least one section in a JSON template.
            disabled={saving || sections.length === 1}
            onClick={remove}
          >
            <Trash2Icon data-icon="inline-start" />
            Remove
          </Button>
        </div>
      )}
    </InspectorFrame>
  )
}

/**
 * The control for one setting: a switch, slider, select, color, store picker or text field. A typed value, a dragged
 * slider or color changes with a delay, the others at once; onFlush (on blur, or releasing the slider) ends the delay.
 */
function SettingField({
  id,
  setting,
  value,
  store,
  error,
  onChange,
  onFlush,
}: {
  id: string
  setting: Setting
  value: Value
  /** The store's resources, for a setting that picks one. */
  store?: StoreResources | { error: string } | null
  /** Why the Studio refused the latest edit. */
  error?: string
  onChange: (value: Value, delay?: number) => void
  onFlush: () => void
}) {
  const kind = storeKinds[setting.type]
  const change = (next: Value) => onChange(next)
  const type = (next: Value) => onChange(next, typing)
  const refused = error ? <FieldError>{error}</FieldError> : null
  let control: React.ReactNode
  if (kind && store && !('error' in store)) {
    control = <StorePicker id={id} value={value as string | string[]} options={store[kind]} onChange={change} />
  } else if (setting.type === 'checkbox') {
    return (
      <Field orientation="horizontal" data-invalid={error ? true : undefined}>
        <Switch id={id} checked={value === true} onCheckedChange={change} />
        <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
        {refused}
      </Field>
    )
  } else if (setting.type === 'range') {
    control = (
      <div className="flex items-center gap-3">
        <Slider
          aria-labelledby={`${id}-label`}
          value={Number(value)}
          min={setting.min}
          max={setting.max}
          step={setting.step}
          onValueChange={(next) => type(next as number)}
          onValueCommitted={onFlush}
        />
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {String(value)}
          {setting.unit}
        </span>
      </div>
    )
  } else if (setting.options) {
    control = (
      <Select items={setting.options} value={value as string} onValueChange={(next) => next !== null && change(next)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {setting.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    )
  } else if (setting.type === 'color') {
    // An empty color is none.
    control = (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          type="color"
          className="h-7 w-9 shrink-0 p-0.5"
          value={(value as string) || '#ffffff'}
          onChange={(event) => type(event.target.value)}
          onBlur={onFlush}
        />
        <span className="text-muted-foreground">{(value as string) || 'None'}</span>
        {value ? (
          <Button type="button" size="xs" variant="ghost" className="ml-auto" onClick={() => change('')}>
            Clear
          </Button>
        ) : null}
      </div>
    )
  } else if (setting.type === 'number') {
    const number = value === null ? '' : String(value)
    control = (
      <Input
        id={id}
        type="number"
        value={number}
        onChange={(event) => type(event.target.value === '' ? null : event.target.valueAsNumber)}
        onBlur={onFlush}
      />
    )
  } else if (Array.isArray(setting.value)) {
    // Without the store's list, handles are typed, separated by commas.
    const text = Array.isArray(value) ? value.join(', ') : (value as string)
    control = <Input id={id} value={text} placeholder="handle-one, handle-two" onChange={(event) => type(event.target.value)} onBlur={onFlush} />
  } else if (setting.type === 'richtext') {
    control = <Textarea id={id} value={value as string} rows={3} onChange={(event) => type(event.target.value)} onBlur={onFlush} />
  } else {
    const placeholder = setting.type === 'url' ? '/collections/all or https://…' : kind ? 'handle' : undefined
    control = <Input id={id} value={value as string} placeholder={placeholder} onChange={(event) => type(event.target.value)} onBlur={onFlush} />
  }
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {setting.label}
      </FieldLabel>
      {control}
      {refused}
    </Field>
  )
}

/** Picks one of the store's collections, products or menus by handle, or several for a list setting. */
function StorePicker({
  id,
  value,
  options,
  onChange,
}: {
  id: string
  value: string | string[]
  options: { handle: string; title: string }[]
  onChange: (value: string | string[]) => void
}) {
  const anchor = useComboboxAnchor()
  const titles = new Map(options.map((option) => [option.handle, option.title]))
  const label = (handle: string) => titles.get(handle) ?? handle
  // A handle the store no longer has stays listed, so it shows and can be removed.
  const handles = [...new Set([...options.map((option) => option.handle), ...(Array.isArray(value) ? value : value ? [value] : [])])]
  const content = (
    <ComboboxContent anchor={Array.isArray(value) ? anchor : undefined}>
      <ComboboxEmpty>Nothing found.</ComboboxEmpty>
      <ComboboxList>
        {(handle: string) => (
          <ComboboxItem key={handle} value={handle}>
            {label(handle)}
          </ComboboxItem>
        )}
      </ComboboxList>
    </ComboboxContent>
  )
  if (Array.isArray(value)) {
    return (
      <Combobox multiple items={handles} value={value} onValueChange={onChange} itemToStringLabel={label}>
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(picked: string[]) => (
              <>
                {picked.map((handle) => (
                  <ComboboxChip key={handle}>{label(handle)}</ComboboxChip>
                ))}
                <ComboboxChipsInput id={id} placeholder={picked.length ? '' : 'Search'} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        {content}
      </Combobox>
    )
  }
  return (
    <Combobox items={handles} value={value || null} onValueChange={(handle) => onChange(handle ?? '')} itemToStringLabel={label}>
      <ComboboxInput id={id} placeholder="Search" showClear={value !== ''} />
      {content}
    </Combobox>
  )
}

/** Image and video settings, picked in the Theme Editor: it shows whether each is set, an image's file name, and links to the Theme Editor. */
function MediaSettings({ media, editor }: { media: MediaSetting[]; editor: string | null }) {
  return media.map((setting) => (
    <div key={setting.id} className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{setting.label}</span>
        <Badge variant={setting.set ? 'secondary' : 'outline'}>{setting.set ? 'Set' : 'Empty'}</Badge>
      </div>
      {setting.type === 'image_picker' && setting.value ? (
        <p className="max-w-full truncate text-muted-foreground">{setting.value.replace('shopify://shop_images/', '')}</p>
      ) : null}
      {editor ? (
        <a
          href={editor}
          target="_blank"
          rel="noreferrer"
          aria-label={`Choose ${setting.label} in the Theme Editor`}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          <ExternalLinkIcon data-icon="inline-start" />
          Choose in the Theme Editor
        </a>
      ) : (
        <p className="text-muted-foreground">Chosen in Shopify's Theme Editor, linked here once the preview runs.</p>
      )}
    </div>
  ))
}

function InspectorFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <section aria-label={`${title} settings`} className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium">{title}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      {children}
    </section>
  )
}

function SchemeSwatch({ brand, scheme }: { brand: Brand; scheme: string }) {
  const colors = brand.colorSchemes[scheme]
  return (
    <span
      aria-hidden
      className="flex size-4 shrink-0 items-center justify-center rounded-sm border text-[9px] font-semibold"
      style={{ backgroundColor: colors?.background, backgroundImage: colors?.background_gradient, color: colors?.text }}
    >
      A
    </span>
  )
}

// The pairs a scheme keeps readable (WCAG AA): text at 4.5:1, input borders at 3:1.
const contrastPairs = [
  ['text', 'background', 4.5],
  ['button_label', 'button', 4.5],
  ['accent', 'background', 4.5],
  ['border', 'background', 3],
] as const

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrastRatio(a: string, b: string) {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

function ContrastWarning({ colors }: { colors: Record<string, string> }) {
  const failing = contrastPairs.flatMap(([color, on, minimum]) => {
    if (!colors[color] || !colors[on]) return []
    const ratio = contrastRatio(colors[color], colors[on])
    // Rounded down, so a failing ratio never shows as the minimum.
    return ratio < minimum ? [`${color.replaceAll('_', ' ')} on ${on} is ${Math.floor(ratio * 10) / 10}:1, needs ${minimum}:1`] : []
  })
  return failing.length > 0 ? <FieldDescription className="text-destructive">Low contrast: {failing.join('; ')}.</FieldDescription> : null
}

/** The Brand: color schemes, fonts and logo, each written as it changes. */
function BrandPanel({ brand, onSaved }: { brand: Brand; onSaved: (state: ThemeState) => void }) {
  // Changes on every logo upload, so the logo reloads even when the file name stays the same.
  const [logoVersion, setLogoVersion] = useState(Date.now)
  const { saving, error, write } = useWrite(onSaved)
  const live = useLiveEdits(onSaved)
  const fields = [...brand.colorFields, ...brand.gradientFields]
  // The schemes as edited; a gradient the Theme lacks reads as empty.
  const colorSchemes = Object.fromEntries(
    Object.entries(brand.colorSchemes).map(([scheme, colors]) => [
      scheme,
      Object.fromEntries(fields.map((field) => [field, live.value(`brand/${scheme}/${field}`, colors[field] ?? '')])),
    ]),
  )

  // Only the value changed is sent, so values set elsewhere (the Theme Editor, the agent) stay as they are.
  function setColor(scheme: string, field: string, value: string) {
    live.change(`brand/${scheme}/${field}`, value, (color) => ['/api/brand', jsonRequest('PUT', { colorSchemes: { [scheme]: { [field]: color } } })], typing)
  }

  function fontPicker(id: string, label: string, font: 'headingFont' | 'bodyFont' | 'accentFont') {
    const field = `brand/${font}`
    return (
      <FontPicker
        id={id}
        label={label}
        value={live.value(field, brand[font])}
        error={live.error(field)}
        onChange={(handle) => live.change(field, handle, (value) => ['/api/brand', jsonRequest('PUT', { [font]: value })])}
      />
    )
  }

  function addScheme() {
    const schemes = brand.colorSchemes
    let n = Object.keys(schemes).length + 1
    while (`scheme-${n}` in schemes) n++
    // A new scheme starts as a copy of the first one.
    write('/api/brand', jsonRequest('PUT', { colorSchemes: { [`scheme-${n}`]: { ...Object.values(schemes)[0] } } }))
  }

  async function writeLogo(init: RequestInit) {
    if (await write('/api/brand/logo', init)) setLogoVersion(Date.now())
  }

  function uploadLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) writeLogo({ method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <FieldGroup className="gap-5">
        <FieldSet>
          <FieldLegend>Color schemes</FieldLegend>
          <FieldDescription>
            Each section picks one of these schemes for its colors. The accent colors links, sale prices and badges; the border,
            inputs and dividers.
          </FieldDescription>
          <FieldGroup className="gap-3">
            {Object.entries(colorSchemes).map(([scheme, colors]) => (
              <FieldSet key={scheme} className="gap-2 rounded-md border p-3">
                <FieldLegend variant="label" className="flex items-center gap-2">
                  <SchemeSwatch brand={{ ...brand, colorSchemes }} scheme={scheme} />
                  {scheme}
                </FieldLegend>
                <div className="grid grid-cols-2 gap-2">
                  {brand.colorFields.map((field) => (
                    <Field key={field} orientation="horizontal" className="items-center gap-2">
                      <Input
                        id={`${scheme}-${field}`}
                        type="color"
                        className="h-7 w-9 shrink-0 p-0.5"
                        value={colors[field] || '#000000'}
                        onChange={(event) => setColor(scheme, field, event.target.value)}
                        onBlur={() => live.flush(`brand/${scheme}/${field}`)}
                      />
                      <FieldLabel htmlFor={`${scheme}-${field}`} className="text-xs font-normal">
                        {field.replaceAll('_', ' ')}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
                {brand.colorFields.map((field) =>
                  live.error(`brand/${scheme}/${field}`) ? <FieldError key={field}>{live.error(`brand/${scheme}/${field}`)}</FieldError> : null,
                )}
                {brand.gradientFields.map((field) => (
                  <Field key={field} className="gap-1" data-invalid={live.error(`brand/${scheme}/${field}`) ? true : undefined}>
                    <FieldLabel htmlFor={`${scheme}-${field}`} className="text-xs font-normal">
                      {field.replaceAll('_', ' ')}
                    </FieldLabel>
                    <Input
                      id={`${scheme}-${field}`}
                      className="h-7 text-xs"
                      placeholder="linear-gradient(180deg, #FFFFFF, #EEEEEE)"
                      value={colors[field]}
                      onChange={(event) => setColor(scheme, field, event.target.value)}
                      onBlur={() => live.flush(`brand/${scheme}/${field}`)}
                    />
                    <FieldError>{live.error(`brand/${scheme}/${field}`)}</FieldError>
                  </Field>
                ))}
                <ContrastWarning colors={colors} />
              </FieldSet>
            ))}
          </FieldGroup>
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={saving} onClick={addScheme}>
            <PlusIcon data-icon="inline-start" />
            Add color scheme
          </Button>
        </FieldSet>
        {fontPicker('heading-font', 'Heading font', 'headingFont')}
        {fontPicker('body-font', 'Body font', 'bodyFont')}
        {fontPicker('accent-font', 'Accent font (labels, prices)', 'accentFont')}
        <Field>
          <FieldLabel htmlFor="logo">Logo</FieldLabel>
          {brand.logoAsset ? (
            <div className="flex items-center gap-3">
              <img src={`/api/brand/logo?v=${logoVersion}`} alt="Current logo" className="h-10 w-auto" />
              <Button type="button" size="sm" variant="outline" disabled={saving} onClick={() => writeLogo({ method: 'DELETE' })}>
                Remove logo
              </Button>
            </div>
          ) : null}
          <Input id="logo" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={saving} onChange={uploadLogo} />
          <FieldDescription>
            PNG, JPEG, WebP or SVG up to 2 MB, saved in the Theme's assets.
            {brand.logo ? ' The header shows the logo picked in the Theme Editor instead.' : null}
          </FieldDescription>
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>The Brand was not changed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
    </div>
  )
}

/** The global style settings: type, shape, buttons, spacing, cards, media and motion, each written as it changes. */
function StylePanel({ style, onSaved }: { style: StyleGroup[]; onSaved: (state: ThemeState) => void }) {
  const live = useLiveEdits(onSaved)
  return (
    <FieldGroup className="gap-5 p-3">
      {style.map((group) => (
        <FieldSet key={group.name}>
          <FieldLegend>{group.name}</FieldLegend>
          <FieldGroup className="gap-3">
            {group.settings.map((setting) => {
              const field = `style/${setting.id}`
              return (
                <SettingField
                  key={setting.id}
                  id={`style-${setting.id}`}
                  setting={setting}
                  value={live.value(field, setting.value)}
                  error={live.error(field)}
                  // Only the setting changed is sent, so values set elsewhere (the Theme Editor, the agent) stay as they are.
                  onChange={(next, delay) => live.change(field, next, (value) => ['/api/style', jsonRequest('PUT', { [setting.id]: value })], delay)}
                  onFlush={() => live.flush(field)}
                />
              )
            })}
          </FieldGroup>
        </FieldSet>
      ))}
    </FieldGroup>
  )
}

/** The Theme's Directions: switch the preview between them, and choose one to tune in the Style tab. */
function DirectionsPanel({
  directions,
  onSaved,
  onChosen,
}: {
  directions: Direction[]
  onSaved: (state: ThemeState) => void
  onChosen: () => void
}) {
  const { saving, error, write } = useWrite(onSaved)

  async function choose(name: string) {
    if (await write('/api/directions/chosen', jsonRequest('PUT', { name }))) onChosen()
  }

  if (directions.length === 0) {
    return <EmptyState title="No Directions yet" description="The agent writes up to three Directions for the Theme; compare them and choose one here." />
  }
  return (
    <div className="flex flex-col gap-3 p-3">
      {directions.map((direction) => (
        <Card key={direction.name} size="sm" className={direction.showing ? 'ring-2 ring-primary' : undefined}>
          <CardHeader>
            <CardTitle>{direction.name}</CardTitle>
            {direction.thesis ? <CardDescription>{direction.thesis}</CardDescription> : null}
            {direction.chosen ? (
              <CardAction>
                <Badge>Chosen</Badge>
              </CardAction>
            ) : null}
          </CardHeader>
          {direction.choices.length > 0 ? (
            <CardContent>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                {direction.choices.map((choice, index) => (
                  <li key={index}>{choice}</li>
                ))}
              </ul>
            </CardContent>
          ) : null}
          <CardFooter className="gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={saving || direction.showing}
              onClick={() => write('/api/directions/current', jsonRequest('PUT', { name: direction.name }))}
            >
              {direction.showing ? 'In preview' : 'Preview'}
            </Button>
            {direction.chosen ? null : (
              <Button size="sm" disabled={saving} onClick={() => choose(direction.name)}>
                Choose
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The Direction was not changed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

const fontFamilies = fontLibrary.families
const familyByHandle = new Map(fontFamilies.flatMap((family) => family.handles.map((handle) => [handle, family])))
const familyByName = new Map(fontFamilies.map((family) => [family.family, family]))
// n (normal), i (italic) or o (oblique), then the weight in hundreds.
const variantSuffix = /_([nio])([1-9])$/
const familyNames = fontFamilies.map((family) => family.family)
const weightNames: Record<string, string> = {
  '1': 'Thin',
  '2': 'Extra light',
  '3': 'Light',
  '4': 'Regular',
  '5': 'Medium',
  '6': 'Semibold',
  '7': 'Bold',
  '8': 'Extra bold',
  '9': 'Black',
}

/** "Bold 700 italic" for bodoni_moda_i7. System fonts like mono have a single, unnamed variant. */
function variantName(handle: string) {
  const match = handle.match(variantSuffix)
  if (!match) return 'Regular'
  const [, style, weight] = match
  return `${weightNames[weight]} ${weight}00${style === 'i' ? ' italic' : style === 'o' ? ' oblique' : ''}`
}

/** Picks a font from Shopify's font library: the family, then its weight and style. */
function FontPicker({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string
  label: string
  value: string
  /** Why the Studio refused the latest pick. */
  error?: string
  onChange: (handle: string) => void
}) {
  const family = familyByHandle.get(value)
  const variants = (family?.handles ?? []).map((handle) => ({ value: handle, label: variantName(handle) }))

  function pickFamily(name: string | null) {
    const next = name ? familyByName.get(name) : undefined
    if (!next) return
    // Keep the weight and style when the new family has them, else fall back to regular.
    const suffix = value.match(variantSuffix)?.[0]
    onChange(
      next.handles.find((handle) => suffix && handle.endsWith(suffix)) ??
        next.handles.find((handle) => handle.endsWith('_n4')) ??
        next.handles[0],
    )
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">{label}</FieldLegend>
      <FieldGroup className="gap-2">
        <Field>
          <FieldLabel htmlFor={id} className="sr-only">
            {label} family
          </FieldLabel>
          <Combobox items={familyNames} value={family?.family ?? null} onValueChange={pickFamily}>
            <ComboboxInput id={id} placeholder="Search fonts" />
            <ComboboxContent>
              <ComboboxEmpty>No font found.</ComboboxEmpty>
              <ComboboxList>
                {(name: string) => (
                  <ComboboxItem key={name} value={name}>
                    {name}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-variant`} className="sr-only">
            {label} weight and style
          </FieldLabel>
          <Select items={variants} value={value} onValueChange={(handle) => handle && onChange(handle)}>
            <SelectTrigger id={`${id}-variant`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {variants.map((variant) => (
                  <SelectItem key={variant.value} value={variant.value}>
                    {variant.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </FieldGroup>
      {family ? null : <FieldDescription>{value} is not in Shopify's current font library (it may be deprecated); pick a font.</FieldDescription>}
      <FieldError>{error}</FieldError>
    </FieldSet>
  )
}

function ThemeCheck({ offenses }: { offenses: Offense[] }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  const warnings = offenses.length - errors
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex gap-2">
        <Badge variant={errors > 0 ? 'destructive' : 'secondary'}>{plural(errors, 'error')}</Badge>
        <Badge variant="secondary">{plural(warnings, 'warning')}</Badge>
      </div>
      {offenses.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {offenses.map((offense, index) => (
            <li key={index} className="flex flex-col gap-1 border-b pb-3 last:border-0">
              <div className="flex items-center gap-2">
                <Badge variant={offense.severity === 'error' ? 'destructive' : 'secondary'}>{offense.severity}</Badge>
                <code className="truncate text-xs">
                  {offense.file}:{offense.line}
                </code>
              </div>
              <p>{offense.message}</p>
              <span className="text-xs text-muted-foreground">{offense.check}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No problems" description="Theme Check found no errors or warnings." />
      )}
    </div>
  )
}

function plural(n: number, noun: string) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
