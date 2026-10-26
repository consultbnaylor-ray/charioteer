import { ROUTE_SERVICE_LINE } from '@/domain/findRoute';
import {
  LOCATION_PAGE_LINE,
  OUTSIDE_CRISIS_LINE,
  OUTSIDE_SAFETY_LINE,
  PATH_LINE,
  ROUTE_SAFETY_LINE,
} from '@/domain/outdoorRoute';
import { useAppTheme } from '@/ui/theme';
import { Card, T } from '@/ui/ui';

/** One quiet note under the controls. The lines stay on the page. */
export function OutsideFooter({ kind }: { kind: 'full' | 'short' }) {
  const theme = useAppTheme();
  return (
    <Card style={{ borderWidth: 1, borderColor: theme.colors.line }}>
      <T style={{ fontFamily: theme.font.bodyStrong, fontSize: 15 * theme.scale, lineHeight: 20 * theme.scale, color: theme.colors.muted }}>
        Good to know
      </T>
      {kind === 'short' ? (
        <>
          <T variant="muted">{ROUTE_SERVICE_LINE}</T>
          <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
        </>
      ) : (
        <>
          <T variant="muted">{OUTSIDE_SAFETY_LINE}</T>
          <T variant="muted">{OUTSIDE_CRISIS_LINE}</T>
          <T variant="muted">{ROUTE_SAFETY_LINE}</T>
          <T variant="muted">{LOCATION_PAGE_LINE}</T>
          <T variant="muted">{PATH_LINE}</T>
        </>
      )}
    </Card>
  );
}
