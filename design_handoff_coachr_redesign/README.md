# Handoff: Coachr Mobile Redesign

Target repo: `shayanvalaie/coachr-mobile` (main). React Native + Expo, react-navigation, reanimated, react-native-sortables. Theme lives in `src/theme/{colors,tokens,typography}.ts`.

## Overview
A visual and structural refresh of the whole app: sign-in, first-run setup wizard, Home, Roster, Lineup, Calendar, Rules, Leagues, Profile, Pro paywall, and the tab bar. The palette (forestDark), type (Avenir Next), and every flow are unchanged. What changes: one consistent header pattern, one amber action per screen, flatter surfaces with very subtle depth, glass chrome, a floating tab bar, and a rethought Home and setup wizard.

## About the design files
`Coachr Redesign v2.dc.html` (+ `ios-frame.jsx`, `support.js`) is an HTML **design reference**, not code to ship. Recreate it in the existing RN codebase using the existing `ui/` components (`AppText`, `Button`, `Card`, `Input`, `Chip`, `Sheet`, `MetricTile`, `EmptyState`, `Reveal`, `LoadTransition`) and theme tokens. Where a token needs to change, change the token, not the screen. `Coachr Redesign.dc.html` is v1 (before the depth pass) and can be ignored; `Rules Step Redesign.dc.html` and `Button Options.dc.html` are exploration sheets.

## Fidelity
**High-fidelity.** Colors, spacing, radii, and copy are final. Font sizes in the HTML are 1–2px larger than the app's `type` scale to compensate for the web fallback font; on device, keep the existing scale (caption 11, body 13, bodyLg 15, title 18, display 26) and map as noted below.

---

## Global changes

### Header pattern (all screens)
Replace `Header` (COACHR wordmark bar) and `ScreenHeader` with one pattern, inline in the scroll content, no background bar:
- Eyebrow: caption, heading family, `accent.base`, uppercase, letter-spacing 1.4. Usually the section name ("Roster", "Lineup") or context ("Thursday, Sep 3", "Next game · Sun, Sep 13").
- Title: display, display family, letter-spacing −0.2. Content-first: team name on Home ("Ridgeline Coed"), count on Roster ("12 players"), month on Calendar ("September").
- Optional right slot: one or two 40×40 glass icon buttons (see Glass).
- Gap eyebrow→title 4, block padding top `space.xs`.

### Surfaces
Update `theme.border.subtle` usage and Card:
- **Card (raised)**: bg `bg.raised` `#183129`, border 1px `rgba(246,241,231,0.06)`, radius `radius.lg` 16 (list groups) or `radius.xl` 20 (hero), shadow `0 1px 6px rgba(4,18,11,0.18)` (iOS: shadowOpacity .18, radius 6, offset 0/1; Android elevation 1). No inner border stroke.
- **Hero / elevated**: glass (below) instead of `bg.elevated`.
- **Recessed inputs**: bg `rgba(6,14,11,0.3)`, border 1px `rgba(246,241,231,0.10)`, radius `radius.md`/`lg`, inset shadow not reproducible on RN — skip it, the darker fill is enough.
- **Screen background**: `bg.base` `#0f1f18` with a very soft radial glow top-left (`#183328` → base over ~55% height) and a fainter one bottom-right (`#132820`). Use `expo-linear-gradient` with two absolutely positioned gradients at low alpha, or skip on Android if it costs frames.
- **Grain**: 3% opacity noise overlay was used in the mock. Optional; skip unless cheap (a tiled 160px PNG at opacity 0.03, `pointerEvents="none"`).

### Glass (chrome layer only)
Applied to: tab bar container, segmented controls, icon buttons (36/40px), hero cards (Home next-game, Calendar selected-day, Profile upgrade), onboarding option rows, toast.
- bg `rgba(30,59,49,0.42)` (tab bar `0.55`), blur 14–18 (`expo-blur` `BlurView` intensity ≈ 30, tint dark), border 1px `rgba(246,241,231,0.10)`, shadow `0 4px 16px rgba(4,18,11,0.22)`.
- Content cards (lists, metrics, forms) stay solid `bg.raised` so text stays crisp.

