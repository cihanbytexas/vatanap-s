import * as cheerio from "cheerio";

const VERSION = "15.0";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",

  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "image/avif,image/webp,*/*;q=0.8",

  "Accept-Language":
    "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",

  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

// ============================================================
// TEXT
// ============================================================

function cleanText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ============================================================
// ÜRÜN ADI
// ============================================================

function cleanName(value) {
  value = cleanText(value);

  if (!value) {
    return null;
  }

  const patterns = [
    /\s+fiyatı,?\s*teknik özellikleri.*$/i,
    /\s+fiyatı.*vatan bilgisayar'?da.*$/i,
    /\s+en ucuz fiyatlarla.*$/i
  ];

  for (const pattern of patterns) {
    value = value.replace(pattern, "");
  }

  return value.trim(" -|");
}

// ============================================================
// FİYAT
// ============================================================

function parsePrice(value) {
  if (value === null || value === undefined) {
    return null;
  }

  let text = String(value)
    .replace(/\u00a0/g, " ")
    .trim();

  /*
   * Önce Türk fiyat formatlarını yakala:
   *
   * 50.499
   * 50.499,00
   * 50499
   * 50499,00
   */

  const matches = text.match(
    /\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g
  );

  if (!matches || !matches.length) {
    return null;
  }

  /*
   * Fiyat metninde birden fazla sayı olabilir.
   * İlk uygun fiyatı değil, anlamlı fiyat adayını seç.
   */

  for (const raw of matches) {
    let number = raw.replace(/\s/g, "");

    if (number.includes(",")) {
      number = number.replace(/\./g, "");
      number = number.replace(",", ".");

      const result = Number(number);

      if (Number.isFinite(result) && result > 0) {
        return Number.isInteger(result)
          ? result
          : result;
      }

      continue;
    }

    /*
     * 50.499
     */
    if (/^\d{1,3}(?:\.\d{3})+$/.test(number)) {
      const result = Number(number.replace(/\./g, ""));

      if (Number.isFinite(result) && result > 0) {
        return result;
      }

      continue;
    }

    const result = Number(number);

    if (Number.isFinite(result) && result > 0) {
      return Number.isInteger(result)
        ? result
        : result;
    }
  }

  return null;
}

// ============================================================
// JSON-LD
// ============================================================

function parseJsonLd($) {
  const products = [];

  $("script[type='application/ld+json']").each(
    (_, element) => {
      let raw = $(element).html();

      if (!raw) {
        return;
      }

      raw = raw.trim();

      let data;

      try {
        data = JSON.parse(raw);
      } catch {
        try {
          data = JSON.parse(
            raw
              .replace(/&quot;/g, '"')
              .replace(/&amp;/g, "&")
          );
        } catch {
          return;
        }
      }

      flattenJsonLd(data, products);
    }
  );

  const product = products.find((item) => {
    const type = item["@type"];

    if (Array.isArray(type)) {
      return type.some(
        (x) => String(x).toLowerCase() === "product"
      );
    }

    return String(type || "").toLowerCase() === "product";
  });

  return product || null;
}

function flattenJsonLd(data, output) {
  if (Array.isArray(data)) {
    for (const item of data) {
      flattenJsonLd(item, output);
    }

    return;
  }

  if (!data || typeof data !== "object") {
    return;
  }

  output.push(data);

  if (data["@graph"]) {
    flattenJsonLd(data["@graph"], output);
  }
}

// ============================================================
// JSON-LD ÜRÜN
// ============================================================

function parseProductJsonLd(product, finalUrl) {
  const offers = Array.isArray(product.offers)
    ? product.offers[0]
    : product.offers;

  let price = null;
  let currency = "TRY";
  let inStock = null;
  let availabilityUrl = null;

  if (offers && typeof offers === "object") {
    price = parsePrice(
      offers.price ??
      offers.lowPrice ??
      offers.highPrice
    );

    if (offers.priceCurrency) {
      currency = String(
        offers.priceCurrency
      ).toUpperCase();
    }

    availabilityUrl =
      offers.availability || null;

    const availability =
      String(
        offers.availability || ""
      ).toLowerCase();

    if (availability) {
      inStock =
        availability.includes("instock") ||
        availability.includes("limitedavailability");
    }
  }

  let brand = product.brand;

  if (
    brand &&
    typeof brand === "object"
  ) {
    brand = brand.name;
  }

  let image = product.image;

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

  if (image) {
    image = new URL(
      image,
      finalUrl
    ).toString();
  }

  const id =
    product.productID ||
    product.sku ||
    product.mpn ||
    null;

  return {
    id: id ? String(id) : null,

    sku: product.sku
      ? String(product.sku)
      : null,

    name: cleanName(product.name),

    brand: cleanText(brand),

    price,

    currency,

    in_stock: inStock,

    availability_url: availabilityUrl,

    image: image || null,

    url: finalUrl
  };
}

