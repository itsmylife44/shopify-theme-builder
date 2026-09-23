import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  LayoutListIcon,
  MonitorIcon,
  PaletteIcon,
  PlusIcon,
  Redo2Icon,
  SmartphoneIcon,
  Trash2Icon,
  Undo2Icon,
  XIcon,
} from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import fontLibrary from '../server/shopify-fonts.json'
import type { PreviewState } from '../server/preview.mjs'
import type { Brand, Group, MediaSetting, Offense, Page, SectionDetails, Setting, StoreResources, TemplateSection, ThemeState } from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; state: ThemeState }
type Frame = { url: string; paths: Record<Page, string>; editor: Record<Page, string> | null }
type Tab = 'sections' | 'brand' | 'checks'
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
            <TabButton tab="checks" current={tab} onSelect={setTab} icon={<CircleCheckIcon />} label="Checks" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === 'sections' ? (
              <SectionsPanel state={state} page={page} selectedId={selectedId} onSelect={select} onSaved={showState} />
            ) : tab === 'brand' ? (
              // Keyed by the saved Brand, so the form restarts from what was written.
              <BrandPanel key={JSON.stringify(state.brand)} brand={state.brand} onSaved={showState} />
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
    <Button role="tab" aria-selected={tab === current} size="sm" variant={tab === current ? 'secondary' : 'ghost'} onClick={() => onSelect(tab)}>
      {icon}
      {label}
    </Button>
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

/** Sends writes to the Studio API and hands the Theme state each returns to onSaved. */
function useWrite(onSaved: (state: ThemeState) => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Resolves to the Theme state the write returned, or null when it failed; a failure shows in error. */
  async function write(url: string, init: RequestInit): Promise<ThemeState | null> {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(url, init)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      onSaved(body)
      return body
    } catch (error) {
      setError((error as Error).message)
      return null
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, write }
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
        if (!controller.signal.aborted) setPreview({ status: 'error', message: error.message })
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
  return (
    <Badge variant={status === 'error' ? 'destructive' : status === 'running' ? 'secondary' : 'outline'}>{labels[status]}</Badge>
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
  const { saving, error, write } = useWrite(onSaved)
  const groups = [
    { label: 'Section Catalog', names: state.catalog[page] },
    { label: 'Custom Sections', names: state.custom[page] },
  ].filter((group) => group.names.length > 0)
  const items = groups.flatMap((group) => group.names.map((name) => ({ value: name, label: sectionLabel(state, name) })))
  const [adding, setAdding] = useState<string | null>(null)
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

  async function add() {
    const saved = await write(`/api/${page}/sections`, jsonRequest('POST', { type: adding }))
    const added = saved?.[page].at(-1)
    if (added) onSelect(added.id)
    setAdding(null)
  }

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
      {items.length > 0 ? (
        <FieldGroup className="gap-2">
          <Separator />
          <Field>
            <FieldLabel htmlFor={`add-section-${page}`}>Add a section</FieldLabel>
            <Select items={items} value={adding} disabled={saving} onValueChange={setAdding}>
              <SelectTrigger id={`add-section-${page}`} className="w-full">
                <SelectValue placeholder="Pick a section" />
              </SelectTrigger>
              <SelectContent className="max-w-80">
                {groups.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.names.map((name) => (
                      <SelectItem key={name} value={name} className="items-start">
                        <span className="flex flex-col">
                          <span>{sectionLabel(state, name)}</span>
                          {state.sectionInfo[name]?.description ? (
                            <span className="text-xs whitespace-normal text-muted-foreground">{state.sectionInfo[name].description}</span>
                          ) : null}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            {adding && state.sectionInfo[adding]?.description ? (
              <FieldDescription>{state.sectionInfo[adding].description}</FieldDescription>
            ) : null}
          </Field>
          <Button disabled={saving || !adding} onClick={add}>
            <PlusIcon data-icon="inline-start" />
            Add to the {pageNames[page].toLowerCase()} page
          </Button>
        </FieldGroup>
      ) : (
        <p className="px-2 text-muted-foreground">The Section Catalog has no sections for this page.</p>
      )}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>The section was not added</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
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
  // Edited values, by setting ("heading") or block and setting ("<block id>/quote").
  const [edits, setEdits] = useState<Record<string, Value>>({})
  const [addingBlock, setAddingBlock] = useState<string | null>(null)
  const { saving, error, write } = useWrite(onSaved)
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
  const changed = Object.keys(edits).length > 0

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
    if (!(await write(`${url}/blocks/${encodeURIComponent(blockId)}`, { method: 'DELETE' }))) return
    // Drop the removed block's unsaved edits, keyed "<block id>/<setting id>".
    setEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${blockId}/`))))
  }

  async function addBlock() {
    if (await write(`${url}/blocks`, jsonRequest('POST', { type: addingBlock }))) setAddingBlock(null)
  }

  async function saveSettings(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (details === null || 'error' in details) return
    const settings: Record<string, Value> = {}
    const blocks: Record<string, Record<string, Value>> = {}
    for (const setting of details.settings) {
      if (setting.id in edits) settings[setting.id] = stored(setting, edits[setting.id])
    }
    for (const block of details.blocks) {
      for (const setting of block.settings) {
        const key = `${block.id}/${setting.id}`
        if (key in edits) (blocks[block.id] ??= {})[setting.id] = stored(setting, edits[key])
      }
    }
    if (await write(url, jsonRequest('PATCH', { settings, blocks }))) setEdits({})
  }

  function settingField(setting: Setting, key: string) {
    const value = edits[key] ?? editable(setting)
    const change = (next: Value) => setEdits((current) => ({ ...current, [key]: next }))
    const id = `setting-${key}`
    const kind = storeKinds[setting.type]
    let control: React.ReactNode
    if (kind && store && !('error' in store)) {
      control = <StorePicker id={id} value={value as string | string[]} options={store[kind]} onChange={change} />
    } else if (setting.type === 'checkbox') {
      return (
        <Field key={key} orientation="horizontal">
          <Switch id={id} checked={value === true} onCheckedChange={change} />
          <FieldLabel htmlFor={id}>{setting.label}</FieldLabel>
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
            onValueChange={(next) => change(next as number)}
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
    } else if (setting.type === 'number') {
      const number = value === null ? '' : String(value)
      control = <Input id={id} type="number" value={number} onChange={(event) => change(event.target.value === '' ? null : event.target.valueAsNumber)} />
    } else if (Array.isArray(setting.value)) {
      // Without the store's list, handles are typed, separated by commas.
      const text = Array.isArray(value) ? value.join(', ') : (value as string)
      control = <Input id={id} value={text} placeholder="handle-one, handle-two" onChange={(event) => change(event.target.value)} />
    } else if (setting.type === 'richtext') {
      control = <Textarea id={id} value={value as string} rows={3} onChange={(event) => change(event.target.value)} />
    } else {
      const placeholder = setting.type === 'url' ? '/collections/all or https://…' : kind ? 'handle' : undefined
      control = <Input id={id} value={value as string} placeholder={placeholder} onChange={(event) => change(event.target.value)} />
    }
    return (
      <Field key={key}>
        <FieldLabel id={`${id}-label`} htmlFor={id}>
          {setting.label}
        </FieldLabel>
        {control}
      </Field>
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
        <form onSubmit={saveSettings} className="flex flex-col gap-4">
          <Separator />
          {store && 'error' in store ? (
            <Alert>
              <AlertTitle>The store's collections, products and menus are not listed</AlertTitle>
              <AlertDescription>{store.error} Until then, type their handles.</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup className="gap-4">
            {details.settings.map((setting) => settingField(setting, setting.id))}
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
                  {block.settings.map((setting) => settingField(setting, `${block.id}/${setting.id}`))}
                  <MediaSettings media={block.media} editor={editor} />
                </FieldSet>
              )
            })}
          </FieldGroup>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !changed}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {changed ? (
              <Button type="button" variant="ghost" onClick={() => setEdits({})}>
                Discard
              </Button>
            ) : null}
          </div>
        </form>
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

/** Image and video settings, which the Studio doesn't upload: it shows whether each is set and links to the Theme Editor. */
function MediaSettings({ media, editor }: { media: MediaSetting[]; editor: string | null }) {
  return media.map((setting) => (
    <div key={setting.id} className="flex flex-col items-start gap-1.5">
      <div className="flex items-center gap-2">
        <span className="font-medium">{setting.label}</span>
        <Badge variant={setting.set ? 'secondary' : 'outline'}>{setting.set ? 'Set' : 'Empty'}</Badge>
      </div>
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

function BrandPanel({ brand, onSaved }: { brand: Brand; onSaved: (state: ThemeState) => void }) {
  const [colorSchemes, setColorSchemes] = useState(brand.colorSchemes)
  const [headingFont, setHeadingFont] = useState(brand.headingFont)
  const [bodyFont, setBodyFont] = useState(brand.bodyFont)
  // Changes on every logo upload, so the logo reloads even when the file name stays the same.
  const [logoVersion, setLogoVersion] = useState(Date.now)
  const { saving, error, write } = useWrite(onSaved)

  function setColor(scheme: string, field: string, value: string) {
    setColorSchemes((schemes) => ({ ...schemes, [scheme]: { ...schemes[scheme], [field]: value } }))
  }

  function addScheme() {
    setColorSchemes((schemes) => {
      let n = Object.keys(schemes).length + 1
      while (`scheme-${n}` in schemes) n++
      // A new scheme starts as a copy of the first one.
      return { ...schemes, [`scheme-${n}`]: { ...Object.values(schemes)[0] } }
    })
  }

  // Only what the Creator changed is sent, so values set elsewhere (the Theme Editor, the agent) stay as they are.
  function brandChanges() {
    const changes: Record<string, unknown> = {}
    const changedSchemes = Object.fromEntries(
      Object.entries(colorSchemes).flatMap(([scheme, colors]) => {
        // A gradient the Theme lacks reads as empty, so clearing a new one sends nothing.
        const changed = Object.entries(colors).filter(([field, value]) => value !== (brand.colorSchemes[scheme]?.[field] ?? ''))
        return changed.length > 0 ? [[scheme, Object.fromEntries(changed)]] : []
      }),
    )
    if (Object.keys(changedSchemes).length > 0) changes.colorSchemes = changedSchemes
    if (headingFont !== brand.headingFont) changes.headingFont = headingFont
    if (bodyFont !== brand.bodyFont) changes.bodyFont = bodyFont
    return changes
  }

  function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    write('/api/brand', jsonRequest('PUT', brandChanges()))
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
    <form onSubmit={save} className="flex flex-col gap-4 p-3">
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
                        value={colors[field] ?? '#000000'}
                        onChange={(event) => setColor(scheme, field, event.target.value)}
                      />
                      <FieldLabel htmlFor={`${scheme}-${field}`} className="text-xs font-normal">
                        {field.replaceAll('_', ' ')}
                      </FieldLabel>
                    </Field>
                  ))}
                </div>
                {brand.gradientFields.map((field) => (
                  <Field key={field} className="gap-1">
                    <FieldLabel htmlFor={`${scheme}-${field}`} className="text-xs font-normal">
                      {field.replaceAll('_', ' ')}
                    </FieldLabel>
                    <Input
                      id={`${scheme}-${field}`}
                      className="h-7 text-xs"
                      placeholder="linear-gradient(180deg, #FFFFFF, #EEEEEE)"
                      value={colors[field] ?? ''}
                      onChange={(event) => setColor(scheme, field, event.target.value)}
                    />
                  </Field>
                ))}
                <ContrastWarning colors={colors} />
              </FieldSet>
            ))}
          </FieldGroup>
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={addScheme}>
            <PlusIcon data-icon="inline-start" />
            Add color scheme
          </Button>
        </FieldSet>
        <FontPicker id="heading-font" label="Heading font" value={headingFont} onChange={setHeadingFont} />
        <FontPicker id="body-font" label="Body font" value={bodyFont} onChange={setBodyFont} />
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
            <AlertTitle>The Brand was not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </FieldGroup>
      <div className="sticky bottom-0 -mx-3 border-t bg-background p-3">
        <Button type="submit" className="w-full" disabled={saving}>
          {saving ? 'Saving…' : 'Save Brand'}
        </Button>
      </div>
    </form>
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
  onChange,
}: {
  id: string
  label: string
  value: string
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
