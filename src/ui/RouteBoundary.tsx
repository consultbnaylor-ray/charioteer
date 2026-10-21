import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

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
    return <View key={this.state.tick} style={{ minHeight: 44 }}>{this.props.children}</View>;
  }
}

/** Catches a thrown map. The screen around it stays up. The log is the error line, never the path. */
export function RouteBoundary({ children, onError }: { children: ReactNode; onError: (message: string) => void }) {
  return (
    <BoundaryInner onError={onError}>
      {children}
    </BoundaryInner>
  );
}
