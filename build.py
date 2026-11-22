#!/usr/bin/env python3
"""
UTICoMed Supreme Build Pipeline (Zero External Dependencies - Pure Python 3)
- Safe CSS / JS / HTML minification
- Content-hash auto-versioning for Service Worker (sw.js)
- Single-file offline HTML bundles (plain minified + ultra-compact DecompressionStream gzip)
- Inlines logo.svg as data URI for true 100% offline portability
"""
import base64
import gzip
import hashlib
import os
import re
import urllib.parse
import zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(ROOT, 'dist')

JS_ORDER_FULL = [
    'sweep.js',
    'physiology.js',
    'audio.js',
    'monitor.js',
    'defib.js',
    'pump.js',
    'sg1.js',
    'slides.js',
    'features.js',
    'bedside.js',
    'app.js',
]
JS_ORDER_SIM = [f for f in JS_ORDER_FULL if f != 'slides.js']


def minify_css(css: str) -> str:
    # Remove block comments
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    # Collapse whitespace
    css = re.sub(r'\s+', ' ', css)
    # Trim spaces around punctuation safely (keep spaces inside calc()!)
    css = re.sub(r'\s*([{:;,}])\s*', r'\1', css)
    css = css.replace(';}', '}')
    return css.strip()


def minify_js_safe(js: str) -> str:
    """
    Syntax-safe JS compressor:
    - Preserves strings, template literals, and regex literals intact
    - Strips // and /* */ comments outside literals
    - Removes leading/trailing indentation and blank lines (ASI-safe!)
    """
    out = []
    i, n = 0, len(js)
    prev_sig = ''  # last non-whitespace char for regex disambiguation

    REGEX_PREV = set('(,=:[!&|?{};+-*~%^<>')

    while i < n:
        ch = js[i]

        # String or template literal
        if ch in ('"', "'", '`'):
            q = ch
            start = i
            i += 1
            while i < n:
                if js[i] == '\\' and i + 1 < n:
                    i += 2
                    continue
                if js[i] == q:
                    i += 1
                    break
                i += 1
            tok = js[start:i]
            out.append(tok)
            prev_sig = q
            continue

        # Comments or Regex
        if ch == '/' and i + 1 < n:
            nxt = js[i + 1]
            if nxt == '/':
                # line comment
                while i < n and js[i] != '\n':
                    i += 1
                continue
            if nxt == '*':
                # block comment
                end = js.find('*/', i + 2)
                i = n if end == -1 else end + 2
                continue
            # Possible regex literal: check previous significant token
            tail = ''.join(out[-12:]).rstrip()
            is_kw = bool(re.search(r'(?:^|[^a-zA-Z0-9_$])(return|case|throw|in|of|typeof|instanceof|new|delete|void)$', tail))
            if prev_sig in REGEX_PREV or prev_sig == '' or is_kw:
                start = i
                i += 1
                in_cls = False
                while i < n:
                    c = js[i]
                    if c == '\\' and i + 1 < n:
                        i += 2
                        continue
                    if c == '[':
                        in_cls = True
                    elif c == ']':
                        in_cls = False
                    elif c == '/' and not in_cls:
                        i += 1
                        while i < n and js[i].isalpha():
                            i += 1
                        break
                    elif c == '\n':
                        break
                    i += 1
                out.append(js[start:i])
                prev_sig = '/'
                continue

        out.append(ch)
        if not ch.isspace():
            prev_sig = ch
        i += 1

    cleaned = ''.join(out)
    # Strip indentation & empty lines while preserving newlines for 100% ASI safety
    lines = [ln.strip() for ln in cleaned.splitlines()]
    return '\n'.join(ln for ln in lines if ln)


def minify_html_safe(html: str) -> str:
    html = re.sub(r'<!--(?!\[if).*?-->', '', html, flags=re.S)
    lines = [ln.strip() for ln in html.splitlines()]
    return '\n'.join(ln for ln in lines if ln)


def inline_logo(html: str) -> str:
    svg_path = os.path.join(ROOT, 'logo.svg')
    if not os.path.exists(svg_path):
        return html
    svg = open(svg_path, 'r', encoding='utf-8').read().strip()
    svg = re.sub(r'\s+', ' ', svg)
    data_uri = 'data:image/svg+xml;utf8,' + urllib.parse.quote(svg)
    return re.sub(r'logo\.svg(?:\?v=[^"\']*)?', data_uri, html)


def build_offline_html(direct_sim: bool = False) -> str:
    html = open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8').read()
    css = minify_css(open(os.path.join(ROOT, 'styles.css'), 'r', encoding='utf-8').read())

    # If direct simulator bundle, remove the presentationApp section to save extra bytes
    if direct_sim:
        html = re.sub(
            r'<section id="presentationApp".*?</section>\s*',
            '',
            html,
            count=1,
            flags=re.S,
        )
        html = html.replace('<div id="simulatorApp" class="hidden">', '<div id="simulatorApp">', 1)
        html = re.sub(r'<button[^>]*id="btnBackToSlides"[^>]*>.*?</button>\s*', '', html)

    html = inline_logo(html)
    # Remove manifest link & external stylesheet/scripts
    html = re.sub(r'<link[^>]*href="manifest\.json"[^>]*>\s*', '', html)
    html = re.sub(
        r'<link[^>]*href="styles\.css(?:\?v=[^"]*)?"[^>]*>',
        f'<style>{css}</style>',
        html,
        count=1,
    )

    js_files = JS_ORDER_SIM if direct_sim else JS_ORDER_FULL
    js_chunks = []
    if direct_sim:
        js_chunks.append('window.__UTICOMED_DIRECT_SIM__=true;')
    for jf in js_files:
        raw_js = open(os.path.join(ROOT, jf), 'r', encoding='utf-8').read()
        js_chunks.append(minify_js_safe(raw_js))
    combined_js = '\n;\n'.join(js_chunks)
    # Escape closing script tags if any exist inside string literals
    combined_js = combined_js.replace('</script>', '<\\/script>')

    # Replace external script block with single inline script
    html = re.sub(r'(?:\s*<script[^>]*src="[^"]+\.js[^"]*"[^>]*></script>)+', '', html)
    html = minify_html_safe(html)
    html = html.replace('</body>', f'<script>{combined_js}</script>\n</body>', 1)
    return html


