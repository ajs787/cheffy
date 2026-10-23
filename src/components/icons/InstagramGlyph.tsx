import Svg, { Circle, Rect } from 'react-native-svg';

/** Outline Instagram glyph, drawn to match Cheffy's other line icons. */
export function InstagramGlyph({
  size = 18,
  color,
  strokeWidth = 1.75,
}: {
  size?: number;
  color: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={3} width={18} height={18} rx={5} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={12} cy={12} r={4} stroke={color} strokeWidth={strokeWidth} />
      <Circle cx={17.3} cy={6.7} r={1.1} fill={color} />
    </Svg>
  );
}
