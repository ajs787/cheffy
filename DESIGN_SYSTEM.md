# Cheffy — Design System

Tokens live in `src/theme/`. Components never hardcode a color, size or spacing
value; they read tokens.

## Personality

Editorial, warm, photography-first. Think a well-designed cookbook rather than a
dashboard: paper-toned background, a serif for names and numbers, quiet UI chrome,
and the food photo doing the talking. One accent color, used sparingly.

What we avoid: gradients, glass, heavy shadows, giant rounded cards, emoji as UI,
decorative motion.

## Color

| Token | Value | Use | Contrast on background |
| --- | --- | --- | --- |
| `background` | `#FAF9F6` | app background (warm paper) | — |
| `surface` | `#FFFFFF` | sheets, inputs, cards | — |
| `surfaceMuted` | `#F3F1EC` | chips, skeletons, image placeholders | — |
| `text` | `#222222` | primary text | 15.1 |
| `textSecondary` | `#6F6B66` | metadata, captions | 5.0 (spec `#777` was 4.25 — darkened for AA) |
| `textTertiary` | `#8A817A` | placeholders, disabled | 3.6 (non-essential only) |
| `accent` | `#D95D47` | brand terracotta: liked heart, Create button, focus | 3.6 (icons / large only) |
| `accentStrong` | `#BE4B36` | primary button background, accent text | 4.7; white text on it 4.9 |
| `accentSoft` | `#FBEAE6` | selected chip background | — |
| `sage` | `#82947B` | secondary accent (decorative) | — |
| `sageStrong` | `#5F7259` | sage text | 4.9 |
| `sageSoft` | `#EDF0EA` | sage backgrounds | — |
| `border` | `#E9E6E1` | hairlines, input borders | — |
| `borderStrong` | `#D9D4CC` | pressed / focused borders | — |
| `danger` | `#B3261E` | destructive actions, errors | 6.3 |

Category identity (small dots and icons, never large fills): Cooking `#D95D47`,
Baking `#C8913A`, Drinks `#82947B`, unknown categories fall back to `sage`.

Rating tiers (number color): ≥ 8.0 `#3D7A50` · 6.0–7.9 `#97701F` · < 6.0 `#8A817A`.

The app ships light-only for v1 (`userInterfaceStyle: light`) — the warm paper
palette is the brand. Tokens are structured so a dark palette can be added later.

## Typography

Two families:

- **Fraunces** (serif, display): dish names, screen titles, the rating number.
- **Inter** (sans): everything else.

| Variant | Family / weight | Size / line | Use |
| --- | --- | --- | --- |
| `display` | Fraunces 600 | 34 / 40 | screen titles (Home, Rankings) |
| `title1` | Fraunces 600 | 26 / 32 | profile name, post detail title |
| `title2` | Fraunces 600 | 20 / 26 | post card title, section headers |
| `title3` | Inter 600 | 17 / 22 | list titles, sheet titles |
| `body` | Inter 400 | 15 / 22 | reviews, paragraphs |
| `bodyStrong` | Inter 600 | 15 / 22 | usernames, emphasis |
| `callout` | Inter 400 | 14 / 20 | secondary lines |
| `caption` | Inter 500 | 12 / 16 | timestamps, counts |
| `overline` | Inter 600 | 11 / 14, +0.8 tracking, uppercase | section labels |
| `button` | Inter 600 | 16 / 20 | buttons |
| `rating` | Fraunces 600 | 72 / 76, tabular | rating input |

Text supports Dynamic Type up to 1.3× (`maxFontSizeMultiplier`), keeping layouts
intact.

## Spacing

4-pt scale: `xxs 2 · xs 4 · sm 8 · md 12 · lg 16 · xl 20 · xxl 24 · xxxl 32 · huge 48`.
Screen gutter is `lg` (16). Sections are separated by `xxl`–`xxxl`.

## Radii

`xs 4 · sm 8 · md 12 · lg 16 · pill 999`. Photos use `md`; chips and avatars use
`pill`; sheets use `lg` on top corners. Cards are flat (hairline + no shadow) —
we don't use giant rounded cards.

## Elevation

One shadow (`shadow.sm`) for floating things only: the Create button, toasts,
sheets. Everything else is separated by hairlines and whitespace.

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
| `AppHeader` | title, back button, right actions; large-title variant |
| `Avatar` | image or initials on a tinted circle; sizes xs–xl |
| `FoodImage` | expo-image with placeholder tint, fade-in, `cacheKey` |
| `RatingDisplay` | tier-colored number; `badge` / `inline` / `large` |
| `RatingInput` | big number + slider + ±0.1 steppers + exact entry |
| `Chip` / `CategoryChip` / `TagChip` | selectable, removable |
| `SegmentedControl` | tabs inside screens (Diary / Rankings / Collections) |
| `EmptyState` / `ErrorState` | icon, title, message, action |
| `Skeleton` (`LoadingSkeleton`) | shimmering blocks matching real layouts |
| `BottomSheet` | modal sheet with drag-to-dismiss |
| `ConfirmationDialog` | sheet-styled confirm for destructive actions |
| `Toast` | transient feedback |

`src/components/shared` (composed, app-aware): `PostCard`, `ImageCarousel`,
`PostGrid`, `RankingRow`, `UserRow`, `CommentRow`, `TabBar`, `ScreenState`.
