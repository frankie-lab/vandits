/**
 * AuthedErrorBoundary — captura runtime errors en el árbol autenticado
 * para diagnosticar pantallas blancas (PR-IMPORT-UX-4 white-screen probe).
 *
 * - Loguea `error.message`, `error.stack` y `componentStack` a `console.error`
 *   con prefijo `[AUTHED-ERROR-BOUNDARY]` para que el primer uncaught quede
 *   visible aunque React no lo bubblee al window.
 * - Renderiza fallback visible (no pantalla blanca) con el mensaje + stack
 *   recortado, para poder copiar/pegar sin DevTools.
 * - Temporal: retirar tras cerrar diagnóstico.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class AuthedErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log estructurado y verboso para que el primer error quede capturado
    // aunque el usuario no tenga DevTools abiertos en el momento del crash.
    // eslint-disable-next-line no-console
    console.error('[AUTHED-ERROR-BOUNDARY] uncaught render error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          padding: '24px',
          background: '#1a0a0a',
          color: '#ffd9d9',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: '13px',
          lineHeight: 1.5,
          overflow: 'auto',
        }}
      >
        <h1 style={{ color: '#ff6b6b', fontSize: '18px', margin: '0 0 12px' }}>
          Authed render crashed
        </h1>
        <p style={{ margin: '0 0 8px' }}>
          <strong>message:</strong> {error.message}
        </p>
        <details open style={{ margin: '12px 0' }}>
          <summary style={{ cursor: 'pointer', color: '#ffb86b' }}>error.stack</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{error.stack}</pre>
        </details>
        <details open>
          <summary style={{ cursor: 'pointer', color: '#ffb86b' }}>componentStack</summary>
          <pre style={{ whiteSpace: 'pre-wrap', margin: '8px 0' }}>{componentStack}</pre>
        </details>
      </div>
    );
  }
}
