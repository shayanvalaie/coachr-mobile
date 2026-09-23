import { NavigatorScreenParams } from "@react-navigation/native";
import { LineupLaunchRequest } from "../types/lineupLaunch";

export type HomeStackParamList = {
  // Profile's "Replay app tour" lands on Home with this flag set.
  Home: { replayTour?: boolean } | undefined;
  Rules: undefined;
  Leagues: undefined;
  LeagueDetail: { leagueId: string };
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
