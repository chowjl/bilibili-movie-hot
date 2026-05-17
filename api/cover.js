module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  try {
    const src = req.query && req.query.src;
    if (!src) throw new Error("Missing cover URL");

    const imageUrl = new URL(Array.isArray(src) ? src[0] : src);
    if (!/(^|\.)hdslb\.com$/i.test(imageUrl.hostname)) {
      throw new Error("Unsupported cover host");
    }

    const response = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        Referer: "https://www.bilibili.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      }
    });

    if (!response.ok) throw new Error(`Cover returned ${response.status}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
    res.end(buffer);
  } catch (error) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(error.message);
  }
};
