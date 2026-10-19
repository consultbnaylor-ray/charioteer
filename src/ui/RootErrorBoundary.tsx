import { Component, type ReactNode } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';

import { saveFatalLocally } from '@/domain/fatalError';

/** Calm line for a crash of the whole tree. The press mounts the app again. */
export const ROOT_ERROR = 'Something went wrong — Try again';

type State = { error: Error | null; tick: number };

class Boundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, tick: 0 };

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error };
  }

  componentDidCatch(error: Error) {
    void saveFatalLocally(error);
  }

  render() {
    if (this.state.error) {
      return (
        <RootErrorScreen
          onPress={() => this.setState((state) => ({ error: null, tick: state.tick + 1 }))}
        />
      );
    }
    return <View key={this.state.tick} style={{ flex: 1 }}>{this.props.children}</View>;
  }
}

function RootErrorScreen({ onPress }: { onPress: () => void }) {
  const dark = useColorScheme() !== 'light';
  const background = dark ? '#0C0C0C' : '#F2F2EE';
  const ink = dark ? '#F3F3EE' : '#111111';
  return (
    <View style={{ flex: 1, backgroundColor: background, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ROOT_ERROR}
        onPress={onPress}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={{ color: ink, fontSize: 17, textAlign: 'center' }}>{ROOT_ERROR}</Text>
      </Pressable>
    </View>
  );
}

/** Sits outside the repository so a failure there still has a screen. */
export function RootErrorBoundary({ children }: { children: ReactNode }) {
  return <Boundary>{children}</Boundary>;
}
