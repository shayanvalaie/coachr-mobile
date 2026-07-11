import { NavigatorScreenParams } from "@react-navigation/native";
import { LineupLaunchRequest } from "../types/lineupLaunch";

export type HomeStackParamList = {
  Home: undefined;
  Rules: undefined;
  AllLineups: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList> | undefined;
  RosterTab: undefined;
  LineupTab: { launch?: LineupLaunchRequest } | undefined;
  CalendarTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Subscribe: undefined;
};

declare global {
  // Makes useNavigation()/navigate() typed app-wide without per-call generics.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
