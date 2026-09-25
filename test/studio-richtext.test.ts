import { describe, expect, it } from 'vitest'
import { sanitizeRichtext } from '../skills/shopify-theme-builder/studio/src/richtext.mjs'

// The inspector's rich text editor saves its HTML through this sanitizer: only what Shopify's richtext and
// inline_richtext settings take, whatever the browser's contenteditable or a pasted value holds.
describe('the rich text sanitizer', () => {
  it('keeps paragraphs, bold, italic and links', () => {
    const html = '<p>Write to <a href="mailto:hallo@kadenz.example">us</a>, <strong>today</strong> or <em>tomorrow</em>.</p><p>Thanks</p>'
    expect(sanitizeRichtext(html)).toBe(html)
  })

  it('drops every other tag and attribute, keeping its text', () => {
    const html = '<p class="lead" style="color:red"><span>Our <font color="red">story</font></span> <u>since</u> <img src="x.png" onerror="alert(1)">2020</p>'
    expect(sanitizeRichtext(html)).toBe('<p>Our story since 2020</p>')
  })

  it('drops scripts and styles with their content', () => {
    expect(sanitizeRichtext('<p>Hi<script>alert(1)</script><style>p{}</style></p>')).toBe('<p>Hi</p>')
  })

  it('saves b and i as strong and em', () => {
    expect(sanitizeRichtext('<p><b>New</b> <i>in</i></p>')).toBe('<p><strong>New</strong> <em>in</em></p>')
  })

  it('keeps a link only to a store path, the web, mail, a phone or a store resource', () => {
    expect(sanitizeRichtext('<p><a href="/pages/contact" target="_blank" onclick="x()">Contact</a></p>')).toBe('<p><a href="/pages/contact">Contact</a></p>')
    expect(sanitizeRichtext('<p><a href="shopify://collections/all">Shop</a> <a href="tel:+49123">Call</a></p>')).toBe(
      '<p><a href="shopify://collections/all">Shop</a> <a href="tel:+49123">Call</a></p>',
    )
    expect(sanitizeRichtext('<p><a href="javascript:alert(1)">Click</a> <a>here</a></p>')).toBe('<p>Click here</p>')
  })

  it('turns what a contenteditable writes into paragraphs', () => {
    // Chrome leaves the first line bare, puts the next ones in divs and an empty line as <div><br></div>.
    expect(sanitizeRichtext('First<div>Second<br>line</div><div><br></div><div>Third&nbsp;</div>')).toBe(
      '<p>First</p><p>Second<br>line</p><p>Third&nbsp;</p>',
    )
    expect(sanitizeRichtext('<h2>Title</h2><ul><li>One</li><li>Two</li></ul>')).toBe('<p>Title</p><p>One</p><p>Two</p>')
  })

  it('closes every tag, and one open across paragraphs in each', () => {
    expect(sanitizeRichtext('<p><strong>Bold')).toBe('<p><strong>Bold</strong></p>')
    expect(sanitizeRichtext('<strong>One<div>Two</div></strong>')).toBe('<p><strong>One</strong></p><p><strong>Two</strong></p>')
    expect(sanitizeRichtext('<p>Stray</em> close</p>')).toBe('<p>Stray close</p>')
  })

  it('escapes a bare angle bracket in the text', () => {
    expect(sanitizeRichtext('<p>1 < 2 > 0</p>')).toBe('<p>1 &lt; 2 &gt; 0</p>')
  })

  it('saves nothing for an empty editor', () => {
    expect(sanitizeRichtext('<br>')).toBe('')
    expect(sanitizeRichtext('<p> </p><div><br></div>')).toBe('')
  })

  it('saves inline rich text without paragraphs or line breaks', () => {
    expect(sanitizeRichtext('<p>Summer <strong>sale</strong></p><p>now<br>on</p>', true)).toBe('Summer <strong>sale</strong> now on')
    expect(sanitizeRichtext('<em>Hello</em> <a href="https://kadenz.example">world</a>', true)).toBe('<em>Hello</em> <a href="https://kadenz.example">world</a>')
  })
})
