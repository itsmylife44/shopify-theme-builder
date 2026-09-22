import { useEffect, useState } from 'react'
import type { Brand, Offense, ThemeState } from '../server/studio.mjs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
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

const shopImagePrefix = 'shopify://shop_images/'

function BrandPanel({ brand, onSaved }: { brand: Brand; onSaved: (state: ThemeState) => void }) {
  const [colorSchemes, setColorSchemes] = useState(brand.colorSchemes)
  const [headingFont, setHeadingFont] = useState(brand.headingFont)
  const [bodyFont, setBodyFont] = useState(brand.bodyFont)
  const [logoFile, setLogoFile] = useState(brand.logo?.slice(shopImagePrefix.length) ?? '')
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
    if (headingFont.trim() !== brand.headingFont) changes.headingFont = headingFont.trim()
    if (bodyFont.trim() !== brand.bodyFont) changes.bodyFont = bodyFont.trim()
    const logo = logoFile.trim() ? shopImagePrefix + logoFile.trim() : null
    if (logo !== brand.logo) changes.logo = logo
    return changes
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch('/api/brand', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(brandChanges()),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      onSaved(body)
    } catch (error) {
      setError((error as Error).message)
    } finally {
      setSaving(false)
    }
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
              <Field>
                <FieldLabel htmlFor="heading-font">Heading font</FieldLabel>
                <Input id="heading-font" value={headingFont} onChange={(event) => setHeadingFont(event.target.value)} />
                <FieldDescription>A Shopify font library handle, like playfair_display_n7.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="body-font">Body font</FieldLabel>
                <Input id="body-font" value={bodyFont} onChange={(event) => setBodyFont(event.target.value)} />
                <FieldDescription>
                  Handles are listed in{' '}
                  <a
                    className="underline"
                    href="https://shopify.dev/docs/storefronts/themes/architecture/settings/fonts#available-fonts"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Shopify's font library
                  </a>
                  .
                </FieldDescription>
              </Field>
            </FieldGroup>
            <Field>
              <FieldLabel htmlFor="logo">Logo</FieldLabel>
              <Input
                id="logo"
                placeholder="logo.png"
                value={logoFile}
                onChange={(event) => setLogoFile(event.target.value)}
              />
              <FieldDescription>
                The file name of an image uploaded in the Shopify admin under Content &gt; Files. Leave empty for the
                shop name.
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
