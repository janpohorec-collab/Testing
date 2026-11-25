// Parser za rezultate iskanja na itis.siol.net (brez odvisnosti, deluje v Node in brskalniku).

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
const strip = s => decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\r]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();

export function normAddr(v) {
  return (String(v).toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .match(/[\p{L}\p{N}]+/gu) ?? []).join(' ')
    .replace(/\b(\d{1,4}) ([a-z])\b/g, '$1$2');
}

const MARK = /<div id="CPH_bodyMain_SearchResultsStatic1_RepeaterResults_Item1_\d+_divI(Per|SimWh)_\d+"/g;

export function parseTis(html) {
  const starts = [...html.matchAll(MARK)];
  const out = [];
  for (let i = 0; i < starts.length; i++) {
    const chunk = html.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : starts[i].index + 20000);
    const type = starts[i][1] === 'Per' ? 'oseba' : 'podjetje';
    const titleM = chunk.match(/<div class="title">([\s\S]*?)<\/div>/);
    const name = titleM ? strip(titleM[1]).replace(/\n/g, ' ') : '';
    const phoneBlock = chunk.match(/<div[^>]*class="phone"[^>]*>([\s\S]*?)<div class="location">/);
    const numbers = [];
    if (phoneBlock && !/class="phone" style="display:none;?"/.test(phoneBlock[0])) {
      for (const m of phoneBlock[1].matchAll(/<div class="nr">([\s\S]*?)<\/div>/g)) {
        const nr = strip(m[1].replace(/<span[\s\S]*?<\/span>/g, ''));
        if (nr) numbers.push({ nr, neKlici: /nr-type red/.test(m[1]) });
      }
    }
    const locM = chunk.match(/<div class="location">([\s\S]*?)<\/div>/);
    const loc = locM ? strip(locM[1]) : '';
    const street = loc.split('\n')[0].split(',')[0].trim();
    const linkM = chunk.match(/<a href="([^"]+)"[^>]*class="contact-link"/);
    out.push({ type, name, numbers, location: loc.replace(/\n/g, ', '), street, link: linkM ? 'https://itis.siol.net' + decode(linkM[1]) : '' });
  }
  const more = (html.match(/ResultsPagerStatic1_Page\d+"/g) || []).length > 1;
  return { entries: out, morePages: more };
}

export function hiddenFields(html) {
  const get = k => decode((html.match(new RegExp('id="' + k + '" value="([^"]*)"')) || [])[1] || '');
  return { __VIEWSTATE: get('__VIEWSTATE'), __VIEWSTATEGENERATOR: get('__VIEWSTATEGENERATOR'), __EVENTVALIDATION: get('__EVENTVALIDATION') };
}
