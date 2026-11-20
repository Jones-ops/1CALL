import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import { Platform } from 'react-native';
import { BRAND_ORANGE } from '../theme';

// Heavy sans-serif wordmark on every platform (SVG text otherwise defaults to a serif font on web).
const WORDMARK_FONT = Platform.select({
  ios: 'Helvetica Neue',
  android: 'sans-serif',
  default: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
});

/** Orange circle + white handset + heavy white "1CALL" wordmark. */
export default function Logo({ width = 150 }) {
  const height = (width * 34) / 150;
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 150 34"
      accessibilityRole="image"
      accessibilityLabel="1CALL"
    >
      <Circle cx="17" cy="17" r="16" fill={BRAND_ORANGE} />
      <Path
        d="M11 9l3-1 2 5-2 2c1 2 3 4 5 5l2-2 5 2-1 3c-1 2-3 2-5 1-6-2-11-7-12-13 0-2 1-3 3-2z"
        fill="#fff"
      />
      <SvgText x="40" y="25" fontFamily={WORDMARK_FONT} fontWeight="800" fontSize="22" fill="#fff">
        1CALL
      </SvgText>
    </Svg>
  );
}
