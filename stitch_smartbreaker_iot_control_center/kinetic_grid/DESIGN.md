---
name: Kinetic Grid
colors:
  surface: '#10131d'
  surface-dim: '#10131d'
  surface-bright: '#363944'
  surface-container-lowest: '#0b0e17'
  surface-container-low: '#181b25'
  surface-container: '#1c1f29'
  surface-container-high: '#272a34'
  surface-container-highest: '#31343f'
  on-surface: '#e0e2f0'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e0e2f0'
  inverse-on-surface: '#2d303b'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#45dfa4'
  on-secondary: '#003825'
  secondary-container: '#00bd85'
  on-secondary-container: '#00452e'
  tertiary: '#ffb3ad'
  on-tertiary: '#68000a'
  tertiary-container: '#ff5451'
  on-tertiary-container: '#5c0008'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#68fcbf'
  secondary-fixed-dim: '#45dfa4'
  on-secondary-fixed: '#002114'
  on-secondary-fixed-variant: '#005137'
  tertiary-fixed: '#ffdad7'
  tertiary-fixed-dim: '#ffb3ad'
  on-tertiary-fixed: '#410004'
  on-tertiary-fixed-variant: '#930013'
  background: '#10131d'
  on-background: '#e0e2f0'
  surface-variant: '#31343f'
typography:
  display-lg:
    fontFamily: JetBrains Mono
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  data-point:
    fontFamily: JetBrains Mono
    fontSize: 18px
    fontWeight: '500'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  mono-log:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 8px
  gap: 12px
  padding-card: 16px
  margin-page: 24px
  inner-element: 4px
---

## Brand & Style
The design system is engineered for high-stakes industrial monitoring, prioritizing cognitive clarity and rapid error detection. The brand personality is clinical, precise, and authoritative, drawing inspiration from modern aerospace control rooms and advanced SCADA systems.

The aesthetic follows a **Modern Industrial** approach:
- **Functional Minimalism:** Every pixel serves a data-driven purpose.
- **High-Contrast Signaling:** Neutral backgrounds allow status-specific colors to pop immediately.
- **Technical Precision:** Use of monospaced data points and sharp geometry to convey mechanical reliability.
- **Dense Information Architecture:** Maximizing screen real estate for telemetry without sacrificing legibility.

## Colors
The palette is optimized for dark-mode environments to reduce eye strain during extended monitoring shifts.

- **Backgrounds:** Use `#0F1117` for the base canvas. Use `#1A1D27` for elevated containers (cards, sidebars).
- **Functional Semantic Colors:**
    - **Success/Normal (#34D399):** Indicates "Active," "Safe," or "Flowing."
    - **Error/Alarm (#EF4444):** Indicates "Breaker Tripped," "Failure," or "Stop."
    - **Warning/Countdown (#F59E0B):** Indicates transient states or non-critical maintenance needs.
    - **Tier-1 Critical (#F97316):** High-priority alerts that require immediate operator attention.
- **Borders:** Use `#2A2D3A` for structural divisions. It should be subtle enough to recede, letting the data take center stage.

## Typography
The typography system uses a dual-font strategy to separate UI navigation from telemetry data.

- **UI Elements (Inter):** Used for navigation, headings, and descriptive text. Its humanist qualities ensure legibility in high-density layouts.
- **Data & Readouts (JetBrains Mono):** Used for all numerical values, logs, and logical operators. The monospaced nature ensures that columns of numbers align perfectly, allowing operators to scan for fluctuations quickly.
- **Hierarchy:** Use `label-caps` for table headers and section titles to create a clear structural anchor.

## Layout & Spacing
This design system utilizes a **Strict 8px Grid** to maintain industrial alignment.

- **Grid Model:** Use a 12-column fluid grid for dashboard layouts. On mobile, reflow to a single-column stack.
- **Component Gaps:** Maintain a consistent 12px gap between cards and interactive elements to preserve white space in data-heavy views.
- **Container Padding:** Standard cards use 16px internal padding. Dense data tables may drop to 8px horizontal padding for maximum visibility.
- **Logical Grouping:** Elements related to the same breaker or sensor should be grouped with 4px spacing to indicate a single functional unit.

## Elevation & Depth
In an industrial context, elevation is used sparingly to imply focus rather than aesthetic depth.

- **Base Layer:** The darkest tone (#0F1117) represents the "void" or "rack."
- **Component Layer:** Cards use #1A1D27 with a 1px border (#2A2D3A). No shadows should be used for standard cards to maintain a flat, technical look.
- **Active State:** Use a subtle outer glow (0px 0px 8px) using the primary blue or status green only when a breaker is selected or "Live."
- **Overlays:** Modals and dropdowns use a slightly lighter surface (#242835) with a 4px soft shadow to distinguish them from the static dashboard.

## Shapes
The shape language is primarily **Soft-Industrial**.

- **Containers:** Cards and input fields use a `0.25rem` (4px) radius to maintain a professional, rigid appearance.
- **Status Badges:** Use "Pill" shapes (full-radius) to differentiate status indicators from structural UI elements.
- **Flow Lines:** In diagrammatic views, use 2px solid lines for active power flow and 2px dashed lines for standby or inactive circuits.

## Components
- **Breaker Cards:** Must feature a prominent status dot in the top-right. Active breakers use a solid 1px border; inactive or manual-override breakers use a dashed border.
- **Digital Readouts:** Numbers should be rendered in JetBrains Mono, 1.5x larger than labels. Use "Amber" for countdowns or transient timer states.
- **Pill Badges:** Backgrounds should be 15% opacity of the status color with a 100% opacity text color for maximum readability without visual overwhelm.
- **Control Buttons:** Use "Ghost" style for secondary actions. Primary actions (ON/OFF) should be full-bleed colored blocks with white text for high contrast.
- **Data Tables:** Use alternating row highlights (zebra striping) at 5% opacity. Highlight "IF/THEN" logic keywords in Purple (#8B5CF6).
- **Status Dots:** Small 8px circles. Use a "pulse" animation for active alarms or critical tier-1 warnings.