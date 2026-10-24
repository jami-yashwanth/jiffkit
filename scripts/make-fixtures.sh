#!/usr/bin/env bash
# Generates tests/fixtures/*. macOS only (needs sips).
# Large fixtures (iphone-48mp.heic, huge-63mp.jpg) are gitignored; run `npm run fixtures`.
set -euo pipefail

missing=()
for tool in sips exiftool img2webp cwebp heif-enc magick qpdf node; do
  command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "Missing tools: ${missing[*]}" >&2
  echo "sips ships with macOS. Install the rest with:" >&2
  echo "  brew install exiftool webp libheif imagemagick qpdf" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/tests/fixtures"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

GPS=(-GPSLatitude=37.7749 -GPSLatitudeRef=N -GPSLongitude=122.4194 -GPSLongitudeRef=W)

# Smooth, colourful source image at a given size (kept compressible so fixtures stay small).
base() { # w h out
  magick -size "${1}x${2}" gradient:'#ff7a18-#2b5876' \
    \( -size "${1}x${2}" radial-gradient:white-'#555555' \) \
    -compose multiply -composite "$3"
}

# --- HEIC ---
base 4032 3024 "$TMP/12mp.png"
sips -s format heic "$TMP/12mp.png" --out "$OUT/iphone-12mp.heic" >/dev/null
exiftool -q -overwrite_original "${GPS[@]}" "$OUT/iphone-12mp.heic"

base 8064 6048 "$TMP/48mp.png"
sips -s format heic "$TMP/48mp.png" --out "$OUT/iphone-48mp.heic" >/dev/null

base 400 300 "$TMP/400.png"
sips -s format heic "$TMP/400.png" --out "$OUT/rotated-6.heic" >/dev/null
exiftool -q -overwrite_original -n -Orientation=6 "$OUT/rotated-6.heic"

magick -size 400x300 gradient:'#ff7a18-#2b5876' "$TMP/m1.jpg"
magick -size 200x150 gradient:'#00ff88-#ff0088' "$TMP/m2.jpg"
heif-enc -q 80 "$TMP/m1.jpg" "$TMP/m2.jpg" -o "$OUT/multi.heic" >/dev/null || \
  heif-enc -q 80 "$TMP/m1.jpg" "$TMP/m2.jpg" --output "$OUT/multi.heic" >/dev/null

# --- JPG ---
base 1600 1200 "$TMP/photo.png"
magick "$TMP/photo.png" -quality 85 "$OUT/photo.jpg"
exiftool -q -overwrite_original "${GPS[@]}" "$OUT/photo.jpg"

# A 400 x 300 JPEG whose EXIF Orientation says "rotate 90": it should read as 300 x 400 once upright.
magick -size 400x300 gradient:'#ff7a18-#2b5876' -quality 85 "$OUT/rotated-6.jpg"
exiftool -q -overwrite_original -n -Orientation=6 "$OUT/rotated-6.jpg"

magick -size 9000x7000 gradient:'#ff7a18-#2b5876' -quality 60 "$OUT/huge-63mp.jpg"

# --- WebP ---
base 800 600 "$TMP/w.png"
cwebp -q 75 -quiet "$TMP/w.png" -o "$OUT/lossy.webp"
cwebp -lossless -quiet "$TMP/w.png" -o "$OUT/lossless.webp"
magick -size 200x150 gradient:'#ff7a18-#2b5876' "$TMP/f1.png"
magick -size 200x150 gradient:'#00ff88-#ff0088' "$TMP/f2.png"
img2webp -lossy -d 100 "$TMP/f1.png" -d 100 "$TMP/f2.png" -o "$OUT/animated.webp" >/dev/null

# --- PNG / alpha ---
magick -size 200x150 gradient:'#ff7a18-#2b5876' -alpha set -channel A -fx 'i<100?0:1' +channel PNG32:"$TMP/alpha-src.png"
cp "$TMP/alpha-src.png" "$OUT/alpha.png"
cwebp -lossless -exact -quiet "$OUT/alpha.png" -o "$OUT/alpha.webp"
magick -size 200x150 gradient:'#ff7a18-#2b5876' -depth 16 PNG48:"$OUT/png16.png"
magick -size 200x150 gradient:'#ffffff-#000000' -colorspace Gray -type Grayscale -depth 8 PNG:"$OUT/grey.png"
magick -size 200x150 gradient:'#ff7a18-#2b5876' -colors 16 PNG8:"$OUT/palette.png"

# --- Broken / disguised ---
head -c 2048 "$OUT/iphone-12mp.heic" > "$OUT/truncated.heic"
: > "$OUT/empty.heic"
printf 'This is plain text, not an image.\n' > "$OUT/text-as.heic"
cp "$OUT/iphone-12mp.heic" "$OUT/heic-named.jpg"

# --- PDF ---
mkdir -p "$OUT/pdf"
node "$ROOT/scripts/make-pdf-fixtures.mjs" "$OUT/pdf"
qpdf --encrypt user owner 256 -- "$OUT/pdf/three-pages.pdf" "$OUT/pdf/encrypted.pdf"
printf 'This is plain text, not a PDF.\n' > "$OUT/pdf/not-a.pdf"
head -c 400 "$OUT/pdf/three-pages.pdf" > "$OUT/pdf/truncated.pdf"

echo "Fixtures written to $OUT"
