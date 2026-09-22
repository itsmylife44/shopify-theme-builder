# Shopify Theme Builder

An open-source agent skill that lets a Creator produce their own Shopify Theme by talking to a coding agent, without writing Liquid by hand.

## Language

### People

**Creator**:
The person running the skill through a coding agent to produce a Theme, typically a tech-comfortable merchant or a freelancer building for a client.
_Avoid_: user, developer

**Merchant**:
The owner of the Shopify shop the Theme is installed on. May or may not be the Creator.
_Avoid_: client, store owner

### Theme

**Base Theme**:
The Shopify reference theme (Skeleton) every Theme starts from, before the Section Catalog is added.
_Avoid_: starter, boilerplate

**Theme**:
The Shopify theme the skill produces for one shop.
_Avoid_: template, skin

**Brand**:
The visual identity applied to a Theme: colors, typography, logo and overall style.
_Avoid_: style guide, design tokens

**Section Catalog**:
The fixed set of prebuilt, known-valid sections the skill composes a Theme from.
_Avoid_: library, components

**Custom Section**:
A section the agent generates on request because nothing in the Section Catalog fits.
_Avoid_: AI section, generated block

### Tools

**Studio**:
The local visual app shipped with this skill where the Creator adjusts the Brand and composes sections while watching a preview.
_Avoid_: editor, builder, playground

**Theme Editor**:
Shopify's own in-admin customizer. Never used for the Studio.
_Avoid_: customizer
