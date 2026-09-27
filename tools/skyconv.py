# HDR equirect -> LDR sky JPG (upper hemisphere + a little below the horizon), plus the
# sun direction, sun colour and average sky colour, so lighting matches the photo.
import cv2, numpy as np, json, sys
out = {}
EXP, WHITE = 0.75, 6.0
for f in sys.argv[1:]:
    im = cv2.imread(f, cv2.IMREAD_UNCHANGED)[:, :, ::-1].astype(np.float32)   # RGB linear
    H, W = im.shape[:2]
    lum = im @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # sun: centroid of the brightest pixels
    thr = np.percentile(lum, 99.97)
    ys, xs = np.nonzero(lum >= thr)
    wts = lum[ys, xs]
    u = (xs * wts).sum() / wts.sum() / W; v = (ys * wts).sum() / wts.sum() / H
    phi = (u - 0.5) * 2 * np.pi; el = (0.5 - v) * np.pi
    # three.js equirect convention: dir = (-cos(el) * cos(phi)? ) -> we store az/el and resolve in the shader convention below
    sunRGB = im[ys, xs].mean(0); sunRGB = sunRGB / sunRGB.max()
    # sky: exposure so the zenith-ish median maps to ~0.55 after tonemap, sun clipped
    top = im[: H // 2]
    skyAvg = np.median(top.reshape(-1, 3), 0)
    exp = EXP / max(1e-4, float(np.median(lum[: H // 2])))
    L = im * exp
    Ll = L @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    Lt = Ll * (1 + Ll / (WHITE * WHITE)) / (1 + Ll)       # extended Reinhard on luminance keeps hue
    ldr = L * (Lt / np.maximum(Ll, 1e-6))[..., None]
    ldr = np.clip(ldr, 0, 1) ** (1 / 2.2)
    rows = int(H * 0.56)                               # +90 .. about -10 degrees
    crop = (ldr[:rows] * 255 + 0.5).astype(np.uint8)
    crop = cv2.resize(crop, (2048, int(2048 * rows / W)), interpolation=cv2.INTER_AREA)
    name = f.replace('.hdr', '')
    cv2.imwrite(name + '.jpg', crop[:, :, ::-1], [cv2.IMWRITE_JPEG_QUALITY, 84])
    hor = ldr[int(H * 0.47): int(H * 0.5)].reshape(-1, 3).mean(0)
    zen = ldr[: int(H * 0.08)].reshape(-1, 3).mean(0)
    out[name] = dict(u=float(u), v=float(v), az=float(np.degrees(phi)), el=float(np.degrees(el)), sun=[float(x) for x in sunRGB],
                     horizon=[float(x) for x in hor], zenith=[float(x) for x in zen], rows=rows / H)
    print(name, 'sun az %.1f el %.1f' % (np.degrees(phi), np.degrees(el)), 'sunRGB', np.round(sunRGB, 2), 'hor', np.round(hor, 2), 'zen', np.round(zen, 2))
json.dump(out, open('skies.json', 'w'), indent=1)
