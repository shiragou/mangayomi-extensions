const mangayomiSources = [{
  "name": "轻小说文库 (Wenku8)",
  "id": 1278796713,
  "lang": "zh",
  "baseUrl": "https://www.wenku8.net",
  "apiUrl": "",
  "iconUrl": "https://www.wenku8.net/favicon.ico",
  "typeSource": "single",
  "itemType": 2,
  "version": "0.0.3",
  "pkgPath": "novel/src/zh/wenku8.js",
  "isNsfw": false,
  "hasCloudflare": false,
  "notes": ""
}];

class DefaultExtension extends MProvider {
  loginCookie = "";
  loginAttempted = false;

  getHeaders(url) {
    const headers = {
      "Accept": "text/vnd.wap.wml,application/xhtml+xml,text/html;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": `${this.source.baseUrl}/wap/`,
      "User-Agent": "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36"
    };
    const cookie = this._preferredCookie() || this.loginCookie;
    if (cookie) headers["Cookie"] = cookie;
    return headers;
  }

  get supportsLatest() {
    return true;
  }

  _preference(key) {
    return String(new SharedPreferences().getString(key, "") || "").trim();
  }

  _preferredCookie() {
    return this._preference("wenku8_cookie").replace(/^Cookie:\s*/i, "");
  }

