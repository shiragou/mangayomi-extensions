const mangayomiSources = [{
    "name": "轻小说文库 (Wenku8)",
    "id": 1278796713,
    "lang": "zh",
    "baseUrl": "https://www.wenku8.net",
    "apiUrl": "",
    "iconUrl": "https://www.wenku8.net/favicon.ico",
    "typeSource": "single",
    "itemType": 2,
    "version": "0.0.6",
    "pkgPath": "novel/src/zh/wenku8.js",
    "isNsfw": false,
    "hasCloudflare": true,
    "notes": ""
}];

class DefaultExtension extends MProvider {
    browserCookie = "";
    browserUserAgent = "";
    cookiesBootstrapped = false;
    loginCookie = "";
    loginAttempted = false;

    getHeaders(url) {
        const headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": `${this.source.baseUrl}/`,
            "User-Agent": this.browserUserAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36"
        };
        let cookie = this._mergeCookies(this.browserCookie, this._preferredCookie(), this.loginCookie);
        if (cookie && !/(?:^|;\s*)jieqiUserCharset=/i.test(cookie)) {
            cookie = this._mergeCookies(cookie, "jieqiUserCharset=utf-8");
        }
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

    _mergeCookies(...values) {
        const jar = {};
        for (const value of values) {
            for (const part of String(value || "").split(";")) {
                const separator = part.indexOf("=");
                if (separator <= 0) continue;
                const name = part.slice(0, separator).trim();
                const cookieValue = part.slice(separator + 1).trim();
                if (name) jar[name] = cookieValue;
            }
        }
        return Object.keys(jar).map((name) => `${name}=${jar[name]}`).join("; ");
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

    _cookieFromRequest(res) {
        const headers = res && res.request && res.request.headers;
        return String((headers && (headers["cookie"] || headers["Cookie"])) || "");
    }

    _userAgentFromRequest(res) {
        const headers = res && res.request && res.request.headers;
        return String((headers && (headers["user-agent"] || headers["User-Agent"])) || "");
    }

    async _bootstrapCookies() {
        if (this.cookiesBootstrapped) return;

        const url = `${this.source.baseUrl}/login.php`;
        const headers = this.getHeaders(url);
        delete headers["Cookie"];
        delete headers["User-Agent"];
        const res = await new Client().get(url, headers);
        this.browserCookie = this._mergeCookies(
            this._cookieFromRequest(res),
            this._cookieFromResponse(res)
        );
        this.browserUserAgent = this._userAgentFromRequest(res);
        this.cookiesBootstrapped = true;
    }

    async _login() {
        if (this.loginAttempted) return this.loginCookie;
        this.loginAttempted = true;

        await this._bootstrapCookies();
        if (/(?:^|;\s*)jieqiUserInfo=/i.test(this.browserCookie)) {
            return this.browserCookie;
        }

        const username = this._preference("wenku8_username");
        const password = this._preference("wenku8_password");
        if (!username || !password) return "";

        const jumpUrl = encodeURIComponent(`${this.source.baseUrl}/index.php`);
        const url = `${this.source.baseUrl}/login.php?do=submit&jumpurl=${jumpUrl}`;
        const body = [
            `username=${encodeURIComponent(username)}`,
            `password=${encodeURIComponent(password)}`,
            "usecookie=315360000",
            "action=login",
            `submit=${encodeURIComponent(" 登 录 ")}`
        ].join("&");
        const headers = {
            ...this.getHeaders(url),
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        };
        const res = await new Client({followRedirects: false}).post(url, headers, body);
        const responseCookie = this._cookieFromResponse(res);
        if (!/(?:^|;\s*)jieqiUserInfo=/i.test(responseCookie)) {
            this.loginCookie = "";
            throw new Error("Wenku8 登录失败：请检查用户名和密码。 ");
        }
        this.loginCookie = responseCookie;
        return this.loginCookie;
    }

    async _request(url, method, body, requiresLogin) {
        await this._bootstrapCookies();
        const hasLoginCookie = /(?:^|;\s*)jieqiUserInfo=/i.test(
            this._mergeCookies(this.browserCookie, this._preferredCookie(), this.loginCookie)
        );
        if (requiresLogin && !hasLoginCookie && !this._preferredCookie() && !this.loginCookie) {
            await this._login();
        }
        const client = new Client();
        const headers = this.getHeaders(url);
        const res = method === "POST"
            ? await client.post(url, {
                ...headers,
                "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
            }, body)
            : await client.get(url, headers);

        const finalUrl = String((res.request && res.request.url) || "");
        const isLoginPage = /\/login\.php(?:[?#]|$)/i.test(finalUrl)
            || (/<title>[^<]*(?:会员登录|登录)[^<]*<\/title>/i.test(res.body)
                && /name=["']username["']/i.test(res.body)
                && /name=["']password["']/i.test(res.body));
        if (requiresLogin && isLoginPage) {
            throw new Error("Wenku8 需要登录：请在扩展设置中填写 Cookie，或填写用户名和密码。 ");
        }
        return res;
    }

    _absolute(path, pageUrl) {
        if (!path) return "";
        if (/^https?:\/\//i.test(path)) return path.replace(/^http:/i, "https:");
        if (path.startsWith("//")) return `https:${path}`;
        if (path.startsWith("/")) return `${this.source.baseUrl}${path}`;
        const base = String(pageUrl || `${this.source.baseUrl}/`).replace(/[?#].*$/, "");
        return `${base.replace(/[^/]*$/, "")}${path}`;
    }

    _decodeText(html) {
        return new Document(`<div>${html || ""}</div>`).selectFirst("div").text.trim();
    }

    _bookId(url) {
        const match = String(url).match(/\/book\/(\d+)\.htm|[?&](?:id|aid)=(\d+)/i);
        return match ? (match[1] || match[2]) : "";
    }

    _coverUrl(id) {
        return `https://img.wenku8.com/image/${Math.floor(Number(id) / 1000)}/${id}/${id}s.jpg`;
    }

    _parseBookList(body, page, responseUrl) {
        const doc = new Document(body);
        const detailId = this._bookId(responseUrl);
        const detailName = doc.selectFirst("#content span b").text.trim();
        if (detailId && detailName) {
            return {
                list: [{
                    name: detailName,
                    link: `${this.source.baseUrl}/book/${detailId}.htm`,
                    imageUrl: this._coverUrl(detailId)
                }],
                hasNextPage: false
            };
        }

        const seen = {};
        const list = [];
        for (const element of doc.select("table.grid a[href*='/book/'][href$='.htm']")) {
            const href = element.attr("href");
            const idMatch = href.match(/\/book\/(\d+)\.htm/i);
            if (!idMatch || seen[idMatch[1]]) continue;
            const name = (element.attr("tiptitle") || element.attr("title") || element.text)
                .trim()
                .replace(/^《|》$/g, "");
            if (/^(?:我要阅读|加入书架|推荐本书)$/.test(name)) continue;
            if (!name) continue;
            seen[idMatch[1]] = true;
            list.push({
                name,
                link: `${this.source.baseUrl}/book/${idMatch[1]}.htm`,
                imageUrl: this._coverUrl(idMatch[1])
            });
        }

        const nextPage = Number(page || 1) + 1;
        const hasNext = new RegExp(`[?&]page=${nextPage}(?:[&"']|$)`, "i").test(body)
            || /<a\b[^>]*>\s*(?:下一页|下页|Next)\s*<\/a>/i.test(body);
        return {
            list,
            hasNextPage: hasNext
        };
    }

    async getPopular(page) {
        const url = `${this.source.baseUrl}/modules/article/toplist.php?sort=allvisit&page=${page}`;
        const res = await this._request(url, "GET", "", true);
        return this._parseBookList(res.body, page, res.request && res.request.url);
    }

    async getLatestUpdates(page) {
        const url = `${this.source.baseUrl}/modules/article/toplist.php?sort=lastupdate&page=${page}`;
        const res = await this._request(url, "GET", "", true);
        return this._parseBookList(res.body, page, res.request && res.request.url);
    }

    async search(query, page, filters) {
        const keyword = encodeURIComponent(query.trim());
        const url = `${this.source.baseUrl}/modules/article/search.php?searchtype=articlename&searchkey=${keyword}&charset=utf-8&page=${page}`;
        const res = await this._request(url, "GET", "", true);
        return this._parseBookList(res.body, page, res.request && res.request.url);
    }

    async _getChapters(id) {
        const baseUrl = `${this.source.baseUrl}/novel/${Math.floor(Number(id) / 1000)}/${id}`;
        const res = await this._request(`${baseUrl}/index.htm`, "GET", "", true);
        const doc = new Document(res.body);
        const chapters = [];
        let volume = "";
        for (const row of doc.select("table.css tr")) {
            for (const cell of row.select("td")) {
                const classes = cell.attr("class");
                if (classes.includes("vcss")) {
                    volume = cell.text.trim();
                    continue;
                }
                if (!classes.includes("ccss")) continue;
                const anchor = cell.selectFirst("a[href$='.htm']");
                const href = anchor.attr("href");
                const name = anchor.text.trim();
                if (!href || !name) continue;
                chapters.push({
                    name,
                    url: this._absolute(href, `${baseUrl}/index.htm`),
                    dateUpload: "",
                    scanlator: volume
                });
            }
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
        const res = await this._request(url, "GET", "", true);
        const body = res.body;
        const doc = new Document(body);
        const id = this._bookId(url);
        const content = doc.selectFirst("#content");
        const text = content.text;
        const name = content.selectFirst("span b").text.trim();
        const image = content.selectFirst("img").attr("src");
        const authorMatch = text.match(/(?:小说作者|作者)\s*[：:]\s*([^\s]+)/);
        const genreMatch = text.match(/(?:文库分类|小说分类)\s*[：:]\s*([^\s]+)/);
        const statusMatch = text.match(/(?:文章状态|小说状态)\s*[：:]\s*([^\s]+)/);
        const descriptionMatch = body.match(/内容简介\s*[：:]?[\s\S]*?<\/span>\s*<br\s*\/?>\s*<span[^>]*>([\s\S]*?)<\/span>/i);
        const fallbackDescription = content.selectFirst("#contentmain").text.trim();

        return {
            name,
            link: `${this.source.baseUrl}/book/${id}.htm`,
            imageUrl: image ? this._absolute(image, url) : this._coverUrl(id),
            description: descriptionMatch
                ? this._decodeText(descriptionMatch[1].replace(/<br\s*\/?>/gi, "\n"))
                : fallbackDescription,
            author: authorMatch ? this._decodeText(authorMatch[1]) : "",
            artist: "",
            genre: genreMatch ? [this._decodeText(genreMatch[1])] : [],
            status: this._toStatus(statusMatch ? statusMatch[1] : ""),
            chapters: await this._getChapters(id)
        };
    }

    _chapterContent(body) {
        return new Document(body).selectFirst("#content").innerHtml
            .replace(/<[^>]+\bid=["']contentdp["'][^>]*>[\s\S]*?<\/[^>]+>/gi, "")
            .replace(/\r/g, "")
            .trim();
    }

    _normalizeChapterImages(html, pageUrl) {
        return String(html).replace(/<img\b[^>]*>/gi, (tag) => {
            const lazy = tag.match(/\s(?:data-src|data-original|data-lazy-src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            const regular = tag.match(/\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
            let source = lazy ? (lazy[1] || lazy[2] || lazy[3] || "") : "";
            if (!source && regular) source = regular[1] || regular[2] || regular[3] || "";
            source = source.trim().replace(/&amp;/gi, "&");
            if (!source) return tag;

            const resolved = /^data:/i.test(source) ? source : this._absolute(source, pageUrl);
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
        const res = await this._request(url, "GET", "", true);
        const html = this._chapterContent(res.body);
        if (!html) throw new Error("Wenku8 主站章节正文加载失败，请稍后重试。 ");
        return this.cleanHtmlContent(`<div><h2>${this._escapeHtml(name)}</h2><hr>${html}</div>`, url);
    }

    async cleanHtmlContent(html, pageUrl) {
        const cleaned = String(html)
            .replace(/<script\b[\s\S]*?<\/script>/gi, "")
            .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
            .replace(/<ins\b[\s\S]*?<\/ins>/gi, "");
        return this._normalizeChapterImages(cleaned, pageUrl);
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
                    summary: "填写浏览器中的 Cookie 字符串；留空时自动使用用户名和密码登录网页版。",
                    value: "",
                    dialogTitle: "Wenku8 Cookie",
                    dialogMessage: "格式：name=value; name2=value2"
                }
            },
            {
                key: "wenku8_username",
                editTextPreference: {
                    title: "Wenku8 用户名",
                    summary: "仅在 Cookie 留空时用于自动登录网页版。",
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
