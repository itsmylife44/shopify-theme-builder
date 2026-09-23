// PROTOTYPE (branch prototype/studio-editor, throwaway). Question: does a 3-panel editor with the preview
// embedded in the Studio work with `shopify theme dev`, and which of two layouts reads best?
// Variants, switchable with ?variant= and the bottom bar: current (today's Studio), A (docked panels),
// B (full-bleed canvas with floating panels). Section text fields are stubs: they don't save.
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  LayoutListIcon,
  MonitorIcon,
  PaletteIcon,
  PlusIcon,
  SmartphoneIcon,
  Trash2Icon,
  ArrowDownIcon,
  ArrowUpIcon,
  XIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { PreviewState } from '../server/preview.mjs'
import type { Offense, Page, TemplateSection, ThemeState } from '../server/studio.mjs'
import { App, BrandPanel, jsonRequest, useWrite } from './App'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

const variants = ['current', 'A', 'B'] as const
type Variant = (typeof variants)[number]
const variantNames: Record<Variant, string> = { current: "Today's Studio", A: 'Docked panels', B: 'Canvas' }

export function PrototypeStudioEditor() {
  const [variant, setVariant] = useState<Variant>(() => {
    const param = new URLSearchParams(location.search).get('variant')
    return variants.includes(param as Variant) ? (param as Variant) : 'A'
  })
  function go(next: Variant) {
    const url = new URL(location.href)
    url.searchParams.set('variant', next)
    history.replaceState(null, '', url)
    setVariant(next)
  }
  return (
    <>
      {variant === 'current' ? <App /> : <Editor layout={variant} />}
      <Switcher current={variant} onChange={go} />
    </>
  )
}

function Switcher({ current, onChange }: { current: Variant; onChange: (variant: Variant) => void }) {
  const step = (offset: number) => onChange(variants[(variants.indexOf(current) + offset + variants.length) % variants.length])
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      if (event.key === 'ArrowLeft') step(-1)
      if (event.key === 'ArrowRight') step(1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  })
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1 text-sm text-white shadow-lg">
      <button aria-label="Previous variant" className="rounded-full p-1 hover:bg-white/20" onClick={() => step(-1)}>
        <ChevronLeftIcon className="size-4" />
      </button>
      <span className="px-1 tabular-nums">
        {current} · {variantNames[current]}
      </span>
      <button aria-label="Next variant" className="rounded-full p-1 hover:bg-white/20" onClick={() => step(1)}>
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  )
}

// ---- Data shared by both variants ----

function useThemeState() {
  const [state, setState] = useState<ThemeState | null>(null)
  useEffect(() => {
    let controller = new AbortController()
    function read() {
      controller.abort()
      controller = new AbortController()
      fetch('/api/theme', { signal: controller.signal })
        .then((response) => response.json())
        .then(setState)
        .catch(() => {})
    }
    read()
    import.meta.hot?.on('studio:theme', read)
    return () => {
      controller.abort()
      import.meta.hot?.off('studio:theme', read)
    }
  }, [])
  return [state, setState] as const
}

function usePreview() {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [productPath, setProductPath] = useState('/products')
  useEffect(() => {
    fetch('/api/preview').then((response) => response.json()).then(setPreview)
    fetch('/api/prototype-frame')
      .then((response) => response.json())
      .then((body) => setFrameUrl(body.url))
    import.meta.hot?.on('studio:preview', setPreview)
    return () => import.meta.hot?.off('studio:preview', setPreview)
  }, [])
  const running = preview?.status === 'running'
  useEffect(() => {
    if (!running || !frameUrl) return
    // The product page needs a product: the first one the store has.
    fetch(`${frameUrl}/products.json?limit=1`)
      .then((response) => response.json())
      .then((body) => body.products?.[0] && setProductPath(`/products/${body.products[0].handle}`))
      .catch(() => {})
  }, [running, frameUrl])
  const paths: Record<Page, string> = { home: '/', product: productPath, collection: '/collections/all' }
  return { preview, frameUrl: running ? frameUrl : null, paths }
}

const pageNames: Record<Page, string> = { home: 'Home', product: 'Product', collection: 'Collection' }
const sectionName = (type: string) => type.replaceAll('-', ' ').replace(/^./, (c) => c.toUpperCase())

type Device = 'desktop' | 'mobile'

