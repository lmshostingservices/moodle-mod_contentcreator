# Mobile-First Design Principles for AI Content Creator

**Version:** 1.0.0  
**Updated:** 2026-01-08  
**Standard:** WCAG 2.2 Level AA Compliance

---

## Core Mobile-First Principles

### 1. Base CSS = Mobile First
Write default styles for mobile screens. Add complexity for larger screens using `min-width` queries.

```css
/* CORRECT - Mobile First */
.grid {
  grid-template-columns: 1fr;  /* Mobile: single column */
}

@media (min-width: 640px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);  /* Tablet: 2 columns */
  }
}

@media (min-width: 1024px) {
  .grid {
    grid-template-columns: repeat(3, 1fr);  /* Desktop: 3 columns */
  }
}

/* WRONG - Desktop First */
.grid {
  grid-template-columns: repeat(3, 1fr);  /* Desktop as default */
}

@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;  /* Override for mobile */
  }
}
```

### 2. Progressive Enhancement
Start with essential functionality, enhance for larger screens:
- Mobile: Core content, vertical stacking
- Tablet: Side-by-side layouts, enhanced navigation
- Desktop: Full features, multi-column layouts

---

## Typography Standards (WCAG 2.2)

### Minimum Font Sizes

| Element | Minimum | Recommended | Notes |
|---------|---------|-------------|-------|
| **Body text** | 16px (1rem) | 16-18px | iOS auto-zooms inputs under 16px |
| **Labels/Captions** | 12px (0.75rem) | 12-14px | WCAG requires contrast 4.5:1 |
| **Form inputs** | 16px (1rem) | 16px | **CRITICAL** - prevents iOS zoom |
| **Buttons** | 14px (0.875rem) | 16px | Readable at arm's length |
| **Small text** | 12px (0.75rem) | 13-14px | Use sparingly |

### Forbidden Sizes
```css
/* NEVER USE - Too small for accessibility */
font-size: 0.6rem;    /* 9.6px - FORBIDDEN */
font-size: 0.65rem;   /* 10.4px - FORBIDDEN */
font-size: 0.6875rem; /* 11px - BORDERLINE, prefer 0.75rem */
font-size: 10px;      /* FORBIDDEN */
font-size: 11px;      /* BORDERLINE */
```

### Line Height
- Minimum: 1.5 for body text
- Headings: 1.2-1.3
- Compact UI: 1.4 minimum

---

## Touch Target Standards (WCAG 2.5.8)

### Minimum Target Sizes

| Standard | Size | Use Case |
|----------|------|----------|
| **WCAG 2.5.8 AA** | 24×24px | Absolute minimum |
| **Apple HIG** | 44×44px | iOS recommended |
| **Material Design** | 48×48px | Android recommended |
| **Best Practice** | 48×48px | Optimal for all devices |

### Implementation
```css
/* Touch-friendly interactive elements */
.cc5-btn,
.cc5-card-clickable,
.cc5-nav-item {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 16px;
}

/* Spacing between touch targets */
.cc5-button-group {
  gap: 8px;  /* Minimum 8px between targets */
}
```

### Icon Buttons
```css
/* Icon-only buttons need full touch target */
.cc5-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 48px;
  min-height: 48px;
}

.cc5-icon-btn svg {
  width: 24px;   /* Visual icon size */
  height: 24px;  /* Touch target is still 48px */
}
```

---

## Breakpoint System

Use consistent, mobile-first breakpoints:

```css
/* Base: Mobile (0-479px) - No media query */

/* Small tablets (480px+) */
@media (min-width: 480px) { }

/* Tablets (640px+) */
@media (min-width: 640px) { }

/* Large tablets / Small laptops (768px+) */
@media (min-width: 768px) { }

/* Laptops (1024px+) */
@media (min-width: 1024px) { }

/* Desktops (1280px+) */
@media (min-width: 1280px) { }
```

### Layout Progression
```css
/* Example: Card grid */
.cc5-card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media (min-width: 640px) {
  .cc5-card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .cc5-card-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
```

---

## Units Best Practices

### Use Relative Units
```css
/* CORRECT */
font-size: 1rem;      /* Relative to root */
padding: 1.5rem;      /* Scales with user preferences */
margin: 0.5em;        /* Relative to current font-size */

/* AVOID for typography */
font-size: 14px;      /* Fixed, ignores user preferences */
```

### When to Use Pixels
- Borders: `border: 1px solid`
- Box shadows: `box-shadow: 0 2px 4px`
- Precise decorative elements
- Icons (with adequate touch target padding)

---

## Content Hierarchy

### Vertical Stacking (Mobile Default)
```css
.cc5-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
```

### Horizontal Layout (Larger Screens)
```css
@media (min-width: 768px) {
  .cc5-section {
    flex-direction: row;
    align-items: flex-start;
  }
}
```

---

## Contrast Requirements (WCAG 2.2)

| Text Type | Minimum Ratio |
|-----------|---------------|
| Normal text (<24px) | 4.5:1 |
| Large text (≥24px or ≥18.66px bold) | 3:1 |
| UI components & graphics | 3:1 |

---

## Testing Checklist

Before each release, verify:

- [ ] All grids use `1fr` as base, multi-column via `min-width`
- [ ] No `@media (max-width:)` for adding features
- [ ] Body text ≥ 16px (1rem)
- [ ] Labels ≥ 12px (0.75rem)
- [ ] Touch targets ≥ 48px
- [ ] 8px+ spacing between touch targets
- [ ] Test at 200% browser zoom
- [ ] Test on actual mobile devices
- [ ] Contrast ratios pass WCAG AA

---

## Quick Reference

### Forbidden Patterns
```css
/* NEVER DO THIS */
@media (max-width: 768px) { ... }  /* Desktop-first */
font-size: 0.6rem;                  /* Too small */
min-height: 32px;                   /* Touch target too small */
grid-template-columns: repeat(3, 1fr);  /* Multi-column as default */
```

### Correct Patterns
```css
/* ALWAYS DO THIS */
@media (min-width: 768px) { ... }  /* Mobile-first */
font-size: 0.75rem;                 /* Minimum readable */
min-height: 48px;                   /* Touch-friendly */
grid-template-columns: 1fr;         /* Single column default */
```

---

## References

- [WCAG 2.2 Guidelines](https://www.w3.org/TR/WCAG22/)
- [MDN Responsive Design](https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Material Design 3](https://m3.material.io/)