### Primary button
Unchanged from current `Button` primary: `accent.base` fill, `text.onAccent`, radius `radius.lg` 14–16, height 52, label bodyLg heading (bold), optional 17px leading icon. **No gradient, no glow.** Press: scale 0.99 (`motion.pressScale` → 0.99), 120ms.

### Secondary button
Solid `bg.raised`, border `rgba(246,241,231,0.06)`, cream label 700. Success-tinted variant ("Edit lineup"): border `rgba(126,207,157,0.45)`, label `success.base`. Danger variant: border `rgba(239,107,91,0.4)`, label `danger.base`.

### Chips (selected / unselected)
Selected: bg `accent.subtle`, border `accent.subtleBorder`, text `accent.base`. Unselected: bg `bg.raised`, border `border.base`, text `text.secondary`. Radius pill, height 32–34, caption heading.

### Tab bar (`BottomTabBar`)
Floating glass pill, absolutely positioned at the bottom, content scrolls beneath it (add 128 bottom padding to every scroll view; `space.xl*4`).
- Outer: padding 8/14/30, background vertical gradient `transparent → rgba(15,31,24,0.85)` at 40%.
- Pill: glass (0.55), radius 18, padding 4, gap 2, no top border on the wrap.
- Tab: flex 1, minHeight 52, radius 12, icon 18 + 10px label (heading). Active: `accent.subtle` bg, `accent.subtleBorder` border, `accent.base` icon+label. Inactive: transparent, `text.secondary`.
- Icons unchanged: home, users, target, calendar, user.
- Hidden on the Pro modal and in the landscape editor (existing behavior).

### Motion
- Screen mount: opacity 0→1 + translateY 8→0, 240ms ease-out (existing `Reveal`).
- Press: scale 0.99, 120ms.
- Chip/segment state: 200ms color transition.
- Lineup generation: skeleton rows with staggered 60ms pulse, then grid rises in 300ms (existing skeleton→grid reveal in `GameSetup`).
- Toast: rises from bottom (above tab bar, bottom 110), glass cream `rgba(246,241,231,0.88)` with dark text, 2.6s.

---

## Screens

### 1. Sign in (`AuthScreen`)
Full-bleed, no card. Bottom-anchored form.
- Top half empty (ambient glow). Eyebrow "LINEUP STUDIO" (caption, secondary, letter-spacing 2.4), wordmark "COACHR" (44px display, letter-spacing 0.06em → on device: display 26 scaled to ~40, weight bold), tagline bodyLg secondary: "Fair lineups for every inning. Your rules, your roster, one tap." max width 280.
- Form: recessed inputs (email, password), 10 gap; primary "Sign in"; below: "New here? **Create an account**" (caption secondary, link in accent 600).
- Keep existing verification-code state; render it in the same recessed style.

### 2. Setup wizard (`SetupWizard`) — 4 steps, overlay
Header row: back chevron (only when step>0 or in a rules sub-mode), 4 progress bars 22×4 radius 2 (`accent.base` for index ≤ current, `border.base` otherwise — **fix: welcome is index 0, so Rules shows 2 filled, Roster 3, Ready 4**), right "Set up later" ghost (hidden on Ready).

**Welcome**: eyebrow "WELCOME TO COACHR", title "Let's get your first lineup ready" (34px→display), body "Two quick things and you're generating: your rules, then your players." Numbered list 1/2/3 in 36px accent-subtle circles: Rules / Roster / Lineup with existing detail copy. Primary "Set up my team →" pinned to bottom.

**Rules** (eyebrow "STEP 1 OF 3 · RULES"):
- Options mode, title "Which league do you play in?". Search field first (recessed, accent search icon, placeholder "Search leagues on Coachr", border turns `accent.subtleBorder` when non-empty). Results list appears inline under it (grouped card: name bodyLg heading, meta caption, right "Join" accent caption). Empty hint: "If it's on Coachr, you get its rules instantly." Divider row "NOT IN A LEAGUE?" (caption 700, `#5f7169`, hairlines either side). Two glass rows: "Create a league / Every team in it can use your rules" (plus icon) and "Write my own rules / Just your team, plain English" (edit-3 icon), 34px accent-subtle icon circle, chevron right.
- Create mode, title "Start a shared league": inputs League name, Sport + Region (side by side), League rules (textarea 120), hint "Simple rules go live instantly. Unusual ones get a custom engine built in a few minutes." Primary "Create league", disabled (raised bg, secondary text) until name ≥2, sport ≥2, rules ≥10 chars. Back chevron returns to options.
- Own mode, title "Write your rules in plain English": Sport, Rules (textarea 150), same hint, primary "Save rules", same validation minus name.
- Joining/creating/saving → toast ("Joined X." / "X is live. Your team joined." / "Rules are live.") and advance to Roster. Keep existing similar-league handling.

