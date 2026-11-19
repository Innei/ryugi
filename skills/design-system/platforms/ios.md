# iPhone screens

For a product that runs on iPhone. Read it before the first phone board.

## The device

- Every phone screen is a `<ryugi-ios-shell>` (Mockup components in the artboard writing description). It draws the screen (402×874, iPhone 17), status bar, Dynamic Island and home indicator; `bezel` adds the frame (442×914). Never hand-draw those parts; `hide` drops the ones a screen should not show.
- A board holds one phone at 402×874, or the same screen light and dark side by side: two shells with `appearance="light"` and `appearance="dark"`.
- Content flows from below the status bar (`--safe-top`, 62px). Anything floating at the bottom sits above `--safe-bottom` (34px).

## On the screen

Everything inside the shell is the system you are designing, written by hand from `tokens.css`: navigation bar, glass capsules and buttons, tab bar, a floating composer, cards, lists, inputs, sheets. iOS 26 puts floating chrome on Liquid Glass and content on opaque surfaces; the glass is a token (`--color-glass`) chosen in step 2 like any color, and it must stay visible on the surfaces it floats over in light and dark. Do not imitate iOS Settings rows unless the product's own screens look like that.

## Icons

Give every icon both names on `<ryugi-icon>`: `name` (Lucide) and `symbol` (SF Symbol, `wallet.bifold.fill`). On the partner's Mac the local server draws the SF Symbol; anywhere else the Lucide icon shows. SF Symbols are only for apps on Apple platforms; that is the condition of Apple's license.
