import type { BlockComponentProps } from "../registry";
import { mediaUrl } from "@/config/cdn";
import { stringProp } from "./props";
import "@/experience/ui/StoryHomePage/StoryHomePage.css";

export function FeatureBand({ block }: BlockComponentProps) {
  const kicker = stringProp(block, "kicker");
  const heading = stringProp(block, "heading");
  const body = stringProp(block, "body");
  const mediaKey = stringProp(block, "mediaKey");
  const mediaAlt = stringProp(block, "mediaAlt", heading);
  const imageSrc = mediaKey ? mediaUrl(mediaKey) : "";

  return (
    <section className="storyHome__featureBand">
      {imageSrc && (
        <div className="storyHome__featureMedia">
          <img src={imageSrc} alt={mediaAlt} />
        </div>
      )}
      <div className="storyHome__featureCopy">
        {kicker && <p className="storyHome__sectionKicker">{kicker}</p>}
        <h2>{heading}</h2>
        {body && <p>{body}</p>}
      </div>
    </section>
  );
}
