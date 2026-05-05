import { useUiSounds } from "../audio/useUiSounds";
import CinematicShell from "./CinematicShell";
import "./ContactPage.css";

type ContactPageProps = {
  onGoHome: () => void;
  onNavigateToProducts: () => void;
  onNavigateToShowcase: () => void;
};

export default function ContactPage({
  onGoHome,
  onNavigateToProducts,
  onNavigateToShowcase,
}: ContactPageProps) {
  const { playHover, playNavClick } = useUiSounds();

  return (
    <CinematicShell>
      <div className="contactPage">
        <header className="contactPage__header">
          <nav className="contactPage__nav" aria-label="Primary">
            <button
              type="button"
              className="contactPage__navLink"
              onMouseEnter={playHover}
              onClick={() => {
                playNavClick();
                onGoHome();
              }}
            >
              Home
            </button>
            <button
              type="button"
              className="contactPage__navLink"
              onMouseEnter={playHover}
              onClick={() => {
                playNavClick();
                onNavigateToProducts();
              }}
            >
              Product
            </button>
            <button
              type="button"
              className="contactPage__navLink"
              onMouseEnter={playHover}
              onClick={() => {
                playNavClick();
                onNavigateToShowcase();
              }}
            >
              Showcase
            </button>
            <span className="contactPage__navActive">Contact</span>
          </nav>
        </header>

        <main className="contactPage__main">
          <section className="contactPage__hero">
            <p className="contactPage__eyebrow">Access</p>
            <h1 className="contactPage__title">LUME is not found. It is entered by invitation.</h1>
            <p className="contactPage__lead">
              LUME is a secret luxury hotel in Monaco built around a different form of
              exclusivity. Wealth is not the currency. Impact is.
            </p>
          </section>

          <section className="contactPage__body" aria-label="About LUME access">
            <div className="contactPage__statement">
              <span>01</span>
              <p>
                Access to LUME is reserved for people who have positively influenced
                society and helped others. The invitation is not a purchase, a booking
                strategy, or a public application. It is recognition.
              </p>
            </div>

            <div className="contactPage__statement">
              <span>02</span>
              <p>
                Once invited, a guest is placed on the list. From that moment, they may
                request a stay whenever availability allows, but only once per year.
                When the visit ends, the card resets. The wait becomes part of the
                experience.
              </p>
            </div>

            <div className="contactPage__statement">
              <span>03</span>
              <p>
                Inside LUME, every object belongs to the stay. Special editions created
                with the world&apos;s most recognised brands exist only within the hotel.
                They are experienced there, and they remain there.
              </p>
            </div>
          </section>

          <section className="contactPage__closing">
            <p>
              For LUME, contact is not a form. It is the beginning of discretion,
              consideration, and alignment with a philosophy: the stay itself is the
              product, and access is earned by what a person contributes to the world.
            </p>
          </section>
        </main>
      </div>
    </CinematicShell>
  );
}
