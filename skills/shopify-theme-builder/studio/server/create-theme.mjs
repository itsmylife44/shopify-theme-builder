// Creates a Theme folder (SKILL.md step 3): the Base Theme, the catalog files every Theme
// starts with, the Theme's name and author, and a Git repository.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const skillDir = fileURLToPath(new URL('../..', import.meta.url))

/**
 * The Section Catalog files every new Theme starts with, relative to catalog/: the header, footer and
 * their groups with the sections they fetch, and each page's template with its main section.
 * The Studio copies the other catalog sections when the Creator adds them.
 */
export const starterFiles = [
  'sections/header.liquid',
  'sections/header-group.json',
  'sections/announcement-bar.liquid',
  'sections/predictive-search.liquid',
  'sections/quick-add.liquid',
  'sections/footer.liquid',
  'sections/footer-group.json',
  'sections/contact-form.liquid',
  'templates/page.contact.json',
  'sections/main-cart.liquid',
  'templates/cart.json',
  'sections/main-search.liquid',
  'templates/search.json',
  'sections/main-blog.liquid',
  'templates/blog.json',
  'sections/main-article.liquid',
  'templates/article.json',
  'sections/main-404.liquid',
  'templates/404.json',
  'sections/main-list-collections.liquid',
  'templates/list-collections.json',
]

/**
 * Creates the Theme in `theme`, which must be outside the skill and not exist or be empty.
 * @param {{ theme: string, name: string, author: string }} options
 */
export function createTheme({ theme, name, author }) {
  theme = path.resolve(theme)
  if (!name || name.length > 50) throw new Error('--name is the shop name, 1 to 50 characters.')
  if (!author) throw new Error('--author is required.')
  const fromSkill = path.relative(skillDir, theme)
  if (!fromSkill.startsWith('..') && !path.isAbsolute(fromSkill)) throw new Error(`${theme} is inside the skill: the Theme goes outside ${skillDir}.`)
  if (existsSync(theme) && readdirSync(theme).length > 0) throw new Error(`${theme} isn't empty: pick another folder.`)

  cpSync(path.join(skillDir, 'base-theme'), theme, { recursive: true })
  for (const file of starterFiles) cpSync(path.join(skillDir, 'catalog', file), path.join(theme, file))
  // PROVENANCE.md describes the skill's own copy of Skeleton, not the Theme.
  rmSync(path.join(theme, 'PROVENANCE.md'))

  const schemaFile = path.join(theme, 'config/settings_schema.json')
  const schema = JSON.parse(readFileSync(schemaFile, 'utf8'))
  Object.assign(schema[0], { theme_name: name, theme_author: author })
  writeFileSync(schemaFile, JSON.stringify(schema, null, 2) + '\n')

  // Shopify's GitHub integration connects to a repository with the Theme at its root.
  execFileSync('git', ['init', '--quiet', '-b', 'main'], { cwd: theme })
}
