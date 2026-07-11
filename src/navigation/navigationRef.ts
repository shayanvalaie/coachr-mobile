import {
  CommonActions,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { RootStackParamList } from "./types";

// For navigation from outside the component tree (ProGate upgrade button,
// toasts, background handlers). Prefer useNavigation() inside screens.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const navigateFromRef = <RouteName extends keyof RootStackParamList>(
  name: RouteName,
  params?: RootStackParamList[RouteName],
) => {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(CommonActions.navigate({ name, params }));
  }
};
