export type KnowledgeChunk = {
  id: string;
  text: string;
  category: "brand" | "product" | "experience" | "access";
};

export const chunks: KnowledgeChunk[] = [
  {
    id: "brand-concept",
    category: "brand",
    text: "LUME is a secret luxury hotel in Monaco. It is not a place you find — it is a place you are invited to. The founding philosophy of LUME is that access is not granted by wealth; it is granted by impact. The guests of LUME are people who have positively influenced society and helped others. That is the only currency that gets you through the door. Once invited, a guest is placed on the list. From that moment, they can request a stay whenever availability allows — but only once per year. When an annual visit ends, the card resets. You wait. You think about it. You come back.",
  },
  {
    id: "brand-hotel",
    category: "brand",
    text: "LUME is located in Monaco, chosen for its association with extreme discretion, luxury, and inaccessibility. The hotel has approximately 70 rooms and suites. Access is invitation-only and limited to one stay per year per guest. The design is dark and gold — an architecture and interior design never seen before, where every detail reflects luxury and class. The atmosphere is the kind of place you keep thinking about until your next stay. Nothing about LUME is publicly announced. It exists in the knowledge of those who have been there and those who are waiting.",
  },
  {
    id: "brand-products-philosophy",
    category: "brand",
    text: "LUME collaborates with the biggest brands on earth to offer special edition products that exist nowhere else in the world. These are not products you can buy. They are not products you can take home. They exist only within LUME — you experience them during your stay, and when you leave, they stay behind. This is intentional. It makes the stay itself the product. Every item in LUME is a direct collaboration — the brand creates a version specifically for LUME, and LUME is the sole place it exists. The exclusivity is absolute and permanent.",
  },
  {
    id: "brand-voice",
    category: "brand",
    text: "The LUME brand voice is premium, not playful. It is restrained and confident. Copy is minimal — every word is chosen with care. Descriptions do not oversell; they understate with precision. The tone is that of someone who knows exactly what they have built and does not need to convince anyone. LUME speaks to people who have already earned their invitation, not to people being recruited. The language is English, with French planned for phase two. The brand does not shout. It lets quality, exclusivity, and restraint do the work.",
  },
  {
    id: "brand-design",
    category: "brand",
    text: "LUME's design language is built on darkness, gold, metal, glass, and reflection. The material palette is black, deep charcoal, gold, and metallic finishes. High contrast between deep shadow and precise light is central to the visual identity. The design is cinematic — everything is revealed with pacing, restraint, and intention. Text is minimal and monumental. Motion is slow and purposeful. Nothing is cluttered. The design avoids anything that feels like a consumer application or ecommerce storefront. Every page is an experience, not a transaction. LUME's digital presence is an extension of the physical hotel.",
  },
  {
    id: "product-redbull",
    category: "product",
    text: "The first live product collaboration at LUME is LUME × Red Bull Special Edition. This is a special edition drink created exclusively for LUME — a version of Red Bull that exists nowhere else in the world. It is available to guests during their stay and cannot be purchased or taken home. The collaboration already has a fully built cinematic showcase on the LUME website, making it the reference template for how every product is presented. The Red Bull collaboration is the only product currently live. Category: food and drink. Status: live.",
  },
  {
    id: "product-starbucks",
    category: "product",
    text: "LUME × Starbucks Reserve Blend is an exclusive coffee created specifically for LUME. The blend is a concept product currently in development, representing a collaboration between LUME and Starbucks to create a coffee experience that exists only within the hotel. Like all LUME products, it is not for sale and cannot be taken home — it is part of the LUME stay experience. Category: food and drink. Status: coming soon.",
  },
  {
    id: "product-moet",
    category: "product",
    text: "LUME × Moët & Chandon Blanc de Blancs is an exclusive champagne blend created solely for LUME. Served only at the hotel, it is a collaboration between LUME and one of the most prestigious champagne houses in the world. The blend does not exist outside of LUME. Guests experience it during their stay and cannot purchase it or bring a bottle home. Category: food and drink. Status: coming soon.",
  },
  {
    id: "product-ysl-femme",
    category: "product",
    text: "LUME × YSL Libre — Femme is an exclusive signature perfume for women, created as a direct collaboration between LUME and Yves Saint Laurent. The fragrance is a variation of the YSL Libre line crafted specifically for LUME, available only within the hotel. It is part of the sensory environment of a guest's stay and does not exist in any retail channel. Category: fashion and fragrance. Status: coming soon.",
  },
  {
    id: "product-ysl-homme",
    category: "product",
    text: "LUME × YSL Y — Homme is an exclusive signature perfume for men, developed through a direct collaboration between LUME and Yves Saint Laurent. The fragrance is a LUME-specific edition of the YSL Y line, available only to guests during their stay at the hotel. Like all LUME products, it cannot be purchased or removed from the premises. Category: fashion and fragrance. Status: coming soon.",
  },
  {
    id: "product-hermes",
    category: "product",
    text: "LUME × Hermès Carré Soie is an exclusive piece — a scarf, belt, or small leather good — created by Hermès specifically for LUME. Guests wear it during their stay. It stays at LUME when they leave. The piece cannot be purchased, taken home, or found anywhere else. It is a physical artifact of the LUME experience, designed to exist only within the hotel's world. Category: fashion. Status: coming soon.",
  },
  {
    id: "product-rolex",
    category: "product",
    text: "LUME × Rolex Daytona Edition is a watch created in direct collaboration between LUME and Rolex. Guests wear it inside LUME during their stay. When they check out, the watch stays behind. It is not for sale anywhere in the world. The collaboration produces a timepiece that exists only as a LUME experience object — worn once per stay, returned at departure, worn again on the next visit. Category: fashion. Status: coming soon.",
  },
  {
    id: "product-future",
    category: "product",
    text: "LUME has a roadmap of future product collaborations planned across multiple categories. In technology, the LUME × Bang & Olufsen in-room audio system is an exclusive hardware line that will never be sold commercially. The LUME × Leica camera edition will be available to use during a stay and left behind at checkout. In wellness, LUME × Technogym will equip the hotel gym with a machine line that does not exist outside LUME. LUME × a rotating Michelin-starred chef will create a private dining experience with a menu that changes per guest. LUME × Ferrari or Lamborghini will offer a private driving experience in Monaco exclusive to guests. An annual rotating artist commission will produce a permanent installation, replaced each year and created only for LUME.",
  },
  {
    id: "experience-showcase-1",
    category: "experience",
    text: "The LUME cinematic showcase is an immersive, full-screen product experience built to make each collaboration feel tangible before a visitor has ever touched it. The Red Bull collaboration is the first completed showcase and serves as the template for how every LUME product is presented. Each showcase is a sequence of carefully paced scenes — not a product page, not a slideshow, but a cinematic arc. The experience is built to slow the visitor down, to make them feel the weight and meaning of the product before they understand what it is. Motion, light, and camera work are used in place of copy.",
  },
  {
    id: "experience-showcase-2",
    category: "experience",
    text: "The LUME showcase narrative follows a consistent arc across all product experiences. It begins with a brand concept scene that establishes what LUME is. A signal scene then introduces the problem or friction the product addresses. The product is revealed with restraint — motion, light, and pacing create anticipation before the object is fully visible. A craft scene shows the materials, engineering, and detail behind the collaboration. Lifestyle and benefit scenes translate features into feeling. Trust and proof scenes anchor the emotional arc in specificity. The showcase closes with a final product moment and a contact or access prompt. Every scene is authored to feel premium, focused, and unhurried.",
  },
  {
    id: "access-philosophy",
    category: "access",
    text: "Access to LUME is not purchased. There is no booking system, no price list, and no public waiting list to join. Guests are invited based on a simple criterion: they have positively influenced society and helped others. That is the only basis for an invitation. Once invited, a guest is placed on the list. They can then request availability for a stay at any time. Each guest is permitted one stay per year. After a stay ends, the annual allocation resets. The model is designed to make the stay itself feel rare — something earned, not bought.",
  },
  {
    id: "access-website",
    category: "access",
    text: "The LUME website is structured around three core sections. The home page at the root is a dark cinematic brand entry point — a brand statement, not a sales pitch. The products section at slash products is an editorial grid of all current and upcoming LUME product collaborations. Each product has its own cinematic experience page at slash products slash slug. The story page is a detailed account of LUME's philosophy, origin, and what it stands for. The access page contains the invitation request form — the only way to express interest in being considered for a stay. The entire site is intentionally minimal, with no cluttered navigation or generic content patterns.",
  },
  {
    id: "access-contact",
    category: "access",
    text: "LUME is located in Monaco. It operates by invitation only. There is no public booking system and no way to reserve a stay directly. Guests who believe they meet LUME's access criteria — having positively influenced society and helped others — can submit a request through the access form at the slash access page on the website. The form is the only intake mechanism. Questions about LUME's products, experience, or philosophy can be directed to the LUME assistant. Questions about specific invitation status or guest management are handled through the access page exclusively.",
  },
];
