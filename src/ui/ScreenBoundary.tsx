import Constants from 'expo-constants';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable } from 'react-native';

import { useRepository } from '@/data';
import { SCREEN_ERROR, clientAppBuild, sanitizeClientError } from '@/domain/clientError';
import { T } from '@/ui/ui';

type Props = {
  screen: string;
  children: ReactNode;
  onError: (screen: string, message: string) => void;
};

type State = { error: Error | null; tick: number };

class BoundaryInner extends Component<Props, State> {
  state: State = { error: null, tick: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(this.props.screen, sanitizeClientError(error));
  }

  render() {
    if (this.state.error) {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={SCREEN_ERROR}
          onPress={() => this.setState((state) => ({ error: null, tick: state.tick + 1 }))}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <T>{SCREEN_ERROR}</T>
        </Pressable>
      );
    }
    return <Remount key={this.state.tick}>{this.props.children}</Remount>;
  }
}

function Remount({ children }: { children: ReactNode }) {
  return children;
}

/** Catches a thrown profile or chat render. The press draws that screen again. */
export function ScreenBoundary({ screen, children }: { screen: string; children: ReactNode }) {
  const repo = useRepository();
  return (
    <BoundaryInner
      screen={screen}
      onError={(name, message) => {
        void repo.logClientError(name, message, clientAppBuild({
          buildNumber: Constants.expoConfig?.ios?.buildNumber,
          version: Constants.expoConfig?.version,
        })).catch((error: unknown) => console.error(error));
      }}
    >
      {children}
    </BoundaryInner>
  );
}
