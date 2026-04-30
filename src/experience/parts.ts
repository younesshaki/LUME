import { storyManifest } from "./story/manifest";

export type Chapter = {
  title: string;
};

export type Part = {
  title: string;
  chapters: Chapter[];
};

export const parts: Part[] = storyManifest.map((partDefinition) => ({
  title: partDefinition.title,
  chapters: partDefinition.chapters.map((chapterDefinition) => ({
    title: chapterDefinition.title,
  })),
}));
