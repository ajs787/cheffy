# Cheffy — Design System

Tokens live in `src/theme/`. Components never hardcode a color, size or spacing
value; they read tokens.

## Identity

From *Cheffy Food Club — Identity, Vol. I*. Cheffy is a private table for
people who cook, bake, whisk, and keep notes: a supper club's menu card
rather than a dashboard. High-contrast Didone display type, warm paper, ink
hairlines, one deep wine accent.

- **Wordmark:** lowercase `cheffy.` in Bodoni Moda with a signature full stop
  (`Wordmark`): all oxblood, full stop included, on light grounds; ivory
  letters with a rose stop on dark. Lock-up adds "Club de cuisine" in tracked
  capitals.
- **Monogram:** `c.`, the app icon (oxblood c, espresso stop on ivory) and
  the in-app `Monogram` tile (ivory c, rose stop on oxblood).
- **Voice:** "Your kitchen has a fan club now." · "Cook. Rate. Share.
  Repeat." Small French touches (Membre, Depuis) are flourishes, not UI copy;
  the welcome screen carries none.

## Color — "The Cellar"

| Token | Value | Use | Contrast |
| --- | --- | --- | --- |
| `oxblood` / `accent` | `#6B2737` | marks, entry titles, primary buttons, liked heart | 9.5:1 on ivory; ivory on it 9.5:1 |
| `ivory` / `background` | `#F7F1E8` | ground: paper, linen | — |
| `espresso` / `text` / `rule` | `#3B2A22` | ink: text, hairline rules | 12.1:1 |
| `creme` / `tint` | `#EADFD0` | quiet fills: tags, banners, cards | — |
| `rose` | `#B87484` | the full stop on dark marks; category dot (decorative only) | — |
| `surface` | `#FCF9F4` | lifted paper: inputs, sheets | — |
| `textSecondary` | `#6F5F55` | metadata | 5.4:1 ivory, 4.6:1 crème |
| `textTertiary` | `#8C7B6E` | placeholders, disabled (non-essential) | 3.6:1 |
| `border` / `borderStrong` | `#DFD3C3` / `#CDBEAA` | soft hairlines (inputs, chips) | — |
| `danger` | `#A1261D` | destructive text and outlines | 6.7:1 |

Category dots: Cooking oxblood, Baking caramel `#B08452`, Drinks rose. Rating
tiers: ≥ 8 oxblood, 6–7.9 caramel `#8C6534` (4.7:1), < 6 taupe `#8C7B6E`.
Light-only for v1: the paper is the brand.

## Typography

| Variant | Face | Size / line | Use |
| --- | --- | --- | --- |
| `display` | Bodoni Moda 400 | 36 / 42 | screen titles, post title on detail |
| `title1` | Bodoni Moda 400 | 29 / 35 | entry titles (oxblood), membership name |
| `title2` | Bodoni Moda 500 | 21 / 26 | section headers, stat numerals |
| `title3` | Newsreader 600 | 17 / 22 | sheet titles |
| `body` / `bodyStrong` | Newsreader 400 / 600 | 16 / 23 | reviews, paragraphs |
| `callout` / `calloutStrong` | Newsreader 400 / 600 | 15 / 21 | secondary lines |
| `caption` | Newsreader 500 | 13 / 17 | timestamps |
| `overline` | Newsreader 500, caps, +1.8 tracking | 11 / 14 | labels: `DRINKS · MATCHA`, `MON · 19 OCT`, `MEMBRE` |
| `button` | Newsreader 600 | 16 / 20 | buttons |
| `rating` | Bodoni Moda 400, tabular | 76 / 84 | the rating input |

Bodoni's hairlines need size: never set Bodoni below ~18pt (use Newsreader).

## Spacing

