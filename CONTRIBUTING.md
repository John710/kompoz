# Contributing to Kompoz

Thank you for your interest in improving Kompoz!

## Translations

Kompoz UI translations are stored as JSON files in the `locales/` directory.

- `locales/en.json` — English (source)
- `locales/ru.json` — Russian

Each locale file must contain a `_meta` object with the native language display name:

```json
{
  "_meta": {
    "name": "Deutsch"
  },
  ...
}
```

### Adding a new language

1. Copy `locales/en.json` to `locales/<lang>.json` (use a two-letter ISO 639-1 code, e.g. `de`, `fr`, `es`).
2. Fill in the `_meta` object with the native language name.
3. Translate all string values. Keep keys and placeholders (`{placeholder}`) unchanged.
4. Open a Pull Request with your translation.

The language will appear automatically in the UI language switcher — no HTML or JS changes required.

### Updating an existing translation

1. Edit the corresponding `locales/<lang>.json` file.
2. Open a Pull Request describing what you changed.

## Code contributions

- Keep changes minimal and focused.
- Follow the existing code style.
- Test your changes locally before submitting.

## Questions?

Feel free to open an issue if you have questions or suggestions.
