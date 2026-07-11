// Single icon family for the whole app. Do not import other
// @expo/vector-icons families - mixed icon weights read as inconsistent.
import Feather from "@expo/vector-icons/Feather";

export type IconName = keyof typeof Feather.glyphMap;
export { Feather };
export default Feather;