function PreviewFrame({
  src,
  device,
  selectedId,
  onSelect,
  className,
}: {
  src: string
  device: Device
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frame.current?.contentWindow) return
      if (event.data?.type === 'studio:select') onSelect(event.data.id)
      if (event.data?.type === 'studio:loaded') setLoadedAt(Date.now())
    }
    addEventListener('message', onMessage)
    return () => removeEventListener('message', onMessage)
  }, [onSelect])
  // Tells the page which section is selected, again after each reload (theme dev reloads it on changes).
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: 'studio:selected', id: selectedId, scroll: true }, '*')
  }, [selectedId, loadedAt])
  return (
    <iframe
      ref={frame}
      src={src}
      title="Theme preview"
      className={className}
      style={{ width: device === 'mobile' ? 390 : '100%' }}
    />
  )
}

function StatusBadges({ preview, offenses }: { preview: PreviewState | null; offenses: Offense[] }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  return (
    <>
      <Badge variant={preview?.status === 'error' ? 'destructive' : 'secondary'}>
        <span className={`size-2 rounded-full ${preview?.status === 'running' ? 'bg-green-500' : 'bg-amber-500'}`} />
        {preview?.status === 'running' ? 'Live' : (preview?.status ?? 'Starting')}
      </Badge>
      <Badge variant={errors > 0 ? 'destructive' : 'secondary'} title={offenses.map((o) => `${o.file}:${o.line} ${o.message}`).join('\n')}>
        {errors > 0 ? `${errors} Theme Check errors` : 'Theme Check ✓'}
      </Badge>
    </>
  )
}

function DeviceToggle({ device, onChange }: { device: Device; onChange: (device: Device) => void }) {
  return (
    <div className="flex rounded-md border p-0.5">
      <Button size="icon-sm" variant={device === 'desktop' ? 'secondary' : 'ghost'} aria-label="Desktop" onClick={() => onChange('desktop')}>
        <MonitorIcon />
      </Button>
      <Button size="icon-sm" variant={device === 'mobile' ? 'secondary' : 'ghost'} aria-label="Mobile" onClick={() => onChange('mobile')}>
        <SmartphoneIcon />
      </Button>
    </div>
  )
}

function PageTabs({ page, onChange }: { page: Page; onChange: (page: Page) => void }) {
  return (
    <div className="flex rounded-md border p-0.5">
      {(Object.keys(pageNames) as Page[]).map((name) => (
        <Button key={name} size="sm" variant={page === name ? 'secondary' : 'ghost'} onClick={() => onChange(name)}>
          {pageNames[name]}
        </Button>
      ))}
    </div>
  )
}

