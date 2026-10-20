# Cheffy — Product Spec

> Everything you make deserves to be remembered.

Cheffy is a social food diary for things people make themselves. You photograph what
you cooked, baked, or poured, rate it 0–10, write a few words, and it joins your
personal ranking. Friends see it in their feed, react, and get ideas for what to make
next.

## Core loop

MAKE → PHOTOGRAPH → RATE → REVIEW → POST → RANK → SHARE

The whole product is built around making step 2–5 fast (a basic post in ~30 seconds)
and making steps 6–7 rewarding (your ranking grows, friends react).

## Who it's for

- Home cooks, bakers and drink-makers who already photograph what they make.
- Small friend groups who want to see and react to each other's cooking. The launch
  scenario is two friends on two iPhones.

## Primary categories

Three equal top-level categories: **Cooking**, **Baking**, **Drinks**. Classification is
an extensible taxonomy, not a fixed hierarchy. A post carries:

| Dimension     | Example                               | Notes                                  |
| ------------- | ------------------------------------- | -------------------------------------- |
| Primary       | Drinks                                | Required                               |
| Subcategory   | Matcha                                | Belongs to a primary                   |
| Cuisine       | Korean                                | Global; most useful for Cooking        |
| Meal type     | Lunch                                 | Global                                 |
| Dish type     | Rice                                  | Global                                 |
| Tags          | iced, oat milk, strawberry            | Free-form, many per post               |

New categories are rows in the database; the UI renders whatever the taxonomy returns.

## Feature set (MVP)

### Accounts
- Email sign-up / sign-in, password reset, persistent sessions, sign-out.
- Profile onboarding: username, display name, optional photo and bio.
- Account deletion (App Store requirement), terms + community guidelines acceptance.

### Create (the most important screen)
- Required: name, primary category, rating (0.0–10.0, one decimal).
- Optional: up to 6 photos (reorder, remove, cover), review (the short take), a
  **story** (long-form write-up, like a post body: backstory, process, what went
  wrong), subcategory, cuisine,
  meal type, dish type, tags, date made, would make again, visibility.
- Drinks: hot/iced, milk, sweetener. Cooking/Baking: cook time, ingredients, recipe
  URL, notes for next time. All: preparation notes.
- Save as draft, publish, edit, delete, change visibility.
- Visibility: Public, Followers, Only me — enforced in the database.

### Home feed
- Posts from people you follow (and your own), newest first, cursor paginated.
- Post card: author, date, name, category, photo carousel, rating, review, tags,
  like / comment / save.
- Optimistic like/save; pull to refresh; infinite scroll.
- Empty state that sends you to find friends — never filler content.

### Rankings
- Your ranked list of everything you've made, derived from ratings (no stored rank).
- Filter by primary category, plus cuisine / subcategory / meal type / tag.
- Sort by highest, lowest, most recent, oldest. Rank number is always the
  rating rank within the current filter.
- Deterministic tie-break: rating ↓, date made ↓, created ↓, id ↓.
- Browse a friend's rankings (only posts you're allowed to see).

### Discover
- Search people, creations (name, category, cuisine, tag) and tags.
- Sections built only from real data: from people you follow, top rated recently,
  most liked recently, trending subcategories/tags, home cooks to follow.
  A section with no data is hidden.

### Profiles
- Photo, name, username, bio, follower/following counts, total + per-category counts.
- Tabs: Diary (photo grid, category filter), Rankings, Collections.
- Follow/unfollow, followers/following lists, edit profile.

### Collections & saved
- Named lists of posts (yours or others'), public or private.
- Saved posts ("want to try") are private to you.

### Safety
- Block (hides content both ways, removes follows), report users/posts/comments.
- Blocked users list with unblock.

## Explicit non-goals for MVP (architected for later)
1. Comparative ranking ("Was this better than your Matcha Cheesecake?")
2. Collaborative posts with two credited cooks and independent ratings
3. Cooking progress across repeated attempts of the same dish
4. Personalized recommendations
5. Cooking statistics
6. Push notifications

See ARCHITECTURE.md §Future for how each one fits.

## Two-device acceptance test

The MVP is done when this works on real Supabase data across two iPhones:

1. A signs up, creates a profile, posts homemade matcha rated 9.2.
2. B signs up, finds A, follows A, sees the matcha post, likes and comments.
3. A sees the like count and reads the comment, visits B's profile, browses B's
   public posts and rankings.
4. Both sign out and back in; data persists; neither can edit or delete the other's
   posts.

Step-by-step instructions live in `docs/ACCEPTANCE_TEST.md`.
