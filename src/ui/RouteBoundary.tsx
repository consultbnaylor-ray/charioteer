import Constants from 'expo-constants';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useRepository } from '@/data';
import { clientAppBuild } from '@/domain/clientError';
import { ROUTE_LOAD_ERROR, ROUTE_RETRY, routeErrorLine } from '@/domain/workoutRoute';
import { T } from '@/ui/ui';

type Props = {
  children: ReactNode;
  onError: (message: string) => void;
};

type State = { error: Error | null; tick: number };

class BoundaryInner extends Component<Props, State> {
  state: State = { error: null, tick: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(routeErrorLine(error));
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ gap: 8 }}>
          <T>{ROUTE_LOAD_ERROR}</T>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ROUTE_RETRY}
            onPress={() => this.setState((state) => ({ error: null, tick: state.tick + 1 }))}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <T>{ROUTE_RETRY}</T>
          </Pressable>
        </View>
      );
    }
    return <View key={this.state.tick}>{this.props.children}</View>;
  }
}

/** Catches a thrown route screen. The log is the error line, never the path. */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const repo = useRepository();
  return (
    <BoundaryInner
      onError={(message) => {
        void repo.logClientError('workout-route', message, clientAppBuild({
          buildNumber: Constants.expoConfig?.ios?.buildNumber,
          version: Constants.expoConfig?.version,
        })).catch((error: unknown) => console.error(error));
      }}
    >
      {children}
    </BoundaryInner>
  );
}
