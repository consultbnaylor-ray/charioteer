import { Redirect } from 'expo-router';

/** Old Stats links open Health Stats. That screen is the one place for these figures. */
export default function StatsRedirect() {
  return <Redirect href="/health" />;
}