4-pt scale: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`.
Screen gutter is `lg` (16). Sections are separated by `xxl`–`xxxl`.

## Radii

`xs 2 · sm 4 · md 6 · lg 12 · pill 999`. Squared off and editorial: buttons
`sm` (a menu card, not a pill), photos and cards `md`, the membership card and
sheets `lg`, chips and avatars `pill`, the monogram tile ~24% like the app
icon.

## Editorial patterns

- **Diary entry** (post card / detail): tracked-caps meta line (category left,
  `formatEntryDate` right) → oxblood Bodoni title + rating → review → tags →
  espresso rule → actions.
- **Membership card** (profile hero): oxblood card, ivory wordmark, `MEMBRE ·
  DEPUIS {year}`, name, `@username · specialties`, avatar in a rose ring.
- **Notification card** (toast): monogram tile, `CHEFFY · NOW`, message,
  espresso hairline.
- **Rule-divided rows**: stats and the welcome categories sit between espresso
  hairlines with vertical rules, like the identity's cover.

## Elevation

One soft espresso shadow (`shadow.sm`) for objects that sit on the table: the
Create button, toasts, the membership card. Everything else is separated by
hairlines and whitespace.

## Icons

lucide-react-native, stroke 1.75 (2.25 when selected). Sizes: `sm 16 · md 20 · lg 24 · xl 28`.

## Motion & haptics

- Spring presses (`scale 0.97`) on buttons and cards.
- Rating number springs on change; slider emits a selection haptic at each whole
  number, a light impact at 10.0 and 0.0.
- Like: heart pops (scale 1 → 1.25 → 1) with a light impact.
- Sheets slide with a damped spring; backdrop fades.
- Respect Reduce Motion: springs become instant.

## Components

`src/components/ui` (primitives — no data fetching):

| Component | Notes |
| --- | --- |
| `AppText` | typed variants above, `color` token prop |
| `AppButton` | `primary` · `secondary` · `ghost` · `destructive`; `sm`/`md`/`lg`; loading state |
| `IconButton` | 44 pt hit target, accessibility label required |
| `AppInput` | label, helper/error, multiline, character counter |
| `AppHeader` | `brand` (Home only: logo + search + activity) · `large` (Discover, My Rankings: display title + actions) · `nav` (back/close + centred title; Profile "@username", Create "New entry") |
| `Avatar` | image or initials on a tinted circle; sizes xs–xl |
| `FoodImage` | expo-image with placeholder tint, fade-in, `cacheKey` |
| `RatingDisplay` | `badge` → `RatingRing`; `inline` plain number |
| `RatingRing` | progress ring, fill = rating / 10 from 12 o'clock, colour from `ratingScale` (red → deep green), espresso number in the centre; sm 36 / md 44 / lg 58 |
| `RatingInput` | compact readout (number beside descriptor) + slider + ±0.1 steppers; tap the number to type an exact score |
| `Collapsible` | one ruled row (icon, title, one-line summary, chevron) that opens in place; Create's Story, Tags, More details |
| `Chip` / `CategoryChip` / `TagChip` | selectable, removable |
| `SegmentedControl` | tabs inside screens (Diary / Rankings / Collections) |
| `EmptyState` / `ErrorState` | icon, title, message, action |
| `Skeleton` (`LoadingSkeleton`) | shimmering blocks matching real layouts |
| `BottomSheet` | modal sheet with drag-to-dismiss |
| `ConfirmationDialog` | sheet-styled confirm for destructive actions |
| `Toast` | transient feedback |

`src/components/shared` (composed, app-aware): `PostCard`, `PhotoMosaic`,
`ImageCarousel`, `PostGrid`, `RankingRow`, `UserRow`, `CommentRow`, `TabBar`, `ScreenState`.

### Feed entry card (`PostCard`)

Information before imagery: creator row → oxblood title + rating → category
and date → inset photos (`PhotoMosaic`: one photo 4:3; two or three as a
mosaic with "+N") → review, story teaser, tags → "Liked by **name** and N
others" (real likers only) → espresso rule with like / comment / save.

### Profile

Compact social header: avatar (oxblood ring) beside tappable counts; name,
"Membre depuis" overline, bio; actions; category line; Top rated preview
(rank badge + ring); then tabs with a 3-column photo grid.

### Notifications

Bell with an oxblood count badge (9+ cap). Unread rows: tint background and
an oxblood dot. Live banners reuse the toast surface with the sender's
avatar and the post thumbnail.

### Screen headers

Only Home shows the wordmark. Every other tab names itself with a large
display title; pushed and modal screens use the `nav` header. Create, Edit
profile and Edit collection present full screen (no stacked card sheet).