  _cookieFromResponse(res) {
    const raw = String((res.headers && (res.headers["set-cookie"] || res.headers["Set-Cookie"])) || "");
    const cookies = [];
    const regex = /(?:^|,\s*)([^=;,\s]+)=([^;,]*)/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      cookies.push(`${match[1]}=${match[2]}`);
    }
    return cookies.join("; ");
  }

  async _login() {
    if (this.loginAttempted) return this.loginCookie;
    this.loginAttempted = true;

    const username = this._preference("wenku8_username");
    const password = this._preference("wenku8_password");
    if (!username || !password) return "";

    const url = `${this.source.baseUrl}/wap/login.php`;
    const body = [
      "action=login",
      "jumpurl=%2Fwap%2F",
      `username=${encodeURIComponent(username)}`,
      `password=${encodeURIComponent(password)}`
    ].join("&");
    const headers = {
      ...this.getHeaders(url),
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
    };
    const res = await new Client({ followRedirects: false }).post(url, headers, body);
    this.loginCookie = this._cookieFromResponse(res);
    if (!this.loginCookie) {
      throw new Error("Wenku8 登录失败：未收到登录 Cookie，请检查用户名和密码，或直接填写 Cookie。 ");
    }
    return this.loginCookie;
  }

  async _request(url, method, body, requiresLogin) {
    if (requiresLogin && !this._preferredCookie() && !this.loginCookie) {
      await this._login();
    }
    const client = new Client();
    const headers = this.getHeaders(url);
    const res = method === "POST"
      ? await client.post(url, { ...headers, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }, body)
      : await client.get(url, headers);

    if (requiresLogin && /<card[^>]+title=["'](?:会员登录|登录)["']|name=["']username["']/i.test(res.body)) {
      throw new Error("Wenku8 需要登录：请在扩展设置中填写 Cookie，或填写用户名和密码。 ");
    }
    return res;
  }

  _absolute(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path.replace(/^http:/i, "https:");
    if (path.startsWith("//")) return `https:${path}`;
    if (path.startsWith("/")) return `${this.source.baseUrl}${path}`;
    return `${this.source.baseUrl}/wap/article/${path}`;
  }

  _decodeText(html) {
    return new Document(`<div>${html || ""}</div>`).selectFirst("div").text.trim();
  }

  _bookId(url) {
    const match = String(url).match(/[?&](?:id|aid)=(\d+)/i);
    return match ? match[1] : "";
  }

  _coverUrl(id) {
    return `https://img.wenku8.com/image/${Math.floor(Number(id) / 1000)}/${id}/${id}s.jpg`;
  }

  _totalPages(body) {
    const match = String(body).match(/\[(\d+)\/(\d+)\]/);
    return match ? Number(match[2]) : 1;
  }

  _parseBookList(body) {
    const doc = new Document(body);
    const seen = {};
    const list = [];
    for (const element of doc.select("a[href*='articleinfo.php?id=']")) {
      const href = element.attr("href");
      const idMatch = href.match(/[?&]id=(\d+)/i);
      if (!idMatch || seen[idMatch[1]]) continue;
      seen[idMatch[1]] = true;
      const name = element.text.trim().replace(/^《|》$/g, "");
      if (!name) continue;
      list.push({
        name,
        link: `${this.source.baseUrl}/wap/article/articleinfo.php?id=${idMatch[1]}`,
        imageUrl: this._coverUrl(idMatch[1])
      });
    }
    const page = String(body).match(/\[(\d+)\/(\d+)\]/);
    return {
      list,
      hasNextPage: !!page && Number(page[1]) < Number(page[2])
    };
  }

  async getPopular(page) {
    const url = `${this.source.baseUrl}/wap/article/toplist.php?sort=allvisit&page=${page}`;
    const res = await this._request(url, "GET", "", true);
    return this._parseBookList(res.body);
  }

  async getLatestUpdates(page) {
    const url = `${this.source.baseUrl}/wap/article/toplist.php?sort=lastupdate&page=${page}`;
    const res = await this._request(url, "GET", "", true);
    return this._parseBookList(res.body);
  }

  async search(query, page, filters) {
    const url = `${this.source.baseUrl}/wap/article/search.php`;
    const body = [
      "action=search",
      "searchtype=articlename",
      `searchkey=${encodeURIComponent(query.trim())}`,
      `page=${page}`
    ].join("&");
    const res = await this._request(url, "POST", body, true);
    return this._parseBookList(res.body);
  }

  _parseCatalogPage(body, chapters, state) {
    const regex = /〖([^〗]+)〗|<a\b[^>]*href=["']readchapter\.php\?aid=(\d+)&(?:amp;)?cid=(\d+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = regex.exec(body)) !== null) {
      if (match[1]) {
        state.volume = this._decodeText(match[1]);
        continue;
      }
      chapters.push({
        name: this._decodeText(match[4]),
        url: `${this.source.baseUrl}/wap/article/readchapter.php?aid=${match[2]}&cid=${match[3]}`,
        dateUpload: "",
        scanlator: state.volume
      });
    }
  }

  async _getChapters(id) {
    const chapters = [];
    const state = { volume: "" };
    const firstUrl = `${this.source.baseUrl}/wap/article/readbook.php?aid=${id}&page=1`;
    const first = await this._request(firstUrl, "GET", "", false);
    this._parseCatalogPage(first.body, chapters, state);
    const total = this._totalPages(first.body);
    for (let page = 2; page <= total; page++) {
      const url = `${this.source.baseUrl}/wap/article/readbook.php?aid=${id}&page=${page}`;
      const res = await this._request(url, "GET", "", false);
      this._parseCatalogPage(res.body, chapters, state);
    }
    return chapters;
  }

  _toStatus(text) {
    if (/已完成|完结/.test(text)) return 1;
    if (/连载|写作中/.test(text)) return 0;
    if (/暂停/.test(text)) return 4;
    return 3;
  }

  async getDetail(url) {
    const res = await this._request(url, "GET", "", false);
    const body = res.body;
    const doc = new Document(body);
    const card = doc.selectFirst("card");
    const id = this._bookId(url);
    const name = card.attr("title") || doc.selectFirst("card b").text.trim();
    const image = doc.selectFirst("card img").attr("src");
    const authorMatch = body.match(/作者:\s*(?:<anchor[^>]*>)?([^<]+)/i);
    const genreMatch = body.match(/类别:\s*(?:<a[^>]*>)?([^<]+)/i);
    const statusMatch = body.match(/状态:\s*([^<]+)/i);
    const descriptionMatch = body.match(/\[作品简介\]\s*<br\s*\/?>([\s\S]*?)(?:<br\s*\/?>\s*)?<p\s+align=["']center["']/i);

    return {
      name,
      link: url,
      imageUrl: image ? this._absolute(image) : this._coverUrl(id),
      description: this._decodeText(descriptionMatch ? descriptionMatch[1].replace(/<br\s*\/?>/gi, "\n") : ""),
      author: authorMatch ? this._decodeText(authorMatch[1]) : "",
      artist: "",
      genre: genreMatch ? [this._decodeText(genreMatch[1])] : [],
      status: this._toStatus(statusMatch ? statusMatch[1] : ""),
      chapters: await this._getChapters(id)
    };
  }

  _chapterPageContent(body) {
    const source = String(body);
    const first = source.match(/\[\d+\/\d+\]/);
    if (!first) return "";
    const firstIndex = first.index + first[0].length;
    const firstBreak = source.indexOf("<br", firstIndex);
    if (firstBreak < 0) return "";
    const start = source.indexOf(">", firstBreak) + 1;
    const nextRegex = /\[\d+\/\d+\]/g;
    nextRegex.lastIndex = start;
    const next = nextRegex.exec(source);
    let end = next ? next.index : source.indexOf("<p align=", start);
    if (end < start) end = source.length;
    return source.slice(start, end)
      .replace(/<a\b[^>]*title=["'](?:上页|下页)["'][^>]*>\s*(?:上页|下页)\s*<\/a>\s*$/i, "")
      .replace(/\r/g, "")
      .trim();
  }

  _normalizeChapterImages(html) {
    return String(html).replace(/<img\b[^>]*>/gi, (tag) => {
      const lazy = tag.match(/\s(?:data-src|data-original|data-lazy-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      const regular = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
      let source = lazy ? (lazy[1] || lazy[2] || lazy[3] || "") : "";
      if (!source && regular) source = regular[1] || regular[2] || regular[3] || "";
      source = source.trim().replace(/&amp;/gi, "&");
      if (!source) return tag;

      const resolved = /^data:/i.test(source) ? source : this._absolute(source);
      if (/^(?:https?:)?\/\/ia\.51\.la\//i.test(resolved)) return "";
      const escaped = resolved.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
      const attributes = tag
        .replace(/^<img\b/i, "")
        .replace(/\/?>\s*$/, "")
        .replace(/\s(?:src|data-src|data-original|data-lazy-src|srcset|data-srcset)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");
      return `<img${attributes} src="${escaped}">`;
    });
  }

  _escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  async getHtmlContent(name, url) {
    const first = await this._request(`${url}&page=1`, "GET", "", false);
    const total = this._totalPages(first.body);
    let html = this._chapterPageContent(first.body);
    for (let page = 2; page <= total; page++) {
      const res = await this._request(`${url}&page=${page}`, "GET", "", false);
      html += `<br>${this._chapterPageContent(res.body)}`;
    }
    return this.cleanHtmlContent(`<div><h2>${this._escapeHtml(name)}</h2><hr>${html}</div>`);
  }

  async cleanHtmlContent(html) {
    const cleaned = String(html)
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
      .replace(/<ins\b[\s\S]*?<\/ins>/gi, "");
    return this._normalizeChapterImages(cleaned);
  }

  getFilterList() {
    return [];
  }

  getSourcePreferences() {
    return [
      {
        key: "wenku8_cookie",
        editTextPreference: {
          title: "Wenku8 Cookie（优先）",
          summary: "填写浏览器中的 Cookie 字符串；留空时尝试用户名和密码。",
          value: "",
          dialogTitle: "Wenku8 Cookie",
          dialogMessage: "格式：name=value; name2=value2"
        }
      },
      {
        key: "wenku8_username",
        editTextPreference: {
          title: "Wenku8 用户名",
          summary: "仅在 Cookie 留空时使用。",
          value: "",
          dialogTitle: "Wenku8 用户名",
          dialogMessage: ""
        }
      },
      {
        key: "wenku8_password",
        editTextPreference: {
          title: "Wenku8 密码",
          summary: "Mangayomi 当前会以普通文本编辑此字段。",
          value: "",
          dialogTitle: "Wenku8 密码",
          dialogMessage: ""
        }
      }
    ];
  }
}
