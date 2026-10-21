"use client";

import { useEffect, useRef } from "react";
import { IconWifiOff } from "@tabler/icons-react";
import { useAnnounce } from "./Announcer";
import { useOnline } from "./network";
import { color, gutter, space, type } from "./tokens";

/**
 * A bar across the top of every page while the browser is offline. Firestore
 * holds writes made offline until the connection returns, so without this a
 * Save or Confirm button just kept spinning. The bar sits in the page flow
 * (never over the nav), and coming back online is announced politely.
 */
export function ConnectionStatus(): React.JSX.Element | null {
  const online = useOnline();
  const announce = useAnnounce();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      announce("You're back online.");
    }
  }, [online, announce]);

  if (online) return null;
  return (
    <div role="status" style={styles.bar}>
      <IconWifiOff size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>
        <strong style={styles.title}>You&apos;re offline.</strong> Anything you save waits until your connection is
        back, so keep this page open.
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: `${space.sm}px ${gutter}`,
    background: color.warningSoft,
    color: color.warningText,
    borderBottom: `1px solid ${color.warning}`,
    ...type.bodySmall,
    textAlign: "center",
  },
  title: { fontWeight: 700 },
};
