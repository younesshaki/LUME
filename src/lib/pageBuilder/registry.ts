/**
 * Component registry — Epic L (SCRUM-180), foundation skeleton.
 *
 * Binds a block `type` to the React component that renders it. The descriptors
 * (metadata, defaultProps, validation) live in `./blockTypes`; this layer adds
 * the component binding so the future <PageRenderer> can do:
 *   descriptor = getBlockDescriptor(block.type)
 *   Component  = getBlockComponent(block.type)
 *   render <Component block={block} mode={mode} />
 *
 * SKELETON STATUS: no components are bound yet. The current site's sections are
 * still embedded inside the page components (StoryHomePage, ProductsPage, …).
 * Extracting them into standalone block components is the next step (follow-up),
 * at which point each calls `registerBlockComponent(type, Component)`. Until then
 * the registry returns `undefined` for components and the live site is untouched.
 */
import type { ComponentType } from "react";
import type { PageBlock } from "@lume/types";
import {
  getBlockDescriptor,
  listBlockDescriptors,
  type BlockDescriptor,
  type BlockMode,
} from "./blockTypes";

/** Props every block component receives from the renderer. */
export type BlockComponentProps<P extends Record<string, unknown> = Record<string, unknown>> = {
  block: PageBlock & { props: P };
  mode: BlockMode;
};

export type BlockComponent = ComponentType<BlockComponentProps>;

const componentRegistry = new Map<string, BlockComponent>();

/** Bind a React component to a block type. Call during module init as sections
 * are extracted into standalone block components. */
export function registerBlockComponent(type: string, component: BlockComponent): void {
  if (!getBlockDescriptor(type)) {
    // Fail loud in dev: a component without a descriptor can't be validated/edited.
    console.warn(`[pageBuilder] registering component for unknown block type "${type}"`);
  }
  componentRegistry.set(type, component);
}

export function getBlockComponent(type: string): BlockComponent | undefined {
  return componentRegistry.get(type);
}

/** A block type is renderable once both a descriptor and a component exist. */
export function isBlockRenderable(type: string): boolean {
  return Boolean(getBlockDescriptor(type) && componentRegistry.has(type));
}

/** Combined view for the admin block palette: descriptor + whether it's wired up. */
export function listRegisteredBlocks(): Array<{
  descriptor: BlockDescriptor;
  hasComponent: boolean;
}> {
  return listBlockDescriptors().map((descriptor) => ({
    descriptor,
    hasComponent: componentRegistry.has(descriptor.type),
  }));
}

export { getBlockDescriptor, listBlockDescriptors } from "./blockTypes";