function SectionList({
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
  const { saving, write } = useWrite(onSaved)
  const groups = [
    { label: 'Section Catalog', names: state.catalog[page] },
    { label: 'Custom Sections', names: state.custom[page] },
  ].filter((group) => group.names.length > 0)
  const items = groups.flatMap((group) => group.names.map((name) => ({ value: name, label: sectionName(name) })))
  const [adding, setAdding] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 text-xs text-muted-foreground">Header</p>
      {state[page].map((section) => (
        <button
          key={section.id}
          onClick={() => onSelect(section.id)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${
            selectedId === section.id ? 'bg-muted font-medium' : ''
          }`}
        >
          <LayoutListIcon className="size-4 text-muted-foreground" />
          {sectionName(section.type)}
        </button>
      ))}
      <p className="px-2 pt-1 text-xs text-muted-foreground">Footer</p>
      <div className="mt-2 flex gap-1">
        <Select items={items} value={adding} onValueChange={setAdding}>
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue placeholder="Add section" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.names.map((name) => (
                  <SelectItem key={name} value={name}>
                    {sectionName(name)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon-sm"
          aria-label="Add section"
          disabled={saving || !adding}
          onClick={() => write(`/api/${page}/sections`, jsonRequest('POST', { type: adding })).then(() => setAdding(null))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  )
}

// Stub text settings per section type, until the Studio reads each section's schema.
const stubText: Record<string, [string, string][]> = {
  hero: [['Heading', 'Welcome to our store'], ['Text', 'Tell customers what makes your products special.'], ['Button label', 'Shop now']],
  'image-with-text': [['Heading', 'Image with text'], ['Text', 'Pair text with an image to tell the story of your brand.'], ['Button label', 'Learn more']],
  testimonials: [['Heading', 'What our customers say']],
  newsletter: [['Heading', 'Subscribe to our emails'], ['Text', 'Be the first to hear about new products.']],
  'featured-collection': [['Heading', 'Featured collection']],
}

function SectionInspector({
  state,
  page,
  sectionId,
  onClose,
  onSaved,
}: {
  state: ThemeState
  page: Page
  sectionId: string
  onClose: () => void
  onSaved: (state: ThemeState) => void
}) {
  const { saving, error, write } = useWrite(onSaved)
  const sections = state[page]
  const index = sections.findIndex((section) => section.id === sectionId)
  const section: TemplateSection | undefined = sections[index]
  if (!section) {
    return (
      <div className="flex flex-col gap-2 p-4 text-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">{sectionName(sectionId)}</h2>
          <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
        <p className="text-muted-foreground">This section is in the header or footer, shared by every page. The Studio doesn't edit it yet.</p>
      </div>
    )
  }
  const schemes = Object.keys(state.brand.colorSchemes).map((scheme) => ({ value: scheme, label: scheme }))
  function move(offset: number) {
    const order = sections.map((s) => s.id)
    ;[order[index], order[index + offset]] = [order[index + offset], order[index]]
    write(`/api/${page}/order`, jsonRequest('PUT', { order }))
  }
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">{sectionName(section.type)}</h2>
        <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <FieldGroup className="gap-4">
        {section.colorScheme !== undefined ? (
          <Field>
            <FieldLabel>Color scheme</FieldLabel>
            <Select
              items={schemes}
              value={section.colorScheme}
              disabled={saving}
              onValueChange={(colorScheme) =>
                colorScheme && write(`/api/${page}/sections/${encodeURIComponent(section.id)}`, jsonRequest('PATCH', { colorScheme }))
              }
            >
              <SelectTrigger className="w-full">
                <span
                  className="size-4 rounded-sm border"
                  style={{ background: state.brand.colorSchemes[section.colorScheme ?? '']?.background }}
                />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {schemes.map((scheme) => (
                    <SelectItem key={scheme.value} value={scheme.value}>
                      <span className="size-3 rounded-sm border" style={{ background: state.brand.colorSchemes[scheme.value]?.background }} />
                      {scheme.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        {(stubText[section.type] ?? []).map(([label, value]) => (
          <Field key={section.id + label}>
            <FieldLabel>{label}</FieldLabel>
            {label === 'Text' ? <Textarea defaultValue={value} rows={3} /> : <Input defaultValue={value} />}
          </Field>
        ))}
        {stubText[section.type] ? <FieldDescription>Prototype: text fields don't save yet.</FieldDescription> : null}
      </FieldGroup>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-1 border-t pt-4">
        <Button size="sm" variant="outline" disabled={saving || index === 0} onClick={() => move(-1)}>
          <ArrowUpIcon /> Up
        </Button>
        <Button size="sm" variant="outline" disabled={saving || index === sections.length - 1} onClick={() => move(1)}>
          <ArrowDownIcon /> Down
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive"
          disabled={saving || sections.length === 1}
          onClick={() => write(`/api/${page}/sections/${encodeURIComponent(section.id)}`, { method: 'DELETE' }).then(onClose)}
        >
          <Trash2Icon /> Remove
        </Button>
      </div>
    </div>
  )
}

function Waiting({ preview }: { preview: PreviewState | null }) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
      {preview && preview.status !== 'running' ? preview.message : 'Starting the preview…'}
    </div>
  )
}

// ---- The two layouts ----

function Editor({ layout }: { layout: 'A' | 'B' }) {
  const [state, setState] = useThemeState()
  const { preview, frameUrl, paths } = usePreview()
  const [page, setPage] = useState<Page>('home')
  const [device, setDevice] = useState<Device>('desktop')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<'sections' | 'brand'>('sections')
  if (!state) return <Waiting preview={null} />
  const props = { state, preview, frameUrl, paths, page, device, selectedId, tab, setState, setPage, setDevice, setSelectedId, setTab }
  return layout === 'A' ? <DockedLayout {...props} /> : <CanvasLayout {...props} />
}

type LayoutProps = {
  state: ThemeState
  preview: PreviewState | null
  frameUrl: string | null
  paths: Record<Page, string>
  page: Page
  device: Device
  selectedId: string | null
  tab: 'sections' | 'brand'
  setState: (state: ThemeState) => void
  setPage: (page: Page) => void
  setDevice: (device: Device) => void
  setSelectedId: (id: string | null) => void
  setTab: (tab: 'sections' | 'brand') => void
}

/** A: three docked columns, like Shopify's Theme Editor. */
function DockedLayout(p: LayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <span className="font-heading font-medium">Studio</span>
        <PageTabs page={p.page} onChange={(page) => (p.setPage(page), p.setSelectedId(null))} />
        <div className="ml-auto flex items-center gap-2">
          <StatusBadges preview={p.preview} offenses={p.state.validation} />
          <DeviceToggle device={p.device} onChange={p.setDevice} />
          {p.preview?.status === 'running' ? (
            <a href={p.preview.url + p.paths[p.page]} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm', variant: 'outline' })}>
              <ExternalLinkIcon /> Open
            </a>
          ) : null}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col border-r">
          <div className="flex gap-1 border-b p-2">
            <Button size="sm" variant={p.tab === 'sections' ? 'secondary' : 'ghost'} onClick={() => p.setTab('sections')}>
              <LayoutListIcon /> Sections
            </Button>
            <Button size="sm" variant={p.tab === 'brand' ? 'secondary' : 'ghost'} onClick={() => p.setTab('brand')}>
              <PaletteIcon /> Brand
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {p.tab === 'sections' ? (
              <SectionList state={p.state} page={p.page} selectedId={p.selectedId} onSelect={p.setSelectedId} onSaved={p.setState} />
            ) : (
              <BrandPanel key={JSON.stringify(p.state.brand)} brand={p.state.brand} onSaved={p.setState} />
            )}
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 justify-center overflow-hidden bg-muted p-4">
          {p.frameUrl ? (
            <PreviewFrame
              src={p.frameUrl + p.paths[p.page]}
              device={p.device}
              selectedId={p.selectedId}
              onSelect={p.setSelectedId}
              className="h-full rounded-md border bg-white shadow-sm"
            />
          ) : (
            <Waiting preview={p.preview} />
          )}
        </main>
        <aside className="w-80 shrink-0 overflow-y-auto border-l">
          {p.selectedId ? (
            <SectionInspector state={p.state} page={p.page} sectionId={p.selectedId} onClose={() => p.setSelectedId(null)} onSaved={p.setState} />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Click a section in the preview or in the list to edit it.</p>
          )}
        </aside>
      </div>
    </div>
  )
}

/** B: the preview fills the window; panels float over it and the inspector only shows when a section is picked. */
function CanvasLayout(p: LayoutProps) {
  const [panelOpen, setPanelOpen] = useState(true)
  return (
    <div className="relative h-screen overflow-hidden bg-neutral-900">
      <div className="absolute inset-0 flex justify-center pt-14">
        {p.frameUrl ? (
          <PreviewFrame
            src={p.frameUrl + p.paths[p.page]}
            device={p.device}
            selectedId={p.selectedId}
            onSelect={p.setSelectedId}
            className="h-full bg-white"
          />
        ) : (
          <div className="text-neutral-300">
            <Waiting preview={p.preview} />
          </div>
        )}
      </div>
      <header className="absolute inset-x-0 top-0 flex h-14 items-center gap-3 bg-neutral-950 px-4 text-white">
        <span className="font-heading font-medium">Studio</span>
        <div className="flex gap-1">
          {(Object.keys(pageNames) as Page[]).map((name) => (
            <button
              key={name}
              onClick={() => (p.setPage(name), p.setSelectedId(null))}
              className={`rounded-full px-3 py-1 text-sm ${p.page === name ? 'bg-white text-black' : 'text-neutral-300 hover:bg-white/10'}`}
            >
              {pageNames[name]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusBadges preview={p.preview} offenses={p.state.validation} />
          <div className="rounded-md bg-white">
            <DeviceToggle device={p.device} onChange={p.setDevice} />
          </div>
          <Button size="sm" variant="secondary" onClick={() => setPanelOpen((open) => !open)}>
            {panelOpen ? 'Hide panels' : 'Show panels'}
          </Button>
        </div>
      </header>
      {panelOpen ? (
        <aside className="absolute top-18 left-4 flex max-h-[calc(100vh-6rem)] w-72 flex-col rounded-xl bg-background shadow-2xl">
          <div className="flex gap-1 border-b p-2">
            <Button size="sm" variant={p.tab === 'sections' ? 'secondary' : 'ghost'} onClick={() => p.setTab('sections')}>
              <LayoutListIcon /> Sections
            </Button>
            <Button size="sm" variant={p.tab === 'brand' ? 'secondary' : 'ghost'} onClick={() => p.setTab('brand')}>
              <PaletteIcon /> Brand
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto p-2">
            {p.tab === 'sections' ? (
              <SectionList state={p.state} page={p.page} selectedId={p.selectedId} onSelect={p.setSelectedId} onSaved={p.setState} />
            ) : (
              <BrandPanel key={JSON.stringify(p.state.brand)} brand={p.state.brand} onSaved={p.setState} />
            )}
          </div>
        </aside>
      ) : null}
      {panelOpen && p.selectedId ? (
        <aside className="absolute top-18 right-4 max-h-[calc(100vh-6rem)] w-80 overflow-y-auto rounded-xl bg-background shadow-2xl">
          <SectionInspector state={p.state} page={p.page} sectionId={p.selectedId} onClose={() => p.setSelectedId(null)} onSaved={p.setState} />
        </aside>
      ) : null}
    </div>
  )
}
