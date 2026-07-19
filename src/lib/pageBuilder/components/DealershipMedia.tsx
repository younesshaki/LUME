import { useId } from "react";
import { ArrowRight, Clock3, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { BlockComponentProps } from "../registry";
import { DealershipActionLink, DealershipSection } from "./DealershipSection";
import { labelBodyItemsProp, stringProp } from "./props";
import {
  safeLink,
  safeMapEmbedUrl,
  safeMediaSource,
  whatsappHref,
  youtubeOrVimeoEmbedUrl,
} from "./dealershipBlockUtils";

export function SplitFeature({ block }: BlockComponentProps) {
  const headingId = useId();
  const media = safeMediaSource(stringProp(block, "mediaUrl"));
  const mediaAlt = stringProp(block, "mediaAlt");
  const mediaPosition = stringProp(block, "mediaPosition") === "right" ? "right" : "left";
  const ctaHref = safeLink(stringProp(block, "ctaHref"));
  const ctaLabel = stringProp(block, "ctaLabel");
  const eyebrow = stringProp(block, "eyebrow");
  const title = stringProp(block, "title");
  const body = stringProp(block, "body");

  return (
    <section
      className="dealershipBlock dealershipBlock--split"
      aria-labelledby={headingId}
    >
      <div className="dealershipBlock__inner">
        <div className={`splitFeature splitFeature--media-${mediaPosition}`}>
          <div className="splitFeature__media">
            {media ? (
              <img
                src={media}
                alt={mediaAlt}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span role="status">Add an image to complete this feature.</span>
            )}
          </div>
          <div className="splitFeature__copy">
            {eyebrow ? <p className="dealershipBlock__eyebrow">{eyebrow}</p> : null}
            <h2 id={headingId} className="dealershipBlock__title">{title}</h2>
            {body ? <p className="dealershipBlock__body">{body}</p> : null}
            {ctaHref && ctaLabel ? (
              <DealershipActionLink href={ctaHref}>
                {ctaLabel}
                <ArrowRight aria-hidden="true" />
              </DealershipActionLink>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function VideoEmbed({ block }: BlockComponentProps) {
  const embedUrl = youtubeOrVimeoEmbedUrl(stringProp(block, "videoUrl"));
  const title = stringProp(block, "caption") || stringProp(block, "title") || "Dealership video";

  return (
    <DealershipSection block={block} className="dealershipBlock--video">
      {embedUrl ? (
        <div className="videoEmbed">
          <iframe
            src={embedUrl}
            title={title}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <p className="dealershipBlock__empty" role="status">
          Add a valid YouTube or Vimeo URL to display the film.
        </p>
      )}
    </DealershipSection>
  );
}

export function GalleryMasonry({ block }: BlockComponentProps) {
  const images = labelBodyItemsProp(block).flatMap((item) => {
    const src = safeMediaSource(item.body);
    return src ? [{ src, alt: item.label }] : [];
  });

  return (
    <DealershipSection block={block} className="dealershipBlock--gallery">
      {images.length > 0 ? (
        <div className="galleryMasonry">
          {images.map((image, index) => (
            <figure key={`${image.src}-${index}`}>
              <img
                src={image.src}
                alt={image.alt}
                loading="lazy"
                decoding="async"
              />
              <figcaption>{image.alt}</figcaption>
            </figure>
          ))}
        </div>
      ) : (
        <p className="dealershipBlock__empty" role="status">
          Add public showroom or vehicle images to build this gallery.
        </p>
      )}
    </DealershipSection>
  );
}

export function MapHours({ block }: BlockComponentProps) {
  const hours = labelBodyItemsProp(block);
  const mapHref = safeLink(stringProp(block, "mapUrl"));
  const mapEmbed = safeMapEmbedUrl(stringProp(block, "mapEmbedUrl"));
  const address = stringProp(block, "address");

  return (
    <DealershipSection block={block} className="dealershipBlock--location">
      <div className="mapHours">
        <div className="mapHours__details">
          <div className="mapHours__address">
            <MapPin aria-hidden="true" />
            <address>{address}</address>
          </div>
          <dl className="mapHours__schedule">
            {hours.map((item, index) => (
              <div key={`${item.label}-${index}`}>
                <dt>{item.label}</dt>
                <dd>{item.body}</dd>
              </div>
            ))}
          </dl>
          {mapHref ? (
            <DealershipActionLink href={mapHref} secondary>
              Open in maps
              <ArrowRight aria-hidden="true" />
            </DealershipActionLink>
          ) : null}
        </div>
        <div className="mapHours__map">
          {mapEmbed ? (
            <iframe
              src={mapEmbed}
              title={`Map showing ${address}`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="mapHours__placeholder" role="status">
              <MapPin aria-hidden="true" />
              <span>Add a supported map embed URL for an interactive map.</span>
            </div>
          )}
        </div>
      </div>
    </DealershipSection>
  );
}

export function FooterContact({ block }: BlockComponentProps) {
  const phone = stringProp(block, "phone");
  const email = stringProp(block, "email");
  const address = stringProp(block, "address");
  const legalText = stringProp(block, "legalText");
  const phoneHref = safeLink(phone ? `tel:${phone}` : "");
  const emailHref = safeLink(email ? `mailto:${email}` : "");
  const whatsApp = whatsappHref(
    stringProp(block, "whatsappPhone"),
    "Hello, I would like to speak with the dealership team.",
  );
  const hours = labelBodyItemsProp(block);

  return (
    <footer className="dealershipContact" aria-label="Dealership contact information">
      <div className="dealershipContact__inner">
        <div className="dealershipContact__intro">
          {stringProp(block, "eyebrow") ? (
            <p className="dealershipBlock__eyebrow">{stringProp(block, "eyebrow")}</p>
          ) : null}
          <h2>{stringProp(block, "title")}</h2>
          {stringProp(block, "body") ? <p>{stringProp(block, "body")}</p> : null}
        </div>

        <div className="dealershipContact__contact">
          <h3>Contact</h3>
          <address>{address}</address>
          <ul>
            {phoneHref && phone ? (
              <li>
                <Phone aria-hidden="true" />
                <a href={phoneHref}>{phone}</a>
              </li>
            ) : null}
            {emailHref && email ? (
              <li>
                <Mail aria-hidden="true" />
                <a href={emailHref}>{email}</a>
              </li>
            ) : null}
            {whatsApp ? (
              <li>
                <MessageCircle aria-hidden="true" />
                <a href={whatsApp}>WhatsApp</a>
              </li>
            ) : null}
          </ul>
        </div>

        <div className="dealershipContact__hours">
          <h3>
            <Clock3 aria-hidden="true" />
            Opening hours
          </h3>
          <dl>
            {hours.map((item, index) => (
              <div key={`${item.label}-${index}`}>
                <dt>{item.label}</dt>
                <dd>{item.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      {legalText ? <p className="dealershipContact__legal">{legalText}</p> : null}
    </footer>
  );
}
