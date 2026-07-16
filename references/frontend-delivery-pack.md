# Frontend UI/Browser Delivery Pack

Use this pack when a slice changes user-visible UI, client routing, browser state, interaction behavior, accessibility-sensitive markup, visual states, or screenshot-worthy layout.

## Triggers

- `src/app/`, `app/`, `pages/`, `components/`, `ui/`, `styles/`, `public/`, or frontend route files changed.
- The slice outcome mentions UI, browser, screen, form, navigation, loading, empty, error, success, streaming, screenshot, responsive, or accessibility behavior.
- The project profile names React, Next.js, Vue, Svelte, Remix, Vite, Tailwind, shadcn, Playwright, Cypress, Storybook, or a browser QA route.

## Minimum Gate

Pick the smallest evidence that would fail if the changed visible behavior broke:

- component/unit evidence for isolated component logic;
- browser or screenshot evidence for layout, routing, real interaction, streaming, or responsive claims;
- accessibility check when forms, keyboard flow, semantics, contrast, or navigation changed.

## Evidence Boundary

- Use `verified-component` for component-only UI proof.
- Use `verified-browser` only after real browser, screenshot, or DOM/runtime evidence.
- Do not claim browser verification from static inspection, typecheck, or unit tests.

## Acceptance Scenario Shape

```text
Given a user is on <screen/route/state>
When they perform <interaction or load condition>
Then they can see <expected visible result or actionable failure state>
Evidence: <component/browser/screenshot command>
```