// ============================================================
// HTML ÜRÜN ADI
// ============================================================

function getHtmlName($) {
  const selectors = [
    "h1",
    '[itemprop="name"]',
    'meta[property="og:title"]'
  ];

  for (const selector of selectors) {
    const element = $(selector).first();

    if (!element.length) {
      continue;
    }

    const value =
      element.attr("content") ||
      element.text();

    const name = cleanName(value);

    if (name && name.length >= 3) {
      return name;
    }
  }

  return null;
}

// ============================================================
// HTML GÖRSEL
// ============================================================

function isBadImage(url) {
  if (!url) {
    return true;
  }

  const lower = url.toLowerCase();

  const blocked = [
    "favicon",
    "user.svg",
    "/svg/",
    "placeholder",
    "default-image",
    "no-image",
    "logo"
  ];

  return blocked.some(
    (item) => lower.includes(item)
  );
}

function getHtmlImage($, finalUrl) {
  const selectors = [
    '[data-src]',
    '[data-original]',
    'img[src]',
    'meta[property="og:image"]'
  ];

  const candidates = [];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const value =
        $(element).attr("data-src") ||
        $(element).attr("data-original") ||
        $(element).attr("src") ||
        $(element).attr("content");

      if (!value) {
        return;
      }

      try {
        const absolute =
          new URL(
            value,
            finalUrl
          ).toString();

        if (!isBadImage(absolute)) {
          candidates.push(absolute);
        }
      } catch {}
    });
  }

  /*
   * Vatan ürün görsellerini önceliklendir.
   */

  const productImage =
    candidates.find((url) =>
      url.includes(
        "cdn.vatanbilgisayar.com/Upload/PRODUCT/"
      )
    );

  return productImage ||
    candidates[0] ||
    null;
}

// ============================================================
// DATA-PRICE
// ============================================================

function getDataPrices($) {
  const candidates = [];

  $("[data-price]").each((_, element) => {
    const raw =
      $(element).attr("data-price");

    const price = parsePrice(raw);

    if (
      price !== null &&
      price > 100
    ) {
      candidates.push({
        price,
        source: "data-price"
      });
    }
  });

  return candidates;
}

// ============================================================
// PRODUCT PRICE SELECTOR
// ============================================================

function getProductPrices($) {
  const candidates = [];

  const selectors = [
    ".product-price",
    ".productPrice",
    ".product-price-value",
    ".product-price-current",
    ".current-price",
    ".currentPrice",
    ".sale-price",
    ".salePrice",
    "[itemprop='price']"
  ];

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const raw =
        $(element).attr("content") ||
        $(element).attr("data-price") ||
        $(element).text();

      const price = parsePrice(raw);

      if (
        price !== null &&
        price > 100
      ) {
        candidates.push({
          price,
          source: "html-product-price"
        });
      }
    });
  }

  return candidates;
}

// ============================================================
// FİYAT DOĞRULAMA
// ============================================================

function choosePrice(
  jsonLdPrice,
  dataPrices,
  htmlPrices
) {
  const all = [];

  if (
    jsonLdPrice !== null &&
    jsonLdPrice > 100
  ) {
    all.push({
      price: jsonLdPrice,
      source: "json-ld",
      priority: 1
    });
  }

  all.push(
    ...dataPrices.map((x) => ({
      ...x,
      priority: 2
    }))
  );

  all.push(
    ...htmlPrices.map((x) => ({
      ...x,
      priority: 3
    }))
  );

  if (!all.length) {
    return {
      price: null,
      source: null,
      confidence: 0,
      status: "not_found"
    };
  }

  /*
   * Aynı fiyatı birden fazla kaynakta gören
   * adaya yüksek güven ver.
   */

  const frequency = new Map();

  for (const candidate of all) {
    frequency.set(
      candidate.price,
      (frequency.get(candidate.price) || 0) + 1
    );
  }

  let best = null;

  for (const candidate of all) {
    const count =
      frequency.get(candidate.price) || 0;

    if (!best) {
      best = {
        ...candidate,
        count
      };

      continue;
    }

    if (
      count > best.count ||
      (
        count === best.count &&
        candidate.priority < best.priority
      )
    ) {
      best = {
        ...candidate,
        count
      };
    }
  }

  let confidence = 0.70;

  if (best.count >= 3) {
    confidence = 1.0;
  } else if (best.count === 2) {
    confidence = 0.90;
  } else if (
    best.source === "json-ld"
  ) {
    confidence = 0.85;
  }

  return {
    price: best.price,
    source: best.source,
    confidence,
    status: "verified",
    candidate_count: all.length
  };
}