**Roster** (eyebrow "STEP 2 OF 3 · ROSTER"), title "Add your players", body: "Your rules need N more players." or "That's enough to generate. Add the rest whenever." Add row: input + M/W segmented toggle + amber "Add". Player chips (pill, gender dot amber/`#c96f95`, name caption heading, ×; tap removes). Dashed glass row "Import a spreadsheet / Excel or CSV with names and genders" (upload icon; Pro-gated as today). Bottom primary shows "N of 10 players" disabled until met, then "Continue".

**Ready** (eyebrow "STEP 3 OF 3 · LINEUP"), title "You're ready". Grouped card: sliders icon + rules label ("Austin Coed Softball rules" / "{League} rules" / "Your {Sport} rules") + "Ready" (success); users icon + "N players on the roster" + "Ready". Primary "⚡ Generate my first lineup" → navigates to Lineup tab and auto-generates. Ghost "I'll explore on my own".

### 3. Home (`HomeScreen`)
Gap 20. Remove metrics grid + Quick Actions card + hero card stack.
- Header: eyebrow = today's date ("Thursday, Sep 3"), title = team name. Right: 40px glass icon button (sliders) → Rules.
- **Next game card** (glass hero, radius 20, padding 20, gap 14): eyebrow "NEXT GAME · SUN, SEP 13"; title 26 display "vs Bombers"; meta body secondary "11:30 AM · Away · Krieg Complex"; readiness row (8px success dot + "12 active · ready to generate" or "N more needed" with accent dot); primary "⚡ Generate lineup". If no upcoming game: title "No game scheduled", CTA "Add a game" → Calendar.
- **Three metric tiles** (grid 3, gap 10, radius 16 raised): 24px bold value + 12px secondary label — Active players (→ Roster), Innings (→ Rules), On field (→ Rules).
- **Recent lineups**: row header "Recent lineups" bodyLg heading + "See all" accent → Lineup/Saved. Grouped card, 2 rows: name bodyLg heading, date caption, chevron. Empty: existing `EmptyState`.
- Info/tour button moves to Profile ("Replay app tour").

### 4. Roster (`RosterScreen`)
- Header: eyebrow "ROSTER", title "12 players". Right: glass upload (Import, Pro) and amber plus (Add player) 40px.
- Helper caption secondary: "Tap a chip to bench a player for the next lineup. Tap a name for positions."
- Remove metric tiles and the actions card ("Save all", "Delete all" move to a long-press / overflow menu; auto-save on blur).
- Player row (raised card, radius 16, padding 12/14): 38px avatar circle (accent subtle bg + border, initials accent 13 heading), name bodyLg heading + gender tag (10px, "F" rose `#d98bb0`/border `rgba(201,111,149,.5)`, "M" secondary), positions caption secondary ("SS · 2B" or "No preferred positions"), right chip Active/Bench (selected style when active). Benched row opacity 0.6.
- Expanded (tap identity): "PREFERRED POSITIONS" caption label, slot chips (radius 8, selected/unselected), "Lock to one position" switch row in `bg.elevated`. Save/Remove stay in the expanded footer as today.
- Keep drag-to-reorder via `Sortable.Handle` on the identity block.

### 5. Lineup (`LineupScreen`)
Sticky header block (padding 8/20/12): eyebrow "LINEUP", title "Build" / game name when a lineup exists / "Saved". Glass segmented control (radius 12, padding 4): **Generate | Saved** (Generate first; default tab = Generate when arriving with a launch request, else Saved as today).

