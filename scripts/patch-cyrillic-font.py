"""Adds the two capitals the Pixelify Sans Cyrillic subset is missing:
U+041E (О, same shape as Latin O) and U+041F (П, built from the font's own
H stems and O top bar), so every Russian letter renders in the pixel font.
Run once after updating the font files: python3 scripts/patch-cyrillic-font.py
(needs: pip install fonttools brotli)."""
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen

for weight in ('400', '700'):
    latin = TTFont(f'public/fonts/pixelify-sans-latin-{weight}-normal.woff2')
    cyr_path = f'public/fonts/pixelify-sans-cyrillic-{weight}-normal.woff2'
    cyr = TTFont(cyr_path)
    lgs = latin.getGlyphSet(); lcmap = latin.getBestCmap()

    def rec(ch):
        p = RecordingPen(); lgs[lcmap[ord(ch)]].draw(p); return p.value

    h = [pt for op, args in rec('H') for pt in args]
    xs = sorted({x for x, _ in h}); ys = sorted({y for _, y in h})
    left0, left1, right0, right1 = xs[0], xs[1], xs[-2], xs[-1]
    base, cap = ys[0], ys[-1]
    o_inner_top = max(y for op, args in rec('O') for (x, y) in args if y < cap)
    width = lgs[lcmap[ord('H')]].width

    glyf = cyr['glyf']; hmtx = cyr['hmtx']; cmap_tables = [t for t in cyr['cmap'].tables if t.isUnicode()]
    order = cyr.getGlyphOrder()

    def add(name, code, draw, adv):
        pen = TTGlyphPen(None)
        draw(pen)
        g = pen.glyph()
        if name not in order:
            order.append(name)
        glyf.glyphs[name] = g
        g.recalcBounds(glyf)
        hmtx.metrics[name] = (adv, g.xMin)
        for t in cmap_tables:
            t.cmap[code] = name

    def draw_O(pen):
        p = RecordingPen(); lgs[lcmap[ord('O')]].draw(p); p.replay(pen)

    def draw_Pe(pen):
        pen.moveTo((left0, base)); pen.lineTo((left0, cap)); pen.lineTo((right1, cap)); pen.lineTo((right1, base))
        pen.lineTo((right0, base)); pen.lineTo((right0, o_inner_top)); pen.lineTo((left1, o_inner_top)); pen.lineTo((left1, base))
        pen.closePath()

    add('uni041E', 0x041E, draw_O, lgs[lcmap[ord('O')]].width)
    add('uni041F', 0x041F, draw_Pe, width)
    cyr.setGlyphOrder(order)
    cyr['maxp'].numGlyphs = len(order)
    cyr.flavor = 'woff2'
    cyr.save(cyr_path)
    print('patched', cyr_path)
