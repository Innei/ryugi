export function registerIcons(icons: Record<string, string>) {
  if (customElements.get('ryugi-icon')) return;

  class RyugiIcon extends HTMLElement {
    static observedAttributes = ['name', 'size', 'stroke-width', 'aria-label'];

    #root = this.attachShadow({ mode: 'open' });

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    render() {
      const name = this.getAttribute('name') ?? '';
      const source = Object.hasOwn(icons, name) ? icons[name] : '';
      this.#root.innerHTML =
        '<style>:host{display:inline-flex;vertical-align:middle;flex:none}svg{display:block;width:100%;height:100%}</style>' +
        (source ?? '');
      const size = Number(this.getAttribute('size') ?? 20);
      const width = Number(this.getAttribute('stroke-width') ?? 2);
      this.style.width = this.style.height = `${Number.isFinite(size) && size > 0 ? size : 20}px`;
      this.#root
        .querySelector('svg')
        ?.setAttribute('stroke-width', String(Number.isFinite(width) && width >= 0 ? width : 2));
      if (this.getAttribute('aria-label')) {
        this.setAttribute('role', 'img');
        this.removeAttribute('aria-hidden');
      } else {
        this.removeAttribute('role');
        this.setAttribute('aria-hidden', 'true');
      }
      if (name && !source) {
        const message = `[ryugi-icon] Unknown Lucide icon: ${name}`;
        window.dispatchEvent(new ErrorEvent('error', { message }));
      }
    }
  }

  customElements.define('ryugi-icon', RyugiIcon);
}
