import { cssVar } from '@lobehub/ui/stylex/cssVar.stylex';
import * as stylex from '@stylexjs/stylex';
import { Component, type ReactNode } from 'react';
import { t } from '../i18n';

const styles = stylex.create({
  message: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    color: cssVar.colorTextSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});

interface Props {
  resetKey: unknown;
  children: ReactNode;
}

interface State {
  error: Error | null;
  resetKey: unknown;
}

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State) {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey };
  }

  render() {
    if (this.state.error) {
      return <div {...stylex.props(styles.message)}>{t('chrome.canvasFailed', { message: this.state.error.message })}</div>;
    }
    return this.props.children;
  }
}
