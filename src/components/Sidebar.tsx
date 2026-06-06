import React, { memo, useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  Animated,
} from "react-native";
import Feather from "@expo/vector-icons/Feather";
import { palette } from "../theme/colors";
import { typeface } from "../theme/typography";

type Props = {
  visible: boolean;
  onClose: () => void;
  onNavigateRules: () => void;
  onNavigateRoster: () => void;
  onNavigateGameRoom: () => void;
  onNavigateCalendar: () => void;
  onNavigateLineups: () => void;
  onProfile: () => void;
  onSignOut: () => void;
};

const Sidebar = ({
  visible,
  onClose,
  onNavigateRules,
  onNavigateRoster,
  onNavigateGameRoom,
  onNavigateCalendar,
  onNavigateLineups,
  onProfile,
  onSignOut,
}: Props) => {
  const translate = useRef(new Animated.Value(-280)).current;

  useEffect(() => {
    Animated.spring(translate, {
      toValue: visible ? 0 : -280,
      useNativeDriver: true,
      damping: 20,
      stiffness: 240,
    }).start();
  }, [visible, translate]);

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Animated.View style={[styles.panel, { transform: [{ translateX: translate }] }]}>
          <View style={styles.headerRow}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}
              hitSlop={6}
            >
              <Feather name="arrow-left" size={20} color={palette.text} />
            </Pressable>
            <Text style={styles.title}>Quick Menu</Text>
            <View style={{ width: 38 }} />
          </View>

          <Text style={styles.sectionLabel}>Navigate</Text>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onNavigateRules();
              onClose();
            }}
          >
            <Feather name="edit-3" size={19} color={palette.text} />
            <View>
              <Text style={styles.itemText}>Rules</Text>
              <Text style={styles.itemSubtext}>Open rules workspace</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onNavigateRoster();
              onClose();
            }}
          >
            <Feather name="users" size={19} color={palette.text} />
            <View>
              <Text style={styles.itemText}>Roster Builder</Text>
              <Text style={styles.itemSubtext}>Open roster workspace</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onNavigateGameRoom();
              onClose();
            }}
          >
            <Feather name="target" size={19} color={palette.text} />
            <View>
              <Text style={styles.itemText}>Game Room</Text>
              <Text style={styles.itemSubtext}>Open lineup workspace</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onNavigateCalendar();
              onClose();
            }}
          >
            <Feather name="calendar" size={19} color={palette.text} />
            <View>
              <View style={styles.itemTitleRow}>
                <Text style={styles.itemText}>Calendar</Text>
                <View style={styles.proBadge}>
                  <Text style={styles.proBadgeText}>PRO</Text>
                </View>
              </View>
              <Text style={styles.itemSubtext}>Plan and track games</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onNavigateLineups();
              onClose();
            }}
          >
            <Feather name="archive" size={19} color={palette.text} />
            <View>
              <Text style={styles.itemText}>All Lineups</Text>
              <Text style={styles.itemSubtext}>Browse full saved lineup history</Text>
            </View>
          </Pressable>

          <Text style={styles.sectionLabel}>Account</Text>

          <Pressable
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            onPress={() => {
              onProfile();
              onClose();
            }}
          >
            <Feather name="user" size={19} color={palette.text} />
            <View>
              <Text style={styles.itemText}>Profile</Text>
              <Text style={styles.itemSubtext}>Account + subscription</Text>
            </View>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.item,
              styles.dangerItem,
              pressed && styles.itemPressed,
            ]}
            onPress={() => {
              onSignOut();
              onClose();
            }}
          >
            <Feather name="log-out" size={19} color={palette.danger} />
            <View>
              <Text style={[styles.itemText, styles.dangerText]}>Sign out</Text>
              <Text style={styles.itemSubtext}>End this session</Text>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
};

export default memo(Sidebar);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: palette.overlay,
    flexDirection: "row",
  },
  panel: {
    width: 280,
    height: "100%",
    backgroundColor: palette.card,
    padding: 18,
    paddingTop: 72,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    borderRightWidth: 1,
    borderColor: palette.border,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontFamily: typeface.display,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: palette.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionLabel: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 6,
    marginBottom: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: palette.cardAlt,
    borderWidth: 1,
    borderColor: palette.border,
  },
  itemPressed: {
    opacity: 0.9,
  },
  itemText: {
    color: palette.text,
    fontFamily: typeface.heading,
    fontSize: 14,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  proBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,166,59,0.7)",
    backgroundColor: "rgba(242,166,59,0.2)",
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  proBadgeText: {
    color: palette.accent,
    fontFamily: typeface.heading,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  itemSubtext: {
    color: palette.subtext,
    fontFamily: typeface.body,
    fontSize: 11,
    marginTop: 1,
  },
  dangerItem: {
    borderColor: "rgba(239,107,91,0.35)",
  },
  dangerText: {
    color: palette.danger,
  },
});
