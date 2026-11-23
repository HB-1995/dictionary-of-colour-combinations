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

`index.html` is an interactive explorer for all the combinations, deployed on Vercel. It reads `colors.json` directly, so any data change appears on the site automatically. Signed-in palettes (the palette builder) are stored privately in Supabase, not in this repository. A GitHub Action validates `colors.json` on every push.

Changes in this fork:
- Dull Violet Black corrected to CMYK 100 / 90 / 38 / 50 (checked against the printed book); RGB, hex and Lab recalculated with the same SWOP → sRGB conversion as the rest of the data.

### Paints and mixing
- `paints.json`: all 140 Michael Harding Artists Oil Colours (number, series, Colour Index pigments, opacity, tint power, measured masstone CIELAB by Artist Pigments), collected from michaelharding.co.uk. `mix` is the colour fed to the mixing model and `mixSource` says where it came from (measured masstone, a reference pigment colour for very dark transparent paints, or the chart swatch where the published measurement looks wrong).
- `mix.js`: recipe solver. Tries 1-, 2- and 3-paint combinations, mixing with the Mixbox pigment model, and ranks by CIEDE2000 distance to the target. Parts are adjusted for each paint's tint power.
- `vendor/mixbox.js`: Mixbox 2.0 by Secret Weapons, CC BY-NC 4.0 (non-commercial use only); see `vendor/MIXBOX-LICENSE`.

### Seen in art (Harvard Art Museums)
- `api/art.js`: Vercel server function behind the "Seen in art" panel. `GET /api/art?c=HEX,HEX,...&type=Paintings|Prints|Drawings|Textile Arts|Photographs|all&n=12`.
- Needs the env var `HARVARD_ART_MUSEUMS_API` (free key from Harvard Art Museums; non-commercial use only).
- Harvard's `color` filter only matches the simplified colours it extracts from each image, where every RGB channel is a multiple of 25. Each palette colour is snapped to its 2 nearest grid colours (1 for palettes over 4 colours), 40 works are fetched per grid colour, and works are ranked by CIEDE2000 match across the whole palette (coverage, closeness, presence, off-palette penalty). Weak matches (average ΔE ≥ 12) are dropped.
- Only works cleared for display at any size are requested. Images load from the URLs Harvard returns; each result links to harvardartmuseums.org.
- Answers are cached by Vercel for up to 14 days (Harvard's limit); empty answers aren't cached. A new palette costs up to 8 API calls (limit: 2,500 a day).
- Not built yet: "show more", saving a work to a palette, tuned scoring weights.

### Supabase
`supabase/schema.sql` holds the tables for private palettes (`palettes`) and the box of paints (`owned_paints`).