**Generate tab** (gap 14):
- Game chips row (horizontal scroll): "No game", "Sep 13 vs Bombers", … (Pro-gated as today).
- Context row (raised card 12/14): "11 of 12 players active" bodyLg heading + "Softball · 7 innings · 10 on field" caption; right "Edit" accent → Roster (replaces PlayerPickerSheet entry; keep the sheet reachable from here if preferred).
- Primary "⚡ Generate lineup" (only when no lineup and not generating).
- Generating: raised card with spinner row "Balancing bench time across 7 innings…" + N skeleton rows (110px name bar + 7 cells, pulse 1.2s, stagger 60ms).
- Lineup grid (raised card, radius 16, no inner padding): header row 36px `rgba(246,241,231,.04)` bg, "PLAYER" 11px caption secondary letter-spacing .06em, inning numbers 12 heading centered. Rows 40px, border-bottom `rgba(246,241,231,.06)`; player cell 118 wide: 20px number badge `rgba(246,241,231,.14)` + name 13 heading ellipsis; cells 12 heading centered, position cream, bench "X" `danger.base`. Female rows bg `rgba(201,111,149,0.28)` (was .45 — lighter). Legend caption `#8a978f`: "X = benched that inning. Rose rows are women."
- Action row (3 equal): secondary "Regenerate", success-outline "Edit" (opens landscape editor), primary "Save".

**Saved tab**: history rows (raised card 14/16): name bodyLg heading, date caption, version pill (11 caption, border `border.base`, radius 6), chevron. Footer caption centered: "Long-press a lineup to delete. Export to Excel or PDF from inside."

Landscape `EditLineupOverlay`: no layout change; restyle card border/shadow to the new Card values.

### 6. Calendar (`CalendarScreen`)
- Header: eyebrow "CALENDAR", title month name. Right: two 36px glass chevrons.
- Remove the intro card, "Selected:" bar and Open Games/Today buttons. Tapping a day selects it; agenda renders below the grid.
- Weekday row S M T W T F S (11 caption `#8a978f`). Day cells 44 tall, radius 10, number 14 + 5px dot. Game day: dot `success.base`, weight 700. Today: `bg.raised` bg + `border.base`. Selected: `accent.subtle` bg, `accent.subtleBorder`, accent number and dot.
- Selected day with game → glass hero card (radius 18, padding 18): eyebrow "SUN, SEP 13", title 22 "vs Bombers", meta caption, lineup status ("1 saved lineup" success / "No lineup yet" muted), buttons: primary (flex 2) "Generate lineup" or "Open lineup", secondary "Edit". Delete via long-press or inside Edit sheet.
- Selected day without game → dashed outline card (border `border.base` dashed, radius 18): eyebrow date, "No game scheduled", accent "+ Add game" link → `GameFormSheet`.
- Multiple games on a day: stack hero cards.

### 7. Rules (`RulesScreen`) — league state
- "‹ Back" caption link (secondary). Header: eyebrow "LEAGUE RULES", title league name, subtitle "Softball · Austin, TX · 14 teams".
- Enforced grid (2×2 raised tiles, radius 16): 7 Innings / 10 On the field / 3+ Women on field / 1 Max innings benched in a row. Values 24 bold, labels 12 secondary. Drive from `RulesetSpec` (segment.count, field.playersOnField, roster.requirements, bench.maxConsecutive).
- "POSITIONS" label + slot chips (unselected style, radius 8).
- Tier card(s): "With exactly 3 women" heading + description from `describeTierWhen` + dropped slots / slotGenders.
- "COACH NOTES": recessed textarea (min 60) with existing placeholder, caption "Private to you. Not applied by the generator.", auto-save on blur (or keep "Save notes" secondary if you prefer explicit).
- Footer: secondary "Request a change" (flex 1) + danger-outline "Leave".
- Leagueless state: same header pattern with eyebrow "YOUR RULES"; keep the existing "Is your league on Coachr?" card (glass) above the Sport/Rules recessed inputs and primary "Save rules"; enforced grid below once a ruleset exists.
- `RulesetStatusBanner` stays above the grid when status ≠ active.

### 8. Leagues (`LeaguesScreen`)
- "‹ Rules" back link. Header: eyebrow "LEAGUES", title "Find yours", right amber 40px plus (New league).
- Recessed search field with search icon, placeholder "Search by name or region".
- Results in one grouped card; rows: name bodyLg heading, meta caption, optional status pill (accent subtle: "Setting up" / "In review"), chevron.
- Create form: keep existing fields, restyled recessed; header eyebrow "NEW LEAGUE", title "Start a shared league".

