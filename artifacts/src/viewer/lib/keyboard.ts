// Safari fires compositionend before the keydown that ends a composition, so only keyCode 229 marks that key.
export const isComposing = (event: KeyboardEvent) => event.isComposing || event.keyCode === 229;
