# GURS Leads

GURS (OPT) naslovi po operaterju/tehnologiji/statusu + imena in telefoni iz TIS → Excel za klicanje.

## Deploy (Vercel, 2 minuti)
1. Razpakiraj mapo `gurs-leads`.
2. V Terminalu: `cd gurs-leads` in `npx vercel --prod`
   (prvič te vpraša za prijavo in ime projekta, vse ostalo Enter).
3. Odpri URL, ki ga izpiše.

## Struktura
- `public/index.html` – vmesnik (GURS filter, TIS, Excel)
- `api/tis.js` – serverless funkcija, ki išče po itis.siol.net
- `lib/tis-parse.js` – parser TIS rezultatov

GURS podatki se berejo z https://gurs-vercel.vercel.app/data/ (CORS odprt).
TIS rezultati se v brskalniku hranijo 14 dni (localStorage), da se isti naslov ne išče dvakrat.
