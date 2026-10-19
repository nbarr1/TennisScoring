"use client";

/**
 * First focusable element on every page: jumps keyboard users past the nav to
 * the page's `<main>`. Pages need no id; the first `<main>` is used.
 */
export function SkipLink(): React.JSX.Element {
  return (
    <a
      href="#main"
      className="tl-skip-link"
      onClick={(event) => {
        const main = document.querySelector<HTMLElement>("main");
        if (!main) return;
        event.preventDefault();
        if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
        main.focus();
        main.scrollIntoView();
      }}
    >
      Skip to main content
    </a>
  );
}
