# Claude Prompt — Dukaan Saathi UI Design System

You are a senior product designer and frontend engineer. Design a polished, production-quality UI for **Dukaan Saathi**, a friendly, trustworthy business companion for shopkeepers. Apply the brand system below consistently across the mobile app and web admin panel.

## Brand positioning
- Brand promise: “Har Dukaan Ka Saathi”
- Personality: trustworthy, practical, friendly, modern, growth-oriented, inclusive.
- Visual direction: clean and premium, light surfaces, confident forest-green brand color, bright green for primary actions, ample whitespace, clear hierarchy. Avoid loud gradients, clutter, excessive shadows, or a generic template look.

## Official assets
Use the supplied assets instead of redrawing the logo:
- `logo-horizontal.svg` — main horizontal logo for website headers and desktop admin.
- `logo-stacked.svg` — centered/splash or narrow spaces.
- `app-icon.svg` / `app-icon-512.png` — app icon.
- `icon-transparent.svg` — icon-only mark.
- `logo-monochrome.svg` — single-color use.
- `logo-dark-background.svg` — logo for dark surfaces.
Keep the logo's aspect ratio. Do not recolor, distort, add effects, or recreate the icon with text/CSS.

## Color tokens
Use these values as the source of truth:
- Primary forest green: `#0F3D2E`
- Primary hover: `#0B3024`
- Action green: `#22C55E`
- Dark green: `#16A34A`
- Light green: `#A7F3D0`
- Pale green background: `#F0FDF4`
- Main text: `#1F2937`
- Secondary text: `#6B7280`
- Muted text: `#9CA3AF`
- Border: `#E5E7EB`
- Page background: `#F8FAFC`
- Card/surface: `#FFFFFF`
- Success: `#15803D`, background `#DCFCE7`
- Warning: text `#B45309`, background `#FEF3C7`
- Error: `#B91C1C`, background `#FEE2E2`
- Info: `#1D4ED8`, background `#DBEAFE`
- Optional promotional accents only: yellow `#FACC15`, orange `#FB923C`

Import `design-tokens.css` where CSS is used. For Tailwind, map these exact values into the theme configuration instead of introducing a second palette. Keep semantic status colors distinct from brand colors.

## Typography and shape
- Use Inter if available; otherwise use a highly legible system sans-serif.
- Use font weights 400, 500, 600, and 700.
- Use an 8px spacing rhythm.
- Corner radii: 8px small, 12px medium, 16px cards, 24px hero/promo panels.
- Use subtle elevation only: `0 2px 10px rgba(15, 61, 46, 0.06)`.
- Ensure accessible contrast and visible keyboard focus.

## Mobile app UI
Design for small Android/iOS screens first, then scale up:
- Onboarding / welcome and authentication
- Home dashboard with a clear greeting and key daily actions
- Product and inventory list, search, category filters, low-stock state
- Add/edit product form with validation states
- Orders and order details
- Customer list and customer details
- Sales/analytics summaries and charts
- Notifications, profile, settings, empty states, loading states, and error states
- Bottom navigation with a small, consistent set of primary destinations
Use forest green for navigation/brand anchors, bright green sparingly for primary CTAs and positive trends, white cards on a very light neutral background, and pale green only for supportive highlights.

## Web admin panel
Create a responsive desktop-first admin experience with:
- Left sidebar and top navigation
- Overview dashboard with KPI cards, sales/order charts, recent orders, low-stock alerts
- Products, categories, inventory, orders, customers, reports/analytics, staff/roles, settings
- Tables with useful filters, pagination, bulk actions, sorting, and clear empty/loading/error states
- Forms with labels, help text, inline validation, save/cancel actions
- Responsive sidebar behavior on tablet and mobile
Keep the admin panel data-dense but calm. Do not use green for every card; use neutral surfaces and reserve green for active navigation, key actions, and meaningful positive states.

## Interaction and accessibility
- Use consistent primary, secondary, ghost, and destructive button variants.
- Include hover, pressed, disabled, loading, focus, success, warning, and error states.
- Minimum comfortable touch target: 44×44px.
- Do not communicate status through color alone; pair colors with text and/or icons.
- Use accessible labels, keyboard navigation, responsive layouts, and WCAG-aware contrast.
- Charts must use clear labels and should not rely on green alone to distinguish series.

## Implementation constraints
Before editing an existing codebase, inspect the project structure, framework, current routes, API/service layer, authentication, state management, and reusable components. Preserve all existing business logic, API endpoints, request/response handling, validation, event handlers, routing, and authentication unless I explicitly authorize changes. Make UI changes in small, testable steps. Do not replace working integrations with mock data. If backend data is not yet available, use clearly isolated mock data and mark it for later replacement.

## Deliverables
1. A shared design-token file and reusable components.
2. Responsive mobile app screens and web admin panel.
3. A consistent component system for buttons, inputs, cards, badges, tables, dialogs, navigation, and feedback states.
4. Responsive behavior at phone, tablet, laptop, and wide desktop breakpoints.
5. A concise summary of changed files, design decisions, and any remaining assumptions.
6. Test for layout overflow, empty/error/loading states, keyboard focus, and contrast.

First inspect the repository and tell me the framework and existing architecture you found. Then propose the implementation plan, and proceed without changing existing backend logic.
