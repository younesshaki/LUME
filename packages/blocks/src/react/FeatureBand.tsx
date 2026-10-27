import type { BlockComponentProps } from "./types";
import { stringProp } from "./props";

export function FeatureBandView({
  block,
  mediaUrl,
}: BlockComponentProps & { mediaUrl: (key: string) => string }) {
  const kicker = stringProp(block, "kicker");
  const heading = stringProp(block, "heading");
  const body = stringProp(block, "body");
  const mediaKey = stringProp(block, "mediaKey");
  const mediaAlt = stringProp(block, "mediaAlt", heading);
  const imageSrc = mediaKey ? resolveMediaSource(mediaKey, mediaUrl) : "";

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

function resolveMediaSource(
  value: string,
  mediaUrl: (key: string) => string,
): string {
  if (/^(https?:)?\/\//.test(value) || value.startsWith("/")) return value;
  return mediaUrl(value);
}
