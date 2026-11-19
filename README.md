# Armory Minna: Vercel setup

```
Armory Minna (root)/
  index.html              the tool (was armory-report-maker.html)
  heroes.csv              the list you edit
  heroes.json             generated, commit this
  tools/build-library.mjs
  Assets/
    Adult/                adult hero art
    Young/                young hero art
    Hero-BG/              backgrounds
```

## Adding or changing heroes
1. Drop the image into Assets/Adult, Assets/Young or Assets/Hero-BG.
2. Add or edit the row in heroes.csv (file name only, no folder).
3. Run `node tools/build-library.mjs` (add `--strict` to fail on missing images).
4. Commit and push. Vercel redeploys.

## Deploying
Import the repo in Vercel. Framework preset: Other. No build command, no output directory.
Vercel serves the folder as-is.

## Notes
- File names are case-sensitive on Vercel. The script writes the real on-disk spelling into heroes.json.
- All images load when the page opens. Keep each one under ~300 KB (WebP, about 1400 px wide).
- When heroes.json loads, it replaces any library saved in the visitor's browser.
- Opening index.html straight from disk (file://) still works the old way: load the CSV and images by hand.
"# Armory-Report-Maker" 
