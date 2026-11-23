# dictionary-of-colour-combinations

A JSON dataset of 348 colour combinations (of 2, 3, and 4 colours) of 159 unique colours, from the book ["A Dictionary of Colour Combinations"](https://coloursmayvary.com/products/copy-of-a-dictionary-of-colour-combinations-by-sanzo-wada) compiled by Sanzo Wada (1883 – 1967) and published by Seigensha Art.

![book](./images/print.jpg)

### Source

The data here has originally been compiled and open sourced by **Dain M. Blodorn Kim** (@dblodorn) for his interactive web version ([dblodorn/sanzo-wada](https://github.com/dblodorn/sanzo-wada/)). In this fork, I've fixed some incorrect data from the original, used a more perceptual CMYK to RGB conversion, and encapsulated the dataset as a standalone and distributed project.

### Data

See [./colors.json](./colors.json), an array of colours where each takes the following form:

```js
{
  "name": "Burnt Sienna",
  "combinations": [ 198, 242, 263, 285, 286, 297, 312, 333, 343 ],
  "swatch": 0,
  "cmyk": [ 22, 76, 100, 15 ],
  "lab": [ 46.43778133821622, 36.23346303501947, 43.7898832684825 ],
  "rgb": [ 174, 82, 36 ],
  "hex": "#ae5224"
}
```

In the book, each unique colour has:

- A name such as "Burnt Sienna" or "Rosolanc Purple"
- Combinations: which palette(s) this colour is associated with (identifiers from 1 to 348)
- CMYK values in `C% / M% / Y% / K%` from 0 to 100
- Which swatch book the colour is associated with (the 159 colours are split into 6 chapters)

The colours are already sorted by the author in a fairly pleasing way, and the data here maintains that order.

## Installation

If you are using JavaScript and npm/Node.js, you can install it like so:

```sh
npm install dictionary-of-colour-combinations
```

## Example – Extracting Palettes

This is left up to the user, but for example if you wish to get a list of palettes from the book, you could use this (JavaScript):

```js
const colors = require('dictionary-of-colour-combinations');

const map = colors.reduce((map, color, i) => {
  color.combinations.forEach(id => {
    if (map.has(id)) map.get(id).push(i);
    else map.set(id, [ i ]);
  });
  return map;
}, new Map());

const palettes = [ ...map.entries() ]
  .sort((a, b) => a[0] - b[0])
  .map(e => e[1]);

console.log(palettes.length); // 348
```

## CMYK to RGB

The original data by @dblodorn contained some conversions from CMYK to RGB that looked very different than the physical colours in the book.

In this fork of the data, each CMYK value is converted to RGB using specific colour profiles that attempt to better represent the physical printed colours:

- CMYK: U.S. Web Coated (SWOP) v2.icc
- RGB: sRGB IEC61966-2.1.icc

(Converted with Relative Colorimetric and Black Point Compensation)

These conversions provides the `rgb`, `lab` (L\*a\*b\* with D50 illuminant) and `hex` fields in the JSON data.

There may still be some differences to the book's printed swatches, as the conversion is not exact.

## Converting from Source

If you wish to convert the CMYK values to RGB/LAB/HEX with different colour profiles, you can do the following with Python:

```sh
pip3 install -r requirements.txt
```

Then, change the profile files in `augment_sanzo.py` and run the script:

```sh
python3 src/augment_sanzo.py
```

## License

MIT, see [LICENSE.md](http://github.com/mattdesl/dictionary-of-colour-combinations/blob/master/LICENSE.md) for details.
## Colour explorer (this fork)

`index.html` is an interactive explorer, deployed on Vercel. It reads the colour libraries listed in `sources.json`, so any data change appears on the site automatically. Signed-in palettes (the palette builder) are stored privately in Supabase, not in this repository. A GitHub Action (`scripts/check_sources.py`) validates every library on each push.

Changes in this fork:
- Dull Violet Black corrected to CMYK 100 / 90 / 38 / 50 (checked against the printed book); RGB, hex and Lab recalculated with the same SWOP → sRGB conversion as the rest of the data.

### Colour libraries (`sources.json`)
Wada Volume 1 is the first library, not the only one. Each entry in `sources.json` points at one data file:

```json
{ "id": "wada-2", "name": "A Dictionary of Color Combinations, Volume 2", "short": "Wada Vol 2",
  "byline": "Sanzo Wada · Volume 2", "file": "sources/wada-2.json", "format": "palettes", "idBase": 1000 }
```

- `format: "wada"` is the original `colors.json` layout. `format: "palettes"` is the general one:
  `{"colours":[{"name":"…","hex":"#RRGGBB","cmyk":[c,m,y,k],"family":1}],"palettes":[{"id":1,"name":"optional","colours":["colour name", …]}]}`. `cmyk` and `family` (1 reds … 6 neutrals) are optional; a missing family is worked out from the hue.
- Palette ids on the site are `idBase` + the palette's own number. Give each library its own block (0, 1000, 2000 …) so links and saved combinations never clash. Wada Volume 1 keeps its plain numbers (#240).
- Once there is more than one library, a **Library** menu appears in the filter bar. It sets what you browse and what "nearest colour", complements and "Potential additions" draw from. With one library it stays hidden.
- Colours added to your palettes remember their library; palettes saved earlier are read as Wada Volume 1.

### Palette from an image
- The **Image** button beside the search box (or dropping an image anywhere on the page) opens a palette panel. Works with JPEG, PNG, WebP, and HEIC in Safari / on the iPad.
- `extract.js`: the extraction engine, entirely in the browser; images are never uploaded or stored. It scales the image to 200 px, buckets the pixels, clusters them in CIELAB (vivid colours weighted up so small accents survive), then merges down to the chosen count. Similar colours average; distinct ones keep the larger colour, so two accents never blend into a colour that isn't in the picture. Shares come from real pixel counts.
- In the panel: 3–10 colours (default 6), leave out near-white and near-black, drag to crop, click to pick a colour by hand, and snap to the chosen library. Each colour shows its nearest library colour with ΔE and a Mix link. Below: value check, complements, **Similar palettes** from the chosen library (optional) and Seen in art.
- Save as palette (signed in) stores the colours with their shares; with snap on, it stores the library colours instead. Procreate export works as elsewhere.

### Recolour with a palette (value map)
- In the image panel, **Recolour with a palette** repaints the picture using only the colours of a chosen palette: this image's own, one of your palettes, or any combination (also from **Apply to an image** on combination and palette panels).
- `valuemap.js`: works out each pixel's lightness (CIELAB L*), stretches the image's values to the palette's range, and gives each pixel the palette colour at the matching position: **Nearest value**, or **By share** (the darkest x% of the image takes the darkest colour, x = its share). When colours are close in value (within 8 L*), temperature on the painter's wheel (warm vs cool), then hue, decides between them, weighed against value so the tonal structure always holds. A majority filter and minimum patch size clean up specks.
- Controls: mapping, warm/cool on ties, stretch, darks and lights, clean-up, add white and black, grid (3–12), and views (original, greyscale, palette reference, side by side; press and hold to see the original). The key lists colours darkest to lightest with value, coverage and Mix; hovering one highlights where it's used. A warning appears when the palette spans under 30 L*.
- Download PNG renders at 1600 px with the key along the bottom; nothing is uploaded or stored.

### Paints and mixing
- `paints.json`: all 140 Michael Harding Artists Oil Colours (number, series, Colour Index pigments, opacity, tint power, measured masstone CIELAB by Artist Pigments), collected from michaelharding.co.uk. `mix` is the colour fed to the mixing model and `mixSource` says where it came from (measured masstone, a reference pigment colour for very dark transparent paints, or the chart swatch where the published measurement looks wrong).
- `mix.js`: recipe solver. Tries 1-, 2- and 3-paint combinations, mixing with the Mixbox pigment model, and ranks by CIEDE2000 distance to the target. Parts are adjusted for each paint's tint power.
- `vendor/mixbox.js`: Mixbox 2.0 by Secret Weapons, CC BY-NC 4.0 (non-commercial use only); see `vendor/MIXBOX-LICENSE`.

### Seen in art (Harvard Art Museums)
- `api/art.js`: Vercel server function behind the "Seen in art" panel. `GET /api/art?c=HEX,HEX,...&type=all|Paintings|Prints|Drawings|Textile Arts|Photographs&n=12` (default: all types).
- Needs the env var `HARVARD_ART_MUSEUMS_API` (free key from Harvard Art Museums; non-commercial use only).
- Harvard's `color` filter only matches the simplified colours it extracts from each image, where every RGB channel is a multiple of 25. Each palette colour is snapped to its 2 nearest grid colours (1 for palettes over 4 colours), 40 works are fetched per grid colour, and works are ranked by CIEDE2000 match across the whole palette (coverage, closeness, presence, off-palette penalty). Weak matches (average ΔE ≥ 12) are dropped.
- Only works cleared for display at any size are requested. Images load from the URLs Harvard returns; each result links to harvardartmuseums.org.
- Answers are cached by Vercel for up to 14 days (Harvard's limit); empty answers aren't cached. A new palette costs up to 8 API calls (limit: 2,500 a day).
- Not built yet: "show more", saving a work to a palette, tuned scoring weights.

### Supabase
`supabase/schema.sql` holds the tables for private palettes (`palettes`) and the box of paints (`owned_paints`).
