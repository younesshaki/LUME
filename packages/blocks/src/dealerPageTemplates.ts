/**
 * Tier-1 dealer page templates — premade page-builder documents a tenant can
 * publish as-is or customize. Pure data (same rules as defaultPages.ts: no
 * React, no aliases, seed-script importable). Composed entirely of existing
 * palette blocks; each block carries sensible dealer copy so the page reads
 * finished on first publish, and every block remains editable afterwards.
 */
import type { DefaultPageSeed } from "./defaultPages";

export const DEALER_PAGE_TEMPLATES: DefaultPageSeed[] = [
  {
    slug: "financing",
    title: "Financing",
    navOrder: 5,
    isReserved: false,
    seoMeta: {
      title: "Financing & Pre-Qualification",
      description:
        "Estimate your monthly payment and start a confidential finance pre-qualification with our team.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "financing-calculator",
          type: "finance-calculator",
          props: {
            eyebrow: "Finance",
            title: "Shape the terms around the drive.",
            body:
              "Adjust the purchase price, deposit, term, and illustrative rate to explore a monthly estimate before we talk.",
            defaultPrice: 85000,
            defaultDeposit: 15000,
            defaultTermMonths: 60,
            defaultAnnualRate: 6.9,
            disclaimer:
              "Illustrative estimate only. This is not an offer of credit. Final terms depend on lender approval, taxes, fees, and individual circumstances.",
          },
        },
        {
          id: "financing-trust",
          type: "trust-stats",
          props: {
            eyebrow: "Finance With Confidence",
            title: "A finance desk that answers directly.",
            body: "",
            items: [
              { label: "Vehicles financed", body: "1400|0|+" },
              { label: "Average approval time", body: "4|0|h" },
              { label: "Finance partners", body: "12|0|+" },
              { label: "Client rating", body: "4.9|1|/5" },
            ],
          },
        },
        {
          id: "financing-application",
          type: "lead-capture-form",
          props: {
            eyebrow: "Get Pre-Qualified",
            title: "Start a confidential pre-qualification.",
            body:
              "Tell us what you are considering and how to reach you. A finance specialist will respond with real options — no obligation, no impact on your credit at this stage.",
            buttonLabel: "Request pre-qualification",
            successMessage: "Your pre-qualification request is with our finance desk. We will respond shortly.",
          },
        },
      ],
    },
  },
  {
    slug: "trade-in",
    title: "Trade-In",
    navOrder: 6,
    isReserved: false,
    seoMeta: {
      title: "Trade-In & Sell Your Car",
      description:
        "Get a considered valuation for your current vehicle — handled remotely first, confirmed in person.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "trade-in-form",
          type: "trade-in-form",
          props: {
            eyebrow: "Trade-In",
            title: "Your current car is part of the next one.",
            body:
              "Share the essentials — year, make, model, mileage, and condition. We respond with a considered valuation, not an automated guess.",
            buttonLabel: "Request valuation",
            successMessage: "Your appraisal request is with our team. Expect a considered response shortly.",
          },
        },
        {
          id: "trade-in-trust",
          type: "trust-stats",
          props: {
            eyebrow: "Fair By Design",
            title: "Valuations people come back for.",
            body: "",
            items: [
              { label: "Vehicles appraised", body: "2100|0|+" },
              { label: "Average response", body: "24|0|h" },
              { label: "Repeat clients", body: "72|0|%" },
              { label: "Client rating", body: "4.9|1|/5" },
            ],
          },
        },
        {
          id: "trade-in-faq",
          type: "faq-accordion",
          props: {
            eyebrow: "Before You Ask",
            title: "How the trade-in works.",
            body: "",
            items: [
              {
                label: "Can the valuation start remotely?",
                body: "Yes. Photos and the basics are enough for a considered first figure; the final offer is confirmed after inspection.",
              },
              {
                label: "Can I trade in against any vehicle in stock?",
                body: "Yes. Your valuation can be applied to any vehicle in the collection, or taken as a direct sale.",
              },
              {
                label: "What if the car has outstanding finance?",
                body: "We settle the balance with your lender as part of the process and handle the paperwork with you.",
              },
            ],
          },
        },
      ],
    },
  },
  {
    slug: "specials",
    title: "Specials",
    navOrder: 7,
    isReserved: false,
    seoMeta: {
      title: "Specials & Offers",
      description: "Current dealership offers and featured opportunities, updated regularly.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "specials-announcement",
          type: "announcement-bar",
          props: {
            message: "This month's featured opportunities are now live.",
            linkLabel: "Browse the collection",
            linkHref: "/vehicles",
            dismissible: true,
          },
        },
        {
          id: "specials-offer-finance",
          type: "cta-banner",
          props: {
            eyebrow: "Finance Offer",
            title: "Illustrative rates from 6.9% on selected vehicles.",
            body:
              "For a limited time, selected vehicles qualify for preferred finance terms. Final terms depend on lender approval.",
            primaryLabel: "Estimate your payment",
            primaryHref: "/financing",
            secondaryLabel: "Browse eligible vehicles",
            secondaryHref: "/vehicles",
          },
        },
        {
          id: "specials-offer-trade",
          type: "cta-banner",
          props: {
            eyebrow: "Trade-In Week",
            title: "Priority valuations this week.",
            body:
              "Appraisal requests placed this week are answered within 24 hours and honored for seven days.",
            primaryLabel: "Value my car",
            primaryHref: "/trade-in",
            secondaryLabel: "",
            secondaryHref: "",
          },
        },
        {
          id: "specials-signup",
          type: "newsletter-signup",
          props: {
            eyebrow: "First Look",
            title: "Hear about the next offer before it is widely seen.",
            body: "Join the private list. We only write when there is something worth your attention.",
            buttonLabel: "Notify me",
            successMessage: "You are on the list.",
          },
        },
      ],
    },
  },
  {
    slug: "service",
    title: "Service & Parts",
    navOrder: 8,
    isReserved: false,
    seoMeta: {
      title: "Service & Parts — Schedule Service",
      description:
        "Book a service appointment with our workshop and see hours, location, and what we cover.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "service-booking",
          type: "service-booking",
          props: {
            eyebrow: "Service & Parts",
            title: "Book your service appointment.",
            body:
              "Pick the work your vehicle needs and a preferred time. Our service team will confirm the appointment personally.",
            buttonLabel: "Request appointment",
            successMessage: "Your service request has been received. Our service team will confirm shortly.",
          },
        },
        {
          id: "service-list",
          type: "services-list",
          props: {
            eyebrow: "What We Cover",
            title: "Workshop capability, without the runaround.",
            body: "",
            items: [
              { label: "Scheduled maintenance", body: "Manufacturer-scheduled service with genuine or approved parts." },
              { label: "Diagnostics", body: "Dealer-level diagnostics and clear, quoted findings before any work." },
              { label: "Brakes, tires & alignment", body: "Measured, road-tested, and documented on every visit." },
              { label: "Genuine parts", body: "Sourced quickly and fitted by the same team that services your vehicle." },
            ],
          },
        },
        {
          id: "service-map-hours",
          type: "map-hours",
          props: {
            eyebrow: "Visit the Workshop",
            title: "Drop-off, pickup, or wait with a coffee.",
            body: "Early drop-off can be arranged in advance.",
            address: "1250 Motor Row, Beverly Hills, CA 90210",
            mapUrl: "https://maps.google.com/",
            mapEmbedUrl: "",
            items: [
              { label: "Monday–Friday", body: "08:00–17:00" },
              { label: "Saturday", body: "09:00–13:00" },
              { label: "Sunday", body: "Closed" },
            ],
          },
        },
      ],
    },
  },
  {
    slug: "about",
    title: "About",
    navOrder: 9,
    isReserved: false,
    seoMeta: {
      title: "About Us — Our Story",
      description: "Who we are, how we work, and the people you will deal with directly.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "about-story",
          type: "rich-text",
          props: {
            body: "We started as a small team with a simple rule: never sell a vehicle we would not put our own name behind.\n\nEvery vehicle in the collection is chosen, inspected, and prepared by people you can actually call. No hand-offs to a call center, no pressure, no surprises after delivery — just considered advice and cars we are proud to hand over.",
          },
        },
        {
          id: "about-trust",
          type: "trust-stats",
          props: {
            eyebrow: "Measured Experience",
            title: "The numbers behind the name.",
            body: "",
            items: [
              { label: "Vehicles delivered", body: "2500|0|+" },
              { label: "Client rating", body: "4.9|1|/5" },
              { label: "Years of expertise", body: "18|0|+" },
              { label: "Repeat clients", body: "72|0|%" },
            ],
          },
        },
        {
          id: "about-team",
          type: "team-grid",
          props: {
            eyebrow: "Your Team",
            title: "The people you will actually deal with.",
            body: "A small team, accountable for every detail.",
            items: [
              {
                label: "Alex Morgan",
                body: "Managing Director|Collector-car sourcing and long-term client relationships.",
              },
              {
                label: "Maya Laurent",
                body: "Sales Director|Contemporary performance and luxury vehicles.",
              },
              {
                label: "James Ellis",
                body: "Vehicle Specialist|Appraisals, provenance, and pre-delivery preparation.",
              },
            ],
          },
        },
        {
          id: "about-testimonials",
          type: "testimonials",
          props: {
            eyebrow: "Client Notes",
            title: "Confidence, expressed quietly.",
            body: "",
            items: [
              {
                label: "Amelia R. — Returning client",
                body: "Every detail was handled before I needed to ask. The car was exactly as described.",
              },
              {
                label: "Daniel M. — First-time buyer",
                body: "Measured advice, transparent history, and a delivery that felt genuinely personal.",
              },
            ],
          },
        },
        {
          id: "about-cta",
          type: "cta-banner",
          props: {
            eyebrow: "Meet Us",
            title: "The best way to know us is a conversation.",
            body: "Browse the collection or come meet the team in person.",
            primaryLabel: "View inventory",
            primaryHref: "/vehicles",
            secondaryLabel: "Contact the team",
            secondaryHref: "/contact",
          },
        },
      ],
    },
  },
  {
    slug: "reviews",
    title: "Reviews",
    navOrder: 10,
    isReserved: false,
    seoMeta: {
      title: "Client Reviews",
      description: "Verified client feedback and ratings for our dealership.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "reviews-summary",
          type: "review-summary",
          props: {
            eyebrow: "Client Confidence",
            title: "A reputation built one handover at a time.",
            body: "Independent feedback from verified dealership clients.",
            rating: 4.9,
            reviewCount: 287,
            sourceLabel: "Read verified reviews",
            sourceHref: "",
          },
        },
        {
          id: "reviews-testimonials",
          type: "testimonials",
          props: {
            eyebrow: "In Their Words",
            title: "What clients say after delivery.",
            body: "",
            items: [
              {
                label: "Amelia R. — Returning client",
                body: "Every detail was handled before I needed to ask. The car was exactly as described.",
              },
              {
                label: "Daniel M. — First-time buyer",
                body: "Measured advice, transparent history, and a delivery that felt genuinely personal.",
              },
              {
                label: "Sophia K. — Collector",
                body: "They understood the specification I wanted and waited for the right example.",
              },
            ],
          },
        },
        {
          id: "reviews-cta",
          type: "cta-banner",
          props: {
            eyebrow: "See For Yourself",
            title: "The next review could be yours.",
            body: "Browse the live collection or arrange a private viewing.",
            primaryLabel: "View inventory",
            primaryHref: "/vehicles",
            secondaryLabel: "Contact the team",
            secondaryHref: "/contact",
          },
        },
      ],
    },
  },
  {
    slug: "faq",
    title: "FAQ",
    navOrder: 11,
    isReserved: false,
    seoMeta: {
      title: "Frequently Asked Questions",
      description: "Clear answers about buying, trade-ins, financing, delivery, and service.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "faq-accordion",
          type: "faq-accordion",
          props: {
            eyebrow: "Questions, Answered",
            title: "The details worth knowing.",
            body: "Clear answers before the conversation begins.",
            items: [
              {
                label: "Can you source a vehicle that is not listed?",
                body: "Yes. Share the model, specification, and timing and our team can begin a discreet search.",
              },
              {
                label: "Do you accept part exchange?",
                body: "Yes. We can review your current vehicle remotely before arranging a final inspection.",
              },
              {
                label: "Can I finance my purchase?",
                body: "Yes. Our finance desk works with a panel of lenders — start with the calculator on the financing page, then we confirm real terms.",
              },
              {
                label: "Can delivery be arranged?",
                body: "Collection and enclosed transport options can be coordinated once the purchase is complete.",
              },
              {
                label: "Do vehicles come with a warranty?",
                body: "Every vehicle leaves with documented preparation and, where applicable, warranty coverage — confirmed in writing before purchase.",
              },
            ],
          },
        },
        {
          id: "faq-cta",
          type: "cta-banner",
          props: {
            eyebrow: "Still Wondering?",
            title: "Ask us directly — a person answers.",
            body: "No scripts, no ticket queues. Speak with the team that prepares the vehicles.",
            primaryLabel: "Contact the team",
            primaryHref: "/contact",
            secondaryLabel: "",
            secondaryHref: "",
          },
        },
      ],
    },
  },
  {
    slug: "privacy",
    title: "Privacy & Terms",
    navOrder: 12,
    isReserved: false,
    seoMeta: {
      title: "Privacy Policy & Terms of Service",
      description: "How this dealership handles your personal data, and the terms for using this website.",
    },
    blocks: {
      version: 1,
      blocks: [
        {
          id: "privacy-policy",
          type: "rich-text",
          props: {
            body: "PRIVACY POLICY\n\nWho we are. This website is operated by the dealership named on this site (\"we\", \"us\"). This policy explains what personal data we collect, why, and the rights you have over it.\n\nWhat we collect. When you contact us — through a lead form, a trade-in or finance application, a service or test-drive booking, or the AI concierge chat — we collect the details you provide: your name, email address, phone number, and the content of your message, including any vehicle or preference information you share. When you accept, we also keep a record of your consent. Like most websites, we collect limited technical information (such as pages visited) through privacy-respecting analytics, and we use a bot-protection service (Cloudflare Turnstile) on some forms.\n\nHow we use it. We use your details only to respond to your enquiry, arrange viewings, test drives, service appointments, valuations, or finance discussions, to communicate about vehicles you have asked about, and to operate and improve this website. We do not sell your personal data, and we do not use your enquiry details for unrelated marketing without your consent.\n\nWhere it is processed. Your data is stored and processed by our service providers acting as processors: Supabase (database, EU region), Cloudflare (file storage and security), Vercel (hosting and analytics), and our email delivery provider. The AI concierge processes chat content to answer your questions; chat content is used to provide the service, not to build advertising profiles.\n\nHow long we keep it. Enquiry and lead records are kept for as long as needed to handle your request and any resulting relationship, and thereafter only as required by law or legitimate record-keeping.\n\nYour rights. You may request a copy of your personal data, ask us to correct or delete it, withdraw consent at any time, or object to how we use it. To exercise any of these rights, contact us using the details on our contact page and we will respond within the time required by applicable law.\n\nBrowser storage. This site stores small preferences in your browser (such as saved vehicles and display settings). These stay on your device and can be cleared at any time using your browser settings.\n\nChanges. If this policy changes, the updated version will be published on this page with a revised date.",
          },
        },
        {
          id: "terms-of-service",
          type: "rich-text",
          props: {
            body: "TERMS OF SERVICE\n\nThe basics. This website is provided by the dealership named on this site. By using it, you accept these terms.\n\nInformation, not offers. Vehicle descriptions, prices, mileage, imagery, finance examples, and availability on this site are provided for general information. They do not constitute a binding offer, and may change or contain errors. A purchase, finance agreement, or service appointment becomes binding only when confirmed in writing by the dealership. Finance examples are illustrative estimates, not offers of credit; any finance is subject to lender approval and status.\n\nEnquiries. Submitting a lead form, valuation request, booking, or chat message does not create a contract or reservation. We will make reasonable efforts to respond, but cannot guarantee response times.\n\nThe AI concierge. The concierge answers questions and can guide you around the site. It is an assistant, not an authoritative source: please confirm important details — price, specification, availability, finance terms — with our team before relying on them.\n\nAcceptable use. Do not misuse this site, attempt to access another tenant's or user's data, scrape inventory at disruptive volumes, or submit false or unlawful content through forms or chat.\n\nIntellectual property. Site content, design, and branding belong to the dealership or its licensors and may not be reproduced without permission.\n\nLiability. To the extent permitted by law, the dealership is not liable for indirect losses arising from use of this site or reliance on information presented on it. Nothing in these terms limits liability that cannot be limited by law.\n\nChanges and contact. We may update these terms; the current version always appears on this page. Questions about these terms can be sent using the contact details on this site.",
          },
        },
      ],
    },
  },
];
