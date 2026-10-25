import { toast, type ToastOptions } from '@lobehub/ui';

type Message = string | Omit<ToastOptions, 'type'>;

export function createToastRoot() {
  const host = document.createElement('div');
  host.dataset.ryugiToastRoot = '';
  host.style.font = '14px/1.5 var(--lobe-font-family, system-ui, sans-serif)';
  const root = host.attachShadow({ mode: 'open' });
  const styles = document.getElementById('ryugi-ui-style');
  if (styles) root.append(styles.cloneNode(true));
  const overrides = document.createElement('style');
  overrides.textContent = '.ryugi-toast-viewport:empty{display:none}.ryugi-toast-viewport .lobe-toast__description{color:var(--lobe-color-text-secondary)}';
  root.append(overrides);
  (document.body ?? document.documentElement).append(host);
  return root;
}

const optionsFor = (message: Message) => {
  if (typeof message === 'string') return { title: message };
  if (message.title != null) return message;
  return { ...message, title: message.description, description: undefined };
};

export const artifactToast = {
  success: (message: Message) => toast.success(optionsFor(message)),
  error: (message: Message) => toast.error(optionsFor(message)),
  info: (message: Message) => toast.info(optionsFor(message)),
  warning: (message: Message) => toast.warning(optionsFor(message)),
  loading: (message: Message) => toast.loading(optionsFor(message)),
  dismiss: toast.dismiss,
};
