import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { useCdnImage } from "@/config/cdn";
import { useSound } from "@/lib/sound";
import { showcaseTitleCardSoundActions } from "./ShowcaseTitleCard.sounds";
import "./ShowcaseTitleCard.css";

type ShowcaseTitleCardProps = {
  onPlay: () => void;
};

export default function ShowcaseTitleCard({ onPlay }: ShowcaseTitleCardProps) {
  const showcaseTitleBackground = useCdnImage("showcaseentry2.png");
  const lumeLogo = useCdnImage("LUMElogo.png");
  const { play } = useSound();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!rootRef.current) {
      return;
    }

    const ctx = gsap.context(() => {
      gsap.fromTo(
        ".showcaseTitleCard__fade",
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 1.4,
          ease: "power3.out",
          stagger: 0.14,
        }
      );
    }, rootRef);

    return () => {
      ctx.revert();
    };
  }, []);

  const handlePlay = () => {
    if (isLeaving || !rootRef.current) {
      return;
    }

    setIsLeaving(true);
    play(showcaseTitleCardSoundActions.play);

    gsap.to(rootRef.current, {
      autoAlpha: 0,
      duration: 1,
      ease: "power2.inOut",
      onComplete: onPlay,
    });
  };

  return (
    <div ref={rootRef} className="showcaseTitleCard">
      <div
        className="showcaseTitleCard__image"
        style={{ backgroundImage: `url(${showcaseTitleBackground})` }}
      />
      <div className="showcaseTitleCard__overlay" />
      <div className="showcaseTitleCard__content">
        <img
          className="showcaseTitleCard__logo showcaseTitleCard__fade"
          src={lumeLogo}
          alt="LUME"
        />
        <p className="showcaseTitleCard__eyebrow showcaseTitleCard__fade">Cinematic Product Showcase</p>
        <h1 className="showcaseTitleCard__title showcaseTitleCard__fade">LUME</h1>
        <HoverBorderGradient
          as="button"
          type="button"
          containerClassName="showcaseTitleCard__play showcaseTitleCard__fade"
          className="showcaseTitleCard__playInner"
          onClick={handlePlay}
          disabled={isLeaving}
        >
          Play
        </HoverBorderGradient>
      </div>
    </div>
  );
}
