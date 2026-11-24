// TradingView's <tv-tickers> lays its vertical strip out with `overflow:hidden auto`
// and sizes rows from its own height. At fractional zoom (80–90%) the strip can
// overflow by a sub-pixel: the 5px scrollbar appears, rows narrow and wrap to two
// lines, the overflow disappears, the scrollbar goes, rows unwrap — forever. That
// loop resized the whole page. Without the inner scrollbar the width stays fixed.
//
// The widgets use closed shadow roots, so the rule is added as each root is
// attached. This module must load before the TradingView widget script.
const sheet = new CSSStyleSheet();
sheet.replaceSync('.strip.vertical{overflow:hidden}');

const sheets = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'adoptedStyleSheets')
  ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ShadowRoot.prototype), 'adoptedStyleSheets');
const attachShadow = Element.prototype.attachShadow;

if (sheets && !Element.prototype.attachShadow.tvTickersFix) {
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    if (this.localName.startsWith('tv-')) {
      // Lit replaces adoptedStyleSheets when it renders, so keep the rule appended.
      Object.defineProperty(root, 'adoptedStyleSheets', {
        configurable: true,
        get() { return sheets.get.call(this); },
        set(value) { sheets.set.call(this, [...value.filter((s) => s !== sheet), sheet]); },
      });
      root.adoptedStyleSheets = [];
    }
    return root;
  };
  Element.prototype.attachShadow.tvTickersFix = true;
}
