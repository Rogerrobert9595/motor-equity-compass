<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Single-screen deal desk at `/`; phone tabs (Deal/Costs/Equity) are CSS visibility toggles, desktop shows all panels — keeps one source of state.
- All deal/ownership math lives in `src/lib/deal-math.ts` as pure functions with tests beside it — so numbers stay verifiable and UI-free.
- External lookups (Google Apps Script sheet feed, NHTSA, EPA fueleconomy.gov) go through server functions in `src/lib/vehicle.functions.ts` — avoids browser CORS limits; sheet fetch is restricted to script.google.com hosts to prevent open-proxy abuse.
- Inventory auto-loads on every app open from the Apps Script link saved on the device (localStorage `deal_desk_script_url`), falling back to `DEFAULT_SCRIPT_URL` in `src/lib/sheet-config.ts`; last good list is cached in localStorage with bundled sample units as fallback; no backend — the Google Sheet is the source of truth.
- Installable via web manifest only (no service worker) — home-screen install without stale-cache risk.
- Customer "Share summary" links encode only deal inputs into `/summary?d=` (`src/lib/summary-link.ts`) and recompute with deal-math — stateless links with no backend and no internal lot data.
