

# Update Agenda Header Text & Premium Liquid Glass Style

## Changes

### File: `src/pages/AgendaPage.tsx`

**1. Update header text (lines 283-284):**
- Title: "Programação da Feira" → "Agenda de Transportes"
- Subtitle: "Agenda oficial de eventos Fenasoja" → "Gestão dos deslocamentos e recepção de convidados"

**2. Apply Liquid Glass styling to the header block (lines 281-285):**
- Wrap the header area in a glass container with `backdrop-blur-xl`, translucent background (`bg-white/[0.04]`), subtle border (`border border-white/10`), rounded corners (`rounded-2xl`), and padding
- Add a subtle gradient or glow accent consistent with the existing Liquid Glass design system

**3. Update PDF header (lines 85-86):**
- Match the same text changes in the PDF generator: title → "Agenda de Transportes", subtitle → "Gestão dos deslocamentos e recepção de convidados — Fenasoja 2026"

## Technical Details

| File | Lines | Action |
|---|---|---|
| `src/pages/AgendaPage.tsx` | 281-294 | Restyle header with glass container + new text |
| `src/pages/AgendaPage.tsx` | 85-86 | Update PDF header text |

