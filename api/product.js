// api/product.js
// VATAN PRODUCT API V16
// Tek dosya - Vercel uyumlu
//
// POST /api/product
// Body:
// {
//   "url": "https://www.vatanbilgisayar.com/....html"
// }

const VERSION = "16.0";

const V10 = "https://www.vatanbilgisayar.com/";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/139.0.0.0 Safari/537.36",

  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,image/apng,*/*;q=0.8",

  "Accept-Language":
    "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",

  "Cache-Control": "no-cache",
  "Pragma": "no-cache",

  "Sec-Ch-Ua":
    '"Chromium";v="139", "Google Chrome";v="139", "Not-A.Brand";v="99"',

  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',

  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",

  "Upgrade-Insecure-Requests": "1"
};

// ============================================================
// HELPERS
// ============================================================

function cleanText(value) {
  if (value === undefined || value === null) return null;

  return String(value)
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#x2B;/gi, "+")
    .replace(/&#43;/gi, "+")
    .replace(/&#x131;/gi, "ı")
    .replace(/&#x130;/gi, "İ")
    .replace(/&#x15F;/gi, "ş")
    .replace(/&#x15E;/gi, "Ş")
    .replace(/&#x11F;/gi, "ğ")
    .replace(/&#x11E;/gi, "Ğ")
    .replace(/&#xFC;/gi, "ü")
    .replace(/&#xDC;/gi, "Ü")
    .replace(/&#xF6;/gi, "ö")
    .replace(/&#xD6;/gi, "Ö")
    .replace(/&#xE7;/gi, "ç")
    .replace(/&#xC7;/gi, "Ç")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  let name = cleanText(value);

  if (!name) return null;

  const patterns = [
    /\s+fiyatı,?\s*teknik özellikleri.*$/i,
    /\s+fiyatı.*vatan bilgisayar'?da.*$/i,
    /\s+en ucuz fiyatlarla.*$/i,
    /\s+\|\s*vatan bilgisayar.*$/i
  ];

  for (const pattern of patterns) {
    name = name.replace(pattern, "");
  }

  return name.replace(/\s+/g, " ").trim();
}

function decodeHtml(value) {
  if (!value) return null;

  return cleanText(
    String(value)
      .replace(/&quot;/gi, '"')
      .replace(/&#34;/gi, '"')
      .replace(/&#x22;/gi, '"')
      .replace(/&amp;/gi, "&")
  );
}

// ============================================================
// PRICE PARSER
// ============================================================

function parsePrice(value) {
  if (value === undefined || value === null) return null;

  let text = decodeHtml(value);

  if (!text) return null;

  text = text
    .replace(/TL/gi, "")
    .replace(/TRY/gi, "")
    .replace(/\u00a0/g, " ")
    .trim();

  // 50.499,00
  let m = text.match(
    /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?)/ 
  );

  if (m) {
    let n = m[1]
      .replace(/\./g, "")
      .replace(",", ".");

    const price = Number(n);

    if (Number.isFinite(price)) {
      return price;
    }
  }

  // 50499,00
  m = text.match(/(\d+,\d{1,2})/);

  if (m) {
    const price = Number(
      m[1].replace(",", ".")
    );

    if (Number.isFinite(price)) {
      return price;
    }
  }

  // 50499.00
  m = text.match(/(\d+(?:\.\d+)?)/);

  if (!m) return null;

  const price = Number(m[1]);

  if (!Number.isFinite(price)) return null;

  return Number.isInteger(price)
    ? price
    : price;
}

// ============================================================
// HTML ATTRIBUTE
// ============================================================

function attr(tag, name) {
  if (!tag) return null;

  const re = new RegExp(
    name + '\\s*=\\s*["\']([^"\']+)["\']',
    "i"
  );

  const match = tag.match(re);

  return match ? decodeHtml(match[1]) : null;
}

// ============================================================
// JSON-LD
// ============================================================

function getJsonLd(html) {
  const results = [];

  const regex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let match;

  while ((match = regex.exec(html)) !== null) {
    let raw = match[1].trim();

    if (!raw) continue;

    try {
      results.push(JSON.parse(raw));
      continue;
    } catch {}

    try {
      results.push(
        JSON.parse(
          raw
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
        )
      );
    } catch {}
  }

  return results;
}

function flattenJsonLd(data) {
  const result = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      result.push(...flattenJsonLd(item));
    }

    return result;
  }

  if (!data || typeof data !== "object") {
    return result;
  }

  result.push(data);

  if (Array.isArray(data["@graph"])) {
    result.push(
      ...flattenJsonLd(data["@graph"])
    );
  }

  return result;
}

function findJsonProduct(html) {
  const data = getJsonLd(html);

  const products = [];

  for (const root of data) {
    for (const item of flattenJsonLd(root)) {
      let type = item["@type"];

      if (!Array.isArray(type)) {
        type = [type];
      }

      type = type
        .filter(Boolean)
        .map(x => String(x).toLowerCase());

      if (type.includes("product")) {
        products.push(item);
      }
    }
  }

  if (!products.length) return null;

  // Offer içeren Product öncelikli
  const withOffers = products.find(
    p => p.offers
  );

  return withOffers || products[0];
}

// ============================================================
// ID
// ============================================================

function findProductId(html, jsonProduct) {
  if (jsonProduct) {
    const id =
      jsonProduct.productID ||
      jsonProduct.sku ||
      jsonProduct.mpn;

    if (id) return String(id);
  }

  const patterns = [
    /"productId"\s*:\s*"(\d+)"/i,
    /"productID"\s*:\s*"(\d+)"/i,
    /"sku"\s*:\s*"(\d+)"/i,
    /productId\s*=\s*["'](\d+)["']/i,
    /\/(\d{5,})/
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

// ============================================================
// NAME
// ============================================================

function findName(html, jsonProduct) {
  if (jsonProduct?.name) {
    const name = cleanName(jsonProduct.name);

    if (name) return name;
  }

  // H1
  const h1 = html.match(
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i
  );

  if (h1) {
    const name = cleanName(
      h1[1].replace(/<[^>]+>/g, " ")
    );

    if (name) return name;
  }

  // og:title
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  );

  if (og) {
    return cleanName(og[1]);
  }

  // title
  const title = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  if (title) {
    return cleanName(
      title[1].replace(/<[^>]+>/g, " ")
    );
  }

  return null;
}

// ============================================================
// BRAND
// ============================================================

function findBrand(html, jsonProduct) {
  if (jsonProduct?.brand) {
    if (
      typeof jsonProduct.brand === "object"
    ) {
      return cleanText(
        jsonProduct.brand.name
      );
    }

    return cleanText(
      jsonProduct.brand
    );
  }

  const patterns = [
    /<meta[^>]+property=["']product:brand["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']brand["'][^>]+content=["']([^"']+)["']/i
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match) {
      return cleanText(match[1]);
    }
  }

  return null;
}

// ============================================================
// IMAGE
// ============================================================

function normalizeImage(url, baseUrl) {
  if (!url) return null;

  url = decodeHtml(url);

  if (!url) return null;

  if (
    url.startsWith("data:") ||
    url.includes("user.svg") ||
    url.includes("favicon") ||
    url.includes("logo")
  ) {
    return null;
  }

  try {
    return new URL(
      url,
      baseUrl
    ).href;
  } catch {
    return null;
  }
}

function findImage(html, jsonProduct, baseUrl) {
  // JSON-LD
  if (jsonProduct?.image) {
    let image = jsonProduct.image;

    if (Array.isArray(image)) {
      image = image[0];
    }

    if (
      image &&
      typeof image === "object"
    ) {
      image =
        image.url ||
        image.contentUrl;
    }

    const result = normalizeImage(
      image,
      baseUrl
    );

    if (result) {
      return {
        url: result,
        source: "json-ld"
      };
    }
  }

  // Vatan product image pattern
  const imageRegex =
    /<img\b[^>]*(?:data-src|data-original|src)=["']([^"']+)["'][^>]*>/gi;

  const candidates = [];

  let match;

  while (
    (match = imageRegex.exec(html)) !== null
  ) {
    const tag = match[0];

    const dataSrc =
      attr(tag, "data-src") ||
      attr(tag, "data-original");

    const src =
      dataSrc ||
      attr(tag, "src");

    const image = normalizeImage(
      src,
      baseUrl
    );

    if (!image) continue;

    // CDN product image önceliği
    let score = 0;

    if (
      image.includes(
        "cdn.vatanbilgisayar.com/Upload/PRODUCT/"
      )
    ) {
      score += 100;
    }

    if (
      image.includes("_large")
    ) {
      score += 30;
    }

    if (
      image.includes("_small")
    ) {
      score += 10;
    }

    if (
      image.includes("thumb")
    ) {
      score += 5;
    }

    if (
      image.includes("user.svg") ||
      image.includes("favicon") ||
      image.includes("logo")
    ) {
      score -= 1000;
    }

    candidates.push({
      url: image,
      score,
      source: dataSrc
        ? "data-src"
        : "src"
    });
  }

  candidates.sort(
    (a, b) => b.score - a.score
  );

  if (candidates.length) {
    return candidates[0];
  }

  // og:image son fallback
  const og = html.match(
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
  );

  if (og) {
    const image = normalizeImage(
      og[1],
      baseUrl
    );

    if (image) {
      return {
        url: image,
        source: "og:image"
      };
    }
  }

  return {
    url: null,
    source: null
  };
}

// ============================================================
// PRICE CANDIDATES
// ============================================================

function collectPriceCandidates(
  html,
  jsonProduct
) {
  const candidates = [];

  function add(
    price,
    source,
    raw = null,
    score = 0
  ) {
    if (
      price === null ||
      price === undefined
    ) {
      return;
    }

    if (
      !Number.isFinite(price) ||
      price <= 0
    ) {
      return;
    }

    // Ürün fiyatlarında 100 TL altı
    // yanlış eşleşme olma ihtimali yüksek.
    if (price < 100) {
      return;
    }

    candidates.push({
      price,
      source,
      raw,
      score
    });
  }

  // ----------------------------------------------------------
  // JSON-LD
  // ----------------------------------------------------------

  if (jsonProduct?.offers) {
    let offers =
      jsonProduct.offers;

    if (Array.isArray(offers)) {
      offers = offers[0];
    }

    if (
      offers &&
      typeof offers === "object"
    ) {
      add(
        parsePrice(
          offers.price ??
          offers.lowPrice
        ),
        "json-ld",
        offers.price,
        100
      );
    }
  }

  // ----------------------------------------------------------
  // data-price
  // ----------------------------------------------------------

  const dataPriceRegex =
    /data-price\s*=\s*["']([^"']+)["']/gi;

  let match;

  while (
    (match = dataPriceRegex.exec(html)) !== null
  ) {
    add(
      parsePrice(match[1]),
      "data-price",
      match[1],
      95
    );
  }

  // ----------------------------------------------------------
  // product price selectors
  // ----------------------------------------------------------

  const priceClassRegex =
    /<(?:span|div|p|strong)[^>]*class=["'][^"']*(?:product-price|productPrice|product-price-current|current-price|currentPrice|sale-price|salePrice|price)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div|p|strong)>/gi;

  while (
    (match = priceClassRegex.exec(html)) !== null
  ) {
    const raw =
      match[1]
        .replace(/<[^>]+>/g, " ");

    add(
      parsePrice(raw),
      "html-product-price",
      raw,
      90
    );
  }

  // ----------------------------------------------------------
  // itemprop
  // ----------------------------------------------------------

  const itempropRegex =
    /<[^>]+itemprop=["']price["'][^>]*>/gi;

  while (
    (match = itempropRegex.exec(html)) !== null
  ) {
    const tag = match[0];

    const content =
      attr(tag, "content") ||
      attr(tag, "value");

    add(
      parsePrice(content),
      "itemprop",
      content,
      85
    );
  }

  return candidates;
}

// ============================================================
// PRICE SELECTOR
// ============================================================

function choosePrice(candidates) {
  if (!candidates.length) {
    return {
      price: null,
      source: null,
      confidence: 0
    };
  }

  // Aynı fiyatın tekrar sayısını hesapla
  const frequency = {};

  for (const c of candidates) {
    const key = String(c.price);

    frequency[key] =
      (frequency[key] || 0) + 1;
  }

  const scored = candidates.map(
    c => ({
      ...c,
      finalScore:
        c.score +
        (frequency[String(c.price)] || 0) *
          15
    })
  );

  scored.sort(
    (a, b) =>
      b.finalScore -
      a.finalScore
  );

  const best = scored[0];

  let confidence = 0.5;

  if (best.score >= 95) {
    confidence = 0.95;
  } else if (best.score >= 90) {
    confidence = 0.90;
  } else if (best.score >= 85) {
    confidence = 0.85;
  }

  if (
    frequency[String(best.price)] >= 2
  ) {
    confidence += 0.05;
  }

  confidence = Math.min(
    confidence,
    1
  );

  return {
    price: best.price,
    source: best.source,
    confidence:
      Math.round(confidence * 100) / 100
  };
}

// ============================================================
// STOCK
// ============================================================

function findStock(
  html,
  jsonProduct
) {
  if (jsonProduct?.offers) {
    let offers =
      jsonProduct.offers;

    if (Array.isArray(offers)) {
      offers = offers[0];
    }

    const availability =
      String(
        offers?.availability || ""
      ).toLowerCase();

    if (availability) {
      if (
        availability.includes(
          "instock"
        ) ||
        availability.includes(
          "limitedavailability"
        )
      ) {
        return true;
      }

      if (
        availability.includes(
          "outofstock"
        ) ||
        availability.includes(
          "soldout"
        )
      ) {
        return false;
      }
    }
  }

  const lower =
    html.toLowerCase();

  if (
    lower.includes(
      "tükendi"
    ) &&
    !lower.includes(
      "stokta"
    )
  ) {
    return false;
  }

  if (
    lower.includes(
      "stokta yok"
    )
  ) {
    return false;
  }

  return true;
}

// ============================================================
// URL VALIDATION
// ============================================================

function validateVatanUrl(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return {
      ok: false,
      error: "URL zorunludur."
    };
  }

  let url;

  try {
    url = new URL(value.trim());
  } catch {
    return {
      ok: false,
      error: "Geçersiz URL."
    };
  }

  const hostname =
    url.hostname.toLowerCase();

  const allowed =
    hostname ===
      "vatanbilgisayar.com" ||
    hostname.endsWith(
      ".vatanbilgisayar.com"
    );

  if (
    url.protocol !== "https:" ||
    !allowed
  ) {
    return {
      ok: false,
      error:
        "Sadece HTTPS Vatan Bilgisayar ürün URL'leri kabul edilir."
    };
  }

  return {
    ok: true,
    url:
      "https://www.vatanbilgisayar.com" +
      url.pathname +
      url.search
  };
}

// ============================================================
// FETCH
// ============================================================

async function fetchVatan(url) {
  // Önce ana domain üzerinden session/cookie alma
  let homeResponse;

  try {
    homeResponse = await fetch(
      V10,
      {
        method: "GET",
        headers: HEADERS,
        redirect: "follow"
      }
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        "Vatan ana sayfasına erişilemedi: " +
        error.message
    };
  }

  const cookies =
    homeResponse.headers.get(
      "set-cookie"
    );

  const headers = {
    ...HEADERS,
    Referer: V10
  };

  if (cookies) {
    headers.Cookie = cookies
      .split(",")
      .map(x => x.split(";")[0])
      .join("; ");
  }

  let response;

  try {
    response = await fetch(
      url,
      {
        method: "GET",
        headers,
        redirect: "follow"
      }
    );
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error:
        "Vatan ürün sayfasına erişilemedi: " +
        error.message
    };
  }

  const text =
    await response.text();

  return {
    ok: response.ok,
    status: response.status,
    text,
    finalUrl: response.url,
    headers: response.headers
  };
}

// ============================================================
// PARSER
// ============================================================

async function parseProduct(url) {
  const fetched =
    await fetchVatan(url);

  if (!fetched.ok) {
    return {
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        fetched.status === 403
          ? "Vatan HTTP 403 döndürdü. Vatan sunucusu bu sunucu isteğini reddetti."
          : `Vatan HTTP ${fetched.status} döndürdü.`
      ],
      warnings: []
    };
  }

  const html =
    fetched.text;

  if (
    !html ||
    html.length < 5000
  ) {
    return {
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        "Vatan sayfası eksik veya geçersiz HTML döndürdü."
      ],
      warnings: []
    };
  }

  const jsonProduct =
    findJsonProduct(html);

  const name =
    findName(
      html,
      jsonProduct
    );

  const brand =
    findBrand(
      html,
      jsonProduct
    );

  const id =
    findProductId(
      html,
      jsonProduct
    );

  const image =
    findImage(
      html,
      jsonProduct,
      fetched.finalUrl || url
    );

  const candidates =
    collectPriceCandidates(
      html,
      jsonProduct
    );

  const selected =
    choosePrice(
      candidates
    );

  const inStock =
    findStock(
      html,
      jsonProduct
    );

  const warnings = [];

  // Kaynaklar arasında ciddi fiyat farkı varsa
  const uniquePrices = [
    ...new Set(
      candidates.map(
        c => c.price
      )
    )
  ];

  if (
    uniquePrices.length > 1 &&
    selected.price
  ) {
    const max =
      Math.max(...uniquePrices);

    const min =
      Math.min(...uniquePrices);

    if (
      max / min >= 1.5
    ) {
      warnings.push(
        "Fiyat kaynakları arasında büyük fark var."
      );
    }
  }

  const errors = [];

  if (!name) {
    errors.push(
      "Ürün adı bulunamadı."
    );
  }

  if (!selected.price) {
    errors.push(
      "Güncel ürün fiyatı bulunamadı."
    );
  }

  if (!image.url) {
    warnings.push(
      "Ürün görseli bulunamadı."
    );
  }

  if (!id) {
    warnings.push(
      "Ürün ID bulunamadı."
    );
  }

  let confidence = 0;

  if (name) confidence += 0.25;
  if (id) confidence += 0.15;
  if (selected.price) confidence += 0.35;
  if (image.url) confidence += 0.15;
  if (brand) confidence += 0.05;
  if (inStock !== null) confidence += 0.05;

  confidence =
    Math.min(
      1,
      Math.round(
        confidence * 100
      ) / 100
    );

  const source =
    jsonProduct &&
    selected.source === "json-ld"
      ? "json-ld"
      : "html";

  return {
    success:
      errors.length === 0,

    product: {
      id,
      name,
      brand,
      price:
        selected.price,
      currency: "TRY",
      in_stock:
        inStock,
      image:
        image.url,
      url:
        fetched.finalUrl || url
    },

    price_verification: {
      status:
        selected.price
          ? "verified"
          : "not_found",

      confidence:
        selected.confidence,

      source:
        selected.source,

      candidate_count:
        candidates.length
    },

    parser: {
      version: VERSION,
      source,
      json_ld_found:
        !!jsonProduct,
      confidence
    },

    errors,
    warnings
  };
}

// ============================================================
// VERCEL HANDLER
// ============================================================

export default async function handler(
  req,
  res
) {
  // CORS
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  // OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Sadece POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        "Sadece POST metodu destekleniyor."
      ],
      warnings: []
    });
  }

  let body = req.body;

  // Bazı Vercel durumlarında body string gelebilir
  if (
    typeof body === "string"
  ) {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        success: false,
        product: null,
        parser: {
          version: VERSION
        },
        errors: [
          "Geçersiz JSON."
        ],
        warnings: []
      });
    }
  }

  const inputUrl =
    body?.url;

  const validation =
    validateVatanUrl(
      inputUrl
    );

  if (!validation.ok) {
    return res.status(400).json({
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        validation.error
      ],
      warnings: []
    });
  }

  try {
    const result =
      await parseProduct(
        validation.url
      );

    // Vatan 403 gibi gerçek upstream
    // hatalarında 502 kullan.
    if (
      !result.success &&
      result.errors.some(
        e =>
          e.includes(
            "HTTP 403"
          ) ||
          e.includes(
            "HTTP 4"
          ) ||
          e.includes(
            "HTTP 5"
          )
      )
    ) {
      return res
        .status(502)
        .json(result);
    }

    return res
      .status(
        result.success
          ? 200
          : 422
      )
      .json(result);

  } catch (error) {
    console.error(
      "VATAN PARSER ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        "Sunucu tarafında beklenmeyen hata.",
        error.message
      ],
      warnings: []
    });
  }
}
