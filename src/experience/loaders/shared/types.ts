import type { ComponentType } from "react";

export type LoaderVariant = "pre" | "a" | "b" | "c" | "d" | "e" | "f";

export type LoaderAudio = {
  loop?: string;
  sfx?: string;
  volume?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
};

export type LoaderComponentProps = {
  text: string;
  className?: string;
};

export type LoaderComponent = ComponentType<LoaderComponentProps>;