// ============================================================
// ANA PARSER
// ============================================================

export async function parseVatanProduct(url) {
  const errors = [];
  const warnings = [];

  let response;

  try {
    response = await fetch(url, {
      method: "GET",
      headers: HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(25000)
    });
  } catch (error) {
    return {
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        `HTTP isteği başarısız: ${error.message}`
      ],
      warnings
    };
  }

  if (!response.ok) {
    return {
      success: false,
      product: null,
      parser: {
        version: VERSION
      },
      errors: [
        `Vatan HTTP ${response.status} döndürdü.`
      ],
      warnings
    };
  }

  const finalUrl = response.url;
  const html = await response.text();

  if (!html || html.length < 5000) {
    errors.push(
      "HTML eksik veya beklenenden kısa."
    );
  }

  const $ = cheerio.load(html);

  // ----------------------------------------------------------
  // JSON-LD
  // ----------------------------------------------------------

  const jsonLd = parseJsonLd($);

  let jsonProduct = null;

  if (jsonLd) {
    jsonProduct =
      parseProductJsonLd(
        jsonLd,
        finalUrl
      );
  }

  // ----------------------------------------------------------
  // HTML
  // ----------------------------------------------------------

  const htmlName =
    getHtmlName($);

  const htmlImage =
    getHtmlImage(
      $,
      finalUrl
    );

  // ----------------------------------------------------------
  // FİYATLAR
  // ----------------------------------------------------------

  const dataPrices =
    getDataPrices($);

  const htmlPrices =
    getProductPrices($);

  const jsonPrice =
    jsonProduct?.price ?? null;

  const priceResult =
    choosePrice(
      jsonPrice,
      dataPrices,
      htmlPrices
    );

  // ----------------------------------------------------------
  // ÜRÜN
  // ----------------------------------------------------------

  const product = {
    id:
      jsonProduct?.id ||
      null,

    sku:
      jsonProduct?.sku ||
      null,

    name:
      htmlName ||
      jsonProduct?.name ||
      null,

    brand:
      jsonProduct?.brand ||
      null,

    price:
      priceResult.price,

    currency:
      jsonProduct?.currency ||
      "TRY",

    in_stock:
      jsonProduct?.in_stock ??
      true,

    availability_url:
      jsonProduct?.availability_url ||
      null,

    image:
      htmlImage ||
      jsonProduct?.image ||
      null,

    url: finalUrl,

    price_source:
      priceResult.source,

    price_status:
      priceResult.status
  };

  // ----------------------------------------------------------
  // ID FALLBACK
  // ----------------------------------------------------------

  if (!product.id) {
    const patterns = [
      /"productId"\s*:\s*"(\d+)"/i,
      /"productID"\s*:\s*"(\d+)"/i,
      /"sku"\s*:\s*"(\d+)"/i
    ];

    for (const pattern of patterns) {
      const match =
        html.match(pattern);

      if (match) {
        product.id = match[1];
        break;
      }
    }
  }

  // ----------------------------------------------------------
  // VALIDATION
  // ----------------------------------------------------------

  if (!product.name) {
    errors.push(
      "Ürün adı bulunamadı."
    );
  }

  if (
    product.price === null ||
    product.price <= 0
  ) {
    errors.push(
      "Geçerli ürün fiyatı bulunamadı."
    );
  }

  if (!product.image) {
    warnings.push(
      "Ürün görseli bulunamadı."
    );
  }

  if (
    priceResult.confidence < 0.80
  ) {
    warnings.push(
      "Fiyat güven seviyesi düşük."
    );
  }

  // ----------------------------------------------------------
  // CONFIDENCE
  // ----------------------------------------------------------

  let confidence = 0;

  if (product.id) {
    confidence += 0.15;
  }

  if (product.name) {
    confidence += 0.25;
  }

  if (product.price !== null) {
    confidence += 0.35;
  }

  if (product.image) {
    confidence += 0.15;
  }

  if (
    product.in_stock !== null
  ) {
    confidence += 0.10;
  }

  confidence = Math.min(
    1,
    Number(confidence.toFixed(2))
  );

  // ----------------------------------------------------------
  // FINAL
  // ----------------------------------------------------------

  return {
    success: errors.length === 0,

    product,

    price_verification: {
      status:
        priceResult.status,

      confidence:
        priceResult.confidence,

      source:
        priceResult.source,

      candidate_count:
        priceResult.candidate_count ||
        0
    },

    parser: {
      version: VERSION,

      source:
        jsonProduct
          ? "json-ld+html"
          : "html",

      json_ld_found:
        Boolean(jsonLd),

      confidence
    },

    errors,
    warnings
  };
}
