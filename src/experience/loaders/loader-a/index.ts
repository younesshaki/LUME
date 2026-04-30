import type { LoaderAudio } from "../shared/types";
import { Loader } from "./Loader";
import { mediaUrl } from "@/config/cdn";

const loopUrl = mediaUrl("here-comes-the-sun-loaderA.mp3");

export const loaderAudio: LoaderAudio | null = {
  loop: loopUrl,
  volume: 0.5, // Default volume, can be adjusted
};

export { Loader };
