import { parseVatanProduct } from "../lib/vatan-parser.js";

export default async function handler(req, res) {
  // ---------------------------------------------------------
  // SADECE POST
  // ---------------------------------------------------------

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      success: false,
      error: "Sadece POST metodu desteklenmektedir."
    });
  }

  // ---------------------------------------------------------
  // BODY
  // ---------------------------------------------------------

  let body = req.body;

  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      return res.status(400).json({
        success: false,
        error: "Geçersiz JSON."
      });
    }
  }

  if (!body || typeof body !== "object") {
    return res.status(400).json({
      success: false,
      error: "JSON body gönderilmelidir."
    });
  }

  const url = body.url;

  if (!url || typeof url !== "string") {
    return res.status(400).json({
      success: false,
      error: "url alanı zorunludur."
    });
  }

  // ---------------------------------------------------------
  // URL DOĞRULAMA
  // ---------------------------------------------------------

  let parsedUrl;

  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return res.status(400).json({
      success: false,
      error: "Geçersiz URL."
    });
  }

  /*
   * SADECE:
   *
   * https://www.vatanbilgisayar.com/...
   *
   * kabul edilir.
   */

  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.hostname !== "www.vatanbilgisayar.com"
  ) {
    return res.status(400).json({
      success: false,
      error:
        "Sadece https://www.vatanbilgisayar.com/ adresleri kabul edilmektedir."
    });
  }

  // Ana sayfa yerine ürün URL'si bekle
  if (
    !parsedUrl.pathname ||
    parsedUrl.pathname === "/" ||
    parsedUrl.pathname.length < 5
  ) {
    return res.status(400).json({
      success: false,
      error: "Geçerli bir Vatan Bilgisayar ürün URL'si gönderilmelidir."
    });
  }

  // ---------------------------------------------------------
  // SCRAPE
  // ---------------------------------------------------------

  try {
    const result = await parseVatanProduct(
      parsedUrl.toString()
    );

    if (!result.success) {
      return res.status(422).json(result);
    }

    return res.status(200).json(result);

  } catch (error) {
    console.error("Vatan API error:", error);

    return res.status(500).json({
      success: false,
      error: "Ürün alınırken beklenmeyen bir hata oluştu."
    });
  }
}
