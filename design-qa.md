# STANDBY deployment/source design QA

## Comparison target

- Source visual truth: `https://standby-junctionx.vercel.app/`
- Source captures:
  - `qa/production-input-desktop.jpg`
  - `qa/production-workspace-e3-desktop.jpg`
  - `qa/production-input-mobile.jpg`
- Local implementation: `app/`, served from the copied source without code changes
- Local captures:
  - `qa/local-input-desktop.jpg`
  - `qa/local-workspace-e3-desktop.jpg`
  - `qa/local-input-mobile.jpg`
- Combined comparison: `qa/side-by-side-comparison.jpg` and `qa/compare.html`

## Capture normalization

- Desktop browser viewport override: 1440 × 900 CSS px
- Desktop captured pixels: 1170 × 900 at 1× density on both source and local
- Mobile viewport and captured pixels: 390 × 844 at 1× density on both source and local
- Theme: dark
- States: input screen, workspace with the E3 finding open, and mobile input screen
- Browser console: no errors or warnings observed on the local implementation

## Findings

- No actionable P0, P1, or P2 fidelity difference was found between the deployed source and local implementation.
- Fonts and typography: the same Inter, JetBrains Mono, and Noto Sans KR declarations, weights, hierarchy, wrapping, and labels are visible.
- Spacing and layout rhythm: panel tracks, borders, zero-radius treatment, timeline density, and evidence layout match.
- Colors and visual tokens: background, border, verdict colors, cyan person marks, and amber prop marks match.
- Image and asset fidelity: the product UI contains no photographic or illustrative assets. The same library icons and CSS-rendered entity marks are present.
- Copy and content: source labels, fixture names, hashes, E3 calculation, evidence text, and verdict labels match.
- The mobile captures are byte-identical. Desktop JPEGs differ at capture level, but the side-by-side visual comparison and DOM/bundle checks show no material rendered difference.
- The production JavaScript bundle is byte-identical to the current local build JavaScript after content-hash filename normalization. The production CSS contains additional unused Tailwind selectors, while all selectors used by the local build are present.

## Focused comparison

The desktop E3 capture keeps the calculation (`AVAILABLE 58–62s` versus `REQUIRED 66–68s`), all three evidence blocks, the action button, and the event timeline readable in one view. No additional crop was required.

## Primary interactions tested

1. Input screen → `Upstage 추출 시작` → workspace navigation.
2. E3 event card → violation evidence popup.
3. `이 위치로 이동` → `R3:환복시간` cell.
4. `58s` → `70s` → save.
5. E3 verdict changes from `VIOLATION` to `CONSISTENT`.

## Comparison history

- Pass 1: no P0/P1/P2 reproduction mismatch found; no visual fix was required.
- Known source limitation: the 390 px layout preserves the production site's horizontal desktop composition rather than reflowing. This is intentionally unchanged in this source-preservation task and should be addressed as a separate responsive-design change.

## Verification

- `npm ci`: passed
- `npm run typecheck`: passed
- `npm run build`: passed
- Local browser console errors: none

final result: passed
