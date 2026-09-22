import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import fontLibrary from '../server/shopify-fonts.json'
import type { PreviewState } from '../server/preview.mjs'
import type { Brand, Offense, Page, TemplateSection, ThemeState } from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; state: ThemeState }

export function App() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-medium">Studio</h1>
      <Preview />
      {load.status === 'loading' ? (
        <Skeleton className="h-64 w-full" />
      ) : load.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>The Studio could not read the Theme</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Keyed by the saved Brand, so the form restarts from what was written. */}
          <BrandPanel
            key={JSON.stringify(load.state.brand)}
            brand={load.state.brand}
            onSaved={showState}
          />
          <PageSections page="home" title="Home page" file="templates/index.json" state={load.state} onSaved={showState} />
          <PageSections page="product" title="Product page" file="templates/product.json" state={load.state} onSaved={showState} />
          <ThemeCheck offenses={load.state.validation} />
        </div>
      )}
    </main>
  )
}

/** Sends writes to the Studio API and hands the Theme state each returns to onSaved. */
function useWrite(onSaved: (state: ThemeState) => void) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Resolves to whether the write succeeded; a failure shows in error. */
  async function write(url: string, init: RequestInit) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(url, init)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      onSaved(body)
      return true
    } catch (error) {
      setError((error as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return { saving, error, write }
}

function jsonRequest(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function BrandPanel({ brand, onSaved }: { brand: Brand; onSaved: (state: ThemeState) => void }) {
  const [colorSchemes, setColorSchemes] = useState(brand.colorSchemes)
  const [headingFont, setHeadingFont] = useState(brand.headingFont)
  const [bodyFont, setBodyFont] = useState(brand.bodyFont)
  // Changes on every logo upload, so the preview reloads even when the file name stays the same.
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
        const changed = Object.entries(colors).filter(([field, value]) => value !== brand.colorSchemes[scheme]?.[field])
        return changed.length > 0 ? [[scheme, Object.fromEntries(changed)]] : []
      }),
    )
    if (Object.keys(changedSchemes).length > 0) changes.colorSchemes = changedSchemes
    if (headingFont !== brand.headingFont) changes.headingFont = headingFont
    if (bodyFont !== brand.bodyFont) changes.bodyFont = bodyFont
    return changes
  }

  function save(event: React.FormEvent) {
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
    <Card>
      <CardHeader>
        <CardTitle>Brand</CardTitle>
        <CardDescription>Colors, fonts and logo, saved to config/settings_data.json.</CardDescription>
      </CardHeader>
      <form onSubmit={save} className="contents">
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Color schemes</FieldLegend>
              <FieldDescription>Sections pick one of these schemes for their colors.</FieldDescription>
              <FieldGroup className="gap-3">
                {Object.entries(colorSchemes).map(([scheme, colors]) => (
                  <FieldSet key={scheme}>
                    <FieldLegend variant="label">{scheme}</FieldLegend>
                    <FieldGroup className="flex-row flex-wrap gap-4">
                      {brand.colorFields.map((field) => (
                        <Field key={field} className="w-24">
                          <FieldLabel htmlFor={`${scheme}-${field}`}>{field.replaceAll('_', ' ')}</FieldLabel>
                          <Input
                            id={`${scheme}-${field}`}
                            type="color"
                            value={colors[field] ?? '#000000'}
                            onChange={(event) => setColor(scheme, field, event.target.value)}
                          />
                        </Field>
                      ))}
                    </FieldGroup>
                  </FieldSet>
                ))}
              </FieldGroup>
              <Button type="button" variant="outline" className="self-start" onClick={addScheme}>
                Add color scheme
              </Button>
            </FieldSet>
            <FieldGroup className="grid md:grid-cols-2">
              <FontPicker id="heading-font" label="Heading font" value={headingFont} onChange={setHeadingFont} />
              <FontPicker id="body-font" label="Body font" value={bodyFont} onChange={setBodyFont} />
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="logo">Logo</FieldLabel>
              {brand.logoAsset ? (
                <div className="flex items-center gap-4">
                  <img src={`/api/brand/logo?v=${logoVersion}`} alt="Current logo" className="h-12 w-auto" />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={saving}
                    onClick={() => writeLogo({ method: 'DELETE' })}
                  >
                    Remove logo
                  </Button>
                </div>
              ) : null}
              <Input
                id="logo"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                disabled={saving}
                onChange={uploadLogo}
              />
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
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Brand'}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

const previewBadges: Record<PreviewState['status'], string> = {
  starting: 'Starting',
  running: 'Running',
  'login-required': 'Login required',
  error: 'Error',
}

/** The status of `shopify theme dev`, and the link to the preview once it runs. */
function Preview() {
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>The Theme rendered by Shopify through shopify theme dev.</CardDescription>
        {preview ? (
          <CardAction>
            <Badge variant={preview.status === 'error' ? 'destructive' : 'secondary'}>{previewBadges[preview.status]}</Badge>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {preview === null ? (
          <Skeleton className="h-9 w-full" />
        ) : preview.status === 'running' ? (
          <div className="flex flex-wrap items-center gap-4">
            <a href={preview.url} target="_blank" rel="noreferrer" className={buttonVariants()}>
              Open preview
              <ExternalLinkIcon data-icon="inline-end" />
            </a>
            <p className="text-muted-foreground">
              {preview.url} works in Google Chrome and reloads when the Theme changes.
            </p>
          </div>
        ) : (
          <p className={preview.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{preview.message}</p>
        )}
      </CardContent>
    </Card>
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
      <FieldGroup className="flex-row gap-2">
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
        <Field className="w-44 shrink-0">
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

/** A page's sections: add from the Section Catalog, remove, reorder and pick each one's color scheme. */
function PageSections({
  page,
  title,
  file,
  state,
  onSaved,
}: {
  page: Page
  title: string
  file: string
  state: ThemeState
  onSaved: (state: ThemeState) => void
}) {
  const { saving, error, write } = useWrite(onSaved)
  const [sectionType, setSectionType] = useState<string | null>(state.catalog[page][0] ?? null)
  const sections = state[page]
  const schemes = Object.keys(state.brand.colorSchemes).map((scheme) => ({ value: scheme, label: scheme }))
  const catalog = state.catalog[page].map((name) => ({ value: name, label: name }))

  function move(index: number, offset: number) {
    const order = sections.map((section) => section.id)
    ;[order[index], order[index + offset]] = [order[index + offset], order[index]]
    write(`/api/${page}/order`, jsonRequest('PUT', { order }))
  }

  function remove(section: TemplateSection) {
    if (!confirm(`Remove ${section.type} (${section.id}) from the ${title.toLowerCase()}? Its settings and blocks are deleted too.`)) return
    write(`/api/${page}/sections/${encodeURIComponent(section.id)}`, { method: 'DELETE' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Sections in page order, saved to {file}.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {sections.map((section, index) => (
              <li key={section.id} className="flex items-center gap-2">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{index + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">{section.type}</span>
                  <span className="truncate text-xs text-muted-foreground">{section.id}</span>
                </div>
                {section.colorScheme !== undefined ? (
                  <Select
                    items={schemes}
                    value={section.colorScheme}
                    disabled={saving}
                    onValueChange={(colorScheme) =>
                      colorScheme &&
                      write(`/api/${page}/sections/${encodeURIComponent(section.id)}`, jsonRequest('PATCH', { colorScheme }))
                    }
                  >
                    <SelectTrigger aria-label={`Color scheme of ${section.id}`} className="w-36">
                      <SelectValue placeholder="Color scheme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {schemes.map((scheme) => (
                          <SelectItem key={scheme.value} value={scheme.value}>
                            {scheme.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${section.id} up`}
                  disabled={saving || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${section.id} down`}
                  disabled={saving || index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${section.id}`}
                  // Shopify needs at least one section in a JSON template.
                  disabled={saving || sections.length === 1}
                  onClick={() => remove(section)}
                >
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No sections" description={`The ${title.toLowerCase()} has no sections yet.`} />
        )}
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>The {title.toLowerCase()} was not saved</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
      <CardFooter className="gap-2">
        {catalog.length > 0 ? (
          <>
            <Field className="w-44">
              <FieldLabel htmlFor={`add-section-${page}`} className="sr-only">
                Section to add
              </FieldLabel>
              <Select items={catalog} value={sectionType} disabled={saving} onValueChange={setSectionType}>
                <SelectTrigger id={`add-section-${page}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {catalog.map((section) => (
                      <SelectItem key={section.value} value={section.value}>
                        {section.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button
              disabled={saving || !sectionType}
              onClick={() => write(`/api/${page}/sections`, jsonRequest('POST', { type: sectionType }))}
            >
              Add section
            </Button>
          </>
        ) : (
          <p className="text-muted-foreground">The Section Catalog has no sections yet.</p>
        )}
      </CardFooter>
    </Card>
  )
}

function ThemeCheck({ offenses }: { offenses: Offense[] }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  const warnings = offenses.length - errors
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme Check</CardTitle>
        <CardDescription>Errors and warnings in the Theme.</CardDescription>
        <CardAction className="flex gap-2">
          <Badge variant={errors > 0 ? 'destructive' : 'secondary'}>{plural(errors, 'error')}</Badge>
          <Badge variant="secondary">{plural(warnings, 'warning')}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        {offenses.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {offenses.map((offense, index) => (
              <li key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge variant={offense.severity === 'error' ? 'destructive' : 'secondary'}>{offense.severity}</Badge>
                  <code className="truncate">
                    {offense.file}:{offense.line}
                  </code>
                  <span className="text-muted-foreground">{offense.check}</span>
                </div>
                <p>{offense.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No problems" description="Theme Check found no errors or warnings." />
        )}
      </CardContent>
    </Card>
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
