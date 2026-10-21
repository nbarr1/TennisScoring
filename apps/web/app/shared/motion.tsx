"use client";

import { useEffect } from "react";
import type { HTMLAttributes } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import Skeleton from "react-loading-skeleton";

/**
 * A `div` whose direct children fade and slide when they are added, removed,
 * or reordered. auto-animate skips the animation when the visitor's system
 * asks for reduced motion.
 *
 * Pass `animate={false}` to switch it off, for a list long enough that
 * measuring every child on each change costs more than the motion is worth.
 */
export function AnimatedDiv({
  animate = true,
  ...props
}: HTMLAttributes<HTMLDivElement> & { animate?: boolean }): React.JSX.Element {
  const [ref, setEnabled] = useAutoAnimate<HTMLDivElement>();
  useEffect(() => {
    setEnabled(animate);
  }, [animate, setEnabled]);
  return <div ref={ref} {...props} />;
}

/**
 * Grey placeholder bars shown while a page's data loads. The label is what a
 * screen reader announces; the bars themselves are hidden from it.
 */
export function LoadingBlock({
  label,
  rows = 4,
  rowHeight = 20,
  style,
}: {
  label: string;
  rows?: number;
  rowHeight?: number;
  style?: React.CSSProperties;
}): React.JSX.Element {
  return (
    <div role="status" style={style}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true">
        <Skeleton count={rows} height={rowHeight} style={{ marginBottom: 12 }} />
      </div>
    </div>
  );
}
