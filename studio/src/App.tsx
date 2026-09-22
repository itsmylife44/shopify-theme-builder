import { useEffect, useState } from 'react'
import fontLibrary from '../server/shopify-fonts.json'
import type { Brand, Offense, ThemeState } from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/theme', { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error)
        setLoad({ status: 'ready', state: body })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setLoad({ status: 'error', message: error.message })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <h1 className="font-heading text-xl font-medium">Studio</h1>
      {load.status === 'loading' ? (
        <Skeleton className="h-64 w-full" />
      ) : load.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>The Studio could not read the Theme</AlertTitle>
          <AlertDescription>{load.message}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Keyed by the saved Brand, so the form restarts from what was written. */}
          <BrandPanel
            key={JSON.stringify(load.state.brand)}
            brand={load.state.brand}
            onSaved={(state) => setLoad({ status: 'ready', state })}
          />
          <HomePage sections={load.state.home} />
          <SectionCatalog sections={load.state.catalog} />
          <ThemeCheck offenses={load.state.validation} />
        </div>
      )}
    </main>
  )
}

function BrandPanel({ brand, onSaved }: { brand: Brand; onSaved: (state: ThemeState) => void }) {
  const [colorSchemes, setColorSchemes] = useState(brand.colorSchemes)
  const [headingFont, setHeadingFont] = useState(brand.headingFont)
  const [bodyFont, setBodyFont] = useState(brand.bodyFont)
  // Changes on every logo upload, so the preview reloads even when the file name stays the same.
  const [logoVersion, setLogoVersion] = useState(Date.now)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  /** Sends one Brand write to the Studio API and shows the Theme state it returns. */
  async function write(url: string, init: RequestInit) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(url, init)
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      if (url === '/api/brand/logo') setLogoVersion(Date.now())
      onSaved(body)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function save(event: React.FormEvent) {
    event.preventDefault()
    write('/api/brand', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(brandChanges()),
    })
  }

  function uploadLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) write('/api/brand/logo', { method: 'PUT', headers: { 'Content-Type': file.type }, body: file })
  }

  return (
    <Card className="md:col-span-2">
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
                    onClick={() => write('/api/brand/logo', { method: 'DELETE' })}
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

function HomePage({ sections }: { sections: ThemeState['home'] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Home page</CardTitle>
        <CardDescription>Sections in page order, from templates/index.json.</CardDescription>
      </CardHeader>
      <CardContent>
        {sections.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {sections.map((section, index) => (
              <li key={section.id} className="flex items-center gap-3">
                <span className="w-5 text-right text-muted-foreground tabular-nums">{index + 1}</span>
                <span className="font-medium">{section.type}</span>
                <span className="truncate text-muted-foreground">{section.id}</span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState title="No sections" description="The home page has no sections yet." />
        )}
      </CardContent>
    </Card>
  )
}

function SectionCatalog({ sections }: { sections: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Section Catalog</CardTitle>
        <CardDescription>Sections available to add to a page.</CardDescription>
      </CardHeader>
      <CardContent>
        {sections.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {sections.map((name) => (
              <li key={name}>
                <Badge variant="outline">{name}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Empty catalog" description="The Section Catalog has no sections yet." />
        )}
      </CardContent>
    </Card>
  )
}

function ThemeCheck({ offenses }: { offenses: Offense[] }) {
  const errors = offenses.filter((offense) => offense.severity === 'error').length
  const warnings = offenses.length - errors
  return (
    <Card className="md:col-span-2">
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
