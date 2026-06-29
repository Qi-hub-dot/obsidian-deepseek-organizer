// ============================================================
// React root helper — mount React component into Obsidian DOM
// ============================================================
import { Root, createRoot } from "react-dom/client";

/**
 * Create a React root on a container element.
 * The container is cleared before mounting.
 */
export function createReactRoot(container: HTMLElement): Root {
  container.empty();
  return createRoot(container);
}
