// NAME: Liquid Glass Spotify
// DESCRIPTION: Plays the current song's Canvas video (blurred + liquid-distorted) behind the
//              whole Spotify window, turns every panel into Apple-style "liquid glass", and gives
//              the lyrics a soft glow on the current line. Falls back to animated album art.
// VERSION: 7.3.0

(function LiquidGlassSpotify() {
  const S = window.Spicetify;
  // Don't wait for track data (S.Player.data): with a slow start or nothing queued it can stay
  // empty for a long time, and the theme doesn't need it - the video just appears once a song loads.
  if (!S || !S.Player || !S.Platform || !S.Platform.History || !document.body) {
    setTimeout(LiquidGlassSpotify, 300);
    return;
  }

  // ---- Tweakables ----
  const CONFIG = {
    videoBlur: 30,        // px blur of the background video
    videoBrightness: 0.6, // 1 = original; lower = darker, easier on the eyes
    videoContrast: 0.95,  // 1 = original; lower = softer, higher = punchier
    videoSaturation: 1.15, // 1 = original
    liquidWobble: true,   // animated liquid distortion on the background (turn off if laggy)
    panelBlur: 28,        // px blur behind the glass panels
    panelTint: 0.38,      // 0 = crystal clear glass, 1 = solid black panels
    lyricsTint: 0.12,     // panel tint while on the Lyrics page (clearer, so the video shows)
  };

  const ON = "lg-lyrics";         // body class while on the full Lyrics page
  const LITE = "lg-lite";         // body class while Lite mode is on (for low-end PCs)
  const LITE_KEY = "liquid-glass-lite";
  const NPV_LYRICS = '[data-testid="lyrics-npv-section"]';
  const ROOT = '[style*="--lyrics-color-active"]'; // Spotify's lyrics roots carry these inline vars
  // Spotify renames its hashed class names between versions, so prefer element ids and test ids
  // and keep the old class names next to them as fallbacks for earlier builds.
  const MAIN = "#main-view, .Root__main-view";
  const PANEL = "#Desktop_PanelContainer_Id, aside.NowPlayingView";
  const PANES = MAIN + ", " + PANEL;

  // Clean up a previous copy (hot reload)
  if (window.__lgCleanup) window.__lgCleanup();
  document.querySelectorAll("#lg-stage, #lg-npv-stage, #lg-style, #lg-dyn-style, #lg-svg").forEach((el) => el.remove());

  // Liquid glass material. --lg-tint is swapped per page.
  const GLASS = `
    background:
      linear-gradient(135deg, rgba(255,255,255,.13) 0%, rgba(255,255,255,.03) 45%, rgba(255,255,255,.08) 100%),
      rgba(12,12,14,var(--lg-tint)) !important;
    /* No backdrop-filter here on purpose: the video is already blurred, and a backdrop-filter
       on a panel would stop the frosted bars/cards inside it from seeing the video (they'd go dark). */
    border: 1px solid rgba(255,255,255,.16);
    box-shadow:
      inset 0 1.5px 0 rgba(255,255,255,.35),
      inset 0 -1px 0 rgba(255,255,255,.06),
      inset 0 0 50px rgba(255,255,255,.04),
      0 20px 60px rgba(0,0,0,.35);
  `;
  const SUB_GLASS = `
    background: linear-gradient(135deg, rgba(255,255,255,.14), rgba(255,255,255,.04)) !important;
    backdrop-filter: blur(18px) saturate(170%);
    border: 1px solid rgba(255,255,255,.18);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.4), 0 10px 30px rgba(0,0,0,.25);
  `;

  // ---------- Static styles ----------
  const css = `
  :root { --lg-tint: ${CONFIG.panelTint}; }
  body.${ON} { --lg-tint: ${CONFIG.lyricsTint}; }

  /* ===== Whole-window video stage ===== */
  /* The video sits on a layer BELOW everything (z-index -1). Only html gets the black backdrop;
     body must stay transparent or its background would paint over the video. */
  html { background: #000 !important; }
  body { background: transparent !important; }
  #lg-stage {
    position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: #000;
  }
  #lg-stage video {
    position: absolute; left: -8%; top: -8%; width: 116%; height: 116%;
    object-fit: cover; opacity: 0;
    filter: ${CONFIG.liquidWobble ? "url(#lg-liquid) " : ""}blur(${CONFIG.videoBlur}px)
      brightness(${CONFIG.videoBrightness}) contrast(${CONFIG.videoContrast}) saturate(${CONFIG.videoSaturation});
    transition: opacity 1s ease;
  }
  #lg-stage.has-video video { opacity: 1; }
  #lg-stage.has-video .lg-art { opacity: 0; }
  .lg-art {
    position: absolute; width: 150vmax; height: 150vmax; left: 50%; top: 50%;
    background-size: cover; background-position: center; border-radius: 50%;
    filter: blur(80px) brightness(${CONFIG.videoBrightness}) contrast(${CONFIG.videoContrast}) saturate(${CONFIG.videoSaturation});
    transition: opacity 1s ease;
  }
  .lg-art.a { translate: -60% -55%; animation: lg-spin 50s linear infinite; }
  .lg-art.b { translate: -40% -45%; animation: lg-spin 70s linear infinite reverse; opacity: .75; mix-blend-mode: screen; }
  @keyframes lg-spin { to { rotate: 360deg; } }
  #lg-stage::after {
    content: ""; position: absolute; inset: 0;
    background: radial-gradient(ellipse at center, rgba(0,0,0,.05) 0%, rgba(0,0,0,.5) 100%);
  }
  @keyframes lg-sheen { 0%,100% { background-position: 110% 0; } 50% { background-position: -10% 0; } }

  /* (Spotify's own layering is left alone, so popups opened outside #main - "Shared with",
     playlist dialogs, the watch feed - stay above the app like Spotify intended) */

  /* ===== Frame: see-through =====
     Spotify renames its internal classes between versions, so the theme leans on things that don't
     change: element ids (#main-view, #Desktop_LeftSidebar_Id, #Desktop_PanelContainer_Id), test ids,
     and classes the extension tags itself (lg-*). The older class names are kept as fallbacks so
     this still works on previous Spotify builds. */
  .Root__top-container,
  .Root__globalNav,
  .Root__now-playing-bar,
  .lg-playerbar,
  .Root__nav-bar,
  .main-yourLibraryX-entryPoints,
  .main-nowPlayingBar-container,
  .main-view-container,
  .main-view-container__scroll-node,
  .main-view-container__scroll-node-child,
  .main-nowPlayingView-container,
  .Root__right-sidebar-peek {
    background: transparent !important;
    background-color: transparent !important;
  }

  /* ===== Spotify's base surface colour (#121212) is used by almost every view -
     make it transparent everywhere so each window shows the glass/video ===== */
  /* Artist/album/playlist pages re-declare these tokens inline with the artwork colour
     (e.g. --background-base: #5A2300) - the !important below beats those inline values too */
  :root, .encore-dark-theme, .encore-dark-theme .encore-base-set, .encore-base-set,
  [style*="--background-base"], [style*="--background-highlight"], [style*="--background-elevated"] {
    --background-base: transparent !important;
    /* Hover / pressed / raised surfaces: translucent white instead of #242424 / #2a2a2a / #000 */
    --background-highlight: rgba(255,255,255,.10) !important;
    --background-press: rgba(255,255,255,.05) !important;
    --background-elevated-base: rgba(255,255,255,.10) !important;
    --background-elevated-highlight: rgba(255,255,255,.16) !important;
    --background-elevated-press: rgba(255,255,255,.07) !important;
    --background-tinted-base: rgba(255,255,255,.08) !important;
    --background-tinted-highlight: rgba(255,255,255,.14) !important;
    --background-tinted-press: rgba(255,255,255,.18) !important;
  }

  /* Spicetify's own theme colours (used by e.g. the artist About card: var(--spice-card) = #282828) */
  /* (--spice-main/-sidebar/-player are left alone: they double as icon colours on light buttons) */
  :root {
    --spice-card: rgba(255,255,255,.08) !important;
    --spice-main-elevated: rgba(255,255,255,.10) !important;
    --spice-highlight: rgba(255,255,255,.10) !important;
    --spice-highlight-elevated: rgba(255,255,255,.14) !important;
    --spice-shadow: rgba(0,0,0,.3) !important;
  }

  /* Spotify fakes the gaps between panels with an 8px black outline - remove it */
  .Root__top-container div { outline-color: transparent !important; }

  /* Top bar: round glass buttons + glass search pill */
  .Root__globalNav button[aria-label="Home"],
  .Root__globalNav button[aria-label="Marketplace"],
  .Root__globalNav button[aria-label="Go back"],
  .Root__globalNav button[aria-label="Go forward"],
  .Root__globalNav button[aria-label="What's New"],
  .Root__globalNav button[aria-label="Listening activity"],
  .Root__globalNav button[aria-label="Browse"],
  .Root__globalNav input,
  .Root__globalNav nav button:has(img, figure) {
    background: linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.05)) !important;
    backdrop-filter: blur(18px) saturate(180%);
    border: 1px solid rgba(255,255,255,.18) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 6px 18px rgba(0,0,0,.25) !important;
    border-radius: 999px !important;
    transition: background .25s ease, transform .2s ease;
  }
  .Root__globalNav button[aria-label="Go back"],
  .Root__globalNav button[aria-label="Go forward"] { width: 36px !important; height: 36px !important; }
  /* Never tint floating controls inside a lyrics view (e.g. the Sync row) */
  ${ROOT} .lg-sticky, ${ROOT} .lg-top { background: none !important; backdrop-filter: none !important; box-shadow: none !important; }
  /* Lyrics button lights up while the lyrics are open in the middle column */
  body.${ON} [data-testid="now-playing-bar"] [data-testid="lyrics-button"],
  body.${ON} .Root__now-playing-bar [data-testid="lyrics-button"] { color: #1ed760 !important; }
  /* The Lite/Full toggle (droplet) gets the same round glass button */
  .Root__globalNav button[aria-label^="Liquid Glass"] {
    background: linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.05)) !important;
    backdrop-filter: blur(18px) saturate(180%);
    border: 1px solid rgba(255,255,255,.18) !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.35), 0 6px 18px rgba(0,0,0,.25) !important;
    border-radius: 999px !important;
    width: 36px !important; height: 36px !important;
    display: inline-flex !important; align-items: center; justify-content: center;
    margin-inline: 4px !important;
  }
  .Root__globalNav button:hover { background-color: rgba(255,255,255,.2) !important; transform: scale(1.04); }
  .Root__globalNav input:focus { background: rgba(255,255,255,.16) !important; }

  /* Floating surfaces (search dropdown, menus, tooltips, dialogs, popovers): frosted glass */
  .Root__globalNav [role="listbox"], [role="dialog"], [role="tooltip"], .tippy-box, [data-tippy-root] > div,
  [role="menu"], #context-menu > ul, .main-contextMenu-menu, .lg-float {
    background: linear-gradient(160deg, rgba(255,255,255,.07), rgba(255,255,255,0) 40%), rgba(16,16,20,.78) !important;
    backdrop-filter: blur(40px) saturate(150%);
    border: 1px solid rgba(255,255,255,.14);
    box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 16px 48px rgba(0,0,0,.45) !important;
  }
  /* Right-click menus + the search dropdown: rounder, clearer liquid glass with a specular rim */
  [role="menu"], #context-menu > ul, .main-contextMenu-menu,
  #search-dropdown, .Root__globalNav [role="listbox"] {
    border-radius: 20px !important;
    padding: 6px !important;
    /* The glass itself is drawn by ::before (below), not the element. A blur on the element would
       make it a "backdrop root" and stop its submenus from blurring the page behind them. */
    background: none !important;
    backdrop-filter: none !important;
    isolation: isolate;
    border: none !important;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.14),
      inset 0 -1px 0 rgba(255,255,255,.14),
      inset 0 0 24px rgba(255,255,255,.04),
      0 20px 60px rgba(0,0,0,.4) !important;
    /* Must stay visible: submenus (Add to playlist, Share, Go to artist, Sleep timer) are
       children of the menu and open beside it - hidden overflow would clip them away */
    overflow: visible !important;
  }
  /* The glass layer for menus, submenus and the search dropdown - symmetric soft edges, real blur */
  [role="menu"]::before, #context-menu > ul::before, .main-contextMenu-menu::before,
  #search-dropdown::before, .Root__globalNav [role="listbox"]::before {
    content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
    border-radius: inherit;
    background:
      linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.03) 50%, rgba(255,255,255,.08) 100%),
      rgba(24,24,30,.48);
    backdrop-filter: blur(36px) saturate(190%) brightness(1.05);
  }
  /* Submenus sit over busier content (the page + the parent menu edge), so a touch more tint */
  [role="menu"] [role="menu"]::before {
    background:
      linear-gradient(180deg, rgba(255,255,255,.08) 0%, rgba(255,255,255,.03) 50%, rgba(255,255,255,.08) 100%),
      rgba(24,24,30,.62);
  }
  /* Hover tooltips (button labels, collapsed-library item names): light rounded liquid glass */
  [role="tooltip"] {
    border-radius: 12px !important;
    background:
      linear-gradient(155deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.03) 45%, rgba(255,255,255,.06) 100%),
      rgba(16,16,22,.78) !important;
    backdrop-filter: blur(30px) saturate(160%) !important;
    border: none !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 10px 30px rgba(0,0,0,.35) !important;
    text-shadow: 0 1px 6px rgba(0,0,0,.35);
  }
  [role="tooltip"] * { background-color: transparent !important; }
  /* Rich tooltips (collapsed library items) wrap the tooltip in an extra box - clear it */
  *:has(> [role="tooltip"]) {
    background-color: transparent !important; box-shadow: none !important;
    overflow: visible !important; border-radius: 12px !important;
  }

  /* The popover wrapper around a menu: invisible, so only the menu's own glass shows */
  .tippy-box:has([role="menu"]), [data-tippy-root] > div:has([role="menu"]),
  #context-menu:has([role="menu"]), #context-menu > div:has([role="menu"]),
  .tippy-box:has([role="tooltip"]), [data-tippy-root]:has([role="tooltip"]),
  [data-tippy-root] > div:has([role="tooltip"]) {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    backdrop-filter: none !important;
    border-radius: 20px !important;
  }
  [role="menu"] [role="menuitem"], [role="menu"] button, [role="menu"] a {
    border-radius: 12px !important;
  }
  [role="menu"] [role="menuitem"]:hover, [role="menu"] button:hover, [role="menu"] a:hover {
    background-color: rgba(255,255,255,.14) !important;
  }
  [role="menu"] hr, [role="menu"] [role="separator"] { border-color: rgba(255,255,255,.12) !important; opacity: .7; }

  /* ===== Big panels become liquid glass (library, main view, every right-hand panel:
     Now Playing, Queue, Connect, Friend activity...) ===== */
  #Desktop_LeftSidebar_Id,
  #main-view,
  #Desktop_PanelContainer_Id,
  .main-yourLibraryX-libraryContainer,
  .Root__main-view,
  aside.NowPlayingView {
    ${GLASS}
    border-radius: 16px !important;
    transition: background .6s ease;
  }
  /* (Inverted elements - white pill buttons like "Show more" - keep their own white token) */
  #Desktop_PanelContainer_Id *:not([class*="encore-inverted"]) { --background-base: transparent !important; }

  /* The title bar that fades in when you scroll a playlist/album (inline --background-base + opacity):
     frosted glass, so the action bar underneath doesn't show through the title */
  .main-topBar-background.lg-soft,
  .lg-soft[style*="opacity"][style*="--background-base"] {
    background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.03)), rgba(14,14,18,.45) !important;
    backdrop-filter: blur(30px) saturate(170%);
    box-shadow: inset 0 -1px 0 rgba(255,255,255,.10);
  }

  /* Page headers' dimming overlay has a hard-coded #121212 fill (turns into a black block when
     scrolling an artist page) - keep only its soft gradient over the photo */
  .lg-soft::before, .lg-soft::after,
  .main-entityHeader-container::before, .main-entityHeader-container::after {
    background: linear-gradient(180deg, rgba(12,12,14,.55) 0%, rgba(12,12,14,.45) 55%, transparent 100%) !important;
  }
  /* Big header photos (artist pages): fade their bottom edge into the glass */
  .lg-hero {
    -webkit-mask-image: linear-gradient(#000 45%, transparent 100%) !important;
    mask-image: linear-gradient(#000 45%, transparent 100%) !important;
  }

  /* Popups (artist About, dialogs): Spotify dims the app with 70% black behind them, which makes the
     glass look flat grey. Lighter dim (no blur on the dim layer, so the popup's own blur can see the app) */
  *:has(> [role="dialog"]) {
    background-color: rgba(0,0,0,.25) !important;
  }
  dialog::backdrop { background: rgba(0,0,0,.25) !important; }
  dialog, [role="dialog"] {
    border: 1px solid rgba(255,255,255,.16) !important;
    box-shadow: inset 0 1.5px 0 rgba(255,255,255,.3), 0 30px 80px rgba(0,0,0,.45) !important;
    background: linear-gradient(160deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 45%), rgba(22,22,28,.55) !important;
    backdrop-filter: blur(40px) saturate(170%) !important;
    border-radius: 16px;
  }
  [role="dialog"] div { background-color: transparent; }

  /* Watch feed (the Canvas / clips view with "Next"): Spotify paints it solid song-colour (inline)
     over a 90% black backdrop - make it a glass card over a light dim instead */
  div[role="presentation"]:has(> [data-testid="watch-feed-view"]),
  div[role="presentation"]:has([data-testid="watch-feed-view"]):not(:has(div[role="presentation"] [data-testid="watch-feed-view"])) {
    background-color: rgba(0,0,0,.3) !important;
  }
  [data-testid="watch-feed-view"] {
    background:
      linear-gradient(160deg, rgba(255,255,255,.12), rgba(255,255,255,.02) 45%, rgba(255,255,255,.06)),
      rgba(18,18,24,.4) !important;
    backdrop-filter: blur(40px) saturate(170%);
    border-radius: 20px !important;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.18), inset 0 -1px 0 rgba(255,255,255,.08), 0 30px 80px rgba(0,0,0,.45) !important;
    overflow: hidden;
  }

  /* Carousel edge fades are hard-coded #121212 gradients - drop them */
  .search-searchCategory-contentArea::before,
  .search-searchCategory-contentArea::after { background: none !important; }

  /* Sticky bars inside panels (tagged by JS) */
  .lg-sticky {
    background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)), rgba(14,14,18,.38) !important;
    backdrop-filter: blur(30px) saturate(170%);
  }
  /* The song-list header lives inside Spotify's virtualised list, which is drawn on its own
     hardware layer - a backdrop blur there can't see the rows, so they'd show straight through.
     Use a near-solid smoky glass instead. */
  .main-trackList-trackListHeader {
    background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.02)), rgba(15,15,19,.93) !important;
    backdrop-filter: blur(30px) saturate(170%);
  }
  /* Bars that sit on a panel's top edge: follow the panel's rounded corners (backdrop blur isn't
     clipped by the panel's radius) and fade out at the bottom instead of a hard line */
  /* Apple-style "progressive blur": no tinted strip, just blur that fades out downward */
  .lg-top,
  .main-topBar-background.lg-soft,
  .lg-soft[style*="opacity"][style*="--background-base"] {
    /* No bright top edge here: the panel already draws one, and two together looked like a double bezel */
    background: linear-gradient(180deg, rgba(12,12,16,.26), rgba(12,12,16,.06)) !important;
    backdrop-filter: blur(26px) saturate(160%) !important;
    box-shadow: none !important;
    border-radius: 0 !important;
    -webkit-mask-image: linear-gradient(#000 78%, transparent 100%);
    mask-image: linear-gradient(#000 78%, transparent 100%);
    text-shadow: 0 1px 10px rgba(0,0,0,.45);
  }
  /* Side-panel header ("My Playlist"): keep Spotify's own layout and padding untouched, and draw
     the glass strip as a layer behind it that reaches the panel's edges (the panel clips it to
     its rounded corners). */
  .lg-npv-head,
  aside .main-nowPlayingView-headerWrapper {
    background: none !important;
    backdrop-filter: none !important;
    isolation: isolate;
    text-shadow: 0 1px 10px rgba(0,0,0,.45);
  }
  .lg-npv-head::before,
  aside .main-nowPlayingView-headerWrapper::before {
    content: ""; position: absolute; top: 0; bottom: 0; left: -24px; right: -24px;
    z-index: -1; pointer-events: none;
    background: linear-gradient(180deg, rgba(12,12,16,.26), rgba(12,12,16,.06));
    backdrop-filter: blur(26px) saturate(160%);
    -webkit-mask-image: linear-gradient(#000 78%, transparent 100%);
    mask-image: linear-gradient(#000 78%, transparent 100%);
  }
  /* The playlist/album title bar that fades in on scroll. Spotify puts it at z-index:-1 inside a
     paint-contained header, which leaves its backdrop blur seeing only black. Lift it to z-index 0
     (content above it) so it frosts the list scrolling underneath */
  .main-topBar-container { contain: none !important; }
  /* The background layer is absolutely positioned - never give it "position: relative", that
     collapses it to nothing. On new builds it has no class name, only the inline tokens. */
  .main-topBar-container > *:not(.main-topBar-background):not([style*="--background-base"]) {
    position: relative; z-index: 1;
  }
  /* Its inner dark overlay (rgba(0,0,0,.6)) would hide the frosted glass */
  .main-topBar-container > .lg-soft[style*="--background-base"] * { background: none !important; }
  .Root__main-view .main-topBar-background,
  #main-view .lg-soft[style*="--background-base"],
  .lg-soft[style*="opacity"][style*="--background-base"] {
    z-index: 0 !important;
    background: linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.04)), rgba(20,20,26,.18) !important;
    backdrop-filter: blur(34px) saturate(180%) !important;
    -webkit-mask-image: linear-gradient(#000 82%, transparent 100%);
    mask-image: linear-gradient(#000 82%, transparent 100%);
  }

  /* Full-screen / cinema lyrics view: drop its colour wash so the video shows */
  [style*="--cinema-mode-bg-color"] {
    --cinema-mode-bg-color-from: transparent !important;
    --cinema-mode-bg-color-to: transparent !important;
    background: transparent !important;
  }
  [style*="--cinema-mode-bg-color"]::before, [style*="--cinema-mode-bg-color"]::after { background: none !important; }
  /* The expanded view floats over the other panels - give it its own glass so they don't show through */
  .Root__top-container > div:has([style*="--cinema-mode-bg-color"]) {
    ${GLASS}
    --lg-tint: .3;
    border-radius: 16px !important;
    backdrop-filter: blur(40px) saturate(185%);
  }
  /* Spotify's own page backgrounds inside the panels */
  #main-view, #Desktop_LeftSidebar_Id, #Desktop_PanelContainer_Id,
  .Root__main-view, aside.NowPlayingView, .main-yourLibraryX-libraryContainer {
    --background-base: transparent !important;
  }
  /* Full-width coloured page headers (tagged by JS): drop them so the glass shows */
  .lg-soft,
  .main-entityHeader-backgroundColor,
  .main-actionBarBackground-background {
    background-color: transparent !important;
    background-image: none !important;
  }

  /* Spotify's own sharp Canvas at the top of the side panel: fade it into the glass
     instead of ending in a hard dark edge behind the cards */
  .lg-npv-canvas,
  aside.NowPlayingView .main-nowPlayingView-canvasVisualEnhancement {
    -webkit-mask-image: linear-gradient(#000 0%, rgba(0,0,0,.85) 35%, transparent 62%) !important;
    mask-image: linear-gradient(#000 0%, rgba(0,0,0,.85) 35%, transparent 62%) !important;
  }
  /* Spotify darkens the canvas and the song-title area with dark gradients - remove them.
     Newer builds use plain overlay divs instead of pseudo-elements, which JS tags as .lg-dim. */
  .lg-dim { background-image: none !important; background-color: transparent !important; }
  aside.NowPlayingView .main-nowPlayingView-canvasVisualEnhancement::before,
  aside.NowPlayingView .main-nowPlayingView-canvasVisualEnhancement::after,
  aside.NowPlayingView .main-nowPlayingView-contextItemInfo::before,
  aside.NowPlayingView .main-nowPlayingView-contextItemInfo::after { background: none !important; }
  aside.NowPlayingView .main-nowPlayingView-contextItemInfo { text-shadow: 0 1px 12px rgba(0,0,0,.5); }
  /* Side-panel title bar: no dark band */
  .lg-npv-head *,
  aside.NowPlayingView .main-nowPlayingView-headerWrapper * { background: transparent !important; }

  /* Side-panel cards (lyrics, artist, credits, queue) */
  .lg-card,
  aside.NowPlayingView .main-nowPlayingView-section {
    ${SUB_GLASS}
    position: relative;
    border-radius: 20px !important;
    overflow: hidden;
    isolation: isolate;
  }
  /* Sheen sits behind the card's content (z-index -1 inside the isolated card) */
  .lg-card::before,
  aside.NowPlayingView .main-nowPlayingView-section::before {
    content: ""; position: absolute; inset: 0; pointer-events: none; border-radius: inherit; z-index: -1;
    background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.08) 48%, transparent 60%);
    background-size: 300% 100%;
    animation: lg-sheen 10s ease-in-out infinite;
  }
  /* Solid grey inner panels (artist card etc.) -> let the glass show; buttons keep their colours */
  .lg-card div:not([class*="encore-inverted"]),
  aside.NowPlayingView .main-nowPlayingView-section div { background-color: transparent !important; }

  /* ===== Lyrics colour variables (full page + side panel) ===== */
  ${ROOT} {
    --lyrics-color-active: #ffffff !important;
    --lyrics-color-inactive: rgba(255,255,255,.42) !important;
    --lyrics-color-passed: rgba(255,255,255,.6) !important;
    --lyrics-color-background: transparent !important;
    --lyrics-color-messaging: rgba(255,255,255,.85) !important;
  }

  /* ==========================================================================
     LITE MODE (for low-end PCs) - same design, much cheaper to draw.
     Everything above is the full-quality look and is left untouched.
     Toggle with the droplet button in the top bar.
     ========================================================================== */

  /* The liquid wobble (an animated SVG displacement filter over a full-screen video)
     is by far the most expensive effect - drop it, and blur the video far less. */
  body.${LITE} #lg-stage video {
    filter: blur(10px) brightness(${CONFIG.videoBrightness}) contrast(${CONFIG.videoContrast}) saturate(${CONFIG.videoSaturation}) !important;
  }
  body.${LITE} .lg-art {
    filter: blur(28px) brightness(${CONFIG.videoBrightness}) contrast(${CONFIG.videoContrast}) saturate(${CONFIG.videoSaturation}) !important;
    animation: none !important;
  }
  /* No sheen sweeps */
  body.${LITE} *::before, body.${LITE} *::after { animation-name: none !important; }

  /* Small, cheap blurs instead of large ones */
  /* Menus + search dropdown draw their glass on ::before (keeps submenu blur working) */
  body.${LITE} [role="menu"]::before, body.${LITE} #context-menu > ul::before, body.${LITE} .main-contextMenu-menu::before,
  body.${LITE} #search-dropdown::before, body.${LITE} .Root__globalNav [role="listbox"]::before {
    backdrop-filter: blur(10px) saturate(140%) !important;
  }
  body.${LITE} [role="dialog"], body.${LITE} dialog, body.${LITE} .lg-float {
    backdrop-filter: blur(10px) saturate(140%) !important;
  }
  body.${LITE} [role="tooltip"] { backdrop-filter: blur(8px) saturate(130%) !important; }
  body.${LITE} .lg-sticky, body.${LITE} .main-trackList-trackListHeader,
  body.${LITE} .lg-npv-head::before, body.${LITE} aside .main-nowPlayingView-headerWrapper::before, body.${LITE} .lg-top,
  body.${LITE} .Root__main-view .main-topBar-background,
  body.${LITE} .lg-soft[style*="opacity"][style*="--background-base"] {
    backdrop-filter: blur(8px) saturate(130%) !important;
  }
  body.${LITE} aside.NowPlayingView .main-nowPlayingView-section,
  body.${LITE} .Root__globalNav button, body.${LITE} .Root__globalNav input {
    backdrop-filter: blur(6px) saturate(130%) !important;
  }
  /* The glowing lyric line: keep the glow, drop its blur layer */
  body.${LITE} ${ROOT} [class] { backdrop-filter: none !important; }
  `;

  const style = document.createElement("style");
  style.id = "lg-style";
  style.textContent = css;
  document.head.appendChild(style);

  // ---------- Discover Spotify's (obfuscated) lyric class names from its own CSS ----------
  function eachRule(list, fn) {
    for (const r of list) {
      if (r.cssRules && !r.selectorText) eachRule(r.cssRules, fn);
      else if (r.selectorText) fn(r);
    }
  }

  function discoverLineClasses() {
    const found = {};
    const pairs = [];
    for (const ss of document.styleSheets) {
      let rules;
      try { rules = ss.cssRules; } catch (e) { continue; }
      eachRule(rules, (r) => {
        const m = r.selectorText.match(/^\.([\w-]+)\.([\w-]+)$/);
        if (!m) return;
        const color = r.style.getPropertyValue("color").replace(/\s/g, "");
        pairs.push({ line: m[1], state: m[2], opacity: r.style.getPropertyValue("opacity").trim() });
        if (color === "var(--lyrics-color-active)") { found.line = m[1]; found.active = m[2]; }
      });
    }
    if (!found.line) return null;
    const p = pairs.find((p) => p.line === found.line && p.state !== found.active && p.opacity === "0.5");
    if (p) found.passed = p.state;
    // "Lyrics preview" lines: `.line .preview { color: active; pointer-events: none }` -
    // Spotify sizes that card by measuring the lines, so they must keep their layout.
    for (const ss of document.styleSheets) {
      let rules;
      try { rules = ss.cssRules; } catch (e) { continue; }
      eachRule(rules, (r) => {
        const m = r.selectorText.match(new RegExp(`^\\.${found.line} \\.([\\w-]+)$`));
        if (m && r.style.getPropertyValue("pointer-events").trim() === "none") found.preview = m[1];
      });
    }
    return found;
  }

  // A lines container: line -> (plain div) -> wrapper
  function discoverWrap(c, scope) {
    const lineEl = document.querySelector(`${scope} .${c.line}`);
    const wrapEl = lineEl && lineEl.parentElement && lineEl.parentElement.parentElement;
    return wrapEl && wrapEl.classList.length ? "." + [...wrapEl.classList].join(".") : null;
  }

  function dynamicCss(c) {
    const lineSel = `${ROOT} .${c.line}${c.preview ? `:not(.${c.preview})` : ""}`;
    const wrap = c.wrap ? `${ROOT} ${c.wrap}` : null;
    return `
  ${wrap ? `
  ${wrap} { align-items: center !important; text-align: center !important; padding-bottom: 80px !important; }
  ${wrap} > div { display: flex !important; flex-direction: column; align-items: center; text-align: center; }
  ${wrap}::after { display: none !important; }
  ` : ""}
  ${c.npvWrap ? `
  /* Side-panel card fades its edges with a mask built from the (now transparent) background colour */
  ${NPV_LYRICS} ${c.npvWrap} {
    -webkit-mask-image: linear-gradient(transparent 0, #000 28px, #000 calc(100% - 36px), transparent 100%) !important;
    mask-image: linear-gradient(transparent 0, #000 28px, #000 calc(100% - 36px), transparent 100%) !important;
  }
  ` : ""}

  ${lineSel} {
    font-family: -apple-system, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", sans-serif !important;
    font-weight: 800 !important;
    letter-spacing: -0.02em !important;
    line-height: 1.2 !important;
    opacity: 1 !important;
    text-decoration: none !important;
    color: rgba(255,255,255,.45) !important;
    /* Blur + scale are set per line by JS, based on how far the line is from the one playing
       (see focusLyrics): the neighbours stay sharp and it builds up with distance. */
    transform-origin: center;
    transition:
      color .45s ease, filter .55s cubic-bezier(.22,.61,.36,1), text-shadow .5s ease,
      transform .55s cubic-bezier(.22,1.15,.36,1) !important;
  }
  ${c.passed ? `${lineSel}.${c.passed} { color: rgba(255,255,255,.62) !important; }` : ""}
  ${lineSel}.${c.active} {
    color: #fff !important;
    filter: none !important;
    transform: scale(1.04) !important;
    text-shadow: 0 0 18px rgba(255,255,255,.55), 0 0 42px rgba(255,255,255,.25);
  }
  ${lineSel}:hover { filter: none !important; color: rgba(255,255,255,.95) !important; }
  ${c.preview ? `${ROOT} .${c.line}.${c.preview} { color: rgba(255,255,255,.9) !important; text-shadow: 0 0 18px rgba(255,255,255,.35); }` : ""}
  `;
  }

  let dynKey = "";
  let lastWrap = null;
  let lastNpvWrap = null;
  let lineClasses = null;
  function refreshDynamicStyles() {
    const c = discoverLineClasses();
    if (!c) return;
    lineClasses = c;
    c.wrap = lastWrap = discoverWrap(c, `${ROOT}:not(${NPV_LYRICS})`) || lastWrap;
    c.npvWrap = lastNpvWrap = discoverWrap(c, NPV_LYRICS) || lastNpvWrap;
    const key = [c.line, c.active, c.passed, c.preview, c.wrap, c.npvWrap].join("|");
    if (key === dynKey) return;
    dynKey = key;
    let el = document.getElementById("lg-dyn-style");
    if (!el) {
      el = document.createElement("style");
      el.id = "lg-dyn-style";
      document.head.appendChild(el);
    }
    el.textContent = dynamicCss(c);
  }

  // ---------- Lyrics focus: sharp around the line that's playing, blurrier further away ----------
  const FOCUS = {
    startAt: 2,     // lines 0 (playing) and 1 (its neighbours) stay sharp; blur builds from here
    perLine: 1.15,  // px of blur added per line beyond that
    maxBlur: 5,     // px cap
    shrink: 0.012,  // how much each line further away shrinks
    stagger: 25,    // ms of delay per line, so the change ripples outwards
  };

  function focusLyrics() {
    if (!lineClasses) return;
    const { line, active, preview } = lineClasses;
    document.querySelectorAll(ROOT).forEach((root) => {
      const lines = [...root.querySelectorAll("." + line)].filter((l) => !preview || !l.classList.contains(preview));
      const current = lines.findIndex((l) => l.classList.contains(active));
      lines.forEach((el, i) => {
        if (current < 0) { // nothing playing yet / unsynced lyrics: leave everything sharp
          el.style.filter = "";
          el.style.transform = "";
          el.style.transitionDelay = "";
          return;
        }
        const d = Math.abs(i - current);
        const blur = Math.min(FOCUS.maxBlur, Math.max(0, (d - (FOCUS.startAt - 1)) * FOCUS.perLine));
        el.style.filter = blur > 0 ? `blur(${blur.toFixed(2)}px)` : "none";
        el.style.transform = d === 0 ? "" : `scale(${(1 - Math.min(d, 6) * FOCUS.shrink).toFixed(3)})`;
        el.style.transitionDelay = `${Math.min(d, 6) * FOCUS.stagger}ms`;
      });
    });
  }

  // Re-run whenever Spotify moves the "playing" class to another line
  let focusQueued = false;
  const queueFocus = () => {
    if (focusQueued) return;
    focusQueued = true;
    const run = () => { focusQueued = false; focusLyrics(); };
    // requestAnimationFrame never fires while the window is hidden - fall back to a timer
    if (document.hidden) setTimeout(run, 0);
    else requestAnimationFrame(run);
  };
  const lyricsObserver = new MutationObserver(queueFocus);
  const observedRoots = new WeakSet();
  function watchLyrics() {
    document.querySelectorAll(ROOT).forEach((root) => {
      if (observedRoots.has(root)) return;
      observedRoots.add(root);
      lyricsObserver.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true, childList: true });
    });
    queueFocus();
  }

  // ---------- Liquid distortion SVG filter ----------
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "lg-svg";
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.innerHTML = `
    <filter id="lg-liquid" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.004 0.007" numOctaves="2" seed="3" result="noise">
        <animate attributeName="baseFrequency" dur="22s" repeatCount="indefinite"
          values="0.004 0.007; 0.007 0.004; 0.004 0.007"/>
      </feTurbulence>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="80" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.appendChild(svg);

  // ---------- Lite mode (for low-end PCs) + its toggle button ----------
  let liteOn = false;
  try { liteOn = S.LocalStorage.get(LITE_KEY) === "1"; } catch (e) { /* first run */ }
  function isLite() { return liteOn; }

  const DROPLET = `<svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 .5c.2 0 .4.1.5.2C10.6 2.9 13 6.2 13 9a5 5 0 0 1-10 0C3 6.2 5.4 2.9 7.5.7A.7.7 0 0 1 8 .5Zm0 2.2C6.2 4.7 4.5 7.3 4.5 9a3.5 3.5 0 1 0 7 0c0-1.7-1.7-4.3-3.5-6.3Z"/>
  </svg>`;

  let topbarBtn = null;
  let menuItem = null;

  function refreshToggleUi() {
    document.body.classList.toggle(LITE, liteOn);
    const label = liteOn ? "Liquid Glass: Lite (click for Full)" : "Liquid Glass: Full (click for Lite)";
    if (topbarBtn) {
      topbarBtn.label = label;
      try { topbarBtn.element.style.opacity = liteOn ? "0.55" : "1"; } catch (e) {}
    }
    if (menuItem) { try { menuItem.isEnabled = liteOn; } catch (e) {} }
  }

  function setLite(on) {
    liteOn = !!on;
    try { S.LocalStorage.set(LITE_KEY, liteOn ? "1" : "0"); } catch (e) {}
    refreshToggleUi();
    updateMedia(); // re-fetch the Canvas at the other resolution
    try { S.showNotification(liteOn ? "Liquid Glass: Lite mode" : "Liquid Glass: Full quality"); } catch (e) {}
  }
  window.lgSetLite = setLite; // also switchable from the console

  // Spicetify has no way to remove a top-bar button, so create it once and reuse it
  // (a reload just re-points its click handler) - otherwise buttons stack up.
  try {
    if (window.__lgTopbarBtn) {
      topbarBtn = window.__lgTopbarBtn;
      topbarBtn.onClick = () => setLite(!liteOn);
    } else if (S.Topbar && S.Topbar.Button) {
      topbarBtn = window.__lgTopbarBtn = new S.Topbar.Button("Liquid Glass", DROPLET, () => setLite(!liteOn), false);
    }
  } catch (e) { console.warn("[LiquidGlass] topbar button:", e); }
  try {
    if (window.__lgMenuItem) {
      menuItem = window.__lgMenuItem;
      menuItem.onClick = () => setLite(!liteOn);
    } else if (S.Menu && S.Menu.Item) {
      menuItem = window.__lgMenuItem = new S.Menu.Item("Liquid Glass: Lite mode", liteOn, () => setLite(!liteOn));
      menuItem.register();
    }
  } catch (e) { console.warn("[LiquidGlass] menu item:", e); }

  refreshToggleUi();

  // ---------- Whole-window stage ----------
  const stage = document.createElement("div");
  stage.id = "lg-stage";
  stage.innerHTML = `<div class="lg-art a"></div><div class="lg-art b"></div><video muted playsinline></video>`;
  document.body.prepend(stage);
  const video = stage.querySelector("video");

  function meta() {
    return (S.Player.data && S.Player.data.item && S.Player.data.item.metadata) || {};
  }

  function artUrl() {
    const m = meta();
    const uri = m.image_xlarge_url || m.image_large_url || m.image_url || "";
    return uri.startsWith("spotify:image:")
      ? "https://i.scdn.co/image/" + uri.slice("spotify:image:".length)
      : uri;
  }

  async function accessToken() {
    try {
      const st = await S.Platform.AuthorizationAPI.getState();
      if (st && st.token && st.token.accessToken) return st.token.accessToken;
    } catch (e) { /* fall through */ }
    return S.Platform.Session && S.Platform.Session.accessToken;
  }

  // Spotify's desktop build can't decode H.264, so the plain canvas .mp4 won't play.
  // Instead fetch the VP9/WebM version Spotify itself streams, and stitch its segments together.
  const clipCache = new Map();
  async function canvasClip() {
    const m = meta();
    const fileId = m["canvas.fileId"];
    const type = (m["canvas.type"] || "").toUpperCase();
    if (!fileId || !type.includes("VIDEO")) return null;
    const cacheKey = fileId + (isLite() ? ":lite" : ":full");
    if (clipCache.has(cacheKey)) return clipCache.get(cacheKey);

    const tok = await accessToken();
    const res = await fetch(
      `https://spclient.wg.spotify.com/manifests/v9/json/sources/${fileId}/options/supports_drm`,
      { headers: { Authorization: "Bearer " + tok } }
    );
    if (!res.ok) return null;
    const man = await res.json();
    const content = man.contents && man.contents[0];
    if (!content) return null;

    // Lite mode streams a much smaller video, so decoding costs far less on weak hardware
    const target = isLite() ? 426 : 854;
    const webm = content.profiles
      .filter((p) => p.file_type === "webm")
      .sort((a, b) => Math.abs(a.video_height - target) - Math.abs(b.video_height - target))[0];
    if (!webm) return null;

    const base = man.base_urls[0];
    const fill = (tpl, ts) =>
      base + tpl
        .replace("{{profile_id}}", webm.id)
        .replace("{{file_type}}", "webm")
        .replace("{{segment_timestamp}}", ts);

    const urls = [fill(man.initialization_template)];
    const endSec = (content.end_time_millis || man.end_time_millis) / 1000;
    for (let t = 0; t < endSec; t += content.segment_length) urls.push(fill(man.segment_template, t));

    const parts = await Promise.all(urls.map((u) => fetch(u).then((r) => (r.ok ? r.arrayBuffer() : null))));
    if (parts.some((p) => !p)) return null;
    const clip = { url: URL.createObjectURL(new Blob(parts, { type: "video/webm" })), end: endSec };
    if (clipCache.size > 20) {
      const [k, old] = clipCache.entries().next().value;
      URL.revokeObjectURL(old.url);
      clipCache.delete(k);
    }
    clipCache.set(cacheKey, clip);
    return clip;
  }

  // Stitched WebM has no duration header, so `loop` alone isn't reliable - loop manually.
  let clipEnd = 0;
  const restart = () => { video.currentTime = 0; syncPlayback(); };
  video.addEventListener("ended", restart);
  video.addEventListener("timeupdate", () => {
    if (clipEnd && video.currentTime >= clipEnd - 0.08) restart();
  });

  let mediaToken = 0;
  async function updateMedia() {
    const my = ++mediaToken;
    const art = artUrl();
    stage.classList.remove("has-video");
    if (art) stage.querySelectorAll(".lg-art").forEach((el) => (el.style.backgroundImage = `url("${art}")`));

    let clip = null;
    try { clip = await canvasClip(); } catch (e) { console.warn("[LiquidGlass] canvas:", e); }
    if (my !== mediaToken) return;

    clipEnd = clip ? clip.end : 0;
    if (clip) {
      video.oncanplay = () => {
        if (my !== mediaToken) return;
        stage.classList.add("has-video");
        syncPlayback();
      };
      video.src = clip.url;
      video.load();
    } else {
      video.oncanplay = null;
      video.removeAttribute("src");
      video.load();
    }
  }

  function syncPlayback() {
    if (!video.getAttribute("src")) return;
    const playing = S.Player.isPlaying ? S.Player.isPlaying() : !(S.Player.data && S.Player.data.isPaused);
    if (playing) video.play().catch(() => {});
    else video.pause();
  }

  // ---------- Route tracking ----------
  let lastPagePath = "/";
  function updateRoute(location) {
    const path = (location || S.Platform.History.location || {}).pathname || "";
    document.body.classList.toggle(ON, path.startsWith("/lyrics"));
    if (!path.startsWith("/lyrics")) lastPagePath = path || "/";
    refreshDynamicStyles();
    scanSoon();
  }

  // ---------- Lyrics button -> lyrics in the middle column ----------
  // Spotify's mic button opens lyrics in the expanded overlay, which covers the library and the
  // side panel. Open them in the main column instead (library left, song details right).
  // The full-screen lyrics button is left exactly as Spotify made it.
  const isLyricsBtn = (e) => {
    const b = e.target && e.target.closest && e.target.closest('[data-testid="lyrics-button"]');
    return !!(b && b.closest('[data-testid="now-playing-bar"], .Root__now-playing-bar'));
  };
  const overlayOpen = () => !!document.querySelector('[style*="--cinema-mode-bg-color"]');
  // Spotify acts on press (pointer/mouse down), not click - so decide at press time and block
  // Spotify's handlers for the whole press. If its overlay is open, leave it to close normally.
  let lyricsPress = false;
  function onLyricsPress(e) {
    if (!isLyricsBtn(e)) return;
    if (e.type === "pointerdown" || e.type === "mousedown") lyricsPress = !overlayOpen();
    if (!lyricsPress) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }
  function onLyricsButton(e) {
    if (!isLyricsBtn(e)) return;
    // Keyboard presses (Enter/Space) arrive as a click with no pointer press first
    if (e.detail === 0) lyricsPress = !overlayOpen();
    if (!lyricsPress) return;
    lyricsPress = false;
    e.preventDefault();
    e.stopImmediatePropagation();
    const path = S.Platform.History.location.pathname || "";
    S.Platform.History.push(path.startsWith("/lyrics") ? lastPagePath : "/lyrics");
  }
  const PRESS_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup"];
  PRESS_EVENTS.forEach((t) => document.addEventListener(t, onLyricsPress, true));
  document.addEventListener("click", onLyricsButton, true);

  // Spotify paints full-width coloured headers with inline styles and hashed classes - tag them.
  function softenHeaders() {
    const main = document.querySelector(MAIN);
    if (!main) return;
    const w = main.clientWidth;
    main.querySelectorAll('[style*="background-color"], [style*="--background-base"]').forEach((el) => {
      if (el.classList.contains("lg-soft")) return;
      if (el.getBoundingClientRect().width >= w * 0.85) el.classList.add("lg-soft");
    });
    // Artist-page header photo: its wrapper holds only background layers - fade it out at the bottom
    main.querySelectorAll('div[style^="background-image: url"]').forEach((el) => {
      const p = el.parentElement;
      if (!p || p.classList.contains("lg-hero")) return;
      const onlyLayers = [...p.children].every((c) => getComputedStyle(c).position === "absolute");
      if (onlyLayers && p.getBoundingClientRect().width >= w * 0.85) p.classList.add("lg-hero");
    });
  }

  // Sticky bars (e.g. Home's All/Music/Podcasts chips) relied on the dark base colour;
  // now that it's transparent, give them a frosted glass so content doesn't show through.
  function glassStickyBars() {
    document.querySelectorAll(PANES.split(", ").map((s) => s + " div").join(", ")).forEach((el) => {
      // Lyrics views have their own floating controls (e.g. the Sync row) - never tint those
      if (el.closest(ROOT)) { el.classList.remove("lg-sticky", "lg-top"); return; }
      if (el.classList.contains("lg-top")) return;
      if (!el.classList.contains("lg-sticky") && getComputedStyle(el).position !== "sticky") return;
      const r = el.getBoundingClientRect();
      if (r.height > 0 && r.height < 140 && r.width > 200) {
        el.classList.add("lg-sticky");
        const panel = el.closest(PANES);
        if (panel && Math.abs(r.top - panel.getBoundingClientRect().top) < 6) el.classList.add("lg-top");
      }
    });
  }

  // Spotify 1.3.3 dropped the .main-nowPlayingView-* / .Root__now-playing-bar class names and
  // left only hashed ones, so these surfaces are found by their shape and tagged with our own
  // classes instead. Older builds still match the class-name rules in the stylesheet above.
  function tagShell() {
    // The strip the player bar sits in is a plain black div with no class name of its own
    const npb = document.querySelector('[data-testid="now-playing-bar"]');
    if (npb && npb.parentElement) npb.parentElement.classList.add("lg-playerbar");

    const panel = document.querySelector(PANEL);
    if (!panel) return;
    const pr = panel.getBoundingClientRect();

    // Title strip pinned to the panel's top edge ("My Playlist", "Queue"...)
    panel.querySelectorAll("div").forEach((el) => {
      if (el.classList.contains("lg-npv-head")) return;
      if (getComputedStyle(el).position !== "absolute") return;
      const r = el.getBoundingClientRect();
      if (r.width > pr.width * 0.8 && r.height > 40 && r.height < 90 && Math.abs(r.top - pr.top) < 8) {
        el.classList.add("lg-npv-head");
      }
    });

    // Cards (lyrics, about the artist, credits...): Spotify draws them with the raised-surface
    // token, which this theme turned into translucent white - that is what identifies them.
    panel.querySelectorAll("div").forEach((el) => {
      if (el.classList.contains("lg-card")) return;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 40) return;
      if (getComputedStyle(el).backgroundColor === "rgba(255, 255, 255, 0.1)") el.classList.add("lg-card");
    });
    const lyr = panel.querySelector(NPV_LYRICS);
    if (lyr) lyr.classList.add("lg-card");

    // Spotify's own sharp Canvas at the top of the panel, and the dark gradients painted over it
    const vid = panel.querySelector("video, canvas");
    const wrap = vid && vid.parentElement;
    if (wrap) {
      wrap.classList.add("lg-npv-canvas");
      const box = wrap.getBoundingClientRect();
      panel.querySelectorAll("div").forEach((el) => {
        if (el.classList.contains("lg-dim") || el.childElementCount || el.textContent.trim()) return;
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.top > box.bottom + 40) return;
        if (getComputedStyle(el).backgroundImage.indexOf("gradient") >= 0) el.classList.add("lg-dim");
      });
    }
  }

  function scanPage() {
    refreshDynamicStyles();
    tagShell();
    softenHeaders();
    glassStickyBars();
    watchLyrics();
  }
  const scanSoon = () => [400, 1500, 3500].forEach((ms) => setTimeout(scanPage, ms));

  // Pages and lyrics stylesheets load lazily - keep checking, cheaply.
  const tick = setInterval(scanPage, 4000);

  const onSong = () => setTimeout(updateMedia, 300);
  S.Player.addEventListener("songchange", onSong);
  S.Player.addEventListener("onplaypause", syncPlayback);
  const unlisten = S.Platform.History.listen(updateRoute);

  window.__lgCleanup = () => {
    clearInterval(tick);
    S.Player.removeEventListener("songchange", onSong);
    S.Player.removeEventListener("onplaypause", syncPlayback);
    if (typeof unlisten === "function") unlisten();
    document.removeEventListener("click", onLyricsButton, true);
    PRESS_EVENTS.forEach((t) => document.removeEventListener(t, onLyricsPress, true));
    lyricsObserver.disconnect();
    // (the toggle button/menu item are kept and reused by the next load - see above)
  };

  updateMedia();
  updateRoute();
})();