def wrap_self_decompressing_html(inner_html: str, title: str) -> str:
    """
    Wraps a full HTML document inside a ~750-byte native DecompressionStream('gzip')
    bootloader. Runs 100% offline in Chrome, Safari, Edge, Firefox in <15ms!
    """
    gz = gzip.compress(inner_html.encode('utf-8'), compresslevel=9)
    b64 = base64.b64encode(gz).decode('ascii')
    return (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        f'<title>{title}</title>'
        '<style>html,body{margin:0;height:100%;background:#09111c;color:#94a3b8;display:grid;place-items:center;font-family:system-ui,sans-serif}</style>'
        '</head><body><div id="utl">Carregando UTICoMed…</div>'
        f'<script id="utp" type="text/plain">{b64}</script>'
        '<script>(async()=>{try{'
        'const b=atob(document.getElementById("utp").textContent),'
        'u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);'
        'const ds=new DecompressionStream("gzip"),w=ds.writable.getWriter();'
        'w.write(u);w.close();'
        'const h=await new Response(ds.readable).text();'
        'document.open();document.write(h);document.close();'
        '}catch(e){document.getElementById("utl").textContent="Erro ao carregar (navegador sem DecompressionStream): "+e;}})();</script>'
        '</body></html>'
    )


def update_service_worker():
    assets = [
        'index.html', 'styles.css', 'logo.svg', 'manifest.json',
        *JS_ORDER_FULL,
    ]
    h = hashlib.sha256()
    for a in assets:
        p = os.path.join(ROOT, a)
        if os.path.exists(p):
            h.update(open(p, 'rb').read())
    digest = h.hexdigest()[:10]
    cache_name = f'uticomed-v2-{digest}'
    sw_lines = [
        f"const CACHE_NAME = '{cache_name}';",
        'const ASSETS = [',
        "  './',",
        *[f"  './{a}'," for a in assets],
        '];',
        '',
        "self.addEventListener('install', (e) => {",
        '  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));',
        '});',
        "self.addEventListener('activate', (e) => {",
        '  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));',
        '});',
        "self.addEventListener('fetch', (e) => {",
        "  if (e.request.method !== 'GET') return;",
        '  e.respondWith(fetch(e.request).then((r) => { if (r && r.status === 200) { const cl = r.clone(); caches.open(CACHE_NAME).then((c) => c.put(e.request, cl)); } return r; }).catch(() => caches.match(e.request)));',
        '});',
        '',
    ]
    open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write('\n'.join(sw_lines))
    return cache_name


def main():
    os.makedirs(DIST, exist_ok=True)
    cache_name = update_service_worker()

    full_plain = build_offline_html(direct_sim=False)
    sim_plain = build_offline_html(direct_sim=True)

    full_gz_html = wrap_self_decompressing_html(full_plain, 'UTICoMed • Simulador Clínico de UTI')
    sim_gz_html = wrap_self_decompressing_html(sim_plain, 'UTICoMed • Simulador ao Vivo')

    out_files = {
        'UTICoMed-offline.html': full_gz_html,
        'UTICoMed-simulador-offline.html': sim_gz_html,
        'UTICoMed-offline-plain.html': full_plain,
    }
    for name, content in out_files.items():
        p = os.path.join(DIST, name)
        open(p, 'w', encoding='utf-8').write(content)
        print(f'  Built dist/{name:34s} {len(content):7d} B ({len(content)/1024:.1f} KB)')

    # Also package clean production zip in parent folder
    zip_path = os.path.join(os.path.dirname(ROOT), 'UTICoMed-otimizado.zip')
    src_files = [
        'index.html', 'styles.css', 'sw.js', 'manifest.json', 'logo.svg', 'build.py',
        *JS_ORDER_FULL,
    ]
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for f in src_files:
            zf.write(os.path.join(ROOT, f), f'uticomed/{f}')
        zf.write(os.path.join(DIST, 'UTICoMed-offline.html'), 'uticomed/UTICoMed-offline.html')
        zf.write(os.path.join(DIST, 'UTICoMed-simulador-offline.html'), 'uticomed/UTICoMed-simulador-offline.html')

    z_sz = os.path.getsize(zip_path)
    print(f'\n  Service Worker auto-versioned: {cache_name}')
    print(f'  Packaged {os.path.basename(zip_path)}: {z_sz} B ({z_sz/1024:.1f} KB)')


if __name__ == '__main__':
    main()