### 9. Profile (`ProfileScreen`)
- Header: eyebrow "PROFILE", title "Coach".
- Account row (raised): 48px avatar initials, team name bodyLg heading, email caption.
- Upgrade card (glass, border `accent.subtleBorder`): eyebrow with star "FREE PLAN" (or plan name when Pro), title 20 "Upgrade to Pro" (or "Pro Annual"), body "No ads, roster import, exports, and the full calendar. $4.99/mo or $29.99/yr." (use store prices). Tap → Subscribe.
- Grouped list: Team rules (value: league name) → Rules; Restore purchases; Replay app tour; Sign out (danger text). Admin/dev rows unchanged, appended.

### 10. Pro (`SubscriptionScreen`)
- Header: eyebrow "COACHR PRO", title 30 "Cleaner game days", right 36px glass ×.
- Benefits: 4 rows, accent check + body secondary (existing copy).
- Plan cards (radius 16, 2px border): Annual first — `bg.elevated`, "Annual" + "SAVE 50%" amber tag (10px 800 onAccent), "$29.99 per year · $2.50/mo"; Monthly — raised, "$4.99 per month". Selected: border `accent.base`, filled radio 22px with check; unselected: border `border.base`, empty radio. Default annual.
- Primary pinned to bottom, label reflects selection: "Start annual · $29.99/yr" / "Start monthly · $4.99/mo". Ghost "Restore purchases" stays. Legal caption `#8a978f` centered with underlined Terms · Privacy.

---

## State additions
- SetupWizard: `rulesMode: "options" | "create" | "own"` (drop `"league"` — search is inline in options), drafts for league name / sport / region / rules, `obCreated` for the Ready summary label.
- Lineup: default `activeTab` per launch request; grid unchanged.
- Calendar: `selectedDateKey` drives the agenda; remove `viewMode`.
- Pro: `selectedSku` for the single CTA.

## Design tokens (deltas to `src/theme`)
```ts
border.subtle = "rgba(246,241,231,0.06)"       // was .08
border.glass  = "rgba(246,241,231,0.10)"       // new
bg.glass      = "rgba(30,59,49,0.42)"          // new; tab bar uses 0.55
bg.recessed   = "rgba(6,14,11,0.30)"           // new, inputs
shadow.card   = { color:"#04120b", opacity:.18, radius:6, offset:{0,1}, elevation:1 }
shadow.glass  = { color:"#04120b", opacity:.22, radius:16, offset:{0,4}, elevation:3 }
motion.pressScale = 0.99
radius.tab = 18                                 // tab pill
```
Unchanged: `bg.base #0f1f18`, `bg.raised #183129`, `bg.elevated #1e3b31`, `text.primary #f6f1e7`, `text.secondary #c9c0ab`, `accent.base #f2a63b`, `accent.subtle rgba(242,166,59,.14)`, `accent.subtleBorder rgba(242,166,59,.4)`, `success.base #7ecf9d`, `danger.base #ef6b5b`, spacing 4/8/12/16/24/32, radii 8/12/16/20/pill. Female row tint → `rgba(201,111,149,0.28)`. Muted caption `#8a978f` ≈ `text.muted`.

Type: Avenir Next (display Bold, heading DemiBold, body Regular) as today. Eyebrows: caption heading uppercase letter-spacing 1.4. Titles: display. Metric values: display 26 → 24 bold.

## Assets
Feather icons only (already in `src/icons.ts`): home, users, target, calendar, user, search, plus, zap, chevron-left/right, check, x, edit-3, sliders, arrow-right, star, upload. No images.

## Files in this bundle
- `Coachr Redesign v2.dc.html` — the reference prototype (open in a browser; left rail jumps between screens; everything in the phone is clickable)
- `ios-frame.jsx`, `support.js` — runtime needed to open the HTML; not part of the design
- `Rules Step Redesign.dc.html` — three early directions for the wizard Rules step (1a was chosen)
- `Button Options.dc.html` — primary button exploration; the original (Avenir Next Bold, flat amber) was kept
