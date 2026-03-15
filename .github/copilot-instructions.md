# Copilot Instructions

## Layout: Content Card Containers

Content pages (settings, portrait, compendium, etc. — **not** character cards) must wrap their cards in a centered, max-width container:

```
<div className="max-w-7xl mx-auto w-full">
  <Card>...</Card>
</div>
```

- Container: `max-w-7xl mx-auto w-full`
- Cards: `w-full` (fill the container)
- This ensures consistent centering and responsive sizing across all content pages.

Do **not** apply this pattern to character cards or the sidebar.
