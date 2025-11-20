const {
  createRequestObject,
  createManga,
  createMangaTile,
  createChapter,
  createChapterDetails,
  createHomeSection,
  createTag,
  createRequestManager,
  MangaStatus
} = require("paperback-extensions-common");

const MF_DOMAIN = "https://manhuafast.net";

const requestManager = createRequestManager({
  requestsPerSecond: 2,
  requestTimeout: 15000,
  interceptor: {
    interceptRequest: (request) => {
      request.headers = Object.assign({}, request.headers, {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Referer": MF_DOMAIN
      });
      return request;
    }
  }
});

async function search(query, metadata) {
  const page = metadata?.page ?? 1;
  const url = `${MF_DOMAIN}/?s=${encodeURIComponent(query)}&post_type=wp-manga&page=${page}`;
  const request = createRequestObject({ url, method: "GET" });
  const data = await requestManager.schedule(request, 1);
  const $ = this.cheerio.load(data.data);
  const tiles = [];

  $('.c-tabs-item__content, .page-item-detail, .dpost, .bs, .post, .item, .top-item, article').each((i, el) => {
    try {
      const e = $(el);
      const a = e.find('a').first();
      const title = a.attr('title') || a.text().trim();
      let id = a.attr('href') || '';
      if (id.startsWith(MF_DOMAIN)) id = id.replace(MF_DOMAIN + '/', '').replace(/\/$/, '');
      const image = e.find('img').first().attr('data-src') || e.find('img').first().attr('src') || '';
      if (title && id) {
        tiles.push(createMangaTile({
          id: id,
          title: { text: title },
          image: image
        }));
      }
    } catch (e) {}
  });

  return {
    results: tiles,
    metadata: tiles.length ? { page: page + 1 } : undefined
  };
}

async function getMangaDetails(mangaId) {
  const url = mangaId.startsWith('http') ? mangaId : `${MF_DOMAIN}/${mangaId}`;
  const request = createRequestObject({ url, method: "GET" });
  const data = await requestManager.schedule(request, 1);
  const $ = this.cheerio.load(data.data);

  const title = $('h1').first().text().trim() || $('meta[property="og:title"]').attr('content') || 'No title';
  const image = $('img.wp-manga-cover, .summary_image img, .thumb img').first().attr('src') || $('meta[property="og:image"]').attr('content') || '';
  const authorText = $('.author-content, .author a').first().text().trim() || '';
  const description = $('.description-summary, .summary__content, #chapter-content, .entry-content').first().text().trim() || $('div.description').text().trim() || '';
  const statusText = $('.post-status, .manga-status, .status, .post-meta').first().text().toLowerCase();
  const status = statusText.includes('ongoing') ? MangaStatus.ONGOING : statusText.includes('completed') ? MangaStatus.COMPLETED : MangaStatus.UNKNOWN;

  const tags = [];
  $('.genres-content a, .post-content_item a, .genres a, .tags a').each((i, el) => {
    const t = $(el).text().trim();
    if (t) tags.push(createTag({ label: t }));
  });

  return createManga({
    id: mangaId,
    titles: [title],
    image: image,
    author: authorText ? [authorText] : [],
    desc: description,
    status,
    tags
  });
}

async function getChapters(mangaId) {
  const url = mangaId.startsWith('http') ? mangaId : `${MF_DOMAIN}/${mangaId}`;
  const request = createRequestObject({ url, method: "GET" });
  const data = await requestManager.schedule(request, 1);
  const $ = this.cheerio.load(data.data);

  const chapters = [];
  $('.wp-manga-chapter, .chapter-list li, .chapters li, .listing-chapters_wrap li').each((i, el) => {
    try {
      const e = $(el);
      const a = e.find('a').first();
      const name = a.text().trim() || e.text().trim();
      const chapId = a.attr('href') || '';
      const time = e.find('.chapter-release-date, .date, .post-date').text().trim() || '';
      chapters.push(createChapter({
        id: chapId,
        mangaId,
        name,
        lang: 'en',
        chapNum: Number((name.match(/\d+(\.\d+)*/) || [0])[0]) || i + 1,
        time: time ? new Date(time).getTime() : 0
      }));
    } catch (e) {}
  });

  if (chapters.length === 0) {
    $('a').each((i, el) => {
      try {
        const a = $(el);
        const href = a.attr('href') || '';
        const txt = a.text().trim();
        if (href.includes('/chapter-') || /chapter/i.test(txt)) {
          chapters.push(createChapter({ id: href, mangaId, name: txt || 'Chapter ' + (i+1), lang: 'en', chapNum: i+1 }));
        }
      } catch (e) {}
    });
  }

  return chapters;
}

async function getChapterDetails(mangaId, chapterId) {
  const url = chapterId.startsWith('http') ? chapterId : `${MF_DOMAIN}/${chapterId}`;
  const request = createRequestObject({ url, method: "GET" });
  const data = await requestManager.schedule(request, 1);
  const $ = this.cheerio.load(data.data);

  const pages = [];
  $('.reading-content img, .chapter-content img, .wp-manga-image img, .text-left img').each((i, el) => {
    const src = $(el).attr('data-src') || $(el).attr('src') || $(el).attr('data-original') || '';
    if (src) pages.push(src.startsWith('http') ? src : src.startsWith('/') ? MF_DOMAIN + src : MF_DOMAIN + '/' + src);
  });

  if (pages.length === 0) {
    $('figure img').each((i, el) => {
      const src = $(el).attr('src') || '';
      if (src) pages.push(src.startsWith('http') ? src : MF_DOMAIN + src);
    });
  }

  return createChapterDetails({
    id: chapterId,
    mangaId,
    pages,
    longStrip: false
  });
}

async function getHomePageSections(sectionCallback) {
  const request = createRequestObject({ url: MF_DOMAIN, method: "GET" });
  const data = await requestManager.schedule(request, 1);
  const $ = this.cheerio.load(data.data);

  const section = createHomeSection({ id: "latest", title: "Latest", view_more: true });
  const tiles = [];
  $('.update_list, .page-item-detail, .latest .post, .latest-manga .item, .bs, .post, .item').each((i, el) => {
    try {
      const e = $(el);
      const a = e.find('a').first();
      const title = a.attr('title') || a.text().trim();
      let id = a.attr('href') || '';
      if (id.startsWith(MF_DOMAIN)) id = id.replace(MF_DOMAIN + '/', '').replace(/\/$/, '');
      const image = e.find('img').first().attr('src') || '';
      if (title && id) {
        tiles.push(createMangaTile({ id, title: { text: title }, image }));
      }
    } catch (e) {}
  });

  section.items = tiles;
  sectionCallback(section);
}

module.exports = {
  version: "1.0.0",
  name: "ManhuaFast (NET)",
  description: "ManhuaFast.net mirror (generated).",
  author: "Generated",
  websiteBaseURL: MF_DOMAIN,
  // Paperback will call these functions with 'this' context providing cheerio & others.
  search,
  getMangaDetails,
  getChapters,
  getChapterDetails,
  getHomePageSections
};
