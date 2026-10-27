export function FlatShowcaseCardView({
  title,
  imageSrc,
  imageAlt,
  onSelect,
  onHover,
  href,
}: {
  title: string;
  imageSrc: string;
  imageAlt: string;
  href?: string;
  onSelect?: () => void;
  onHover?: () => void;
}) {
  const Root = href ? "a" : "div";
  return (
    <Root
      href={href}
      className="storyHome__flatCard"
      onClick={onSelect}
      onMouseEnter={onHover}
      onFocus={onHover}
      role="button"
      tabIndex={0}
      onKeyDown={
        onSelect
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.();
              }
            }
          : undefined
      }
    >
      <img className="storyHome__flatCardImage" src={imageSrc} alt={imageAlt} />
      <div className="storyHome__flatCardBody">
        <p className="storyHome__flatCardTitle">{title}</p>
        <span className="storyHome__flatCardAction">Open</span>
      </div>
    </Root>
  );
}
