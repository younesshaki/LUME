import { registerBlockComponent } from "./registry";
import {
  AnnouncementBar,
  CtaBanner,
  FaqAccordion,
  FeatureBand,
  FeaturedVehicles,
  FinanceCalculator,
  FooterContact,
  GalleryMasonry,
  Hero,
  HowItWorks,
  LeadCaptureForm,
  LogoMarquee,
  MapHours,
  NewArrivals,
  NewsletterSignup,
  ProductGrid,
  ReviewSummary,
  RichText,
  ServicesList,
  ShowcaseGallery,
  SplitFeature,
  StatementList,
  TeamGrid,
  TestDriveBooking,
  Testimonials,
  TradeInForm,
  TrustStats,
  VehicleSearchBand,
  VehicleSpecTable,
  VehicleInventory,
  VideoEmbed,
  WhatsAppCta,
} from "./components";

let registered = false;

/**
 * Bind shared block type ids to public React components. This is idempotent so
 * tests, HMR, and app startup can call it without duplicating registry work.
 */
export function registerBlocks(): void {
  if (registered) return;

  registerBlockComponent("hero", Hero);
  registerBlockComponent("feature-band", FeatureBand);
  registerBlockComponent("statement-list", StatementList);
  registerBlockComponent("rich-text", RichText);
  registerBlockComponent("product-grid", ProductGrid);
  registerBlockComponent("vehicle-inventory", VehicleInventory);
  registerBlockComponent("showcase-gallery", ShowcaseGallery);
  registerBlockComponent("trade-in-form", TradeInForm);
  registerBlockComponent("finance-calculator", FinanceCalculator);
  registerBlockComponent("test-drive-booking", TestDriveBooking);
  registerBlockComponent("lead-capture-form", LeadCaptureForm);
  registerBlockComponent("whatsapp-cta", WhatsAppCta);
  registerBlockComponent("cta-banner", CtaBanner);
  registerBlockComponent("announcement-bar", AnnouncementBar);
  registerBlockComponent("newsletter-signup", NewsletterSignup);
  registerBlockComponent("featured-vehicles", FeaturedVehicles);
  registerBlockComponent("new-arrivals", NewArrivals);
  registerBlockComponent("vehicle-search-band", VehicleSearchBand);
  registerBlockComponent("vehicle-spec-table", VehicleSpecTable);
  registerBlockComponent("testimonials", Testimonials);
  registerBlockComponent("review-summary", ReviewSummary);
  registerBlockComponent("trust-stats", TrustStats);
  registerBlockComponent("logo-marquee", LogoMarquee);
  registerBlockComponent("services-list", ServicesList);
  registerBlockComponent("how-it-works", HowItWorks);
  registerBlockComponent("faq-accordion", FaqAccordion);
  registerBlockComponent("team-grid", TeamGrid);
  registerBlockComponent("split-feature", SplitFeature);
  registerBlockComponent("video-embed", VideoEmbed);
  registerBlockComponent("gallery-masonry", GalleryMasonry);
  registerBlockComponent("map-hours", MapHours);
  registerBlockComponent("footer-contact", FooterContact);

  registered = true;
}
