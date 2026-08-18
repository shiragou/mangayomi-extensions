const mangayomiSources = [{
  "name": "哔哩轻小说",
  "id": 1278796714,
  "lang": "zh",
  "baseUrl": "https://www.bilinovel.com",
  "apiUrl": "",
  "iconUrl": "https://www.bilinovel.com/favicon.ico",
  "typeSource": "single",
  "itemType": 2,
  "version": "0.0.2",
  "pkgPath": "novel/src/zh/bilinovel.js",
  "isNsfw": false,
  "hasCloudflare": true,
  "notes": ""
}];

class DefaultExtension extends MProvider {
  getHeaders(url) {
    const headers = {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": `${this.source.baseUrl}/`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
    };
    const cookie = String(new SharedPreferences().getString("bilinovel_cookie", "") || "")
      .trim()
      .replace(/^Cookie:\s*/i, "");
    if (cookie) headers["Cookie"] = cookie;
    return headers;
  }

  get supportsLatest() {
    return true;
  }

  _absolute(path, baseUrl) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    if (path.startsWith("//")) return `https:${path}`;
    const base = baseUrl || this.source.baseUrl;
    if (path.startsWith("/")) return `${base}${path}`;
    return `${base}/${path}`;
  }

  _image(element) {
    const value = element.attr("data-src") || element.attr("src");
    return this._absolute(value);
  }

  _parseList(body) {
    const doc = new Document(body);
    const detailTitle = doc.selectFirst("h1.book-title").text.trim();
    const detailCatalog = doc.selectFirst("#btnReadBook").attr("href");
    if (detailTitle && detailCatalog) {
      const cover = doc.selectFirst("img.book-cover").attr("src") || doc.selectFirst(".book-cover img").attr("src");
      return {
        list: [{
          name: detailTitle,
          link: this._absolute(detailCatalog).replace(/\/catalog\/?$/, ".html"),
          imageUrl: this._absolute(cover)
        }],
        hasNextPage: false
      };
    }

    const list = [];
    const seen = {};
    for (const item of doc.select("ol.book-ol.book-ol-normal li.book-li, li.book-li")) {
      const anchor = item.selectFirst("a.book-layout");
      const href = anchor.attr("href");
      const name = item.selectFirst("h4.book-title").text.trim();
      if (!href || !name || seen[href]) continue;
      seen[href] = true;
      list.push({
        name,
        link: this._absolute(href),
        imageUrl: this._image(item.selectFirst("img"))
      });
    }
    const next = doc.selectFirst("#pagelink a.next").attr("href") || doc.selectFirst("a.next").attr("href");
    return { list, hasNextPage: !!next };
  }

  async getPopular(page) {
    const url = `${this.source.baseUrl}/top/monthvisit/${page}.html`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this._parseList(res.body);
  }

  async getLatestUpdates(page) {
    const url = `${this.source.baseUrl}/wenku/postdate_0_0_0_0_0_0_0_${page}_0.html`;
    const res = await new Client().get(url, this.getHeaders(url));
    return this._parseList(res.body);
  }

  _captureCookies(res, jar) {
    const raw = String((res.headers && (res.headers["set-cookie"] || res.headers["Set-Cookie"])) || "");
    const regex = /(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      jar[match[1]] = match[2];
    }
  }

  _cookieHeader(jar) {
    return Object.keys(jar).map((name) => `${name}=${jar[name]}`).join("; ");
  }

  _guardHeaders(url, jar, referer) {
    const headers = this.getHeaders(url);
    const configured = headers["Cookie"] || "";
    const generated = this._cookieHeader(jar);
    if (configured || generated) {
      headers["Cookie"] = [configured, generated].filter((value) => value).join("; ");
    }
    headers["Referer"] = referer || `${this.source.baseUrl}/`;
    return headers;
  }

  async _searchWithGuard(url) {
    const client = new Client();
    const jar = {};
    const home = await client.get(this.source.baseUrl, this._guardHeaders(this.source.baseUrl, jar));
    this._captureCookies(home, jar);

    const cssUrl = `${this.source.baseUrl}/search.html?search_guard=css`;
    const css = await client.get(cssUrl, this._guardHeaders(cssUrl, jar, this.source.baseUrl));
    this._captureCookies(css, jar);

    const jsUrl = `${this.source.baseUrl}/search.html?search_guard=js`;
    const js = await client.get(jsUrl, this._guardHeaders(jsUrl, jar, this.source.baseUrl));
    this._captureCookies(js, jar);
    const jsCookie = js.body.match(/document\.cookie=["']([^=;"']+)=([^;"']+)/i);
    if (jsCookie) jar[jsCookie[1]] = jsCookie[2];

    const redeemUrl = `${this.source.baseUrl}/search.html?search_guard=redeem&r=${Date.now()}`;
    const redeem = await client.get(redeemUrl, this._guardHeaders(redeemUrl, jar, this.source.baseUrl));
    this._captureCookies(redeem, jar);

    const res = await client.get(url, this._guardHeaders(url, jar, this.source.baseUrl));
    if (!res.body) {
      throw new Error("哔哩轻小说搜索校验失败，请先在 Mangayomi WebView 中打开网站后重试。 ");
    }
    return res;
  }

  async search(query, page, filters) {
    const keyword = encodeURIComponent(query.trim());
    const url = page > 1
      ? `${this.source.baseUrl}/search/${keyword}_${page}.html`
      : `${this.source.baseUrl}/search.html?searchkey=${keyword}`;
    const res = await this._searchWithGuard(url);
    return this._parseList(res.body);
  }

  _toStatus(text) {
    if (/完结|已完本/.test(text)) return 1;
    if (/连载|写作中/.test(text)) return 0;
    if (/暂停|休载/.test(text)) return 4;
    return 3;
  }

  async getDetail(url) {
    const client = new Client();
    const res = await client.get(url, this.getHeaders(url));
    const doc = new Document(res.body);
    const name = doc.selectFirst("h1.book-title").text.trim();
    const cover = doc.selectFirst("img.book-cover").attr("src") || doc.selectFirst(".book-cover img").attr("src");
    const description = doc.selectFirst(".book-summary content").text.trim() || doc.selectFirst(".book-summary").text.trim();
    const author = doc.selectFirst(".authorname").text.trim();
    const genre = doc.select(".tag-small-group .tag-small").map((element) => element.text.trim()).filter((value) => value);
    const meta = doc.select(".book-meta").map((element) => element.text.trim()).join(" ");
    const catalogHref = doc.selectFirst("#btnReadBook").attr("href") || `${url.replace(/\.html(?:\?.*)?$/, "")}/catalog`;
    const catalogUrl = this._absolute(catalogHref);
    const catalogRes = await client.get(catalogUrl, this.getHeaders(catalogUrl));
    const catalog = new Document(catalogRes.body);
    const chapters = [];

    for (const volume of catalog.select("#volumes .catalog-volume")) {
      const volumeName = volume.selectFirst("li.chapter-bar h3").text.trim();
      for (const chapter of volume.select("li.jsChapter a")) {
        const chapterUrl = chapter.attr("href");
        const chapterName = chapter.selectFirst(".chapter-index").text.trim() || chapter.text.trim();
        if (!chapterUrl || !chapterName) continue;
        chapters.push({
          name: chapterName,
          url: this._absolute(chapterUrl),
          dateUpload: "",
          scanlator: volumeName
        });
      }
    }

    return {
      name,
      link: url,
      imageUrl: this._absolute(cover),
      description,
      author,
      artist: "",
      genre,
      status: this._toStatus(meta),
      chapters
    };
  }

  _normalizeChapterImages(html, pageUrl) {
    const originMatch = String(pageUrl || "").match(/^(https?:\/\/[^/]+)/i);
    const baseUrl = originMatch ? originMatch[1] : this.source.baseUrl;
    return String(html).replace(/<img\b[^>]*>/gi, (tag) => {
      const lazy = tag.match(/\s(?:data-src|data-original|data-lazy-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const regular = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      let source = lazy ? (lazy[1] || lazy[2] || lazy[3] || "") : "";
      if (!source && regular) source = regular[1] || regular[2] || regular[3] || "";
      source = source.trim().replace(/&amp;/gi, "&");
      if (!source) return tag;

      const resolved = /^data:/i.test(source)
        ? source
        : this._absolute(source, baseUrl).replace(/^http:/i, "https:");
      const escaped = resolved.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const attributes = tag
        .replace(/^<img\b/i, "")
        .replace(/\/?>\s*$/, "")
        .replace(/\s(?:src|data-src|data-original|data-lazy-src|srcset|data-srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<img${attributes} src="${escaped}">`;
    });
  }

  _cleanChapter(html, pageUrl) {
    const cleaned = String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
      .replace(/<ins\b[\s\S]*?<\/ins>/gi, "")
      .replace(/<div\b[^>]*class=["'][^"']*(?:google-auto-placed|ap_container)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, "");
    return this._normalizeChapterImages(cleaned, pageUrl);
  }

  _contentFromBody(body, pageUrl) {
    const doc = new Document(body);
    const content = doc.selectFirst("#TextContent, #acontent");
    const text = content.text.trim();
    if (!text) return "";
    if (/內容加載失敗|内容加载失败|內容載入失敗/.test(text)) return "";
    return this._cleanChapter(content.innerHtml, pageUrl);
  }

  async getHtmlContent(name, url) {
    const client = new Client();
    let res = await client.get(url, this.getHeaders(url));
    let html = this._contentFromBody(res.body, url);

    if (!html) {
      const desktopUrl = url.replace("www.bilinovel.com", "www.linovelib.com");
      if (desktopUrl !== url) {
        res = await client.get(desktopUrl, this.getHeaders(desktopUrl));
        html = this._contentFromBody(res.body, desktopUrl);
      }
    }
    if (!html) {
      throw new Error("章节正文触发浏览器校验，请先用 Mangayomi WebView 打开本章，或在扩展设置中填写 Cookie。 ");
    }
    return `<div>${html}</div>`;
  }

  async cleanHtmlContent(html) {
    return this._cleanChapter(html);
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [{
      key: "bilinovel_cookie",
      editTextPreference: {
        title: "哔哩轻小说 Cookie（可选）",
        summary: "仅在章节正文触发浏览器校验时需要。",
        value: "",
        dialogTitle: "哔哩轻小说 Cookie",
        dialogMessage: "格式：name=value; name2=value2"
      }
    }];
  }
}
