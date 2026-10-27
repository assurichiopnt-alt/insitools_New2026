#!/usr/bin/env node
/**
 * INSITOOLS – SEO / AEO page builder
 * AVISION · Rev0
 *
 * Reads the product data inside product-detail.html and writes:
 *   product/<slug>.html   – one static, crawlable page per model (Product + FAQ schema)
 *   product/index.html    – crawlable catalogue of every model
 *   <old site paths>.html – redirect pages so old insitools.com links land on the new pages
 *   sitemap.xml           – every page Google / Bing / AI crawlers should read
 *   llms.txt              – plain summary for AI answer engines
 *
 * Run from the website folder:   node tools/seo-build.js
 * Re-run it whenever products in product-detail.html change, then Commit + Sync.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SITE = 'https://insitools.com';
const GA4_ID = 'G-VQPL0Y9WXF'; // Google Analytics 4 measurement ID
const TODAY = new Date().toISOString().slice(0, 10);

const COMPANY = {
  name: 'INSITOOLS',
  legal: 'Assurich Industries Pte Ltd',
  street: '9 Tagore Lane #04-28, 9@Tagore',
  city: 'Singapore',
  postal: '787472',
  country: 'SG',
  phone: '+65 6459 1069',
  whatsapp: '6598183419',
  email: 'sales@assurich.com',
};

// ---------- 1. read product data from product-detail.html ----------
function loadProducts() {
  const html = fs.readFileSync(path.join(ROOT, 'product-detail.html'), 'utf8');
  const grab = (name) => {
    const m = html.match(new RegExp('const ' + name + '\\s*=\\s*(\\{[\\s\\S]*?\\n\\s{8}\\});'));
    if (!m) throw new Error('Cannot find ' + name + ' in product-detail.html');
    return vm.runInNewContext('(' + m[1] + ')');
  };
  const db = grab('productsDatabase');
  const linked = grab('linkedProductInfo');
  const images = grab('linkedProductImages');
  const downloads = grab('officialProductDownloads');
  const codes = grab('newProductCodes'); // customer-facing model codes, e.g. BB5000 -> PB-200

  // Publish only models the live site actually shows (linked from a page) or that have a real photo.
  // Older placeholder entries without a photo stay hidden until their data is confirmed.
  const pages = ['index.html', 'products.html', 'product-list.html', 'service-rent.html']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const shown = new Set();
  for (const m of pages.matchAll(/model=([A-Za-z0-9-]+)/g)) shown.add(m[1]);
  for (const m of pages.matchAll(/key:\s*'([A-Za-z0-9-]+)'/g)) shown.add(m[1]);

  const out = [];
  for (const [key, p] of Object.entries({ ...db, ...linked })) {
    if (!shown.has(key) && !(images[key] || p.image)) continue;
    out.push({
      key,
      code: codes[key] || key,
      name: p.name,
      cat: normaliseCat(p.cat),
      image: images[key] || p.image || '',
      specs: p.specs || {},
      oldUrl: p.sourceUrl && p.sourceUrl.startsWith(SITE + '/') ? p.sourceUrl : '',
      datasheet: usableDownload(downloads[key]),
    });
  }
  return out;
}

function normaliseCat(cat) {
  return cat === 'Pipe Cutters' ? 'Pipe Cutting' : cat;
}

// Old insitools.com/upload/... files no longer exist, so never link to them.
function usableDownload(url) {
  if (!url) return '';
  if (url.startsWith(SITE + '/upload/')) return '';
  return url;
}

// ---------- 2. category copy (factual, reused across pages) ----------
const CATEGORY = {
  'Boring Machines': {
    what: 'Portable line boring machines restore worn bores, pin housings and bearing seats in-situ, so heavy equipment, vessels and plant can be repaired where they stand instead of being dismantled and shipped to a workshop.',
    use: 'Typical jobs include excavator and crane pin bores, stern tubes, rudder stocks, hinge points and bearing housings.',
  },
  'Flange Facers': {
    what: 'Portable flange facing machines re-machine flange sealing faces, gasket grooves and heat-exchanger faces on site, restoring a leak-free seal without removing the pipe, vessel or valve.',
    use: 'Typical jobs include raised-face and RTJ flanges, heat-exchanger channel covers, pump and valve flanges.',
  },
  'Milling Machines': {
    what: 'Portable and gantry milling machines bolt directly onto large components to machine flat surfaces, keyways and mounting pads on site with workshop-level accuracy.',
    use: 'Typical jobs include engine and gearbox beds, heat-exchanger split lines, turbine casings and structural mounting surfaces.',
  },
  'Bore Welders': {
    what: 'Automatic bore welders build up worn bores and faces with a controlled weld overlay, so the bore can then be line-bored back to its original size on site.',
    use: 'They are used together with portable boring machines to rebuild worn pin bores and housings without replacing the part.',
  },
  'Valve Solution': {
    what: 'In-situ valve grinding and lapping machines restore the sealing seats of gate, globe and safety valves without removing the valve from the line.',
    use: 'Typical users are power plants, refineries, petrochemical and marine operators that need to stop seat leakage during short shutdowns.',
  },
  'Pipe Cutting': {
    what: 'Split-frame and clamshell pipe cutters cold-cut and bevel in-line pipe for weld preparation, without heat, sparks or the need to remove the pipe.',
    use: 'Typical jobs include pipeline tie-ins, decommissioning and weld preparation in hazardous areas where hot work is restricted.',
  },
  'Hydraulic Tools': {
    what: 'High-pressure hydraulic tools – power units, torque wrenches, pumps and cylinders – provide controlled force for bolting, lifting and maintenance work in the field.',
    use: 'Typical jobs include flange bolting, heavy lifting and powering portable machining tools on site.',
  },
};
const catInfo = (cat) => CATEGORY[cat] || {
  what: 'INSITOOLS supplies portable on-site machining and maintenance equipment that brings workshop accuracy to the job site.',
  use: 'Contact our engineering sales team to confirm the right configuration for your application.',
};

// ---------- 3. helpers ----------
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const slugify = (s) => String(s).toLowerCase()
  .replace(/[–—]/g, '-').replace(/"/g, 'in').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const abs = (u) => (!u ? '' : /^https?:\/\//.test(u) ? u : SITE + '/' + u.replace(/^\//, ''));
const jsonLd = (obj) => '<script type="application/ld+json">\n' +
  JSON.stringify(obj, null, 2).replace(/</g, '\\u003c') + '\n</script>';

function uniqueSlugs(products) {
  const seen = {};
  for (const p of products) {
    let s = slugify(p.name);
    if (seen[s]) s = slugify(p.name + '-' + p.key);
    seen[s] = true;
    p.slug = s;
    p.url = SITE + '/product/' + s + '.html';
  }
}

function summary(p) {
  const specs = Object.entries(p.specs).slice(0, 2).map(([k, v]) => k.toLowerCase() + ' ' + v).join(', ');
  const base = `${p.name} – ${p.cat.toLowerCase()} for on-site machining and maintenance`;
  const s = specs ? `${base}: ${specs}. Request a quotation from INSITOOLS Singapore.` :
    `${base}. Request specifications and a quotation from INSITOOLS Singapore.`;
  return s.length > 160 ? s.slice(0, 157).replace(/\s+\S*$/, '') + '…' : s;
}

function faqFor(p) {
  const info = catInfo(p.cat);
  return [
    { q: `What is the ${p.name} used for?`, a: `${info.what} ${info.use}` },
    { q: `Where can I buy or rent the ${p.code}?`,
      a: `INSITOOLS supplies the ${p.name} from its Singapore headquarters, with service teams supporting customers in Thailand and across ASEAN. On-site machining services and equipment rental are also available – contact the sales team to confirm availability for your project.` },
    { q: `How do I get a quotation for the ${p.code}?`,
      a: `Use the Request a Quote form on this page or contact ${COMPANY.email} / ${COMPANY.phone}. Share your workpiece dimensions and job requirements so the engineering sales team can recommend the right configuration.` },
  ];
}

// ---------- 4. shared layout ----------
function layout({ title, description, canonical, image, schema, body, robots }) {
  return `<!DOCTYPE html>
<!-- AVISION -->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <!-- Google Analytics 4 -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${GA4_ID}"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GA4_ID}');
        document.addEventListener('click', function (e) {
            var a = e.target.closest && e.target.closest('a[href*="wa.me/"], a[href*="#quote"]');
            if (!a) return;
            if (a.href.indexOf('wa.me/') > -1) gtag('event', 'whatsapp_click', { link_url: a.href.split('?')[0], page_path: location.pathname });
            else gtag('event', 'quote_click', { page_path: location.pathname });
        });
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    ${robots ? `<meta name="robots" content="${robots}">` : ''}
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="INSITOOLS">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:image" content="${esc(image || SITE + '/images/home.jpg')}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" href="/favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
    <script src="https://cdn.tailwindcss.com"></script>
    <script>tailwind.config={theme:{extend:{colors:{'insitools-dark':'#0d233a','insitools-blue':'#1a4971','insitools-red':'#c62828'},fontFamily:{sans:['Helvetica Neue','Helvetica','Arial','sans-serif']}}}}</script>
    ${schema.map(jsonLd).join('\n    ')}
</head>
<body class="font-sans antialiased text-gray-900 bg-gray-50 flex flex-col min-h-screen">
    <header class="bg-insitools-blue text-white shadow-md sticky top-0 z-50">
        <div class="max-w-7xl mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <a href="/index.html" class="inline-flex items-center"><img src="/logo.png" alt="INSITOOLS logo" class="h-12 w-auto"></a>
            <nav class="w-full md:w-auto">
                <ul class="flex flex-wrap items-center justify-center gap-4 text-sm font-medium">
                    <li><a href="/index.html" class="hover:text-gray-200">Home</a></li>
                    <li><a href="/products.html" class="text-white font-bold border-b-2 border-white pb-1">Products</a></li>
                    <li><a href="/service-rent.html" class="hover:text-gray-200">Services &amp; Rentals</a></li>
                    <li><a href="/about.html" class="hover:text-gray-200">About Us</a></li>
                </ul>
            </nav>
        </div>
    </header>
${body}
    <footer class="bg-insitools-dark text-gray-300 py-8 mt-auto">
        <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between gap-4 text-xs">
            <div>
                <p class="text-white font-bold mb-1">${COMPANY.name} · ${COMPANY.legal}</p>
                <p>${COMPANY.street}, ${COMPANY.city} ${COMPANY.postal}</p>
                <p>${COMPANY.phone} · <a href="mailto:${COMPANY.email}" class="underline">${COMPANY.email}</a></p>
            </div>
            <div class="flex gap-4 items-start">
                <a href="/product/index.html" class="hover:text-white">All Models</a>
                <a href="/products.html" class="hover:text-white">Products</a>
                <a href="/service-rent.html" class="hover:text-white">Services &amp; Rentals</a>
            </div>
            <div class="text-gray-500">© 2026 INSITOOLS. All rights reserved.</div>
        </div>
    </footer>
</body>
</html>
`;
}

// ---------- 5. product page ----------
function productPage(p, related) {
  const info = catInfo(p.cat);
  const faq = faqFor(p);
  const img = p.image ? '/' + p.image.replace(/^\//, '') : '/images/placeholder.svg';
  const specs = Object.entries(p.specs);
  const quote = `/product-detail.html?model=${encodeURIComponent(p.key)}#quote`;
  const wa = `https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent('INSITOOLS enquiry: ' + p.name)}`;

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: p.name,
    sku: p.code,
    mpn: p.code,
    category: p.cat,
    description: `${info.what} ${info.use}`,
    url: p.url,
    image: p.image ? [abs(p.image)] : undefined,
    brand: { '@type': 'Brand', name: 'INSITOOLS' },
    additionalProperty: specs.map(([k, v]) => ({ '@type': 'PropertyValue', name: k, value: v })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Products', item: SITE + '/products.html' },
      { '@type': 'ListItem', position: 3, name: p.cat, item: SITE + '/product/index.html#' + slugify(p.cat) },
      { '@type': 'ListItem', position: 4, name: p.name, item: p.url },
    ],
  };
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const specRows = specs.length
    ? specs.map(([k, v]) => `<tr class="border-t border-gray-100"><th scope="row" class="text-left align-top px-5 py-3 text-xs font-bold uppercase tracking-wide text-gray-500 w-2/5">${esc(k)}</th><td class="px-5 py-3 text-sm font-semibold text-gray-800">${esc(v)}</td></tr>`).join('\n                        ')
    : `<tr><td class="px-5 py-4 text-sm text-gray-600">Detailed specifications for this model are available on request. Contact our engineering sales team for the configuration that fits your job.</td></tr>`;

  const relatedHtml = related.length ? `
        <section class="mt-14">
            <h2 class="text-xl font-bold text-insitools-dark mb-4">Other ${esc(p.cat)}</h2>
            <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${related.map((r) => `<li><a href="/product/${r.slug}.html" class="block bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm font-semibold text-insitools-blue hover:border-insitools-blue">${esc(r.name)}</a></li>`).join('\n                ')}
            </ul>
        </section>` : '';

  const body = `
    <nav aria-label="Breadcrumb" class="bg-white border-b border-gray-200">
        <ol class="max-w-7xl mx-auto px-6 py-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <li><a href="/index.html" class="hover:text-insitools-red">Home</a> /</li>
            <li><a href="/products.html" class="hover:text-insitools-red">Products</a> /</li>
            <li><a href="/product/index.html#${slugify(p.cat)}" class="hover:text-insitools-red">${esc(p.cat)}</a> /</li>
            <li class="text-gray-800">${esc(p.code)}</li>
        </ol>
    </nav>
    <main class="flex-grow w-full max-w-7xl mx-auto px-6 py-10">
        <article class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div class="lg:col-span-5 bg-white border border-gray-200 rounded-xl p-6 flex items-center justify-center min-h-[320px]">
                <img src="${esc(img)}" alt="${esc(p.name)} – ${esc(p.cat)}" class="w-full max-h-[360px] object-contain" loading="eager">
            </div>
            <div class="lg:col-span-7">
                <p class="text-xs font-bold uppercase tracking-widest text-insitools-red mb-2">${esc(p.cat)}</p>
                <h1 class="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-4">${esc(p.name)}</h1>
                <p class="text-gray-700 leading-relaxed mb-3">${esc(info.what)}</p>
                <p class="text-gray-600 text-sm leading-relaxed mb-6">${esc(info.use)}</p>
                <div class="flex flex-wrap gap-3 mb-8">
                    <a href="${esc(quote)}" class="bg-insitools-red text-white text-xs font-bold uppercase tracking-wider py-3 px-6 rounded hover:bg-opacity-90">Request a Quote</a>
                    <a href="${esc(wa)}" rel="noopener" class="border border-insitools-blue text-insitools-blue text-xs font-bold uppercase tracking-wider py-3 px-6 rounded hover:bg-insitools-blue hover:text-white">Chat on WhatsApp</a>
                    ${p.datasheet ? `<a href="${esc(p.datasheet.startsWith('http') ? p.datasheet : '/' + p.datasheet)}" rel="noopener" class="border border-gray-300 text-gray-700 text-xs font-bold uppercase tracking-wider py-3 px-6 rounded hover:border-gray-500">Download Datasheet</a>` : ''}
                </div>
                <h2 class="text-lg font-bold text-insitools-dark mb-3">${esc(p.code)} Technical Specifications</h2>
                <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    <table class="w-full">
                        <caption class="sr-only">${esc(p.name)} specifications</caption>
                        ${specRows}
                    </table>
                </div>
            </div>
        </article>

        <section class="mt-14 max-w-3xl">
            <h2 class="text-xl font-bold text-insitools-dark mb-4">Frequently Asked Questions</h2>
            ${faq.map((f) => `<details class="bg-white border border-gray-200 rounded-lg p-5 mb-3" open>
                <summary class="font-semibold text-gray-900 cursor-pointer">${esc(f.q)}</summary>
                <p class="mt-3 text-sm text-gray-700 leading-relaxed">${esc(f.a)}</p>
            </details>`).join('\n            ')}
        </section>
${relatedHtml}
    </main>`;

  return layout({
    title: `${p.name} | ${p.cat} | INSITOOLS`,
    description: summary(p),
    canonical: p.url,
    image: p.image ? abs(p.image) : '',
    schema: [productLd, breadcrumbLd, faqLd],
    body,
  });
}

// ---------- 6. catalogue page ----------
function catalogue(products) {
  const groups = {};
  for (const p of products) (groups[p.cat] = groups[p.cat] || []).push(p);
  const listLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'INSITOOLS portable machining equipment',
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.name })),
  };
  const body = `
    <main class="flex-grow w-full max-w-7xl mx-auto px-6 py-10">
        <h1 class="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">All INSITOOLS Models</h1>
        <p class="text-gray-700 max-w-3xl mb-10">Portable on-site machining, welding, valve repair, pipe cutting and hydraulic equipment, supplied and supported from Singapore across ASEAN. Choose a model for full specifications and a quotation.</p>
        ${Object.entries(groups).map(([cat, items]) => `
        <section id="${slugify(cat)}" class="mb-10">
            <h2 class="text-xl font-bold text-insitools-dark mb-2">${esc(cat)}</h2>
            <p class="text-sm text-gray-600 max-w-3xl mb-4">${esc(catInfo(cat).what)}</p>
            <ul class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                ${items.map((p) => `<li><a href="/product/${p.slug}.html" class="block bg-white border border-gray-200 rounded-lg px-4 py-3 text-sm font-semibold text-insitools-blue hover:border-insitools-blue">${esc(p.name)}</a></li>`).join('\n                ')}
            </ul>
        </section>`).join('\n')}
    </main>`;
  return layout({
    title: 'All Models – Portable Machining Equipment | INSITOOLS',
    description: 'Every INSITOOLS model in one place: portable line boring, flange facing, milling, bore welding, valve lapping, pipe cutting and hydraulic tools. Singapore & ASEAN.',
    canonical: SITE + '/product/index.html',
    schema: [listLd],
    body,
  });
}

// ---------- 7. redirect pages for old website URLs ----------
function redirectPage(target, label) {
  return `<!DOCTYPE html>
<!-- AVISION -->
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${esc(label)} | INSITOOLS</title>
    <link rel="canonical" href="${esc(target)}">
    <meta http-equiv="refresh" content="0; url=${esc(target)}">
    <meta name="robots" content="noindex, follow">
    <script>location.replace(${JSON.stringify(target)});</script>
</head>
<body><p>This page has moved to <a href="${esc(target)}">${esc(label)}</a>.</p></body>
</html>
`;
}

// ---------- 8. write everything ----------
function write(rel, content) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function main() {
  const products = loadProducts();
  uniqueSlugs(products);

  // product pages
  fs.rmSync(path.join(ROOT, 'product'), { recursive: true, force: true });
  for (const p of products) {
    const related = products.filter((r) => r.cat === p.cat && r.key !== p.key).slice(0, 6);
    write(`product/${p.slug}.html`, productPage(p, related));
  }
  write('product/index.html', catalogue(products));

  // redirects from old insitools.com URLs (first model wins when shared)
  const redirects = {};
  for (const p of products) {
    if (!p.oldUrl) continue;
    const rel = p.oldUrl.slice(SITE.length + 1).split('#')[0];
    if (!rel || rel === 'index.html' || redirects[rel]) continue;
    redirects[rel] = p;
  }
  const extra = ['boring-machine.html', 'facing-machine.html', 'bore-welder.html', 'pipe-cutters.html',
    'hydraulic-tools.html', 'valve-grinding-machine.html'];
  for (const rel of Object.keys(redirects)) {
    const p = redirects[rel];
    if (rel.split('/').length === 1) {
      write(rel, redirectPage(SITE + '/products.html', 'Products'));
    } else {
      write(rel, redirectPage(p.url, p.name));
    }
  }
  for (const rel of extra) if (!redirects[rel]) write(rel, redirectPage(SITE + '/products.html', 'Products'));

  // model -> static page map, used by product-detail.html for its canonical link
  const urlMap = {};
  for (const p of products) urlMap[p.key] = p.url;
  write('js/product-urls.js', '// AVISION – generated by tools/seo-build.js, do not edit by hand\n' +
    'window.INSITOOLS_PRODUCT_URLS = ' + JSON.stringify(urlMap, null, 2) + ';\n');

  // sitemap
  const core = [
    ['', '1.0'], ['products.html', '0.9'], ['product/index.html', '0.9'], ['product-list.html', '0.7'],
    ['service-rent.html', '0.8'], ['about.html', '0.6'],
  ];
  const urls = core.map(([u, pr]) => ({ loc: SITE + '/' + u, pr }))
    .concat(products.map((p) => ({ loc: p.url, pr: '0.8' })));
  write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<!-- AVISION -->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${TODAY}</lastmod><priority>${u.pr}</priority></url>`).join('\n') +
    '\n</urlset>\n');

  // llms.txt
  const groups = {};
  for (const p of products) (groups[p.cat] = groups[p.cat] || []).push(p);
  write('llms.txt', `# INSITOOLS

> INSITOOLS supplies portable on-site machining, welding, valve repair, pipe cutting and hydraulic equipment, with on-site machining services and equipment rental. Headquartered in Singapore (${COMPANY.legal}) with service teams in Thailand and across ASEAN, backed by 43+ years of industrial equipment distribution and after-sales service.

Contact: ${COMPANY.email} · ${COMPANY.phone} · WhatsApp +${COMPANY.whatsapp} · ${COMPANY.street}, ${COMPANY.city} ${COMPANY.postal}

## Key pages
- [Home](${SITE}/): overview of INSITOOLS portable machining solutions
- [All models](${SITE}/product/index.html): every model with specifications
- [Services & Rentals](${SITE}/service-rent.html): on-site machining services and equipment rental
- [About](${SITE}/about.html): company background and contacts

${Object.entries(groups).map(([cat, items]) => `## ${cat}
${catInfo(cat).what}
${items.map((p) => `- [${p.name}](${p.url})`).join('\n')}`).join('\n\n')}
`);

  console.log(`Built ${products.length} product pages, ${Object.keys(redirects).length + extra.length} redirect pages, sitemap with ${urls.length} URLs, llms.txt`);
}

main();
